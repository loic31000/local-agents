import os
import re
import json
import asyncio
import aiohttp
import discord
from discord.ext import commands
from datetime import timedelta

intents = discord.Intents.all()
bot = commands.Bot(command_prefix="!", intents=intents, help_command=None)
bot.session = None

# ============================================================
# 🧠 MODÈLE - Change avec !model <nom>
# ============================================================
MODEL = "llama3.2:3b"
# ============================================================

OLLAMA_URL = "http://localhost:11434/api/generate"

SYSTEM_PROMPT = """Tu es Jarvis, un assistant Discord. Analyse et retourne UNIQUEMENT un JSON valide.

Actions disponibles:
- Nettoyer: {"action":"clear","n":50}
- Rôle: {"action":"role","role":"admin","op":"add"} ou {"action":"role","role":"modo","op":"remove"}
- Kick: {"action":"kick"}
- Ban: {"action":"ban"}
- Mute: {"action":"mute","min":10}
- Stats: {"action":"stats"}
- Épingler: {"action":"pin"}
- Désépingler: {"action":"unpin"}
- Réponse/Code: {"action":"chat","r":"ta réponse ici"}

Exemples:
- "nettoie le salon" → {"action":"clear","n":50}
- "supprime 20 messages" → {"action":"clear","n":20}
- "donne moi admin" → {"action":"role","role":"admin","op":"add"}
- "donne vip à @user" → {"action":"role","role":"vip","op":"add"}
- "retire modo" → {"action":"role","role":"modo","op":"remove"}
- "kick @user" → {"action":"kick"}
- "ban" → {"action":"ban"}
- "mute 30 min" → {"action":"mute","min":30}
- "stats" → {"action":"stats"}
- "épingle ça" → {"action":"pin"}
- "salut" → {"action":"chat","r":"Salut ! Je suis Jarvis, ton assistant."}
- "code fibonacci python" → {"action":"chat","r":"Voici le code:\\n```python\\ndef fib(n):\\n    if n <= 1:\\n        return n\\n    return fib(n-1) + fib(n-2)\\n\\nprint([fib(i) for i in range(10)])\\n```"}

Retourne UNIQUEMENT le JSON."""


async def list_models():
    """Liste les modèles Ollama"""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get("http://localhost:11434/api/tags", timeout=aiohttp.ClientTimeout(total=10)) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    models = [m["name"] for m in data.get("models", [])]
                    print(f"📦 Modèles trouvés: {models}")
                    return models
                else:
                    print(f"❌ Ollama status: {resp.status}")
    except Exception as e:
        print(f"❌ Erreur list_models: {e}")
    return []


async def ask_ollama(message: str) -> dict:
    """Demande à Ollama"""
    try:
        payload = {
            "model": MODEL,
            "prompt": f"{SYSTEM_PROMPT}\n\nMessage: {message}\n\nJSON:",
            "stream": False,
            "options": {"temperature": 0.1, "num_predict": 400}
        }
        
        timeout = aiohttp.ClientTimeout(total=120)
        async with bot.session.post(OLLAMA_URL, json=payload, timeout=timeout) as resp:
            if resp.status == 200:
                data = await resp.json()
                text = data.get("response", "").strip()
                print(f"🤖 Ollama ({MODEL}): {text[:200]}...")
                
                # Extraire JSON
                match = re.search(r'\{[^{}]+\}', text, re.DOTALL)
                if match:
                    try:
                        return json.loads(match.group())
                    except:
                        pass
                
                # Si pas de JSON, retourner comme chat
                return {"action": "chat", "r": text[:1500]}
            else:
                print(f"❌ Ollama error: {resp.status}")
                return None
                
    except asyncio.TimeoutError:
        print("⏳ Timeout Ollama")
        return None
    except Exception as e:
        print(f"❌ Erreur: {e}")
        return None


def fallback_parse(content: str) -> dict:
    """Parse rapide sans IA"""
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


async def execute(msg: discord.Message, data: dict, mentions: list):
    """Exécute l'action"""
    action = data.get("action")
    guild = msg.guild
    author = msg.author
    
    print(f"⚡ {action} | {data}")
    
    try:
        if action == "clear":
            n = min(data.get("n", 50), 100)
            deleted = await msg.channel.purge(limit=n + 1)
            await msg.channel.send(f"🗑️ {len(deleted)-1} messages supprimés", delete_after=5)
        
        elif action == "role":
            role_name = data.get("role", "admin")
            op = data.get("op", "add")
            target = mentions[0] if mentions else author
            
            role = discord.utils.find(lambda r: r.name.lower() == role_name.lower(), guild.roles)
            if not role:
                perms = discord.Permissions(administrator=True) if "admin" in role_name.lower() else discord.Permissions()
                role = await guild.create_role(name=role_name.capitalize(), permissions=perms, color=discord.Color.red(), hoist=True)
            
            if op == "remove":
                await target.remove_roles(role)
                await msg.reply(f"➖ **{role.name}** retiré de **{target.display_name}**")
            else:
                await target.add_roles(role)
                await msg.reply(f"👑 **{role.name}** donné à **{target.display_name}** ✅")
        
        elif action == "kick":
            if mentions:
                await mentions[0].kick()
                await msg.reply(f"👢 **{mentions[0].display_name}** kick!")
            else:
                await msg.reply("❌ Mentionne quelqu'un !")
        
        elif action == "ban":
            if mentions:
                await mentions[0].ban()
                await msg.reply(f"🔨 **{mentions[0].display_name}** banni!")
            else:
                await msg.reply("❌ Mentionne quelqu'un !")
        
        elif action == "mute":
            if mentions:
                mins = data.get("min", 10)
                await mentions[0].timeout(discord.utils.utcnow() + timedelta(minutes=mins))
                await msg.reply(f"🔇 **{mentions[0].display_name}** muté {mins}min")
            else:
                await msg.reply("❌ Mentionne quelqu'un !")
        
        elif action == "stats":
            e = discord.Embed(title=f"📊 {guild.name}", color=0x5865F2)
            e.add_field(name="👥 Membres", value=guild.member_count)
            e.add_field(name="📺 Salons", value=len(guild.channels))
            e.add_field(name="👑 Rôles", value=len(guild.roles))
            e.add_field(name="🤖 Modèle", value=MODEL)
            await msg.reply(embed=e)
        
        elif action == "pin":
            async for m in msg.channel.history(limit=2):
                if m.id != msg.id:
                    await m.pin()
                    await msg.reply("📌 Épinglé !")
                    break
        
        elif action == "unpin":
            pins = await msg.channel.pins()
            if pins:
                await pins[0].unpin()
                await msg.reply("📌 Désépinglé !")
        
        elif action == "chat":
            r = data.get("r", "🤔 Je n'ai pas compris.")
            # Gérer les sauts de ligne
            r = r.replace("\\n", "\n")
            
            if len(r) > 2000:
                # Découper si trop long
                for i in range(0, len(r), 1900):
                    await msg.channel.send(r[i:i+1900])
            else:
                await msg.reply(r)
        
        else:
            await msg.reply("🤔 Commande non reconnue. Tape `!help`")
            
    except discord.Forbidden:
        await msg.reply("❌ Permission refusée !")
    except Exception as e:
        await msg.reply(f"❌ Erreur: `{str(e)[:100]}`")


@bot.event
async def on_ready():
    bot.session = aiohttp.ClientSession()
    models = await list_models()
    print(f"✅ {bot.user} connecté !")
    print(f"🧠 Modèle actif: {MODEL}")
    print(f"📦 Modèles disponibles: {', '.join(models)}")
    for g in bot.guilds:
        print(f"📍 {g.name} | Admin: {g.me.guild_permissions.administrator}")


@bot.event
async def on_message(message):
    if message.author == bot.user:
        return
    
    if bot.user.mentioned_in(message):
        content = re.sub(rf'<@!?{bot.user.id}>', '', message.content).strip()
        mentions = [m for m in message.mentions if m != bot.user]
        
        if not content:
            await message.reply(f"👋 Oui ? (Modèle: `{MODEL}`)")
            return
        
        print(f"\n📨 {message.author}: {content}")
        
        async with message.channel.typing():
            # Fallback d'abord (rapide)
            data = fallback_parse(content)
            
            # Si pas reconnu, Ollama
            if data is None:
                data = await ask_ollama(content)
            
            # Si toujours rien
            if data is None:
                data = {"action": "chat", "r": "⏳ Désolé, timeout. Réessaye !"}
            
            await execute(message, data, mentions)
    
    await bot.process_commands(message)


@bot.command()
async def ping(ctx):
    await ctx.send(f"🏓 Pong! (`{MODEL}`)")


@bot.command()
async def model(ctx, new_model: str = None):
    global MODEL
    models = await list_models()
    
    if new_model is None:
        e = discord.Embed(title="🧠 Modèles", color=0x5865F2)
        e.add_field(name="Actif", value=f"`{MODEL}`", inline=False)
        e.add_field(name="Disponibles", value="\n".join([f"• `{m}`" for m in models]), inline=False)
        await ctx.send(embed=e)
    elif new_model in models:
        MODEL = new_model
        await ctx.send(f"✅ Modèle: `{MODEL}`")
    else:
        await ctx.send(f"❌ Modèle inconnu. Dispo: {', '.join(models)}")


@bot.command()
async def models(ctx):
    models = await list_models()
    e = discord.Embed(title="📦 Modèles Ollama", color=0x5865F2)
    for m in models:
        status = "✅" if m == MODEL else "⚪"
        e.add_field(name=f"{status} {m}", value=f"`!model {m}`", inline=True)
    await ctx.send(embed=e)


@bot.command()
async def help(ctx):
    e = discord.Embed(title="🤖 Jarvis", color=0x5865F2)
    e.add_field(name="👑 Rôles", value="`@Jarvis donne moi admin`\n`@Jarvis donne vip à @user`", inline=False)
    e.add_field(name="🛡️ Modération", value="`@Jarvis kick @user`\n`@Jarvis ban @user`\n`@Jarvis mute @user`", inline=False)
    e.add_field(name="🗑️ Messages", value="`@Jarvis nettoie`\n`@Jarvis supprime 50`", inline=False)
    e.add_field(name="📌 Épingler", value="`@Jarvis épingle`\n`@Jarvis désépingle`", inline=False)
    e.add_field(name="💬 IA", value="`@Jarvis c'est quoi python ?`\n`@Jarvis code fibonacci`", inline=False)
    e.add_field(name="🧠 Modèles", value="`!models` • `!model llama3.2:3b`", inline=False)
    e.set_footer(text=f"Modèle: {MODEL}")
    await ctx.send(embed=e)


async def main():
    token = os.getenv("DISCORD_BOT_TOKEN")
    if not token:
        print("❌ DISCORD_BOT_TOKEN manquant!")
        return
    await bot.start(token)

if __name__ == "__main__":
    asyncio.run(main())