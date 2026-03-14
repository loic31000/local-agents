# Guide d'installation — Local Agents

Installation complète depuis zéro sur Windows, Linux ou macOS.  
Ce guide couvre la migration depuis une VM Linux vers un poste Windows vierge.

---

## Sommaire

- [Prérequis](#prérequis)
- [Installation Windows (depuis zéro)](#installation-windows-depuis-zéro)
- [Installation Linux / macOS](#installation-linux--macos)
- [Installation Docker (recommandé)](#installation-docker-recommandé)
- [Premier démarrage](#premier-démarrage)
- [Migration VM Linux → Windows](#migration-vm-linux--windows)
- [Vérification de l'installation](#vérification-de-linstallation)
- [Résolution de problèmes](#résolution-de-problèmes)

---

## Prérequis

| Outil | Version minimale | Rôle |
|-------|-----------------|------|
| Git | 2.x | Cloner le projet |
| Go | 1.22+ | Compiler l'orchestrateur |
| Python | 3.10+ | Agents Python |
| Ollama | latest | Backend LLM |
| Docker Desktop | 4.x | Option Docker (recommandé Windows) |
| just | 1.x | Commandes du projet |

**RAM recommandée :** 8 Go minimum (16 Go pour llama3.2:3b confortable)  
**Espace disque :** 10 Go minimum (modèles Ollama inclus)

---

## Installation Windows (depuis zéro)

### Étape 1 — Outils de base

Ouvre **PowerShell en administrateur** et installe WinGet si absent :

```powershell
# Installer les outils via winget
winget install Git.Git
winget install GoLang.Go
winget install Python.Python.3.12
winget install Docker.DockerDesktop
```

Ferme et rouvre PowerShell après l'installation pour recharger le PATH.

### Étape 2 — Ollama

Télécharge et installe depuis https://ollama.com/download  
Ou via winget :

```powershell
winget install Ollama.Ollama
```

Vérifie :
```powershell
ollama --version
```

### Étape 3 — just (command runner)

```powershell
winget install Casey.Just
# ou via cargo :
cargo install just
# ou via scoop :
scoop install just
```

### Étape 4 — Cloner le projet

```powershell
git clone https://github.com/loic31000/local-agents.git
cd local-agents
git checkout 2-suite-de-la-roadmap-bitnet-mock-v410
```

### Étape 5 — Environnement Python

```powershell
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

### Étape 6 — Compiler l'orchestrateur

```powershell
go mod download
go build -o bin\orchestrator.exe .\cmd\orchestrator
```

### Étape 7 — Configuration

```powershell
copy .env.example .env
# Éditer .env avec notepad ou VSCode
notepad .env
```

Variables minimales à renseigner :
```bash
# Ollama (déjà configuré par défaut)
OLLAMA_URL=http://localhost:11434

# Discord (optionnel — uniquement si tu veux le bot Jarvis)
DISCORD_TOKEN=your_token_here

# CyberDefence Discord (optionnel)
CYBERDEFENCE_DISCORD_WEBHOOK=https://discord.com/api/webhooks/...
```

### Étape 8 — Télécharger un modèle Ollama

```powershell
ollama pull llama3.2:3b
```

### Étape 9 — Lancer

```powershell
# Terminal 1 — Orchestrateur
bin\orchestrator.exe

# Terminal 2 — CyberDefence
$env:CYBERDEFENCE_DISCORD_WEBHOOK="ton_webhook"
python -m agents.cyberdefence.agent

# Dashboard : http://localhost:8081
```

---

## Installation Linux / macOS

### Linux (Ubuntu/Debian)

```bash
# Go
wget https://go.dev/dl/go1.22.linux-amd64.tar.gz
sudo tar -C /usr/local -xzf go1.22.linux-amd64.tar.gz
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
source ~/.bashrc

# Python 3.12
sudo apt install python3.12 python3.12-venv python3-pip

# Ollama
curl -fsSL https://ollama.com/install.sh | sh

# just
cargo install just
# ou
sudo apt install just  # Ubuntu 24.04+

# Cloner
git clone https://github.com/loic31000/local-agents.git
cd local-agents
git checkout 2-suite-de-la-roadmap-bitnet-mock-v410

# Setup
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
go mod download
go build -o bin/orchestrator ./cmd/orchestrator

# Config
cp .env.example .env

# Modèle
ollama pull llama3.2:3b
```

### macOS

```bash
# Homebrew (si absent)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Outils
brew install go python@3.12 just git
brew install --cask ollama

# Suite identique à Linux
git clone https://github.com/loic31000/local-agents.git
cd local-agents
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
go build -o bin/orchestrator ./cmd/orchestrator
cp .env.example .env
ollama pull llama3.2:3b
```

---

## Installation Docker (recommandé)

La méthode la plus simple — fonctionne identiquement sur Windows, Linux et macOS.

### Prérequis uniquement

- Docker Desktop (Windows/macOS) ou Docker Engine (Linux)
- Git

### Installation

```bash
# 1. Cloner
git clone https://github.com/loic31000/local-agents.git
cd local-agents
git checkout 2-suite-de-la-roadmap-bitnet-mock-v410

# 2. Config
cp .env.example .env
# Éditer .env si nécessaire

# 3. Lancer
docker compose up -d

# 4. Télécharger un modèle (première fois — attendre que Ollama soit prêt)
docker compose exec ollama ollama pull llama3.2:3b

# 5. Dashboard
# http://localhost:8081
```

### Services Docker

| Service | Port | Description |
|---------|------|-------------|
| ollama | 11434 | Backend LLM |
| orchestrator | 8081 | API Go + Dashboard |
| agents | — | Agents Python |
| cyberdefence | 8086 | Agent sécurité |

---

## Premier démarrage

### Vérifier que tout fonctionne

```bash
# Orchestrateur
curl http://localhost:8081/api/health

# Agents disponibles
curl http://localhost:8081/api/agents | python3 -m json.tool

# CyberDefence
curl http://localhost:8086/health

# Test chat (Mock — instantané, sans LLM)
just mock-on
curl -X POST http://localhost:8081/api/chat/coder \
  -H "Content-Type: application/json" \
  -d '{"message": "bonjour"}'

# Remettre Ollama
just ollama-on
```

### Dashboard web

Ouvrir http://localhost:8081 dans le navigateur.

- Onglet **Chat** — choisir un agent dans la sidebar, envoyer un message
- Onglet **CyberDefence** — métriques de sécurité en temps réel
- Onglet **Paramètres** — modèle par agent, gestion Ollama

---

## Migration VM Linux → Windows

### Ce qui change

| Élément | Linux (VM) | Windows |
|---------|-----------|---------|
| Binaire orchestrateur | `bin/orchestrator` | `bin\orchestrator.exe` |
| Activation venv | `source venv/bin/activate` | `venv\Scripts\activate` |
| Variables d'env | `.env` via `set -a && source .env` | `.env` via PowerShell |
| Port par défaut | 8081 (8080 occupé par VirtualBox) | 8081 recommandé |
| just | `just` | `just` (même syntaxe) |

### Étapes de migration

**1. Exporter la config depuis la VM**

```bash
# Sur la VM Linux
cp .env .env.backup
cat .env | grep -v "^#" | grep "=" > .env.export
```

**2. Récupérer les tokens importants**

Depuis `.env.export` noter :
- `DISCORD_TOKEN`
- `CYBERDEFENCE_DISCORD_WEBHOOK`
- `EMAIL_USER` / `EMAIL_PASS`

**3. Cloner et configurer sur Windows**

```powershell
git clone https://github.com/loic31000/local-agents.git
cd local-agents
git checkout 2-suite-de-la-roadmap-bitnet-mock-v410
copy .env.example .env
# Copier les tokens récupérés dans .env
```

**4. Adapter config.yaml si nécessaire**

Sur Windows le port 8080 est généralement libre (pas de VirtualBox) :
```yaml
server:
  port: 8081  # garder 8081 pour cohérence
```

**5. Retélécharger les modèles Ollama**

Les modèles ne se transfèrent pas — il faut les retélécharger :
```powershell
ollama pull llama3.2:3b
```

**6. Compiler l'orchestrateur**

```powershell
go build -o bin\orchestrator.exe .\cmd\orchestrator
```

**7. Lancer**

```powershell
# PowerShell — Terminal 1
bin\orchestrator.exe

# PowerShell — Terminal 2
$env:CYBERDEFENCE_DISCORD_WEBHOOK=(Get-Content .env | Select-String "WEBHOOK" | ForEach-Object { $_.Line.Split("=")[1] })
python -m agents.cyberdefence.agent
```

---

## Vérification de l'installation

```bash
just test-install
```

Doit afficher :
```
Go OK
Python OK
Ollama OK
Go build OK
All checks passed
```

Test complet de l'API :
```bash
just test-api
just test-cyberdefence
```

Test du Mock Layer (sans Ollama) :
```bash
just mock-on
just chat coder "dis bonjour"
# → réponse en ~0.5s
just ollama-on
```

---

## Résolution de problèmes

### Port déjà utilisé

```bash
# Trouver le processus
just check-port 8081

# Tuer le processus
just kill-port 8081

# Ou changer le port dans config.yaml
```

Sur VirtualBox Ubuntu, le port 8080 est souvent occupé par le service
VirtualBox — utiliser 8081 (déjà configuré dans ce projet).

### Ollama ne répond pas

```bash
# Vérifier qu'Ollama tourne
curl http://localhost:11434/api/tags

# Relancer Ollama
ollama serve  # Linux/macOS
# Windows : redémarrer l'application Ollama depuis la barre système
```

### CyberDefence ne démarre pas (port 8086 occupé)

```bash
pkill -f "cyberdefence.agent"
sleep 1
set -a && source .env && set +a
python -m agents.cyberdefence.agent
```

### Variables d'environnement non chargées (CyberDefence)

Python ne charge pas `.env` automatiquement. Toujours utiliser :
```bash
set -a && source .env && set +a
python -m agents.cyberdefence.agent
# ou
just cyberdefence
```

### Erreur "multiple candidate justfiles"

```bash
ls Justfile justfile  # les deux existent
# Garder le plus grand
wc -l Justfile justfile
rm Justfile  # supprimer le plus petit
```

### Espace disque insuffisant

```bash
# Libérer de l'espace
ollama rm phi3:mini        # -2.2GB
ollama rm tinyllama:1.1b   # -0.6GB
rm -rf ~/.cache/huggingface/
just clean
```

### Windows — erreur de compilation Go

```powershell
# Vérifier la version Go
go version  # doit être >= 1.22

# Nettoyer le cache
go clean -modcache
go mod download
go build -o bin\orchestrator.exe .\cmd\orchestrator
```

### Windows — Python ne trouve pas les modules

```powershell
# S'assurer que le venv est activé
venv\Scripts\activate
pip install -r requirements.txt --force-reinstall
```
