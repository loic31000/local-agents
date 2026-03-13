# 🤖 Local Agents

<div align="center">

![Local Agents](https://img.shields.io/badge/100%25-Local-green?style=for-the-badge)
![Go](https://img.shields.io/badge/Go-1.22+-00ADD8?style=for-the-badge&logo=go)
![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=for-the-badge&logo=python)
![Ollama](https://img.shields.io/badge/Ollama-Powered-black?style=for-the-badge)
![Discord](https://img.shields.io/badge/Discord-Bot-5865F2?style=for-the-badge&logo=discord)
![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)

**Framework multi-agents IA 100% local avec Ollama**

*Zéro coût API • Données privées • Fonctionne hors-ligne • Bot Discord intégré*

[Installation](#-installation) •
[Bot Discord](#-bot-discord-jarvis) •
[Interface Web](#-interface-web) •
[Configuration](#%EF%B8%8F-configuration) •
[API](#-api-rest)

</div>

---

## 📸 Aperçu

### Interface Web
![Dashboard](docs/screenshots/dashboard.png)
*Interface web avec agents (coder, files, email, social, discord) et chat IA*

### Bot Discord
![Discord Bot](docs/screenshots/discord-bot.png)
*Bot Jarvis avec gestion des modèles et génération de code*

---

## ✨ Fonctionnalités

| Fonctionnalité | Description |
|----------------|-------------|
| 🏠 **100% Local** | Tout tourne sur ta machine avec Ollama |
| 🤖 **Bot Discord Jarvis** | Comprend le français naturel avec IA |
| 🧠 **Multi-Modèles** | Change de modèle à la volée (`!model llama3.2:3b`) |
| 🌐 **Interface Web** | Dashboard pour chatter avec les agents |
| ⚡ **Go + Python** | Orchestrateur Go performant + agents Python |
| 💻 **Génération de code** | Demande du code dans n'importe quel langage |
| 🔧 **Extensible** | Ajoute facilement tes propres agents |

---

## 🚀 Installation

### Prérequis

| Outil | Version | Installation |
|-------|---------|--------------|
| **Go** | 1.22+ | [go.dev/dl](https://go.dev/dl/) |
| **Python** | 3.10+ | [python.org](https://python.org) |
| **Ollama** | latest | [ollama.com](https://ollama.com) |

### Installation rapide

```bash
# 1. Clone le repo
git clone https://github.com/loic31000/local-agents.git
cd local-agents

# 2. Installe Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 3. Télécharge les modèles
ollama pull llama3.2:3b      # Recommandé (2 GB)
ollama pull phi3:mini        # Rapide (2.3 GB)
ollama pull mistral:7b       # Excellent français (4 GB)

# 4. Installe les dépendances
./scripts/setup.sh install

# 5. Configure ton environnement
cp .env.example .env
nano .env                    # Ajoute ton token Discord

# 6. Compile et lance
./scripts/setup.sh build
./scripts/setup.sh start
```

🎉 **Interface web** → http://localhost:8080

### 🐳 Installation avec Docker

Pour une installation simplifiée avec Docker :

```bash
# 1. Clone le repo
git clone https://github.com/loic31000/local-agents.git
cd local-agents

# 2. Configure ton environnement
cp .env.example .env
nano .env                    # Ajoute ton token Discord

# 3. Lance avec Docker Compose
docker-compose up --build

# Les modèles Ollama seront téléchargés automatiquement
```

**Services Docker :**
- `ollama` : Serveur IA (port 11434)
- `orchestrator` : Serveur web Go (port 8080)
- `agents` : Agents Python (Discord, etc.)

---

## 🤖 Bot Discord "Jarvis"

Le bot comprend le **français naturel** grâce à Ollama !

### Configuration Discord

1. Va sur [Discord Developer Portal](https://discord.com/developers/applications)
2. Crée une application → Bot → **Reset Token** → Copie le token
3. Active les **Intents** : Presence, Server Members, Message Content
4. Invite le bot sur ton serveur avec les permissions Administrator

```bash
# Ajoute le token dans .env
DISCORD_BOT_TOKEN="ton_token_ici"

# Redémarre
./scripts/setup.sh restart
```

### Commandes Discord

#### 🧠 Gestion des modèles
```
!models                    → Liste les modèles disponibles
!model llama3.2:3b         → Change de modèle
!model phi3:mini           → Modèle plus rapide
!model mistral:7b          → Meilleur pour le français
!ping                      → Test le bot
!help                      → Affiche l'aide
```

#### 👑 Gestion des rôles
```
@Jarvis donne moi admin
@Jarvis donne le role vip à @utilisateur
@Jarvis retire le role modo à @utilisateur
```

#### 🛡️ Modération
```
@Jarvis kick @troll
@Jarvis ban @spammer
@Jarvis mute @utilisateur 30 minutes
@Jarvis supprime 50 messages
@Jarvis nettoie le salon
```

#### 📌 Messages
```
@Jarvis épingle ça
@Jarvis désépingle
@Jarvis stats du serveur
```

#### 💻 Génération de code
```
@Jarvis code une fonction fibonacci en python
@Jarvis écris un serveur express en nodejs
@Jarvis code un ratelimiter en javascript
@Jarvis fais moi un script bash pour backup
```

#### 💬 Conversation IA
```
@Jarvis c'est quoi Docker ?
@Jarvis explique moi les promises en JS
@Jarvis salut comment ça va ?
```

### Modèles recommandés

| Modèle | Taille | Qualité | Vitesse | Usage |
|--------|--------|---------|---------|-------|
| `qwen2:1.5b` | 1 GB | ⭐⭐ | ⭐⭐⭐⭐⭐ | Tests rapides |
| `phi3:mini` | 2.3 GB | ⭐⭐⭐ | ⭐⭐⭐⭐ | Équilibré |
| `llama3.2:3b` | 2 GB | ⭐⭐⭐⭐ | ⭐⭐⭐ | **Recommandé** |
| `mistral:7b` | 4 GB | ⭐⭐⭐⭐⭐ | ⭐⭐ | Excellent français |
| `deepseek-coder:6.7b` | 4 GB | ⭐⭐⭐⭐⭐ | ⭐⭐ | Code |

```bash
# Installer un modèle
ollama pull mistral:7b

# Lister les modèles
ollama list

# Supprimer un modèle
ollama rm qwen2:1.5b
```

---

## 🌐 Interface Web

Accès : **http://localhost:8080**

### Fonctionnalités

- 💬 **Chat** avec les agents (coder, files, email, social, discord)
- 🔄 **Changer de modèle** en temps réel
- 📊 **Statistiques** du système
- ⚙️ **Configuration** des agents

### Agents disponibles

| Agent | Description | Outils |
|-------|-------------|--------|
| **coder** | Génération de code | vscode, git, terminal, filesystem |
| **files** | Gestion de fichiers | filesystem |
| **email** | Envoi d'emails | smtp |
| **social** | Réseaux sociaux | twitter, linkedin |
| **discord** | Bot Discord | discord.py |

---

## ⚙️ Configuration

### Fichier `.env`

```bash
# Copie le template
cp .env.example .env
```

```env
# Ollama
OLLAMA_URL=http://localhost:11434

# Discord Bot (obligatoire pour le bot)
DISCORD_BOT_TOKEN="ton_token_discord"

# Email (optionnel - Gmail avec mot de passe d'application)
EMAIL_USER=ton.email@gmail.com
EMAIL_PASS="xxxx xxxx xxxx xxxx"

# Twitter/X (optionnel)
TWITTER_API_KEY=
TWITTER_API_SECRET=
```

### Fichier `config.yaml`

```yaml
server:
  host: "0.0.0.0"
  port: 8080

ollama:
  base_url: "http://localhost:11434"
  default_model: "llama3.2:3b"
  models:
    coding: "llama3.2:3b"
    general: "llama3.2:3b"
    fast: "phi3:mini"

agents:
  coder:
    enabled: true
    model: "coding"
    tools: ["vscode", "git", "terminal", "filesystem"]
  
  files:
    enabled: true
    tools: ["filesystem"]
```

---

## 🔌 API REST

### Endpoints

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/api/health` | Statut du système |
| `GET` | `/api/agents` | Liste des agents |
| `POST` | `/api/chat/{agent}` | Envoyer un message |
| `GET` | `/api/ollama/models` | Liste modèles Ollama |
| `POST` | `/api/ollama/pull` | Télécharger un modèle |
| `DELETE` | `/api/ollama/delete` | Supprimer un modèle |

### Exemples

```bash
# Statut
curl http://localhost:8080/api/health

# Liste des agents
curl http://localhost:8080/api/agents

# Chat avec l'agent coder
curl -X POST http://localhost:8080/api/chat/coder \
  -H "Content-Type: application/json" \
  -d '{"message": "Code un hello world en Python"}'

# Liste des modèles Ollama
curl http://localhost:8080/api/ollama/models
```

### WebSocket

```javascript
const ws = new WebSocket('ws://localhost:8080/ws');

ws.send(JSON.stringify({
  type: 'chat',
  payload: { agent: 'coder', message: 'Hello!' }
}));

ws.onmessage = (e) => console.log(JSON.parse(e.data));
```

---

## 🛠️ Commandes

```bash
# Installation
./scripts/setup.sh install    # Dépendances
./scripts/setup.sh build      # Compiler
./scripts/setup.sh models     # Télécharger modèles

# Services
./scripts/setup.sh start      # Démarrer
./scripts/setup.sh stop       # Arrêter
./scripts/setup.sh restart    # Redémarrer
./scripts/setup.sh status     # Statut
./scripts/setup.sh logs       # Logs
```

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      INTERFACES                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   Web UI     │  │ Discord Bot  │  │     CLI      │       │
│  │   :8080      │  │   Jarvis     │  │              │       │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘       │
└─────────┼─────────────────┼─────────────────┼───────────────┘
          │                 │                 │
          ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────┐
│                   ORCHESTRATEUR (Go)                         │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐                │
│  │  Router   │  │Task Queue │  │ WebSocket │                │
│  └───────────┘  └───────────┘  └───────────┘                │
│                                                              │
│  ┌─────────────────────────────────────────────────┐        │
│  │              Agent Manager                       │        │
│  │  ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐       │        │
│  │  │ Coder │ │ Files │ │ Email │ │Discord│       │        │
│  │  └───────┘ └───────┘ └───────┘ └───────┘       │        │
│  └─────────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    OLLAMA (LLM Local)                        │
│       llama3.2:3b │ phi3:mini │ mistral:7b │ ...            │
└─────────────────────────────────────────────────────────────┘
```

### Structure du projet

```
local-agents/
├── cmd/
│   └── orchestrator/main.go    # Serveur Go
├── internal/
│   ├── agent/                  # Logique agents
│   ├── llm/ollama.go          # Client Ollama
│   └── tools/                  # Outils (git, terminal, fs)
├── agents/
│   └── discord/bot.py         # Bot Discord Jarvis
├── web/static/index.html       # Interface web
├── scripts/setup.sh            # Script de gestion
├── config.yaml                 # Configuration
├── .env.example                # Template environnement
└── README.md
```

---

## 🤝 Contribuer

Les contributions sont bienvenues !

```bash
# Fork et clone
git clone https://github.com/TON-USER/local-agents.git

# Nouvelle branche
git checkout -b feature/ma-feature

# Commit
git commit -m "feat: ajoute ma feature"

# Push et PR
git push origin feature/ma-feature
```

---

## 📜 Licence

MIT - Fais ce que tu veux !

---

## 🙏 Crédits

- [Ollama](https://ollama.com) - LLM local
- [discord.py](https://discordpy.readthedocs.io/) - Bot Discord
- La communauté open-source ❤️

---

<div align="center">

**⭐ Star ce repo si tu le trouves utile !**

Made with ❤️ by [loic31000](https://github.com/loic31000)

</div>
