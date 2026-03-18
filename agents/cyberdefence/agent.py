#!/usr/bin/env python3
"""
CyberDefence Agent - Surveillance et sécurité du framework Local Agents
Monitore en temps réel : agents, orchestrateur, API, anomalies
Sans LLM — logique déterministe uniquement.
"""

import asyncio
import json
import time
import re
import os
import csv
import io
from datetime import datetime, timezone
from collections import defaultdict
from dataclasses import dataclass, field, asdict
from typing import Optional
from pathlib import Path

import yaml
from aiohttp import web, ClientSession, ClientTimeout

from agents.common.logger import get_logger
from agents.common.protocol import (
    TaskRequest, TaskResponse, ResponseStatus,
    ResponseContent, ResponseType, Metrics
)

logger = get_logger("cyberdefence")

# ─── Chargement config.yaml ────────────────────────────────────────────────────

def load_config() -> dict:
    """Charge la config depuis config.yaml, avec valeurs par défaut."""
    defaults = {
        "check_interval": 15,
        "max_req_per_min": 30,
        "replay_ttl_sec": 300,
        "auto_block": False,
        "auto_block_threshold": 5,
    }
    config_paths = ["config.yaml", "config.docker.yaml"]
    for path in config_paths:
        if Path(path).exists():
            try:
                with open(path) as f:
                    raw = yaml.safe_load(f)
                cyber = raw.get("agents", {}).get("cyberdefence", {}).get("config", {})
                orchestrator_port = raw.get("server", {}).get("port", 8080)
                orchestrator_host = raw.get("server", {}).get("host", "localhost")
                if orchestrator_host == "0.0.0.0":
                    orchestrator_host = "localhost"
                merged = {**defaults, **cyber}
                
                # On donne la priorité à la variable d'environnement si elle existe
                env_url = os.getenv("ORCHESTRATOR_URL")
                if env_url:
                    merged["orchestrator_url"] = env_url
                else:
                    merged["orchestrator_url"] = f"http://{orchestrator_host}:{orchestrator_port}"
                    
                merged["agent_port"] = (
                    raw.get("agents", {})
                       .get("cyberdefence", {})
                       .get("port", 8086)
                )
                # Agents à surveiller (tous sauf cyberdefence lui-même)
                merged["watched_agents"] = [
                    k for k, v in raw.get("agents", {}).items()
                    if k != "cyberdefence" and v.get("enabled", True) and v.get("monitor", True)
                ]
                logger.info(f"Config chargée depuis {path}")
                return merged
            except Exception as e:
                logger.error(f"Erreur lecture config : {e}")
    logger.info("Config par défaut utilisée (config.yaml introuvable)")
    defaults["orchestrator_url"] = os.getenv("ORCHESTRATOR_URL", "http://localhost:8080")
    defaults["agent_port"] = 8086
    defaults["watched_agents"] = ["coder", "files", "email", "social", "discord"]
    return defaults


CONFIG = load_config()

ORCHESTRATOR_URL = CONFIG["orchestrator_url"]
AGENT_PORT       = CONFIG["agent_port"]
CHECK_INTERVAL   = CONFIG["check_interval"]
MAX_REQ_PER_MIN  = CONFIG["max_req_per_min"]
REPLAY_TTL       = CONFIG["replay_ttl_sec"]
AUTO_BLOCK       = CONFIG["auto_block"]
AUTO_BLOCK_THRESH= CONFIG["auto_block_threshold"]
WATCHED_AGENTS   = CONFIG["watched_agents"]

# Webhook Discord pour alertes CRITICAL (lu depuis .env)
DISCORD_WEBHOOK  = os.getenv("CYBERDEFENCE_DISCORD_WEBHOOK", "")

# Patterns d'injection — extensibles via config (BANNED_PATTERNS dans config.yaml)
BANNED_PATTERNS: list[str] = CONFIG.get("banned_patterns", [
    r"(?i)(ignore previous|jailbreak|act as DAN|bypass|forget your instructions|disregard)",
    r"(?i)(rm -rf|os\.system|subprocess|__import__|exec\(|eval\()",
    r"(?i)(drop table|union select|; ?--|xp_cmdshell|insert into|delete from)",
])

# Routes health candidates sur l'orchestrateur (teste dans l'ordre)
HEALTH_ROUTES = ["/api/health", "/health", "/ping", "/status"]

# ─── State ─────────────────────────────────────────────────────────────────────

@dataclass
class AgentStatus:
    agent_id: str
    status: str = "unknown"       # healthy | degraded | unreachable | unknown
    last_seen: Optional[str] = None
    response_time_ms: int = 0
    consecutive_failures: int = 0
    total_requests: int = 0
    total_errors: int = 0

@dataclass
class SecurityEvent:
    timestamp: str
    severity: str                  # INFO | WARNING | CRITICAL
    source: str
    event_type: str
    description: str
    metadata: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)


class CyberDefenceState:
    def __init__(self):
        self.agents: dict[str, AgentStatus] = {
            a: AgentStatus(agent_id=a) for a in WATCHED_AGENTS
        }
        self.orchestrator_failures: int = 0
        self.orchestrator_status: str = "unknown"
        self.health_route: Optional[str] = None   # route qui fonctionne
        self.events: list[SecurityEvent] = []
        self.rate_counters: dict[str, list[float]] = defaultdict(list)
        self.blocked_ips: set[str] = set()
        self.request_ids: dict[str, float] = {}
        self.started_at = datetime.now(timezone.utc).isoformat()
        self.total_inspected: int = 0
        self.total_blocked: int = 0

    # ── Événements ──────────────────────────────────────────────────────────

    def add_event(
        self,
        severity: str,
        source: str,
        event_type: str,
        description: str,
        metadata: dict | None = None
    ) -> SecurityEvent:
        ev = SecurityEvent(
            timestamp=datetime.now(timezone.utc).isoformat(),
            severity=severity,
            source=source,
            event_type=event_type,
            description=description,
            metadata=metadata or {}
        )
        self.events.append(ev)
        # Rotation à 1000 (garde les 500 derniers)
        if len(self.events) > 1000:
            self.events = self.events[-500:]

        if severity == "CRITICAL":
            logger.error(f"[{severity}] {event_type} — {description}")
        elif severity == "WARNING":
            logger.warn(f"[{severity}] {event_type} — {description}")
        else:
            logger.info(f"[{severity}] {event_type} — {description}")

        # Alerte Discord pour CRITICAL et WARNING
        if severity in ("CRITICAL", "WARNING") and DISCORD_WEBHOOK:
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    asyncio.ensure_future(send_discord_alert(ev))
            except RuntimeError:
                pass

        return ev

    # ── Rate limiting ────────────────────────────────────────────────────────

    def check_rate_limit(self, identifier: str) -> bool:
        """True = autorisé, False = bloqué."""
        now = time.time()
        window = [t for t in self.rate_counters[identifier] if now - t < 60]
        self.rate_counters[identifier] = window
        if len(window) >= MAX_REQ_PER_MIN:
            return False
        self.rate_counters[identifier].append(now)
        return True

    # ── Injection ────────────────────────────────────────────────────────────

    def check_prompt_injection(self, message: str) -> Optional[str]:
        for pattern in BANNED_PATTERNS:
            if re.search(pattern, message):
                return pattern
        return None

    # ── Anti-replay ──────────────────────────────────────────────────────────

    def check_replay(self, request_id: str) -> bool:
        """True = replay détecté."""
        now = time.time()
        self.request_ids = {
            k: v for k, v in self.request_ids.items()
            if now - v < REPLAY_TTL
        }
        if request_id in self.request_ids:
            return True
        self.request_ids[request_id] = now
        return False

    # ── Auto-block ───────────────────────────────────────────────────────────

    def maybe_auto_block(self, ip: str, agent_id: Optional[str] = None):
        """Bloque l'IP si auto_block activé et seuil dépassé."""
        if not AUTO_BLOCK or not ip:
            return
        # Compte les events CRITICAL/WARNING récents pour cette IP
        recent_count = sum(
            1 for e in self.events[-100:]
            if e.metadata.get("ip") == ip
            or e.metadata.get("user_id") == ip
        )
        if recent_count >= AUTO_BLOCK_THRESH and ip not in self.blocked_ips:
            self.blocked_ips.add(ip)
            self.add_event(
                "INFO", "auto_block", "IP_AUTO_BLOCKED",
                f"IP {ip} bloquée automatiquement après {recent_count} incidents",
                {"ip": ip, "trigger_count": recent_count}
            )


# ─── Alertes Discord ──────────────────────────────────────────────────────────

SEVERITY_COLORS = {
    "CRITICAL": 0xFF0000,  # rouge
    "WARNING":  0xFFA500,  # orange
    "INFO":     0x3498DB,  # bleu
}

SEVERITY_ICONS = {
    "CRITICAL": "🔴",
    "WARNING":  "🟡",
    "INFO":     "🔵",
}

async def send_discord_alert(ev: "SecurityEvent"):
    """Envoie une alerte Discord via webhook pour les événements CRITICAL."""
    if not DISCORD_WEBHOOK:
        return
    icon = SEVERITY_ICONS.get(ev.severity, "⚪")
    embed = {
        "title": f"{icon} CyberDefence — {ev.event_type}",
        "description": ev.description,
        "color": SEVERITY_COLORS.get(ev.severity, 0x95A5A6),
        "fields": [
            {"name": "Sévérité", "value": ev.severity, "inline": True},
            {"name": "Source",   "value": ev.source,   "inline": True},
            {"name": "Heure",    "value": ev.timestamp[:19].replace("T", " ") + " UTC", "inline": True},
        ],
        "footer": {"text": "Local Agents — CyberDefence v1.1.0"},
    }
    if ev.metadata:
        details = "\n".join(f"`{k}`: {v}" for k, v in list(ev.metadata.items())[:5])
        embed["fields"].append({"name": "Détails", "value": details, "inline": False})

    payload = {"embeds": [embed]}
    try:
        async with ClientSession() as session:
            async with session.post(
                DISCORD_WEBHOOK,
                json=payload,
                timeout=ClientTimeout(total=5)
            ) as resp:
                if resp.status not in (200, 204):
                    logger.warn(f"Webhook Discord : HTTP {resp.status}")
    except Exception as e:
        logger.warn(f"Échec alerte Discord : {e}")


state = CyberDefenceState()

# ─── Monitoring actif ──────────────────────────────────────────────────────────

async def discover_health_route(session: ClientSession) -> Optional[str]:
    """Trouve la route /health qui fonctionne sur l'orchestrateur."""
    for route in HEALTH_ROUTES:
        try:
            async with session.get(
                f"{ORCHESTRATOR_URL}{route}",
                timeout=ClientTimeout(total=3)
            ) as resp:
                if resp.status == 200:
                    logger.info(f"Route health trouvée : {route}")
                    return route
        except Exception:
            continue
    return None


async def check_orchestrator(session: ClientSession):
    """Vérifie l'orchestrateur. Alerte seulement après 3 échecs consécutifs."""
    # Découverte de route au premier appel
    if state.health_route is None:
        state.health_route = await discover_health_route(session)

    url = f"{ORCHESTRATOR_URL}{state.health_route or HEALTH_ROUTES[0]}"
    try:
        async with session.get(url, timeout=ClientTimeout(total=5)) as resp:
            if resp.status < 500:
                if state.orchestrator_failures >= 3:
                    state.add_event(
                        "INFO", "monitor", "ORCHESTRATOR_RECOVERED",
                        f"Orchestrateur de nouveau joignable (HTTP {resp.status})"
                    )
                state.orchestrator_failures = 0
                state.orchestrator_status = "healthy"
            else:
                state.orchestrator_failures += 1
                state.orchestrator_status = "degraded"
                if state.orchestrator_failures == 3:
                    state.add_event(
                        "CRITICAL", "monitor", "ORCHESTRATOR_DOWN",
                        f"Orchestrateur répond HTTP {resp.status} depuis 3 checks"
                    )
    except Exception as e:
        state.orchestrator_failures += 1
        state.orchestrator_status = "unreachable"
        # Redécouverte si la route ne fonctionne plus
        state.health_route = None
        if state.orchestrator_failures == 3:
            state.add_event(
                "CRITICAL", "monitor", "ORCHESTRATOR_UNREACHABLE",
                f"Orchestrateur inaccessible depuis 3 checks : {e}"
            )


async def ping_agent(session: ClientSession, agent_id: str):
    """Ping un agent via l'orchestrateur."""
    s = state.agents[agent_id]
    url = f"{ORCHESTRATOR_URL}/api/agents/{agent_id}/health"
    start = time.time()
    try:
        async with session.get(url, timeout=ClientTimeout(total=5)) as resp:
            s.response_time_ms = int((time.time() - start) * 1000)
            s.last_seen = datetime.now(timezone.utc).isoformat()
            s.total_requests += 1
            if resp.status == 200:
                try:
                    data = await resp.json()
                    s.status = data.get("status", "healthy")
                except Exception:
                    s.status = "healthy"
                prev_failures = s.consecutive_failures
                s.consecutive_failures = 0
                if prev_failures >= 3:
                    state.add_event(
                        "INFO", "monitor", "AGENT_RECOVERED",
                        f"Agent '{agent_id}' de nouveau joignable",
                        {"agent_id": agent_id}
                    )
            else:
                s.status = "degraded"
                s.consecutive_failures += 1
                s.total_errors += 1
    except Exception as e:
        s.status = "unreachable"
        s.consecutive_failures += 1
        s.total_errors += 1
        if s.consecutive_failures == 3:
            state.add_event(
                "CRITICAL", "monitor", "AGENT_UNREACHABLE",
                f"Agent '{agent_id}' injoignable depuis 3 checks",
                {"agent_id": agent_id, "error": str(e)}
            )


async def monitor_loop():
    """Boucle principale de monitoring."""
    with open("doc/training/log.txt", "a") as logf:
        logf.write("[CYBERDEFENCE] Pause initiale 5s pour laisser démarrer les services...\n")
    await asyncio.sleep(5)  # Laisser le temps au reste de démarrer
    async with ClientSession() as session:
        while True:
            try:
                await check_orchestrator(session)
                for agent_id in WATCHED_AGENTS:
                    await ping_agent(session, agent_id)
            except Exception as e:
                logger.error(f"Erreur dans monitor_loop : {e}")
            with open("doc/training/log.txt", "a") as logf:
                logf.write(f"[CYBERDEFENCE] Pause {CHECK_INTERVAL}s avant prochain monitoring...\n")
            await asyncio.sleep(CHECK_INTERVAL)

# ─── Middleware /inspect ───────────────────────────────────────────────────────

async def handle_inspect(request: web.Request) -> web.Response:
    """
    POST /inspect — Valide chaque requête avant routing par l'orchestrateur.
    Retourne {"allowed": bool, "reason": str}
    """
    try:
        data = await request.json()
    except Exception:
        return web.json_response(
            {"allowed": False, "reason": "Payload JSON invalide"}, status=400
        )

    state.total_inspected += 1

    client_ip  = request.headers.get("X-Forwarded-For", request.remote or "")
    request_id = data.get("request_id", "")
    task       = data.get("task", {})
    ctx_meta   = task.get("context", {}).get("metadata", {})
    user_id    = ctx_meta.get("user_id") or client_ip
    message    = task.get("message", "")

    def block(reason: str, event_type: str, severity: str = "WARNING", meta: dict | None = None) -> web.Response:
        state.total_blocked += 1
        state.add_event(severity, "inspect", event_type, reason, meta or {})
        state.maybe_auto_block(client_ip)
        return web.json_response({"allowed": False, "reason": reason})

    # 1. IP bloquée
    if client_ip and client_ip in state.blocked_ips:
        return block(
            f"IP bloquée : {client_ip}",
            "BLOCKED_IP",
            meta={"ip": client_ip}
        )

    # 2. Rate limit
    if not state.check_rate_limit(user_id):
        return block(
            "Trop de requêtes (rate limit)",
            "RATE_LIMIT",
            meta={"user_id": user_id, "ip": client_ip}
        )

    # 3. Anti-replay
    if request_id and state.check_replay(request_id):
        return block(
            "Requête dupliquée (replay)",
            "REPLAY_ATTACK",
            meta={"request_id": request_id, "user_id": user_id}
        )

    # 4. Prompt injection
    if message:
        pattern = state.check_prompt_injection(message)
        if pattern:
            return block(
                "Message refusé (contenu interdit)",
                "PROMPT_INJECTION",
                severity="CRITICAL",
                meta={
                    "user_id": user_id,
                    "ip": client_ip,
                    "preview": message[:120]
                }
            )

    return web.json_response({"allowed": True, "reason": "OK"})

# ─── API REST ──────────────────────────────────────────────────────────────────

async def handle_health(request: web.Request) -> web.Response:
    started = datetime.fromisoformat(state.started_at)
    uptime  = int((datetime.now(timezone.utc) - started).total_seconds())
    # CyberDefence est healthy s'il tourne — les agents surveillés ont leur propre statut dans /status
    has_critical = state.orchestrator_failures >= 3
    return web.json_response({
        "status": "degraded" if has_critical else "healthy",
        "agent_id": "cyberdefence",
        "version": "1.1.0",
        "uptime_seconds": uptime,
        "capabilities": [
            "monitoring", "rate_limiting",
            "prompt_injection_detection", "replay_protection", "ip_blocking"
        ],
        "model_available": False
    })


async def handle_status(request: web.Request) -> web.Response:
    return web.json_response({
        "orchestrator": {
            "status": state.orchestrator_status,
            "consecutive_failures": state.orchestrator_failures,
            "health_route": state.health_route,
        },
        "agents": {aid: asdict(s) for aid, s in state.agents.items()},
        "stats": {
            "total_inspected": state.total_inspected,
            "total_blocked": state.total_blocked,
            "events_total": len(state.events),
            "blocked_ips_count": len(state.blocked_ips),
        },
        "blocked_ips": list(state.blocked_ips),
    })


async def handle_events(request: web.Request) -> web.Response:
    severity = request.rel_url.query.get("severity", "").upper()
    source   = request.rel_url.query.get("source", "")
    limit    = min(int(request.rel_url.query.get("limit", 50)), 500)
    fmt      = request.rel_url.query.get("format", "json")  # json | csv

    events = state.events
    if severity:
        events = [e for e in events if e.severity == severity]
    if source:
        events = [e for e in events if e.source == source]
    events = events[-limit:]

    if fmt == "csv":
        output = io.StringIO()
        writer = csv.DictWriter(
            output,
            fieldnames=["timestamp", "severity", "source", "event_type", "description"]
        )
        writer.writeheader()
        for e in events:
            writer.writerow({
                "timestamp":   e.timestamp,
                "severity":    e.severity,
                "source":      e.source,
                "event_type":  e.event_type,
                "description": e.description,
            })
        return web.Response(
            text=output.getvalue(),
            content_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=security_events.csv"}
        )

    return web.json_response([e.to_dict() for e in events])


async def handle_block_ip(request: web.Request) -> web.Response:
    try:
        data = await request.json()
    except Exception:
        return web.json_response({"error": "JSON invalide"}, status=400)

    ip = data.get("ip", "").strip()
    if not ip:
        return web.json_response({"error": "Champ 'ip' requis"}, status=400)

    state.blocked_ips.add(ip)
    state.add_event(
        "INFO", "admin", "IP_BLOCKED",
        f"IP {ip} bloquée manuellement",
        {"ip": ip}
    )
    return web.json_response({"blocked": ip, "total_blocked_ips": len(state.blocked_ips)})


async def handle_unblock_ip(request: web.Request) -> web.Response:
    try:
        data = await request.json()
    except Exception:
        return web.json_response({"error": "JSON invalide"}, status=400)

    ip = data.get("ip", "").strip()
    if ip not in state.blocked_ips:
        return web.json_response({"error": f"IP {ip} non bloquée"}, status=404)

    state.blocked_ips.discard(ip)
    state.add_event(
        "INFO", "admin", "IP_UNBLOCKED",
        f"IP {ip} débloquée manuellement",
        {"ip": ip}
    )
    return web.json_response({"unblocked": ip})


async def handle_metrics(request: web.Request) -> web.Response:
    """GET /metrics — Métriques pour dashboard / Prometheus."""
    agent_metrics = {}
    for aid, s in state.agents.items():
        agent_metrics[aid] = {
            "status": s.status,
            "response_time_ms": s.response_time_ms,
            "total_requests": s.total_requests,
            "total_errors": s.total_errors,
            "error_rate": round(s.total_errors / max(s.total_requests, 1), 3),
        }

    severity_counts = {"INFO": 0, "WARNING": 0, "CRITICAL": 0}
    for e in state.events:
        severity_counts[e.severity] = severity_counts.get(e.severity, 0) + 1

    return web.json_response({
        "uptime_seconds": int(
            (datetime.now(timezone.utc) -
             datetime.fromisoformat(state.started_at)).total_seconds()
        ),
        "inspected_total": state.total_inspected,
        "blocked_total":   state.total_blocked,
        "block_rate": round(state.total_blocked / max(state.total_inspected, 1), 3),
        "blocked_ips_count": len(state.blocked_ips),
        "events_by_severity": severity_counts,
        "agents": agent_metrics,
        "orchestrator_status": state.orchestrator_status,
    })


async def handle_chat(request: web.Request) -> web.Response:
    """POST /chat — Réponses en langage naturel (commandes Discord incluses)."""
    try:
        data = await request.json()
    except Exception:
        return web.json_response({"error": "JSON invalide"}, status=400)

    req = TaskRequest.from_json(data)
    msg = req.message.lower()

    if any(w in msg for w in ("status", "état", "etat", "santé", "sante")):
        orch_icon = (
            "✅" if state.orchestrator_status == "healthy"
            else ("⚠️" if state.orchestrator_status == "degraded" else "❌")
        )
        lines = [f"**🛡️ CyberDefence — État du framework**\n",
                 f"{orch_icon} `orchestrateur` — {state.orchestrator_status}\n"]
        for aid, s in state.agents.items():
            icon = "✅" if s.status == "healthy" else ("⚠️" if s.status == "degraded" else "❌")
            lines.append(f"{icon} `{aid}` — {s.status} ({s.response_time_ms}ms)")
        content = "\n".join(lines)

    elif any(w in msg for w in ("alerte", "event", "log", "incident", "sécurité", "securite")):
        recent = [e for e in state.events if e.severity in ("WARNING", "CRITICAL")][-5:]
        if not recent:
            content = "✅ Aucun incident de sécurité récent."
        else:
            lines = ["**🔔 Derniers incidents :**\n"]
            for ev in recent:
                icon = "🔴" if ev.severity == "CRITICAL" else "🟡"
                lines.append(f"{icon} `{ev.event_type}` — {ev.description}")
            content = "\n".join(lines)

    elif "métrique" in msg or "metric" in msg or "stat" in msg:
        content = (
            f"**📊 Métriques CyberDefence**\n\n"
            f"Requêtes inspectées : **{state.total_inspected}**\n"
            f"Requêtes bloquées : **{state.total_blocked}**\n"
            f"IPs bloquées : **{len(state.blocked_ips)}**\n"
            f"Événements enregistrés : **{len(state.events)}**"
        )

    else:
        content = (
            "🛡️ **CyberDefence Agent** — je surveille le framework.\n\n"
            "Commandes disponibles :\n"
            "• `status` — état de tous les agents\n"
            "• `alertes` — derniers incidents de sécurité\n"
            "• `métriques` — statistiques\n\n"
            "API : `GET /status`, `GET /events`, `GET /metrics`"
        )

    resp = TaskResponse(
        request_id=req.request_id,
        timestamp=datetime.now(timezone.utc).isoformat(),
        agent_id="cyberdefence",
        status=ResponseStatus.SUCCESS,
        response=ResponseContent(
            type=ResponseType.TEXT,
            content=content,
            format="markdown"
        ),
        metrics=Metrics(duration_ms=0)
    )
    return web.json_response(resp.to_json())

# ─── Démarrage ─────────────────────────────────────────────────────────────────

async def start_app():
    async def cors_middleware(app, handler):
        async def middleware(request):
            if request.method == "OPTIONS":
                return web.Response(headers={
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type",
                })
            response = await handler(request)
            response.headers["Access-Control-Allow-Origin"] = "*"
            return response
        return middleware

    app = web.Application(middlewares=[cors_middleware])

    app.router.add_get ("/health",     handle_health)
    app.router.add_get ("/status",     handle_status)
    app.router.add_get ("/events",     handle_events)
    app.router.add_get ("/metrics",    handle_metrics)
    app.router.add_post("/inspect",    handle_inspect)
    app.router.add_post("/block-ip",   handle_block_ip)
    app.router.add_post("/unblock-ip", handle_unblock_ip)
    app.router.add_post("/chat",       handle_chat)
    app.router.add_route("OPTIONS", "/{tail:.*}", lambda r: web.Response(headers={
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    }))

    asyncio.create_task(monitor_loop())

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", AGENT_PORT)
    await site.start()

    logger.info(
        f"CyberDefence Agent v1.1.0 démarré",
        port=AGENT_PORT,
        orchestrator=ORCHESTRATOR_URL,
        watched_agents=WATCHED_AGENTS,
        check_interval=CHECK_INTERVAL,
        auto_block=AUTO_BLOCK
    )
    await asyncio.Event().wait()


if __name__ == "__main__":
    asyncio.run(start_app())