<div align="center">

# 🤖 Local Agents

[![Version](https://img.shields.io/badge/version-3.0.0-blue?style=for-the-badge)](https://github.com/loic31000/local-agents/releases)
[![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)](LICENSE)
[![100% Local](https://img.shields.io/badge/100%25-Local-brightgreen?style=for-the-badge)](https://github.com/loic31000/local-agents)

[![Go](https://img.shields.io/badge/Go-1.22+-00ADD8?style=for-the-badge&logo=go&logoColor=white)](https://go.dev)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![Ollama](https://img.shields.io/badge/Ollama-powered-black?style=for-the-badge)](https://ollama.com)
[![GGUF](https://img.shields.io/badge/GGUF-GPU%20Support-red?style=for-the-badge)](docs/GGUF.md)

[![Discord](https://img.shields.io/badge/Discord-Bot%20Jarvis-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.com/developers/applications)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://docs.docker.com/compose)
[![AMD ROCm](https://img.shields.io/badge/AMD-ROCm-ED1C24?style=for-the-badge&logo=amd&logoColor=white)](https://rocm.docs.amd.com)
[![NVIDIA CUDA](https://img.shields.io/badge/NVIDIA-CUDA-76B900?style=for-the-badge&logo=nvidia&logoColor=white)](https://developer.nvidia.com/cuda-toolkit)
[![Apple Silicon](https://img.shields.io/badge/Apple-Silicon-000000?style=for-the-badge&logo=apple&logoColor=white)](https://developer.apple.com/metal)

**Framework d'agents IA 100 % local — orchestrateur Go, agents Python, bot Discord Jarvis, sécurité intégrée.**

*Aucun cloud requis. Fonctionne sur CPU, GPU AMD / NVIDIA / Apple Silicon.*

[Installation](#démarrage-rapide) •
[Architecture](#architecture) •
[Agents](#agents) •
[CyberDefence](#cyberdefence) •
[Dashboard](#dashboard-web) •
[GPU](#gpu) •
[Docker](#docker) •
[Changelog](CHANGELOG.md) •
[Roadmap](ROADMAP.md)

</div>

---

![Dashboard Chat](docs/screenshots/chatAgent.png)

---

## Sommaire

- [🤖 Local Agents](#-local-agents)
  - [Sommaire](#sommaire)
  - [Fonctionnalités](#fonctionnalités)
  - [Démarrage rapide](#démarrage-rapide)
    - [🐳 Docker — Linux et Windows (recommandé)](#-docker--linux-et-windows-recommandé)
    - [🐧 Local — Linux / macOS](#-local--linux--macos)
    - [⚡ Commandes Justfile](#-commandes-justfile)
  - [Architecture](#architecture)
  - [Agents](#agents)
    - [💻 Coder](#-coder)
    - [📁 Files](#-files)
    - [✉️ Email](#️-email)
    - [🐦 Social](#-social)
    - [🎮 Discord — Jarvis](#-discord--jarvis)
  - [CyberDefence](#cyberdefence)
    - [Protections actives](#protections-actives)
    - [API CyberDefence — port 8086](#api-cyberdefence--port-8086)
    - [Configuration](#configuration)
    - [Lancer CyberDefence](#lancer-cyberdefence)
  - [Dashboard Web](#dashboard-web)
  - [Configuration](#configuration-1)
  - [Profils prédéfinis](#profils-prédéfinis)
  - [GPU](#gpu)
    - [🟢 NVIDIA (CUDA)](#-nvidia-cuda)
    - [🔴 AMD (ROCm)](#-amd-rocm)
    - [🍎 Apple Silicon](#-apple-silicon)
  - [Docker](#docker)
  - [Développement](#développement)
    - [Ajouter un agent Python](#ajouter-un-agent-python)
    - [Tests](#tests)
    - [Logs structurés](#logs-structurés)
  - [Comparaison](#comparaison)

---

## Fonctionnalités

| Catégorie | Détail |
|-----------|--------|
| 🔀 Orchestration | Routing intelligent, queue de tâches, workers concurrents, WebSocket temps réel |
| 🤖 Agents | Coder, Files, Email, Social, Discord — extensibles sans modifier le code Go |
| 🧠 LLM | Double backend Ollama / GGUF, fallback automatique, support multi-GPU |
| 🛡️ Sécurité | Rate limiting, détection prompt injection, anti-replay, blocage IP, alertes Discord |
| 🌐 Dashboard | Chat par agent, monitoring CyberDefence, gestion modèles Ollama, paramètres |
| 🎮 Bot Discord | Jarvis — commandes naturelles, modération, mémoire contextuelle, modes adaptatifs |

---

## Démarrage rapide

### 🐳 Docker — Linux et Windows (recommandé)

```bash
# 1. Cloner le projet
git clone https://github.com/loic31000/local-agents
cd local-agents

# 2. Configurer l'environnement
cp .env.example .env
# Éditer .env : DISCORD_TOKEN, EMAIL_USER, CYBERDEFENCE_DISCORD_WEBHOOK

# 3. Lancer
docker compose up -d

# 4. Télécharger un modèle (première fois)
docker compose exec ollama ollama pull llama3.2:3b

# 5. Ouvrir le dashboard
#    http://localhost:8081
```

> **Windows** : Docker Desktop suffit, aucun WSL requis.
> **GPU** : voir la section [GPU](#gpu) pour l'accélération matérielle.

### 🐧 Local — Linux / macOS

```bash
# Prérequis : Go 1.22+, Python 3.10+, Ollama
ollama pull llama3.2:3b

pip install -r requirements.txt
go build -o bin/orchestrator ./cmd/orchestrator

./bin/orchestrator &

# Deuxième terminal — CyberDefence
set -a && source .env && set +a
python -m agents.cyberdefence.agent
```

### ⚡ Commandes Justfile

```bash
just start            # démarre orchestrateur + agents
just stop             # arrête tout proprement
just status           # état des services
just logs             # tail des logs
just models           # télécharge les modèles configurés
just test             # lance les tests
just cyberdefence     # démarre uniquement CyberDefence
just gpu              # infos GPU
```

---

## Architecture

```
+--------------------------------------------------+
|  Dashboard Web  :8081                            |
+--------------------+-----------------------------+
                     | HTTP / WebSocket
+--------------------v-----------------------------+
|  Orchestrateur Go                                |
|  routing · queue · workers · API REST            |
+--+----------+----------+----------+--------------+
   |          |          |          |
 coder      files      email    discord
   |
+--v-----------+   +----------------------+
|  Ollama      |   |  CyberDefence :8086  |
|  llm backend |   |  monitoring · sécu   |
+--------------+   +----------------------+
```

Protocole : chaque requête suit le schéma JSON documenté dans [`docs/PROTOCOL.md`](docs/PROTOCOL.md).

Agents externes : déclarés avec `type: external` et `port: XXXX` dans `config.yaml`, pingés directement par CyberDefence.

---

## Agents

### 💻 Coder

Génère, révise et débogue du code. Outillé : `filesystem`, `terminal`, `git`, `vscode`.

```bash
curl -X POST http://localhost:8081/api/chat/coder   -H "Content-Type: application/json"   -d '{"message": "Génère une fonction Python qui parse un CSV"}'
```

### 📁 Files

Lecture, écriture et recherche de fichiers locaux avec restrictions de chemins configurables.

### ✉️ Email

Rédaction et envoi via SMTP. Configurer `EMAIL_SMTP_HOST`, `EMAIL_USER`, `EMAIL_PASS` dans `.env`.

### 🐦 Social

Publication Twitter / LinkedIn. Désactivé par défaut (`enabled: false`).

### 🎮 Discord — Jarvis

```
@Jarvis aide-moi à déboguer ce code Python
@Jarvis !mode code
@Jarvis !backend ollama
@Jarvis !models
@Jarvis status agents
@Jarvis alertes sécurité
```

Modes disponibles : `discussion`, `code`, `moderation`.

---

## CyberDefence

Agent de surveillance sans LLM — logique déterministe uniquement.
Tourne en parallèle de tous les autres agents et surveille l'ensemble du framework en temps réel.

![CyberDefence Dashboard](docs/screenshots/cyberdefence.png)

![Multiple Attacks](docs/screenshots/multiple-attack.png)

![Alerte Discord](docs/screenshots/AlertDiscord.png)

### Protections actives

| Protection | Détail |
|------------|--------|
| 🔍 Monitoring | Ping de chaque agent toutes les 15s, alerte CRITICAL après 3 échecs consécutifs |
| 🚦 Rate limiting | 30 req/min par user/IP, configurable |
| 💉 Prompt injection | Détecte jailbreak, commandes OS, SQL injection via regex |
| 🔁 Anti-replay | Chaque `request_id` traité une seule fois, TTL 5 min |
| 🚫 Blocage IP | Manuel via API ou automatique après N incidents |
| 🔔 Alertes Discord | Embed coloré sur chaque événement CRITICAL et WARNING |
| 📊 Export | Journal exportable CSV / JSON via `GET /events?format=csv` |


### API CyberDefence — port 8086

```bash
GET  /health       # statut de l'agent
GET  /status       # état de tous les agents surveillés
GET  /metrics      # métriques (taux blocage, latences, événements)
GET  /events       # journal filtrable — ?severity=CRITICAL&limit=20&format=csv
POST /inspect      # valider une requête avant routing
POST /block-ip     # bloquer une IP  {"ip": "1.2.3.4"}
POST /unblock-ip   # débloquer une IP
```

### Configuration

```yaml
agents:
  cyberdefence:
    config:
      check_interval: 15       # secondes entre chaque scan
      max_req_per_min: 30      # rate limit par user/IP
      replay_ttl_sec: 300      # TTL anti-replay (5 min)
      auto_block: false        # blocage automatique après N incidents
      auto_block_threshold: 5  # seuil avant blocage auto
```

### Lancer CyberDefence

```bash
set -a && source .env && set +a
python -m agents.cyberdefence.agent

# Ou avec just
just cyberdefence
```

---

## Dashboard Web

Accessible sur `http://localhost:8081`.

![Paramètres](docs/screenshots/parametres.png)

| Onglet | Contenu |
|--------|---------|
| 💬 Chat | Conversation avec n'importe quel agent, sélection du modèle, indicateur de réflexion |
| 🛡️ CyberDefence | Métriques temps réel, statut agents, timeline événements filtrables, export CSV |
| ⚙️ Paramètres | Modèle par agent, gestion modèles Ollama (téléchargement / suppression) |

---

## Configuration

```bash
cp .env.example .env
```

```bash
# Ollama
OLLAMA_URL=http://localhost:11434

# Discord (optionnel)
DISCORD_TOKEN=your_token_here
DISCORD_GUILD_ID=your_guild_id

# Email (optionnel)
EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_SMTP_PORT=587
EMAIL_USER=your@email.com
EMAIL_PASS=your_app_password

# CyberDefence — alertes Discord
CYBERDEFENCE_DISCORD_WEBHOOK=https://discord.com/api/webhooks/...

# Logs
LOG_LEVEL=info   # debug | info | warn | error
```

---

## Profils prédéfinis

| Fichier | Usage |
|---------|-------|
| `config.yaml` | Configuration principale |
| `config.solo-dev.yaml` | Dev solo — coder + files uniquement |
| `config.low-ram.yaml` | RAM < 8 Go — modèles légers (phi3:mini, tinyllama) |
| `config.discord-community.yaml` | Communauté Discord — Jarvis + modération |
| `config.docker.yaml` | Utilisé automatiquement par Docker Compose |

---

## GPU

### 🟢 NVIDIA (CUDA)

Ajouter dans `docker-compose.yml` sous le service `ollama` :

```yaml
deploy:
  resources:
    reservations:
      devices:
        - driver: nvidia
          count: all
          capabilities: [gpu]
```

### 🔴 AMD (ROCm)

```bash
docker compose -f docker-compose.yml -f docker-compose.rocm.yml up -d
```

### 🍎 Apple Silicon

Ollama détecte automatiquement le GPU Metal. Aucune configuration requise.

---

## Docker

| Service | Port | Description |
|---------|------|-------------|
| `ollama` | 11434 | Backend LLM |
| `orchestrator` | 8081 | API Go + dashboard |
| `agents` | — | Agents Python (coder, files, email, social) |
| `cyberdefence` | 8086 | Agent sécurité |

```bash
docker compose up -d                                  # démarrer
docker compose down                                   # arrêter
docker compose logs -f orchestrator                   # logs
docker compose exec ollama ollama list                # modèles installés
docker compose exec ollama ollama pull mistral:7b     # télécharger un modèle
docker compose restart cyberdefence                   # redémarrer un service
```

---

## Développement

### Ajouter un agent Python

1. Créer `agents/mon_agent/agent.py` avec les endpoints `/health` et `/chat`
2. Déclarer dans `config.yaml` :

```yaml
agents:
  mon_agent:
    enabled: true
    name: "Mon Agent"
    description: "Description courte"
    port: 8090
    type: "external"
    endpoint: "http://localhost:8090"
    model: "general"
```

3. L'orchestrateur proxifie automatiquement `/api/agents/mon_agent/health` vers le port déclaré.

### Tests

```bash
just test          # tous les tests
pytest agents/ -v  # tests Python
go test ./...      # tests Go
```

### Logs structurés

Tous les logs sont en JSON :

```json
{
  "timestamp": "2026-03-14T08:00:00Z",
  "level": "INFO",
  "logger": "cyberdefence",
  "message": "Agent healthy",
  "agent_id": "coder",
  "response_time_ms": 340
}
```

---

## Comparaison

| | Local Agents | AutoGen | LangGraph | n8n |
|--|:--:|:--:|:--:|:--:|
| 100% local | ✅ | ⚠️ | ⚠️ | ⚠️ |
| Orchestrateur Go | ✅ | ❌ | ❌ | ❌ |
| Bot Discord natif | ✅ | ❌ | ❌ | 🔌 |
| Sécurité intégrée | ✅ | ❌ | ❌ | ⚠️ |
| Sans cloud | ✅ | ❌ | ❌ | ❌ |
| GPU AMD / NVIDIA | ✅ | ⚠️ | ⚠️ | ❌ |

---

<div align="center">

**⭐ Star ce repo si tu le trouves utile !**

Made with ❤️ by [loic31000](https://github.com/loic31000)

</div>
