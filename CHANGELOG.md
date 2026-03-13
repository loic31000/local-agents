# 📋 Changelog

Toutes les modifications notables du projet sont documentées ici.

## [3.0.0] - 2026-03-14

### ✨ Nouvelles fonctionnalités

#### 🎮 Support GGUF avec GPU
- **Backend GGUF** : Chargement direct des modèles GGUF avec accélération GPU
- **Support GPU** : AMD (ROCm), NVIDIA (CUDA), Apple Silicon (Metal)
- **Téléchargement HuggingFace** : Télécharge des modèles depuis HuggingFace
- **Modèles populaires** : Mistral-7B, Llama3-8B, Phi3-mini, CodeLlama, DeepSeek-Coder

#### 🔀 Client LLM unifié
- **Double backend** : Choix entre Ollama (API) et GGUF (GPU direct)
- **Commande `!backend`** : Change de backend à la volée dans Discord
- **Commande `!gpu`** : Affiche les infos GPU et GGUF
- **Fallback automatique** : Si GGUF échoue, utilise Ollama

#### 📋 Architecture améliorée
- **Protocole JSON standardisé** : Communication orchestrateur ↔ agents
- **Logs structurés JSON** : Traçabilité bout en bout avec `request_id`
- **Agents custom via config** : Ajouter des agents sans modifier le code Go

### 🔧 Commandes Discord ajoutées

| Commande | Description |
|----------|-------------|
| `!backend` | Voir/changer le backend (ollama/gguf) |
| `!backend ollama` | Utiliser Ollama (API HTTP) |
| `!backend gguf` | Utiliser GGUF (GPU direct) |
| `!gpu` | Afficher les infos GPU |
| `!models` | Liste tous les modèles (Ollama + GGUF) |

### 📁 Fichiers ajoutés

```
agents/common/
├── __init__.py          # Module commun
├── logger.py            # Logs structurés JSON
├── protocol.py          # Protocole d'échange
├── gguf_loader.py       # Loader GGUF avec GPU
└── llm_client.py        # Client LLM unifié

scripts/
└── install-gguf.sh      # Installation GGUF auto

docs/
├── PROTOCOL.md          # Documentation protocole
└── GGUF.md              # Documentation GGUF
```

### ⚡ Performance

| Backend | CPU | GPU AMD | GPU NVIDIA |
|---------|-----|---------|------------|
| Ollama | ~90s | ~15s | ~10s |
| GGUF | ~60s | ~8s | ~5s |

---

## [2.0.0] - 2026-03-13

### ✨ Nouvelles fonctionnalités

#### 🎭 Modes adaptatifs
- **Mode discussion** : Conversation naturelle (llama3.2:3b)
- **Mode code** : Génération de code (llama3.2:3b, température basse)
- **Mode modération** : Actions Discord (phi3:mini, rapide)

#### 🧠 Mémoire contextuelle
- **10 derniers messages** par canal
- **Commande `!memory`** : Voir/effacer la mémoire

#### 👋 Onboarding automatique
- Message de bienvenue quand le bot rejoint un serveur

### 🔧 Commandes Discord ajoutées

| Commande | Description |
|----------|-------------|
| `!mode` | Voir/changer le mode |
| `!mode discussion` | Mode conversation |
| `!mode code` | Mode programmation |
| `!mode moderation` | Mode modération |
| `!memory` | Voir la mémoire |
| `!memory clear` | Effacer la mémoire |

---

## [1.0.0] - 2026-03-13

### 🚀 Version initiale

#### Framework multi-agents
- **Orchestrateur Go** : Routing, queue, WebSocket, API REST
- **Agents Python** : coder, files, email, social, discord
- **Ollama** : LLM 100% local

#### Bot Discord Jarvis
- **Commandes naturelles** : `@Jarvis donne moi admin`
- **Gestion des rôles** : Créer, assigner, retirer
- **Modération** : Kick, ban, mute, purge
- **Génération de code** : `@Jarvis code fibonacci python`
- **Multi-modèles** : `!model llama3.2:3b`

#### Interface Web
- **Dashboard** : http://localhost:8080
- **Chat** avec les agents
- **Gestion des modèles** Ollama

#### Outils intégrés
- `filesystem` : Lecture/écriture fichiers
- `terminal` : Exécution commandes
- `git` : Opérations Git
- `vscode` : Intégration VSCode
- `smtp` : Envoi emails

### 📁 Structure du projet

```
local-agents/
├── cmd/orchestrator/     # Serveur Go
├── internal/             # Logique Go (agents, llm, tools)
├── agents/discord/       # Bot Discord Python
├── web/static/           # Interface web
├── scripts/              # Scripts de gestion
├── prompts/              # Prompts des agents
└── config.yaml           # Configuration
```
