# 🤖 Local Agents

<div align="center">

![Version](https://img.shields.io/badge/Version-3.0.0-blue?style=for-the-badge)
![Local](https://img.shields.io/badge/100%25-Local-green?style=for-the-badge)
![Go](https://img.shields.io/badge/Go-1.22+-00ADD8?style=for-the-badge&logo=go)
![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=for-the-badge&logo=python)
![Ollama](https://img.shields.io/badge/Ollama-Powered-black?style=for-the-badge)
![GGUF](https://img.shields.io/badge/GGUF-GPU%20Support-red?style=for-the-badge)
![Discord](https://img.shields.io/badge/Discord-Bot-5865F2?style=for-the-badge&logo=discord)

**Framework multi-agents IA 100% local avec Ollama + GGUF**

*Zéro coût API • Données privées • Support GPU (AMD/NVIDIA) • Bot Discord intégré*

[Installation](#-installation) •
[Bot Discord](#-bot-discord-jarvis) •
[GGUF & GPU](#-support-gguf--gpu) •
[API](#-api-rest) •
[Changelog](CHANGELOG.md)

</div>

---

## 🆕 Quoi de neuf en v3.0.0

- 🎮 **Support GGUF** : Chargement direct des modèles avec accélération GPU
- 🔀 **Double backend** : Choix entre Ollama (API) et GGUF (GPU direct)
- ⚡ **Performance x10** : ~5-10s avec GPU vs ~90s en CPU
- 📋 **Protocole standardisé** : Communication JSON orchestrateur ↔ agents
- 📊 **Logs structurés** : Traçabilité complète avec `request_id`

---

## 📸 Aperçu

### Interface Web
![Dashboard](docs/screenshots/dashboard.png)

### Bot Discord
![Discord Bot](docs/screenshots/discord-bot.png)

---

## ✨ Fonctionnalités

| Fonctionnalité | Description |
|----------------|-------------|
| 🏠 **100% Local** | Tout tourne sur ta machine |
| 🎮 **Support GPU** | AMD (ROCm), NVIDIA (CUDA), Apple Silicon |
| 🔀 **Double Backend** | Ollama (API) ou GGUF (GPU direct) |
| 🤖 **Bot Discord** | Comprend le français naturel avec IA |
| 🎭 **Modes adaptatifs** | Discussion, Code, Modération |
| 🧠 **Mémoire contextuelle** | Se souvient des 10 derniers messages |
| 💻 **Génération de code** | Demande du code dans n'importe quel langage |
| 🔧 **Extensible** | Ajoute facilement tes propres agents |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Interface Web / Discord                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Orchestrateur (Go)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Router    │  │   Queue     │  │  WebSocket  │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┴─────────────────┐
            ▼                                   ▼
┌───────────────────────┐           ┌───────────────────────┐
│     Ollama (API)      │           │    GGUF (GPU Direct)  │
│   llama3.2 | phi3     │           │  mistral | codellama  │
└───────────────────────┘           └───────────────────────┘
                              │
        ┌─────────┬───────────┼───────────┬─────────┐
        ▼         ▼           ▼           ▼         ▼
   ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
   │  Coder  │ │  Files  │ │  Email  │ │ Social  │ │ Discord │
   └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘
```

---

## 🚀 Installation

### Prérequis

| Outil | Version | Installation |
|-------|---------|--------------|
| **Go** | 1.22+ | [go.dev/dl](https://go.dev/dl/) |
| **Python** | 3.10+ | [python.org](https://python.org) |
| **Ollama** | latest | [ollama.com](https://ollama.com) |
| **just** | latest | `cargo install just` ou `brew install just` |

### Installation rapide

```bash
# Clone le repo
git clone https://github.com/loic31000/local-agents.git
cd local-agents

# Installer les dépendances
just install

# Télécharger les modèles Ollama
just models

# Compiler et démarrer
just build
just start
```

🎉 Ouvre http://localhost:8080

### Configuration

```bash
# Copier le template
cp env.example .env

# Éditer (ajouter token Discord, etc.)
nano .env
```

---

## 🎮 Support GGUF & GPU

### Pourquoi GGUF ?

| | Ollama | GGUF Direct |
|--|--------|-------------|
| **Installation** | Simple | Compilation |
| **Performance** | Bon | **Optimal** |
| **Contrôle GPU** | Auto | Manuel |
| **Modèles custom** | Import | **Direct HuggingFace** |

### Installation GGUF

```bash
# Auto-détecte ton GPU (AMD/NVIDIA/Apple)
./scripts/install-gguf.sh

# Télécharger un modèle
python -m agents.common.gguf_loader download mistral-7b-q4

# Tester
python -m agents.common.gguf_loader run mistral-7b-instruct-v0.2.Q4_K_M
```

### Modèles GGUF recommandés

| Modèle | Taille | Usage |
|--------|--------|-------|
| `phi3-mini-q4` | 2.4 GB | Rapide, bon CPU |
| `mistral-7b-q4` | 4.4 GB | Équilibré, bon français |
| `llama3-8b-q4` | 4.9 GB | Très performant |
| `deepseek-coder-6.7b-q4` | 4.0 GB | Code (excellent) |

### Performance

| Backend | CPU | GPU AMD | GPU NVIDIA |
|---------|-----|---------|------------|
| Ollama | ~90s | ~15s | ~10s |
| **GGUF** | ~60s | **~8s** | **~5s** |

📖 [Documentation GGUF complète](docs/GGUF.md)

---

## 🤖 Bot Discord Jarvis

### Configuration Discord

1. [Discord Developer Portal](https://discord.com/developers/applications) → Créer application
2. Bot → Reset Token → Copier
3. Activer les **3 Intents** (Presence, Server Members, Message Content)
4. Inviter avec permissions Administrator

```bash
# Ajouter le token
echo 'DISCORD_BOT_TOKEN="ton_token"' >> .env

# Redémarrer
just restart
```

### Commandes

#### 🔧 Backend & Modèles
```
!backend              → Voir/changer (ollama/gguf)
!backend gguf         → Passer en GPU direct 🎮
!gpu                  → Infos GPU
!models               → Liste tous les modèles
!model mistral:7b     → Changer de modèle
```

#### 🎭 Modes
```
!mode                 → Voir les modes
!mode discussion      → Conversation naturelle
!mode code            → Génération de code
!mode moderation      → Actions Discord
```

#### 💬 Chat IA
```
@Jarvis salut !
@Jarvis c'est quoi Docker ?
@Jarvis code fibonacci en python
```

#### 👑 Rôles & Modération
```
@Jarvis donne moi admin
@Jarvis kick @user
@Jarvis ban @user
@Jarvis mute @user 30
@Jarvis nettoie
```

#### 💾 Mémoire
```
!memory               → Voir la mémoire du canal
!memory clear         → Effacer
```

---

## 🌐 Interface Web

Accès : **http://localhost:8080**

- 💬 Chat avec les agents
- 🔄 Changer de modèle
- 📊 Statistiques
- ⚙️ Configuration

---

## 🔌 API REST

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/api/health` | Statut du système |
| `GET` | `/api/agents` | Liste des agents |
| `POST` | `/api/chat/{agent}` | Envoyer un message |
| `GET` | `/api/ollama/models` | Liste modèles |
| `POST` | `/api/ollama/pull` | Télécharger modèle |

### Exemple

```bash
curl -X POST http://localhost:8080/api/chat/coder \
  -H "Content-Type: application/json" \
  -d '{"message": "Code hello world en Python"}'
```

---

## 🛠️ Commandes

```bash
just install    # Installer dépendances
just build      # Compiler
just start      # Démarrer
just stop       # Arrêter
just restart    # Redémarrer
just status     # Statut
just logs       # Logs
just models     # Télécharger modèles Ollama
```

---

## 📁 Structure du projet

```
local-agents/
├── cmd/orchestrator/       # Serveur Go
├── internal/
│   ├── agent/              # Logique agents
│   ├── llm/                # Client Ollama
│   ├── logging/            # Logs structurés Go
│   └── tools/              # Outils (git, fs, terminal)
├── agents/
│   ├── discord/bot.py      # Bot Discord v3
│   └── common/             # Modules partagés
│       ├── logger.py       # Logs structurés
│       ├── protocol.py     # Protocole JSON
│       ├── gguf_loader.py  # Loader GGUF
│       └── llm_client.py   # Client unifié
├── web/static/             # Interface web
├── scripts/
│   ├── setup.sh            # Script principal
│   └── install-gguf.sh     # Installation GGUF
├── docs/
│   ├── PROTOCOL.md         # Protocole d'échange
│   └── GGUF.md             # Documentation GGUF
├── config.yaml             # Configuration
├── CHANGELOG.md            # Historique des versions
└── README.md
```

---

## 🔧 Troubleshooting

### Bot Discord ne répond pas aux mentions
- Vérifie que tu mentionnes le **BOT** (icône APP) pas le rôle
- Active **Message Content Intent** dans le portail Discord

### GGUF non disponible
```bash
./scripts/install-gguf.sh
python -m agents.common.gguf_loader download mistral-7b-q4
```

### GPU non détecté
```bash
# NVIDIA
nvidia-smi

# AMD
rocm-smi

# Réinstaller llama-cpp-python avec le bon backend
./scripts/install-gguf.sh
```

### Port 8080 occupé
```bash
sudo kill -9 $(sudo lsof -t -i:8080)
just restart
```

---

## 🤝 Contribuer

```bash
git checkout -b feature/ma-feature
git commit -m "feat: ajoute ma feature"
git push origin feature/ma-feature
```

---

## 📜 Licence

MIT - Fais ce que tu veux !

---

<div align="center">

**⭐ Star ce repo si tu le trouves utile !**

Made with ❤️ by [loic31000](https://github.com/loic31000)

</div>