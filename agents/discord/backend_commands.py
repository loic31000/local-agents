"""
Commandes !backend pour le bot Discord Jarvis.

Permet de changer le backend LLM depuis Discord :
    @Jarvis !backend mock     → 0.3s, 0MB RAM (dev)
    @Jarvis !backend bitnet   → 1-2s, 1.2GB RAM (perf)
    @Jarvis !backend ollama   → 5-8s, 3.5GB RAM (défaut)
    @Jarvis !backend status   → infos sur le backend actif
    @Jarvis !backend bench    → benchmark comparatif

À intégrer dans agents/discord/bot.py :

    from agents.discord.backend_commands import handle_backend_command
    
    # Dans le handler de messages :
    if message.content.startswith("!backend"):
        await handle_backend_command(message)
        return
"""

import os
import time
import asyncio
from pathlib import Path
from typing import Optional

BACKEND_FILE = Path(".backend")

BACKENDS = {
    "mock": {
        "name": "Mock Layer",
        "emoji": "🧪",
        "ram": "0 MB",
        "latency": "~0.3s",
        "cpu": "0%",
        "desc": "Réponses simulées — développement instantané",
    },
    "bitnet": {
        "name": "BitNet 2B",
        "emoji": "⚡",
        "ram": "1.2 GB",
        "latency": "~1-2s",
        "cpu": "45%",
        "desc": "Microsoft BitNet 1-bit — 6x plus rapide qu'Ollama",
    },
    "ollama": {
        "name": "Ollama",
        "emoji": "🦙",
        "ram": "3.5 GB",
        "latency": "~5-8s",
        "cpu": "85%",
        "desc": "Backend Ollama — llama3.2:3b",
    },
    "gguf": {
        "name": "GGUF",
        "emoji": "📦",
        "ram": "variable",
        "latency": "variable",
        "cpu": "variable",
        "desc": "Modèle GGUF local direct",
    },
}


def get_active_backend() -> str:
    """Retourne le backend actif depuis le fichier .backend."""
    if BACKEND_FILE.exists():
        return BACKEND_FILE.read_text().strip()
    return os.getenv("BACKEND", "ollama")


def set_backend(backend: str) -> bool:
    """Change le backend actif."""
    if backend not in BACKENDS:
        return False
    BACKEND_FILE.write_text(backend)
    os.environ["BACKEND"] = backend
    return True


def format_backend_status(backend: str) -> str:
    """Formate le statut d'un backend pour Discord."""
    info = BACKENDS.get(backend, {})
    active = get_active_backend()
    marker = " ← actif" if backend == active else ""
    return (
        f"{info.get('emoji','?')} **{info.get('name', backend)}**{marker}\n"
        f"  RAM : `{info.get('ram','?')}` | "
        f"Latence : `{info.get('latency','?')}` | "
        f"CPU : `{info.get('cpu','?')}`\n"
        f"  {info.get('desc','')}"
    )


async def run_bench_quick(agent_id: str = "coder") -> str:
    """Lance un benchmark rapide sur les backends disponibles."""
    prompt = "Dis bonjour en 5 mots max."
    results = []

    for backend_name in ["mock", "bitnet", "ollama"]:
        try:
            from agents.common.llm_client import LLMClient
            client = LLMClient(
                backend=backend_name,
                agent_id=agent_id if backend_name == "mock" else None,
            )
            start = time.time()
            result = await client.agenerate(prompt, max_tokens=50)
            duration = int((time.time() - start) * 1000)
            results.append(f"  {BACKENDS[backend_name]['emoji']} `{backend_name:<8}` → `{duration}ms` | {result.text[:40]}...")
        except Exception as e:
            results.append(f"  ✗ `{backend_name:<8}` → indisponible ({str(e)[:50]})")

    return "\n".join(results)


async def handle_backend_command(message) -> None:
    """
    Gère les commandes !backend depuis Discord.

    Exemples :
        !backend             → affiche le statut
        !backend mock        → active le Mock
        !backend bitnet      → active BitNet
        !backend ollama      → active Ollama
        !backend status      → statut détaillé
        !backend bench       → benchmark rapide
    """
    parts = message.content.strip().split()
    subcmd = parts[1].lower() if len(parts) > 1 else "status"

    active = get_active_backend()

    if subcmd == "status" or subcmd == "info":
        lines = ["**🔧 Backends LLM disponibles**\n"]
        for name in ["mock", "bitnet", "ollama"]:
            lines.append(format_backend_status(name))
            lines.append("")
        lines.append(f"**Actif :** `{active}`")
        await message.channel.send("\n".join(lines))
        return

    if subcmd in BACKENDS:
        old = get_active_backend()
        if set_backend(subcmd):
            info = BACKENDS[subcmd]
            msg = (
                f"{info['emoji']} **Backend changé : `{old}` → `{subcmd}`**\n\n"
                f"**{info['name']}** — {info['desc']}\n"
                f"RAM : `{info['ram']}` | Latence : `{info['latency']}` | CPU : `{info['cpu']}`\n\n"
                f"*Le changement prend effet sur la prochaine requête.*"
            )
            await message.channel.send(msg)
        else:
            await message.channel.send(f"❌ Backend inconnu : `{subcmd}`")
        return

    if subcmd == "bench":
        await message.channel.send("⏱️ Benchmark en cours...")
        results = await run_bench_quick()
        await message.channel.send(
            f"**📊 Benchmark comparatif** (prompt : 'Dis bonjour en 5 mots')\n\n{results}"
        )
        return

    # Aide
    help_msg = (
        "**🔧 Commandes !backend**\n\n"
        "`!backend`            → statut des backends\n"
        "`!backend mock`       → 🧪 Mock (0.3s, 0MB)\n"
        "`!backend bitnet`     → ⚡ BitNet (1-2s, 1.2GB)\n"
        "`!backend ollama`     → 🦙 Ollama (5-8s, 3.5GB)\n"
        "`!backend bench`      → benchmark comparatif\n"
    )
    await message.channel.send(help_msg)
