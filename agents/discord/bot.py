"""
Bot Discord Jarvis v3 - Support Ollama + GGUF avec GPU.

Features:
- Backend Ollama (API HTTP) ou GGUF (GPU direct)
- Modes: discussion, code, moderation
- Mémoire contextuelle par canal
- Logs structurés JSON
- Commandes: !backend, !model, !mode, !memory, !gpu
"""

import os
import re
import json
import io
import asyncio
import aiohttp
import discord
import sys
import time
import uuid
from discord.ext import commands
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, List, Any
from pathlib import Path

# Ajouter le chemin parent pour importer les modules communs
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from common.logger import get_logger, log_request

# ============================================================
# Configuration
# ============================================================

AGENT_ID = "discord"
AGENT_VERSION = "3.0.0"

# Backend par défaut: ollama ou gguf
DEFAULT_BACKEND = os.getenv("LLM_BACKEND", "ollama")

# Ollama config
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:3b")

# CyberDefence config
CYBERDEFENCE_URL = os.getenv("CYBERDEFENCE_URL", "http://localhost:8086")

# GGUF config
GGUF_MODELS_DIR = Path(os.getenv("GGUF_MODELS_DIR", Path.home() / ".local-agents" / "models"))
GGUF_DEFAULT_MODEL = os.getenv("GGUF_MODEL", "")
GGUF_GPU_LAYERS = int(os.getenv("GGUF_GPU_LAYERS", "-1"))  # -1 = tout sur GPU

# Logger structuré
logger = get_logger(AGENT_ID, level=os.getenv("LOG_LEVEL", "info"))

# ============================================================
# État global
# ============================================================

# Backend actif par serveur
guild_backends: Dict[int, str] = {}  # guild_id -> "ollama" ou "gguf"

# Modèle actif par serveur
guild_models: Dict[int, str] = {}  # guild_id -> model_name

# Mode actif par serveur
guild_modes: Dict[int, str] = {}  # guild_id -> "discussion", "code", "moderation"

# Mémoire contextuelle par canal
channel_memory: Dict[int, List[Dict[str, str]]] = {}
MAX_MEMORY = 10

# Client LLM (initialisé au démarrage)
llm_client = None
gguf_available = False

# Stats
stats = {
    "start_time": None,
    "requests_total": 0,
    "requests_success": 0,
    "requests_error": 0,
    "ollama_requests": 0,
    "gguf_requests": 0,
}

# ============================================================
# Bot Discord
# ============================================================

intents = discord.Intents.all()
bot = commands.Bot(command_prefix="!", intents=intents, help_command=None)
bot.session = None

# ============================================================
# Prompts par mode
# ============================================================

MODES = {
    "discussion": {
        "ollama_model": OLLAMA_MODEL,
        "gguf_model": "mistral-7b-instruct-v0.2.Q4_K_M",
        "temperature": 0.7,
        "prompt": """Tu es Jarvis, un assistant Discord sympathique et serviable.
Réponds de manière naturelle et amicale en français.
Tu peux discuter de tout sujet, aider avec des questions, expliquer des concepts.
Sois concis mais informatif."""
    },
    "code": {
        "ollama_model": "llama3.2:3b",
        "gguf_model": "deepseek-coder-6.7b-instruct.Q4_K_M",
        "temperature": 0.3,
        "prompt": """Tu es Jarvis, un assistant de programmation expert.
Tu génères du code propre, commenté et fonctionnel.
Explique brièvement ton code si nécessaire.
Utilise des blocs de code markdown avec le langage spécifié."""
    },
    "moderation": {
        "ollama_model": "phi3:mini",
        "gguf_model": "phi3-mini-4k-instruct-q4",
        "temperature": 0.2,
        "prompt": """Tu es Jarvis, un bot de modération Discord.
Analyse les demandes et retourne UNIQUEMENT un JSON avec l'action à effectuer.

Actions disponibles:
- {"action":"clear","n":50}
- {"action":"role","role":"admin","op":"add"}
- {"action":"kick"}
- {"action":"ban"}
- {"action":"mute","min":10}
- {"action":"stats"}
- {"action":"pin"}
- {"action":"unpin"}
- {"action":"chat","r":"réponse"}

Retourne UNIQUEMENT le JSON."""
    }
}

# ============================================================
# Helpers
# ============================================================

def get_backend(guild_id: int) -> str:
    """Récupère le backend actif d'un serveur."""
    return guild_backends.get(guild_id, DEFAULT_BACKEND)


def set_backend(guild_id: int, backend: str) -> bool:
    """Définit le backend d'un serveur."""
    if backend in ["mock", "ollama", "gguf"]:
        if backend == "gguf" and not gguf_available:
            return False
        guild_backends[guild_id] = backend
        return True
    return False


def get_mode(guild_id: int) -> str:
    """Récupère le mode actuel d'un serveur."""
    return guild_modes.get(guild_id, "discussion")


def set_mode(guild_id: int, mode: str) -> bool:
    """Définit le mode d'un serveur."""
    if mode in MODES:
        guild_modes[guild_id] = mode
        return True
    return False


def get_model(guild_id: int) -> str:
    """Récupère le modèle actif d'un serveur."""
    backend = get_backend(guild_id)
    mode = get_mode(guild_id)
    
    # Modèle custom défini ?
    if guild_id in guild_models:
        return guild_models[guild_id]
    
    # Sinon, modèle par défaut du mode
    mode_config = MODES.get(mode, MODES["discussion"])
    if backend == "mock":
        return "mock"
    if backend == "gguf":
        return mode_config.get("gguf_model", "")
    return mode_config.get("ollama_model", OLLAMA_MODEL)


def set_model(guild_id: int, model: str):
    """Définit le modèle d'un serveur."""
    guild_models[guild_id] = model


# ============================================================
# Mémoire contextuelle
# ============================================================

def add_to_memory(channel_id: int, role: str, content: str):
    """Ajoute un message à la mémoire du canal."""
    if channel_id not in channel_memory:
        channel_memory[channel_id] = []
    
    channel_memory[channel_id].append({
        "role": role,
        "content": content[:500],
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    if len(channel_memory[channel_id]) > MAX_MEMORY:
        channel_memory[channel_id] = channel_memory[channel_id][-MAX_MEMORY:]


def get_memory(channel_id: int) -> List[Dict[str, str]]:
    """Récupère la mémoire d'un canal."""
    return channel_memory.get(channel_id, [])


def clear_memory(channel_id: int):
    """Efface la mémoire d'un canal."""
    if channel_id in channel_memory:
        del channel_memory[channel_id]


# ============================================================
# CyberDefence integration
# ============================================================

async def cyber_request(method: str, path: str, payload: Dict | None = None) -> tuple[bool, Any]:
    """Call CyberDefence API and return (ok, data_or_error_message)."""
    try:
        if bot.session is None or bot.session.closed:
            bot.session = aiohttp.ClientSession()

        timeout = aiohttp.ClientTimeout(total=10)
        url = f"{CYBERDEFENCE_URL}{path}"
        async with bot.session.request(method, url, json=payload, timeout=timeout) as resp:
            content_type = resp.headers.get("Content-Type", "")
            if "application/json" in content_type:
                data = await resp.json()
            else:
                data = await resp.text()

            if 200 <= resp.status < 300:
                return True, data

            if isinstance(data, dict):
                return False, data.get("error") or data.get("reason") or f"HTTP {resp.status}"
            return False, f"HTTP {resp.status}: {str(data)[:180]}"
    except Exception as e:
        return False, f"CyberDefence indisponible: {e}"


async def inspect_message_with_cyberdefence(message: discord.Message, content: str, request_id: str) -> tuple[bool, str]:
    """Inspect a Discord message before LLM processing."""
    payload = {
        "request_id": request_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "agent_id": "discord",
        "task": {
            "message": content,
            "context": {
                "metadata": {
                    "user_id": str(message.author.id),
                    "channel_id": str(message.channel.id),
                    "guild_id": str(message.guild.id) if message.guild else "dm",
                }
            }
        }
    }
    ok, data = await cyber_request("POST", "/inspect", payload)
    if not ok:
        # Fail-open: ne bloque pas le bot si CyberDefence est down.
        logger.warn("CyberDefence inspect failed", request_id=request_id, error=str(data))
        return True, "CyberDefence indisponible"

    if isinstance(data, dict) and data.get("allowed", False):
        return True, data.get("reason", "OK")
    if isinstance(data, dict):
        return False, data.get("reason", "Message bloqué")
    return False, "Message bloqué"


async def ask_cyber_chat(content: str, request_id: str) -> Optional[str]:
    """Forward natural-language cyber queries to CyberDefence /chat."""
    payload = {
        "request_id": request_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "agent_id": "discord",
        "message": content,
        "context": {"metadata": {"source": "discord"}},
    }
    ok, data = await cyber_request("POST", "/chat", payload)
    if not ok:
        return None

    try:
        return data.get("response", {}).get("content")
    except Exception:
        return None


# ============================================================
# LLM - Ollama
# ============================================================

async def list_ollama_models() -> List[str]:
    """Liste les modèles Ollama disponibles."""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{OLLAMA_URL}/api/tags",
                timeout=aiohttp.ClientTimeout(total=10)
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return [m["name"] for m in data.get("models", [])]
    except Exception as e:
        logger.error("Failed to list Ollama models", error=str(e))
    return []


async def ask_ollama(
    message: str,
    model: str,
    system_prompt: str,
    temperature: float = 0.7,
    history: List[Dict] = None,
    request_id: str = None
) -> Optional[Dict]:
    """Envoie une requête à Ollama."""
    
    request_id = request_id or str(uuid.uuid4())
    
    # Construire le prompt avec historique
    prompt_parts = [system_prompt]
    
    if history:
        prompt_parts.append("\nHistorique récent:")
        for msg in history[-5:]:
            role = "User" if msg["role"] == "user" else "Jarvis"
            prompt_parts.append(f"{role}: {msg['content']}")
    
    prompt_parts.append(f"\nUser: {message}\nJarvis:")
    full_prompt = "\n".join(prompt_parts)
    
    start_time = time.time()
    
    try:
        payload = {
            "model": model,
            "prompt": full_prompt,
            "stream": False,
            "options": {
                "temperature": temperature,
                "num_predict": 500
            }
        }
        
        logger.info(
            "Ollama request",
            request_id=request_id,
            model=model,
            message_length=len(message)
        )
        
        timeout = aiohttp.ClientTimeout(total=120)
        async with bot.session.post(f"{OLLAMA_URL}/api/generate", json=payload, timeout=timeout) as resp:
            duration_ms = int((time.time() - start_time) * 1000)
            
            if resp.status == 200:
                data = await resp.json()
                text = data.get("response", "").strip()
                
                stats["ollama_requests"] += 1
                
                logger.info(
                    "Ollama response",
                    request_id=request_id,
                    status="success",
                    duration_ms=duration_ms,
                    response_length=len(text)
                )
                
                return {"text": text, "duration_ms": duration_ms}
            else:
                logger.error("Ollama error", request_id=request_id, status_code=resp.status)
                return None
                
    except asyncio.TimeoutError:
        logger.error("Ollama timeout", request_id=request_id)
        return None
    except Exception as e:
        logger.error("Ollama exception", request_id=request_id, error=str(e))
        return None


# ============================================================
# LLM - GGUF
# ============================================================

def init_gguf():
    """Initialise le support GGUF si disponible."""
    global gguf_available, llm_client
    
    try:
        from common.llm_client import LLMClient
        from common.gguf_loader import GGUFModelManager, detect_gpu_backend
        
        # Vérifier si des modèles GGUF sont disponibles
        manager = GGUFModelManager()
        models = manager.list_available()
        
        if models:
            backend = detect_gpu_backend()
            logger.info(
                "GGUF support enabled",
                models_count=len(models),
                gpu_backend=backend.value
            )
            gguf_available = True
            return True
        else:
            logger.info("GGUF: No models found, using Ollama only")
            return False
            
    except ImportError as e:
        logger.info(f"GGUF not available: {e}")
        return False


def list_gguf_models() -> List[str]:
    """Liste les modèles GGUF disponibles."""
    if not gguf_available:
        return []
    
    try:
        from common.gguf_loader import GGUFModelManager
        manager = GGUFModelManager()
        return [m["name"] for m in manager.list_available()]
    except:
        return []


async def ask_gguf(
    message: str,
    model: str,
    system_prompt: str,
    temperature: float = 0.7,
    history: List[Dict] = None,
    request_id: str = None
) -> Optional[Dict]:
    """Envoie une requête à un modèle GGUF."""
    
    if not gguf_available:
        return None
    
    request_id = request_id or str(uuid.uuid4())
    
    try:
        from common.gguf_loader import GGUFModelManager
        
        # Construire le prompt
        prompt_parts = []
        if history:
            for msg in history[-5:]:
                role = "User" if msg["role"] == "user" else "Assistant"
                prompt_parts.append(f"{role}: {msg['content']}")
        prompt_parts.append(f"User: {message}")
        full_prompt = "\n".join(prompt_parts)
        
        logger.info(
            "GGUF request",
            request_id=request_id,
            model=model,
            message_length=len(message)
        )
        
        start_time = time.time()
        
        # Charger et utiliser le modèle (en thread pool pour ne pas bloquer)
        loop = asyncio.get_event_loop()
        
        def run_gguf():
            manager = GGUFModelManager()
            loader = manager.load(model, n_gpu_layers=GGUF_GPU_LAYERS)
            return loader.generate(
                prompt=full_prompt,
                system_prompt=system_prompt,
                temperature=temperature,
                max_tokens=500
            )
        
        text = await loop.run_in_executor(None, run_gguf)
        
        duration_ms = int((time.time() - start_time) * 1000)
        stats["gguf_requests"] += 1
        
        logger.info(
            "GGUF response",
            request_id=request_id,
            status="success",
            duration_ms=duration_ms,
            response_length=len(text)
        )
        
        return {"text": text, "duration_ms": duration_ms}
        
    except FileNotFoundError:
        logger.error("GGUF model not found", request_id=request_id, model=model)
        return None
    except Exception as e:
        logger.error("GGUF exception", request_id=request_id, error=str(e))
        return None


# ============================================================
# LLM - Unified
# ============================================================

async def ask_llm(
    message: str,
    guild_id: int,
    history: List[Dict] = None,
    request_id: str = None
) -> Optional[Dict]:
    """Envoie une requête au LLM actif (Ollama ou GGUF)."""
    
    backend = get_backend(guild_id)
    mode = get_mode(guild_id)
    model = get_model(guild_id)
    mode_config = MODES.get(mode, MODES["discussion"])
    
    system_prompt = mode_config["prompt"]
    temperature = mode_config["temperature"]

    if backend == "mock":
        # Backend instantané pour dev/tests et fallback de sécurité.
        return {"text": f"[mock/{mode}] Reçu: {message[:240]}", "duration_ms": 1}
    
    if backend == "gguf" and gguf_available:
        result = await ask_gguf(
            message=message,
            model=model,
            system_prompt=system_prompt,
            temperature=temperature,
            history=history,
            request_id=request_id
        )
        if result:
            return result
        # Fallback to Ollama if GGUF fails
        logger.warn("GGUF failed, falling back to Ollama")
    
    # Ollama
    return await ask_ollama(
        message=message,
        model=model if backend == "ollama" else OLLAMA_MODEL,
        system_prompt=system_prompt,
        temperature=temperature,
        history=history,
        request_id=request_id
    )


# ============================================================
# Fallback parser (sans IA)
# ============================================================

def fallback_parse(content: str) -> Optional[Dict]:
    """Parse rapide sans IA pour les commandes de modération."""
    c = content.lower()
    
    # PIN
    if any(x in c for x in ["épingle", "epingle", "pin"]):
        if any(x in c for x in ["dés", "un"]):
            return {"action": "unpin"}
        return {"action": "pin"}
    
    # CLEAR
    if any(x in c for x in ["nettoie", "supprime", "efface", "purge", "clear", "delete"]):
        if "role" not in c and "admin" not in c:
            n = re.search(r'(\d+)', c)
            return {"action": "clear", "n": int(n.group(1)) if n else 50}
    
    # ROLE
    if any(x in c for x in ["role", "admin", "modo", "vip", "donne", "retire"]):
        roles = ["admin", "modo", "vip", "moderateur", "staff", "dev", "member"]
        role_name = "admin"
        for r in roles:
            if r in c:
                role_name = r
                break
        op = "remove" if any(x in c for x in ["retire", "enleve"]) else "add"
        return {"action": "role", "role": role_name, "op": op}
    
    # KICK
    if "kick" in c:
        return {"action": "kick"}
    
    # BAN
    if "ban" in c:
        return {"action": "ban"}
    
    # MUTE
    if any(x in c for x in ["mute", "silence"]):
        m = re.search(r'(\d+)', c)
        return {"action": "mute", "min": int(m.group(1)) if m else 10}
    
    # STATS
    if any(x in c for x in ["stats", "info"]):
        return {"action": "stats"}
    
    return None


# ============================================================
# Exécution des actions
# ============================================================

async def execute_action(
    msg: discord.Message,
    data: Dict,
    mentions: List[discord.Member],
    request_id: str
):
    """Exécute une action avec logging structuré."""
    
    action = data.get("action", "chat")
    guild = msg.guild
    author = msg.author
    
    logger.info(
        "Executing action",
        request_id=request_id,
        action=action,
        data=data
    )
    
    start_time = time.time()
    
    try:
        if action == "clear":
            n = min(data.get("n", 50), 100)
            deleted = await msg.channel.purge(limit=n + 1)
            await msg.channel.send(f"🗑️ {len(deleted)-1} messages supprimés", delete_after=5)
            stats["requests_success"] += 1
        
        elif action == "role":
            role_name = data.get("role", "admin")
            op = data.get("op", "add")
            target = mentions[0] if mentions else author
            
            role = discord.utils.find(lambda r: r.name.lower() == role_name.lower(), guild.roles)
            if not role:
                perms = discord.Permissions(administrator=True) if "admin" in role_name.lower() else discord.Permissions()
                role = await guild.create_role(
                    name=role_name.capitalize(),
                    permissions=perms,
                    color=discord.Color.red(),
                    hoist=True
                )
            
            if op == "remove":
                await target.remove_roles(role)
                await msg.reply(f"➖ **{role.name}** retiré de **{target.display_name}**")
            else:
                await target.add_roles(role)
                await msg.reply(f"👑 **{role.name}** donné à **{target.display_name}** ✅")
            stats["requests_success"] += 1
        
        elif action == "kick":
            if mentions:
                await mentions[0].kick()
                await msg.reply(f"👢 **{mentions[0].display_name}** kick!")
                stats["requests_success"] += 1
            else:
                await msg.reply("❌ Mentionne quelqu'un !")
        
        elif action == "ban":
            if mentions:
                await mentions[0].ban()
                await msg.reply(f"🔨 **{mentions[0].display_name}** banni!")
                stats["requests_success"] += 1
            else:
                await msg.reply("❌ Mentionne quelqu'un !")
        
        elif action == "mute":
            if mentions:
                mins = data.get("min", 10)
                await mentions[0].timeout(discord.utils.utcnow() + timedelta(minutes=mins))
                await msg.reply(f"🔇 **{mentions[0].display_name}** muté {mins}min")
                stats["requests_success"] += 1
            else:
                await msg.reply("❌ Mentionne quelqu'un !")
        
        elif action == "stats":
            backend = get_backend(guild.id)
            mode = get_mode(guild.id)
            model = get_model(guild.id)
            uptime = int(time.time() - stats["start_time"]) if stats["start_time"] else 0
            
            e = discord.Embed(title=f"📊 {guild.name}", color=0x5865F2)
            e.add_field(name="👥 Membres", value=guild.member_count)
            e.add_field(name="📺 Salons", value=len(guild.channels))
            e.add_field(name="👑 Rôles", value=len(guild.roles))
            e.add_field(name="🔧 Backend", value=f"`{backend}`" + (" 🎮" if backend == "gguf" else ""))
            e.add_field(name="🤖 Modèle", value=f"`{model}`")
            e.add_field(name="🎭 Mode", value=f"`{mode}`")
            e.add_field(name="⏱️ Uptime", value=f"{uptime//3600}h{(uptime%3600)//60}m")
            e.add_field(name="📈 Requêtes", value=f"Total: {stats['requests_total']}")
            e.add_field(name="🎯 Stats LLM", value=f"Ollama: {stats['ollama_requests']} | GGUF: {stats['gguf_requests']}")
            await msg.reply(embed=e)
            stats["requests_success"] += 1
        
        elif action == "pin":
            async for m in msg.channel.history(limit=2):
                if m.id != msg.id:
                    await m.pin()
                    await msg.reply("📌 Épinglé !")
                    break
            stats["requests_success"] += 1
        
        elif action == "unpin":
            pins = await msg.channel.pins()
            if pins:
                await pins[0].unpin()
                await msg.reply("📌 Désépinglé !")
            stats["requests_success"] += 1
        
        elif action == "chat":
            r = data.get("r", data.get("text", "🤔 Je n'ai pas compris."))
            r = r.replace("\\n", "\n")
            
            add_to_memory(msg.channel.id, "assistant", r)
            
            if len(r) > 2000:
                for i in range(0, len(r), 1900):
                    await msg.channel.send(r[i:i+1900])
            else:
                await msg.reply(r)
            stats["requests_success"] += 1
        
        else:
            await msg.reply("🤔 Commande non reconnue. Tape `!help`")
        
        duration_ms = int((time.time() - start_time) * 1000)
        logger.info("Action completed", request_id=request_id, action=action, duration_ms=duration_ms)
            
    except discord.Forbidden:
        stats["requests_error"] += 1
        logger.error("Permission denied", request_id=request_id, action=action)
        await msg.reply("❌ Permission refusée !")
    except Exception as e:
        stats["requests_error"] += 1
        logger.error("Action failed", request_id=request_id, action=action, error=str(e))
        await msg.reply(f"❌ Erreur: `{str(e)[:100]}`")


# ============================================================
# Events
# ============================================================

@bot.event
async def on_ready():
    """Bot prêt."""
    global gguf_available
    
    bot.session = aiohttp.ClientSession()
    stats["start_time"] = time.time()
    
    # Initialiser GGUF
    gguf_available = init_gguf()
    
    # Lister les modèles
    ollama_models = await list_ollama_models()
    gguf_models = list_gguf_models()
    
    logger.info(
        "Bot started",
        bot_user=str(bot.user),
        version=AGENT_VERSION,
        default_backend=DEFAULT_BACKEND,
        gguf_available=gguf_available,
        ollama_models=ollama_models,
        gguf_models=gguf_models,
        guilds=[g.name for g in bot.guilds]
    )
    
    print(f"✅ {bot.user} connecté !")
    print(f"📦 Version: {AGENT_VERSION}")
    print(f"🔧 Backend par défaut: {DEFAULT_BACKEND}")
    print(f"🎮 GGUF disponible: {'Oui' if gguf_available else 'Non'}")
    print(f"📦 Modèles Ollama: {', '.join(ollama_models) if ollama_models else 'Aucun'}")
    print(f"📦 Modèles GGUF: {', '.join(gguf_models) if gguf_models else 'Aucun'}")
    for g in bot.guilds:
        print(f"📍 {g.name} | Admin: {g.me.guild_permissions.administrator}")


@bot.event
async def on_guild_join(guild: discord.Guild):
    """Onboarding quand le bot rejoint un serveur."""
    logger.info("Joined guild", guild=guild.name, guild_id=guild.id)
    
    channel = guild.system_channel
    if not channel:
        for c in guild.text_channels:
            if c.permissions_for(guild.me).send_messages:
                channel = c
                break
    
    if channel:
        embed = discord.Embed(
            title="👋 Salut ! Je suis Jarvis v3",
            description="Assistant IA local avec support GPU !",
            color=0x5865F2
        )
        embed.add_field(
            name="🚀 Pour commencer",
            value="Mentionne-moi ! `@Jarvis salut`",
            inline=False
        )
        embed.add_field(
            name="🔧 Backends",
            value="`!backend ollama` - API Ollama\n`!backend gguf` - GPU direct (plus rapide)",
            inline=False
        )
        embed.add_field(
            name="🎭 Modes",
            value="`!mode discussion` | `!mode code` | `!mode moderation`",
            inline=False
        )
        embed.set_footer(text=f"Version {AGENT_VERSION} | 100% local")
        
        await channel.send(embed=embed)


@bot.event
async def on_message(message: discord.Message):
    """Traitement des messages."""
    if message.author == bot.user:
        return
    
    # Debug
    print(f"📩 Message de {message.author}: {message.content[:50]}...")
    
    if bot.user.mentioned_in(message):
        print(f"🎯 Bot mentionné par {message.author}")
        
        request_id = str(uuid.uuid4())
        stats["requests_total"] += 1
        
        content = re.sub(rf'<@!?{bot.user.id}>', '', message.content).strip()
        mentions = [m for m in message.mentions if m != bot.user]
        
        if not content:
            backend = get_backend(message.guild.id)
            mode = get_mode(message.guild.id)
            await message.reply(f"👋 Oui ? (Backend: `{backend}` | Mode: `{mode}`)")
            return
        
        add_to_memory(message.channel.id, "user", content)

        # Inspection sécurité avant toute action LLM/modération
        allowed, reason = await inspect_message_with_cyberdefence(message, content, request_id)
        if not allowed:
            stats["requests_error"] += 1
            await message.reply(f"🚫 Requête bloquée par CyberDefence: `{reason}`")
            return
        
        logger.info(
            "Message received",
            request_id=request_id,
            author=str(message.author),
            channel=str(message.channel),
            content_length=len(content),
            backend=get_backend(message.guild.id)
        )
        
        print(f"📨 Traitement: {content}")
        
        async with message.channel.typing():
            mode = get_mode(message.guild.id)

            # Raccourcis documentés vers CyberDefence en langage naturel
            lowered = content.lower().strip()
            if lowered in ("status agents", "alertes sécurité", "alertes securite", "métriques", "metriques"):
                cyber_reply = await ask_cyber_chat(content, request_id)
                if cyber_reply:
                    await execute_action(message, {"action": "chat", "r": cyber_reply}, mentions, request_id)
                    await bot.process_commands(message)
                    return
            
            # Vérifier session
            if bot.session is None or bot.session.closed:
                bot.session = aiohttp.ClientSession()
            
            # En mode modération, fallback d'abord
            if mode == "moderation":
                data = fallback_parse(content)
                if data is None:
                    result = await ask_llm(content, message.guild.id, request_id=request_id)
                    if result:
                        # Parser le JSON de la réponse
                        text = result.get("text", "")
                        match = re.search(r'\{[^{}]+\}', text, re.DOTALL)
                        if match:
                            try:
                                data = json.loads(match.group())
                            except:
                                data = {"action": "chat", "r": text}
                        else:
                            data = {"action": "chat", "r": text}
            else:
                # Mode discussion/code
                history = get_memory(message.channel.id)
                result = await ask_llm(content, message.guild.id, history=history, request_id=request_id)
                if result:
                    data = {"action": "chat", "r": result.get("text", "")}
                else:
                    data = None
            
            if data is None:
                data = {"action": "chat", "r": "⏳ Désolé, timeout. Réessaye !"}
                stats["requests_error"] += 1
            
            await execute_action(message, data, mentions, request_id)
    
    await bot.process_commands(message)


# ============================================================
# Commandes
# ============================================================

@bot.command()
async def ping(ctx):
    """Test de latence."""
    backend = get_backend(ctx.guild.id)
    mode = get_mode(ctx.guild.id)
    model = get_model(ctx.guild.id)
    await ctx.send(f"🏓 Pong! (Backend: `{backend}` | Mode: `{mode}` | Modèle: `{model}`)")


@bot.command()
async def backend(ctx, new_backend: str = None):
    """Change ou affiche le backend LLM."""
    if new_backend is None:
        current = get_backend(ctx.guild.id)
        e = discord.Embed(title="🔧 Backends disponibles", color=0x5865F2)
        
        # Ollama
        ollama_status = "✅" if current == "ollama" else "⚪"
        e.add_field(
            name=f"{ollama_status} ollama",
            value="API HTTP Ollama\n`!backend ollama`",
            inline=True
        )

        mock_status = "✅" if current == "mock" else "⚪"
        e.add_field(
            name=f"{mock_status} mock",
            value="Backend dev instantané\n`!backend mock`",
            inline=True
        )
        
        # GGUF
        if gguf_available:
            gguf_status = "✅" if current == "gguf" else "⚪"
            e.add_field(
                name=f"{gguf_status} gguf 🎮",
                value="GPU direct (plus rapide)\n`!backend gguf`",
                inline=True
            )
        else:
            e.add_field(
                name="❌ gguf",
                value="Non disponible\n`./scripts/install-gguf.sh`",
                inline=True
            )
        
        e.set_footer(text=f"Actuel: {current}")
        await ctx.send(embed=e)
    
    elif set_backend(ctx.guild.id, new_backend):
        emoji = "🎮" if new_backend == "gguf" else "📡"
        logger.info("Backend changed", guild=ctx.guild.name, backend=new_backend)
        await ctx.send(f"{emoji} Backend changé en `{new_backend}`")
    else:
        if new_backend == "gguf" and not gguf_available:
            await ctx.send("❌ GGUF non disponible. Installe avec `./scripts/install-gguf.sh`")
        else:
            await ctx.send(f"❌ Backend inconnu. Dispo: `mock`, `ollama`, `gguf`")


@bot.command()
async def mode(ctx, new_mode: str = None):
    """Change ou affiche le mode du bot."""
    if new_mode is None:
        current = get_mode(ctx.guild.id)
        backend = get_backend(ctx.guild.id)
        
        e = discord.Embed(title="🎭 Modes disponibles", color=0x5865F2)
        for m, config in MODES.items():
            status = "✅" if m == current else "⚪"
            model_key = "gguf_model" if backend == "gguf" else "ollama_model"
            model = config.get(model_key, "default")
            e.add_field(
                name=f"{status} {m}",
                value=f"Modèle: `{model}`\n`!mode {m}`",
                inline=True
            )
        await ctx.send(embed=e)
    elif set_mode(ctx.guild.id, new_mode):
        logger.info("Mode changed", guild=ctx.guild.name, mode=new_mode)
        await ctx.send(f"✅ Mode changé en `{new_mode}`")
    else:
        await ctx.send(f"❌ Mode inconnu. Dispo: {', '.join(MODES.keys())}")


@bot.command()
async def model(ctx, new_model: str = None):
    """Change ou affiche le modèle."""
    backend = get_backend(ctx.guild.id)
    
    if new_model is None:
        current = get_model(ctx.guild.id)
        
        e = discord.Embed(title="🧠 Modèles", color=0x5865F2)
        e.add_field(name="Actif", value=f"`{current}`", inline=False)
        e.add_field(name="Backend", value=f"`{backend}`", inline=False)
        
        if backend == "ollama":
            models = await list_ollama_models()
            e.add_field(name="Disponibles (Ollama)", value="\n".join([f"• `{m}`" for m in models[:10]]), inline=False)
        else:
            models = list_gguf_models()
            e.add_field(name="Disponibles (GGUF)", value="\n".join([f"• `{m}`" for m in models[:10]]), inline=False)
        
        await ctx.send(embed=e)
    else:
        set_model(ctx.guild.id, new_model)
        logger.info("Model changed", guild=ctx.guild.name, model=new_model)
        await ctx.send(f"✅ Modèle changé en `{new_model}`")


@bot.command()
async def models(ctx):
    """Liste tous les modèles disponibles."""
    e = discord.Embed(title="📦 Modèles disponibles", color=0x5865F2)

    # Ollama
    ollama_models = await list_ollama_models()
    if ollama_models:
        e.add_field(
            name="📡 Ollama",
            value="\n".join([f"• `!model {m}`" for m in ollama_models[:8]]),
            inline=True
        )

    # GGUF
    if gguf_available:
        gguf_models = list_gguf_models()
        if gguf_models:
            e.add_field(
                name="🎮 GGUF (GPU)",
                value="\n".join([f"• `!model {m}`" for m in gguf_models[:8]]),
                inline=True
            )

    current_backend = get_backend(ctx.guild.id)
    current_model = get_model(ctx.guild.id)
    e.add_field(
        name="💡 Utilisation",
        value="`!model <nom>` pour changer\nEx: `!model smollm2:360m`",
        inline=False
    )
    e.set_footer(text=f"Actuel: {current_model} ({current_backend})")

    await ctx.send(embed=e)

@bot.command()
async def gpu(ctx):
    """Affiche les infos GPU/GGUF."""
    e = discord.Embed(title="🎮 Infos GPU / GGUF", color=0x5865F2)
    
    e.add_field(name="GGUF disponible", value="✅ Oui" if gguf_available else "❌ Non", inline=True)
    
    if gguf_available:
        try:
            from common.gguf_loader import detect_gpu_backend, MODELS_DIR
            backend = detect_gpu_backend()
            models = list_gguf_models()
            
            e.add_field(name="Backend GPU", value=f"`{backend.value}`", inline=True)
            e.add_field(name="GPU Layers", value=f"`{GGUF_GPU_LAYERS}` (-1 = all)", inline=True)
            e.add_field(name="Modèles", value=str(len(models)), inline=True)
            e.add_field(name="Dossier", value=f"`{MODELS_DIR}`", inline=False)
        except Exception as ex:
            e.add_field(name="Erreur", value=str(ex), inline=False)
    else:
        e.add_field(
            name="Installation",
            value="```bash\n./scripts/install-gguf.sh\n```",
            inline=False
        )
    
    await ctx.send(embed=e)


@bot.command()
async def memory(ctx, action: str = "show"):
    """Gère la mémoire contextuelle du canal."""
    if action == "clear":
        clear_memory(ctx.channel.id)
        await ctx.send("🧹 Mémoire du canal effacée !")
    else:
        mem = get_memory(ctx.channel.id)
        if mem:
            e = discord.Embed(title="🧠 Mémoire du canal", color=0x5865F2)
            for m in mem[-5:]:
                role = "👤" if m["role"] == "user" else "🤖"
                content = m["content"][:100] + "..." if len(m["content"]) > 100 else m["content"]
                e.add_field(name=f"{role} {m['role']}", value=content, inline=False)
            e.set_footer(text=f"{len(mem)}/{MAX_MEMORY} messages | !memory clear")
            await ctx.send(embed=e)
        else:
            await ctx.send("📭 Pas de mémoire pour ce canal.")


@bot.command()
async def help(ctx):
    """Affiche l'aide."""
    e = discord.Embed(title="🤖 Jarvis v3 - Aide", color=0x5865F2)
    
    e.add_field(
        name="🔧 Backend",
        value="`!backend` - Voir/changer\n`!backend ollama` - API\n`!backend gguf` - GPU direct",
        inline=False
    )
    e.add_field(
        name="🎭 Modes",
        value="`!mode discussion` | `!mode code` | `!mode moderation`",
        inline=False
    )
    e.add_field(
        name="🧠 Modèles",
        value="`!models` - Liste\n`!model <nom>` - Changer\n`!gpu` - Infos GPU",
        inline=False
    )
    e.add_field(
        name="💬 Chat",
        value="`@Jarvis salut !`\n`@Jarvis code fibonacci python`",
        inline=False
    )
    e.add_field(
        name="🛡️ Modération",
        value="`@Jarvis kick @user`\n`@Jarvis ban @user`\n`@Jarvis nettoie`",
        inline=False
    )
    e.add_field(
        name="🛡️ CyberDefence",
        value="`!cyber status` | `!cyber metrics` | `!cyber events`\n`!cyber block-ip <ip>` | `!cyber unblock-ip <ip>` | `!cyber export csv`",
        inline=False
    )
    e.add_field(
        name="💾 Mémoire",
        value="`!memory` - Voir\n`!memory clear` - Effacer",
        inline=False
    )
    
    backend = get_backend(ctx.guild.id)
    mode = get_mode(ctx.guild.id)
    model = get_model(ctx.guild.id)
    e.set_footer(text=f"Backend: {backend} | Mode: {mode} | Modèle: {model} | v{AGENT_VERSION}")
    
    await ctx.send(embed=e)


@bot.command(name="cyber")
async def cyber(ctx, action: str = "status", value: str = ""):
    """Commandes CyberDefence pour la modération Discord."""
    action = (action or "status").lower()

    if action == "status":
        ok, data = await cyber_request("GET", "/status")
        if not ok:
            await ctx.send(f"❌ {data}")
            return

        orch = data.get("orchestrator", {})
        agents = data.get("agents", {})
        stats_data = data.get("stats", {})
        e = discord.Embed(title="🛡️ CyberDefence Status", color=0x2F3136)
        e.add_field(name="Orchestrateur", value=f"`{orch.get('status', 'unknown')}`", inline=True)
        e.add_field(name="Inspectées", value=str(stats_data.get("total_inspected", 0)), inline=True)
        e.add_field(name="Bloquées", value=str(stats_data.get("total_blocked", 0)), inline=True)
        healthy = sum(1 for a in agents.values() if a.get("status") == "healthy")
        e.add_field(name="Agents healthy", value=f"{healthy}/{max(len(agents), 1)}", inline=True)
        e.add_field(name="IPs bloquées", value=str(stats_data.get("blocked_ips_count", 0)), inline=True)
        e.add_field(name="Événements", value=str(stats_data.get("events_total", 0)), inline=True)
        await ctx.send(embed=e)
        return

    if action == "metrics":
        ok, data = await cyber_request("GET", "/metrics")
        if not ok:
            await ctx.send(f"❌ {data}")
            return
        sev = data.get("events_by_severity", {})
        txt = (
            "**📊 CyberDefence Metrics**\n"
            f"Inspectées: **{data.get('inspected_total', 0)}**\n"
            f"Bloquées: **{data.get('blocked_total', 0)}**\n"
            f"Block rate: **{data.get('block_rate', 0)}**\n"
            f"IPs bloquées: **{data.get('blocked_ips_count', 0)}**\n"
            f"INFO/WARNING/CRITICAL: **{sev.get('INFO', 0)}/{sev.get('WARNING', 0)}/{sev.get('CRITICAL', 0)}**"
        )
        await ctx.send(txt)
        return

    if action == "events":
        severity = value.upper().strip()
        query = "/events?limit=10"
        if severity in ("INFO", "WARNING", "CRITICAL"):
            query += f"&severity={severity}"
        ok, data = await cyber_request("GET", query)
        if not ok:
            await ctx.send(f"❌ {data}")
            return
        if not data:
            await ctx.send("✅ Aucun événement.")
            return
        lines = ["**🧾 Derniers événements sécurité**"]
        for ev in data[-10:]:
            lines.append(f"`{ev.get('severity', '?')}` `{ev.get('event_type', '?')}` - {ev.get('description', '')[:90]}")
        await ctx.send("\n".join(lines))
        return

    if action in ("block-ip", "unblock-ip"):
        ip = value.strip()
        if not ip:
            await ctx.send(f"❌ Usage: `!cyber {action} <ip>`")
            return
        route = "/block-ip" if action == "block-ip" else "/unblock-ip"
        ok, data = await cyber_request("POST", route, {"ip": ip})
        if not ok:
            await ctx.send(f"❌ {data}")
            return
        await ctx.send(f"✅ `{ip}` traité via `{action}`")
        return

    if action == "export":
        fmt = value.lower().strip() or "csv"
        if fmt not in ("csv", "json"):
            await ctx.send("❌ Formats: `csv` ou `json`")
            return
        ok, data = await cyber_request("GET", f"/events?limit=500&format={fmt}")
        if not ok:
            await ctx.send(f"❌ {data}")
            return
        if fmt == "csv":
            blob = data.encode("utf-8") if isinstance(data, str) else str(data).encode("utf-8")
            await ctx.send(file=discord.File(io.BytesIO(blob), filename="cyber_events.csv"))
        else:
            blob = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
            await ctx.send(file=discord.File(io.BytesIO(blob), filename="cyber_events.json"))
        return

    await ctx.send(
        "**Usage `!cyber`**\n"
        "`!cyber status`\n"
        "`!cyber metrics`\n"
        "`!cyber events [INFO|WARNING|CRITICAL]`\n"
        "`!cyber block-ip <ip>`\n"
        "`!cyber unblock-ip <ip>`\n"
        "`!cyber export csv|json`"
    )


# ============================================================
# Main
# ============================================================

async def main():
    token = os.getenv("DISCORD_BOT_TOKEN")
    if not token:
        logger.error("DISCORD_BOT_TOKEN missing")
        print("❌ DISCORD_BOT_TOKEN manquant!")
        return
    
    try:
        await bot.start(token)
    finally:
        if bot.session:
            await bot.session.close()
        logger.info("Bot stopped")


if __name__ == "__main__":
    asyncio.run(main())
