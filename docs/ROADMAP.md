# 📋 ROADMAP — Nexus v5.x

## Architecture actuelle (v5.0.0)

```
┌─────────────────────────────────────────────────────┐
│  Nexus Dashboard (React + TypeScript + Vite)        │
│  8 pages · Métriques système live · Dark UI         │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP + WebSocket
┌──────────────────────▼──────────────────────────────┐
│  Orchestrateur Go :8081                             │
│  API REST · Queue · 5 workers · /api/metrics/system  │
└──┬──────────┬──────────┬──────────────┬─────────────┘
   │          │          │              │
coder       files      email     cyberdefence :8086
   │                              (Python)
┌──▼────────────┐   ┌─────────────────────────────┐
│ BackendRouter │   │  Training Service            │
│ Mock | Ollama │   │  LoRA/QLoRA · PostgreSQL     │
└───────────────┘   └─────────────────────────────┘
```

---

## ✅ Terminé — v1.0 → v5.0

| Feature | Version | Statut |
|---------|---------|--------|
| Orchestrateur Go + WebSocket | v1.0 | ✅ |
| Agents Python (coder, files, email) | v1.0 | ✅ |
| Support Ollama | v1.0 | ✅ |
| Bot Discord Jarvis | v3.0 | ✅ |
| CyberDefence (injection, replay, IP) | v4.0 | ✅ |
| Dashboard Web v1 | v4.0 | ✅ |
| BackendRouter Mock Layer (52×) | v4.1 | ✅ |
| Scripts install.sh + install.ps1 | v4.2 | ✅ |
| Suppression BitNet | v4.2.1 | ✅ |
| **Refonte UI complète — Nexus** | **v5.0** | ✅ |
| Dashboard KPIs + charts + terminal | v5.0 | ✅ |
| Chat sans sidebar + dropdown agents | v5.0 | ✅ |
| Models — groupés, pull streaming | v5.0 | ✅ |
| Training — jobs LoRA + logs inline | v5.0 | ✅ |
| Datasets — JSONL, HF, Discord | v5.0 | ✅ |
| Observability — latences p50/p95/p99 | v5.0 | ✅ |
| CyberDefence — vertical, épuré | v5.0 | ✅ |
| Settings — accordéons, persistance | v5.0 | ✅ |
| Métriques CPU/RAM/GPU temps réel | v5.0 | ✅ |
| Logo Nexus SVG custom | v5.0 | ✅ |

---

## ⏸️ En pause — BitNet (2027)

> BitNet b1.58 bloqué sur Windows (ClangCL manquant, lld-link cassé). Reporté à 2027 ou Linux/WSL2.

**Alternative** : `ollama pull qwen2.5-coder:1.5b` — 30 t/s CPU, zéro compilation.

---

## 🔥 Priorité #1 — Observer Bus v5.1.0 *(2 semaines)*

Le service Observer existe en config mais n'est pas encore codé.

| Événement | Action |
|-----------|--------|
| Agent error | Alerte CyberDefence auto |
| LoRA switch | Stats temps réel Dashboard |
| Perf spike | Alerte Observability |
| Mock hit | Compteur Dashboard |

```go
// Route à ajouter dans orchestrateur
router.HandleFunc("/api/observer/events", o.handleObserverEvents)
router.HandleFunc("/api/stats", o.handleStats)  // métriques réelles par agent
```

---

## 🎓 Priorité #2 — LoRA Router v5.2.0 *(1 mois)*

Chaque agent charge automatiquement son adapteur LoRA selon le contexte.

| Adapteur | Déclenché par |
|----------|---------------|
| `coder-lora` | "code python", "fonction", "bug" |
| `cyber-lora` | "scan IP", "exploit", "pentest" |
| `fr-lora` | messages en français |

```yaml
lora:
  base_model: "ollama/qwen2.5-coder:1.5b"
  auto_switch: true
  adapters:
    coder: "loras/coder.pt"
    cyberdefence: "loras/cyber.pt"
```

---

## 🧠 Priorité #3 — ReMe Memory v5.3.0

Mémoire persistante cross-session par agent (inspiré CoPaw/AgentScope).

```
SQLite par agent — cross-session
memory/agent_coder/conversations.db
Récupération contexte 30j max
```

Impact : garde l'historique Discord même après `docker compose down`

---

## 🔌 Priorité #4 — MCP Endpoint v5.4.0

```
POST /api/mcp/{tool}
Standardise outils externes (VSCode, Git, terminal)
Compatible AgentScope ecosystem
```

---

## 📱 Optionnel — Telegram Bot v5.5.0

Parallèle au bot Discord Jarvis, 2ème canal. Impact estimé +20% utilisateurs (Telegram > Discord dev FR).

---

## 📊 Plan v5.x *(8 semaines)*

| Semaine | Objectif | Statut |
|---------|----------|--------|
| 1–2 | Observer Bus + `/api/stats` réelles | 🔥 Prochain |
| 3–4 | LoRA Router — 10 agents spécialisés | ⏳ |
| 5–6 | ReMe Memory — historique cross-session | ⏳ |
| 7–8 | **Release v5.5.0** | ⏳ |

---

## 🔮 Vision 2027 — Marketplace

```bash
just marketplace install crypto   # Agent Crypto live
just marketplace list             # Voir tous les LoRA disponibles
```

| Agent | Spécialité |
|-------|------------|
| 👑 Coder Pro | Python · JS · Go · Rust |
| ₿ Crypto Expert | Smart contracts · MEV |
| 🎮 GameDev | Unity C# · Godot |
| 🛡️ Pentest Pro | Burp · Metasploit · Nmap |
| 🤖 ML Engineer | PyTorch · TensorFlow |
| 🇫🇷 Français Tech | Docs · code · emails |

---

## 📈 Évolution

| Version | UI | Features |
|---------|----|----------|
| ✅ v4.0 | Web basique | Discord + CyberDefence |
| ✅ v4.2 | Web basique | Mock 52× + Scripts install |
| ✅ **v5.0** | **Nexus complet** | **8 pages · Training · Datasets · Métriques live** |
| 🔥 v5.2 | Nexus + LoRA UI | LoRA Router + Observer |
| ⭐ 2027 | Nexus + Marketplace | ReMe + MCP + 50+ agents |

---

⭐ [github.com/loic31000/local-agents](https://github.com/loic31000/local-agents)