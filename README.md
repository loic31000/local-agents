<div align="center">

# ✦ Nexus

[![Version](https://img.shields.io/badge/version-5.0.0-blue?style=for-the-badge)](https://github.com/loic31000/local-agents/releases)
[![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)](LICENSE)
[![100% Local](https://img.shields.io/badge/100%25-Local-brightgreen?style=for-the-badge)](https://github.com/loic31000/local-agents)

[![Go](https://img.shields.io/badge/Go-1.22+-00ADD8?style=for-the-badge&logo=go&logoColor=white)](https://go.dev)
[![React](https://img.shields.io/badge/React-18+-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![Ollama](https://img.shields.io/badge/Ollama-powered-black?style=for-the-badge)](https://ollama.com)

[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://docs.docker.com/compose)
[![AMD Radeon](https://img.shields.io/badge/AMD-Radeon-ED1C24?style=for-the-badge&logo=amd&logoColor=white)](https://ollama.com/docs/gpu)
[![NVIDIA CUDA](https://img.shields.io/badge/NVIDIA-CUDA-76B900?style=for-the-badge&logo=nvidia&logoColor=white)](https://developer.nvidia.com/cuda-toolkit)

**Local AI Platform — orchestrateur Go, agents Python, fine-tuning LoRA, sécurité intégrée.**

*Ollama tourne en natif sur l'hôte (CPU/GPU direct). Docker pour orchestrateur + agents uniquement.*

[Installation](#démarrage-rapide) •
[Architecture](#architecture) •
[Dashboard](#dashboard-nexus) •
[Agents](#agents) •
[Training](#training--fine-tuning) •
[CyberDefence](#cyberdefence) •
[GPU](#gpu) •
[Changelog](docs/CHANGELOG.md) •
[Roadmap](docs/ROADMAP.md)

</div>

---

## Screenshots

### Dashboard

| Dashboard |
|-----------|
| ![Dashboard](docs/screenshots/Dashboard.png) |

### Chat

| Chat 1 | Chat 2 |
|--------|--------|
| ![Chat 1](docs/screenshots/Chat1.png) | ![Chat 2](docs/screenshots/Chat2.png) |

### Models & Training

| Models | Training |
|--------|----------|
| ![Models](docs/screenshots/Model.png) | ![Training](docs/screenshots/Training.png) |

### Datasets, Observability & Settings

| Datasets | Observability | Settings |
|----------|---------------|----------|
| ![Datasets](docs/screenshots/Dataset.png) | ![Observability](docs/screenshots/Observability.png) | ![Settings](docs/screenshots/parametres.png) |




## Fonctionnalités

| Catégorie | Détail |
|-----------|--------|
| 🎨 **Dashboard Nexus** | Interface React/TypeScript dark — 8 pages, métriques CPU/RAM/GPU temps réel dans la navbar |
| 🔀 **Orchestration** | Routing intelligent, queue de tâches, workers concurrents, WebSocket temps réel |
| 🤖 **Agents** | Coder, Files, Email — sélecteur dropdown avec Stop/Start/Config inline |
| 🧠 **LLM** | BackendRouter transparent Mock / Ollama, fallback automatique |
| ⚡ **Mock Layer** | Dev instantané 0.8s / 0 MB RAM — 52× plus rapide qu'Ollama |
| 🎓 **Training** | Fine-tuning LoRA/QLoRA, datasets JSONL, logs temps réel, import HuggingFace |
| 📊 **Datasets** | Upload JSONL, éditeur manuel, import HuggingFace, export Discord |
| 👁️ **Observability** | Latences p50/p95/p99, requêtes par heure, WebSocket logs, état agents |
| 🛡️ **CyberDefence** | Rate limiting, prompt injection, anti-replay, blocage IP, alertes Discord |
| 📡 **Métriques système** | CPU%, RAM (GB), GPU% via `/api/metrics/system` — refresh 3s |

---

## Démarrage rapide

### 🐳 Docker (recommandé)

```bash
# 1. Cloner
git clone https://github.com/loic31000/local-agents
cd local-agents

# 2. Ollama en natif
curl -fsSL https://ollama.com/install.sh | sh   # Linux/macOS
# ou télécharger ollama-windows-amd64.exe        # Windows
ollama pull qwen2.5-coder:1.5b

# 3. Configurer
cp .env.example .env
# OLLAMA_URL=http://host.docker.internal:11434  # Windows/macOS
# OLLAMA_URL=http://host-gateway:11434          # Linux Docker

# 4. Lancer
just start

# 5. Frontend dev
cd frontend && pnpm install && pnpm dev
# → http://localhost:5173
```

### 🪟 Installation automatique Windows

```powershell
irm https://raw.githubusercontent.com/loic31000/local-agents/main/scripts/install.ps1 | iex
```

### 🐧 Installation automatique Linux

```bash
curl -fsSL https://raw.githubusercontent.com/loic31000/local-agents/main/scripts/install.sh | bash
```

### ⚡ Commandes Justfile

```bash
just start            # démarre tous les services
just stop             # arrête tout
just status           # état des containers
just logs             # tail des logs
just build            # rebuild les images Docker
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Nexus Dashboard  (React + TypeScript + Vite)               │
│  :5173 dev / :8081 prod                                     │
│  Dashboard · Chat · Models · Training · Datasets ·          │
│  Observability · CyberDefence · Settings                    │
│  Navbar: CPU% · RAM · GPU% (refresh 3s)                     │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP + WebSocket
┌──────────────────────────▼──────────────────────────────────┐
│  Orchestrateur Go  :8081                                    │
│  routing · queue · 5 workers · API REST                     │
│  /api/metrics/system  (gopsutil → CPU/RAM/GPU)              │
└──┬─────────────┬──────────────┬──────────────┬─────────────┘
   │             │              │              │
coder         files           email      cyberdefence
(Go agent)  (Go agent)    (Go agent)     :8086 (Python)
   │
┌──▼──────────────┐   ┌──────────────────────┐
│  BackendRouter  │   │  Training Service    │
│  Mock | Ollama  │   │  LoRA/QLoRA Python   │
│  .backend file  │   │  PostgreSQL datasets  │
└─────────────────┘   └──────────────────────┘
         │
   Ollama natif
   (hôte, GPU direct)
```

---

## Dashboard Nexus

Interface React/TypeScript construite avec Vite, Tailwind CSS, Recharts.

### Navbar persistante

- **Logo Nexus** — réseau de nœuds SVG custom, sous-titre "Local AI Platform"
- **Métriques système temps réel** — CPU%, RAM (GB utilisés), GPU% si NVIDIA — mini barres colorées, refresh 3s
- **Statut Online** — indicateur vert pulsé

### Pages

| Page | Route | Description |
|------|-------|-------------|
| **Dashboard** | `/` | KPIs (agents, uptime, training, sécurité), charts activité, terminal live WebSocket |
| **Chat** | `/chat` | Sélecteur d'agent dropdown, markdown rendu, syntax highlighting, export .md/.txt |
| **Models** | `/models` | Gestion modèles Ollama — pull avec progression, groupés par famille, sélecteur backend |
| **CyberDefence** | `/cyber` | Timeline des menaces, analyseur de message, IPs bloquées, terminal log |
| **Training** | `/training` | Jobs LoRA/QLoRA, logs inline temps réel, upload dataset, nouveau job modal |
| **Datasets** | `/datasets` | Upload JSONL, éditeur manuel, import HuggingFace, export Discord |
| **Observability** | `/observability` | Latences p50/p95/p99, requêtes par heure, état agents, WebSocket logs |
| **Settings** | `/settings` | Backend LLM, agents, notifications, sécurité, système — accordéons |

### Stack frontend

```
React 18 + TypeScript + Vite
Tailwind CSS (dark theme slate-950/900)
Recharts (AreaChart, BarChart, LineChart)
React Markdown + Prism Syntax Highlighter
Lucide React (icônes)
pnpm
```

---

## Agents

### 💻 Coder
Génère, révise et débogue du code. Modèle recommandé : `qwen2.5-coder:1.5b`.
```bash
curl -X POST http://localhost:8081/api/chat/coder \
  -H "Content-Type: application/json" \
  -d '{"message": "code une fonction fibonacci en Python"}'
```

### 📁 Files
Lecture, écriture et recherche de fichiers locaux avec restrictions de chemins.

### ✉️ Email
Rédaction et envoi via SMTP. Variables `.env` : `EMAIL_SMTP_HOST`, `EMAIL_USER`, `EMAIL_PASS`.

### Gestion des agents (Dashboard Chat)

Le sélecteur dropdown permet pour chaque agent :
- **Sélection** de l'agent actif
- **Stop/Start** instantané via `/api/agents/:id/start|stop`
- **Config** inline — modèle LLM, description, toggle enabled

---

## Training & Fine-tuning

Interface complète de fine-tuning LoRA/QLoRA accessible depuis le dashboard.

### Workflow

1. **Créer un dataset** (Datasets page) — Upload JSONL, éditeur manuel, HuggingFace, ou export Discord
2. **Lancer un job** (Training page) — modèle base, méthode LoRA/QLoRA, dataset, epochs, batch
3. **Suivre en temps réel** — logs step/epoch/loss/grad/lr, auto-refresh 3s
4. **Annuler** si besoin via `POST /api/training/jobs/:id/cancel`

### API Training

```bash
GET  /api/training/stats              # statistiques globales
GET  /api/training/jobs               # liste des jobs
POST /api/training/jobs               # créer un job
POST /api/training/jobs/:id/start     # démarrer
POST /api/training/jobs/:id/cancel    # annuler
GET  /api/training/jobs/:id/logs      # logs temps réel
GET  /api/training/datasets           # liste datasets
POST /api/training/datasets           # créer dataset
POST /api/training/datasets/import-hf # import HuggingFace
POST /api/training/datasets/manual    # dataset manuel
POST /api/training/datasets/discord-export # export Discord
GET  /api/training/datasets/:id/rows  # lignes dataset
POST /api/training/datasets/:id/rows  # ajouter ligne
DELETE /api/training/datasets/:id     # supprimer dataset
```

---

## CyberDefence

Agent de surveillance 100 % déterministe, sans LLM. Port `:8086`.

### Protections

| Protection | Détail |
|------------|--------|
| 🔍 Monitoring | Ping agents toutes les 15s, alerte après 3 échecs |
| 🚦 Rate limiting | 30 req/min par user/IP |
| 💉 Prompt injection | Jailbreak, OS commands, SQL injection |
| 🔁 Anti-replay | `request_id` unique, TTL 5 min |
| 🚫 Blocage IP | Manuel via UI ou automatique |
| 🔔 Alertes Discord | Embed coloré CRITICAL/WARNING + IP + payload |

### API `:8086`

```bash
GET  /status                    # état agents surveillés
GET  /events?limit=20           # journal des événements
GET  /events?format=csv         # export CSV
POST /analyze                   # analyser un message
POST /block   {"ip": "x.x.x.x"} # bloquer IP
POST /unblock {"ip": "x.x.x.x"} # débloquer IP
```

---

## Métriques système temps réel

Route Go : `GET /api/metrics/system`

```json
{
  "cpu_percent": 5.2,
  "ram_percent": 42.1,
  "ram_used_gb": 6.7,
  "ram_total_gb": 16.0,
  "gpu_percent": 12.0,
  "gpu_mem_percent": 31.0,
  "gpu_name": "NVIDIA GeForce RTX 3080"
}
```

Implémenté dans `cmd/orchestrator/metrics_handler.go` — lit `/proc/stat` et `/proc/meminfo` directement (zéro dépendance externe). GPU via `nvidia-smi` si disponible.

---

## Backend LLM

```bash
just mock-on    # Mock Layer — dev instantané 0.8s / 0 MB RAM
just ollama-on  # Ollama natif (défaut)
just bench      # benchmark comparatif
```

| Backend | Temps | RAM | CPU |
|---------|-------|-----|-----|
| 🟢 Mock | ~0.8s | 0 MB | 0% |
| 🔵 Ollama | 5–8s | 3.5 GB | 85% |

---

## Configuration

```bash
cp .env.example .env
```

```bash
OLLAMA_URL=http://localhost:11434

# GPU (détecté auto par install.sh / install.ps1)
GPU_ENABLED=false
GPU_TYPE=           # nvidia | amd

# PostgreSQL (Training)
DATABASE_URL=postgres://nexus:nexus@localhost:5432/nexus

# Discord (optionnel)
DISCORD_TOKEN=
CYBERDEFENCE_DISCORD_WEBHOOK=https://discord.com/api/webhooks/...

# Email (optionnel)
EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_SMTP_PORT=587
EMAIL_USER=
EMAIL_PASS=

LOG_LEVEL=info
```

---

## GPU

Ollama tourne en natif sur l'hôte — accès direct aux drivers GPU, aucun GPU passthrough Docker requis.

**NVIDIA** : détecté automatiquement via CUDA.
**AMD Radeon** : drivers Adrenalin suffisent sur Windows, ROCm auto sur Linux.
**Apple Silicon** : Metal détecté automatiquement.

```bash
ollama ps  # vérifier GPU usage
```

---

## Docker

| Service | Port | Description |
|---------|------|-------------|
| `orchestrator` | 8081 | API Go + métriques système |
| `agents` | — | Agents Python (coder, files, email) |
| `cyberdefence` | 8086 | Agent sécurité Python |
| `postgres` | 5432 | Base de données training/datasets |

```bash
just start                                    # démarrer tout
just stop                                     # arrêter tout
docker compose logs -f orchestrator           # logs orchestrateur
docker compose restart cyberdefence           # redémarrer un service
```

---

## Développement

### Frontend

```bash
cd frontend
pnpm install
pnpm dev          # → http://localhost:5173 (proxy → :8081)
pnpm build        # build production dans web/static/
```

### Ajouter un agent

1. Créer `agents/mon_agent/agent.py` avec `/health` et `/chat`
2. Déclarer dans `config.yaml` :

```yaml
agents:
  mon_agent:
    enabled: true
    port: 8090
    type: "external"
    endpoint: "http://localhost:8090"
    model: "general"
```

### Tests

```bash
just test              # tous les tests
pytest agents/ -v      # tests Python
go test ./...          # tests Go
```

---

## Comparaison

| | **Nexus** | AutoGen | LangGraph | n8n |
|--|:--:|:--:|:--:|:--:|
| 100% local | ✅ | ⚠️ | ⚠️ | ⚠️ |
| Dashboard complet | ✅ | ❌ | ❌ | ⚠️ |
| Fine-tuning LoRA UI | ✅ | ❌ | ❌ | ❌ |
| Métriques système live | ✅ | ❌ | ❌ | ❌ |
| Orchestrateur Go | ✅ | ❌ | ❌ | ❌ |
| Mock Layer dev | ✅ | ❌ | ❌ | ❌ |
| Sécurité intégrée | ✅ | ❌ | ❌ | ⚠️ |
| Bot Discord natif | ✅ | ❌ | ❌ | 🔌 |
| Install 1 commande | ✅ | ❌ | ❌ | ⚠️ |

---

<div align="center">

**⭐ Star ce repo si tu le trouves utile !**

Made with ❤️ by [loic31000](https://github.com/loic31000)

</div>