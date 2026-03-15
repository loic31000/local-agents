"""
Commandes !backend pour le bot Discord Jarvis.

Permet de changer le backend LLM depuis Discord :
    @Jarvis !backend mock     â†’ 0.3s, 0MB RAM (dev)
    @Jarvis !backend ollama   â†’ 5-8s, 3.5GB RAM (dÃ©faut)
    @Jarvis !backend status   â†’ infos sur le backend actif
    @Jarvis !backend bench    â†’ benchmark comparatif

Ã€ intÃ©grer dans agents/discord/bot.py :

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
        "emoji": "ðŸ§ª",
        "ram": "0 MB",
        "latency": "~0.3s",
        "cpu": "0%",
        "desc": "RÃ©ponses simulÃ©es â€” dÃ©veloppement instantanÃ©",
    },
    "ollama": {
        "name": "Ollama",
        "emoji": "ðŸ¦™",
        "ram": "3.5 GB",
        "latency": "~5-8s",
        "cpu": "85%",
        "desc": "Backend Ollama â€” llama3.2:3b",
    },
    "gguf": {
        "name": "GGUF",
        "emoji": "ðŸ“¦",
        "ram": "variable",
        "latency": "variable",
        "cpu": "variable",
        "desc": "ModÃ¨le GGUF local direct",
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
    marker = " â† actif" if backend == active else ""
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

    for backend_name in ["mock", "ollama"]:
        try:
            from agents.common.llm_client import LLMClient
            client = LLMClient(
                backend=backend_name,
                agent_id=agent_id if backend_name == "mock" else None,
            )
            start = time.time()
            result = await client.agenerate(prompt, max_tokens=50)
            duration = int((time.time() - start) * 1000)
            results.append(f"  {BACKENDS[backend_name]['emoji']} `{backend_name:<8}` â†’ `{duration}ms` | {result.text[:40]}...")
        except Exception as e:
            results.append(f"  âœ— `{backend_name:<8}` â†’ indisponible ({str(e)[:50]})")

    return "\n".join(results)


async def handle_backend_command(message) -> None:
    """
    GÃ¨re les commandes !backend depuis Discord.

    Exemples :
        !backend             â†’ affiche le statut
        !backend mock        â†’ active le Mock
        !backend ollama      â†’ active Ollama
        !backend status      â†’ statut dÃ©taillÃ©
        !backend bench       â†’ benchmark rapide
    """
    parts = message.content.strip().split()
    subcmd = parts[1].lower() if len(parts) > 1 else "status"

    active = get_active_backend()

    if subcmd == "status" or subcmd == "info":
        lines = ["**ðŸ”§ Backends LLM disponibles**\n"]
        for name in ["mock", "ollama"]:
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
                f"{info['emoji']} **Backend changÃ© : `{old}` â†’ `{subcmd}`**\n\n"
                f"**{info['name']}** â€” {info['desc']}\n"
                f"RAM : `{info['ram']}` | Latence : `{info['latency']}` | CPU : `{info['cpu']}`\n\n"
                f"*Le changement prend effet sur la prochaine requÃªte.*"
            )
            await message.channel.send(msg)
        else:
            await message.channel.send(f"âŒ Backend inconnu : `{subcmd}`")
        return

    if subcmd == "bench":
        await message.channel.send("â±ï¸ Benchmark en cours...")
        results = await run_bench_quick()
        await message.channel.send(
            f"**ðŸ“Š Benchmark comparatif** (prompt : 'Dis bonjour en 5 mots')\n\n{results}"
        )
        return

    # Aide
    help_msg = (
        "**ðŸ”§ Commandes !backend**\n\n"
        "`!backend`            â†’ statut des backends\n"
        "`!backend mock`       â†’ ðŸ§ª Mock (0.3s, 0MB)\n"
        "`!backend ollama`     â†’ ðŸ¦™ Ollama (5-8s, 3.5GB)\n"
        "`!backend bench`      â†’ benchmark comparatif\n"
    )
    await message.channel.send(help_msg)
