```markdown
# Installation — Local Agents

---

## ⚡ Installation en une commande

### 🪟 Windows (PowerShell Admin)

```powershell
irm https://raw.githubusercontent.com/loic31000/local-agents/main/scripts/install.ps1 | iex
```

> Lance PowerShell en **administrateur**, colle la commande, c'est tout.  
> Docker Desktop, Go, Python, Just, Ollama — tout est installé automatiquement.

### 🐧 Linux

```bash
curl -fsSL https://raw.githubusercontent.com/loic31000/local-agents/main/scripts/install.sh | bash
```

> Compatible Ubuntu, Debian, Fedora, Arch.  
> GPU NVIDIA/AMD détecté automatiquement.

---

## Ce que fait le script automatiquement

| Étape | Windows | Linux |
|-------|---------|-------|
| Gestionnaire paquets | winget / Chocolatey | apt / dnf / pacman |
| Git | ✅ | ✅ |
| Docker | Docker Desktop | Docker Engine |
| Go 1.22+ | ✅ | ✅ |
| Python 3.10+ | ✅ | ✅ |
| Just | ✅ | ✅ |
| Ollama | ✅ | ✅ |
| Clone repo | ✅ | ✅ |
| Config `.env` | prompt interactif | prompt interactif |
| Détection GPU | Win32_VideoController | nvidia-smi / rocm-smi |
| Pull modèle | llama3.2:latest | llama3.2:latest |
| Ouvre dashboard | http://localhost:8081 | http://localhost:8081 |

---

## Configuration `.env`

Le script crée `.env` automatiquement depuis `.env.example`.  
Seuls ces deux tokens sont demandés à l'install :

```bash
# Bot Discord Jarvis (optionnel)
DISCORD_TOKEN=

# Alertes CyberDefence sur Discord (optionnel)
CYBERDEFENCE_DISCORD_WEBHOOK=
```

Pour configurer manuellement après l'install :
```bash
nano ~/.local/local-agents/.env       # Linux
notepad $env:USERPROFILE\local-agents\.env  # Windows
```

---

## Commandes post-install

```bash
just status           # état des services
just logs             # logs en direct
just test-api         # tests API
just security-status  # état CyberDefence
just chat coder "bonjour"  # test agent
```

---

## Sans Docker (Linux / macOS avancé)

```bash
# Prérequis : Go 1.22+, Python 3.10+, Ollama
ollama pull llama3.2:latest

git clone https://github.com/loic31000/local-agents.git
cd local-agents
cp .env.example .env

python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
go build -o bin/orchestrator ./cmd/orchestrator

./bin/orchestrator &
python -m agents.cyberdefence.agent
```

---

## Vérification manuelle

```bash
curl http://localhost:8081/api/health    # orchestrateur
curl http://localhost:8086/health        # CyberDefence
curl http://localhost:11434/api/tags     # Ollama
```

---

## Problèmes fréquents

**Port déjà utilisé**
```bash
just check-port 8081
just kill-port 8081
```

**Docker Desktop ne démarre pas (Windows)**  
Lance Docker Desktop manuellement, attends qu'il soit prêt, puis relance `install.ps1`.

**Espace disque insuffisant**
```bash
ollama rm tinyllama:1.1b   # libère 0.6GB
just clean                 # nettoie Docker
```

**GPU non détecté**  
Vérifie dans `.env` :
```bash
GPU_ENABLED=true
GPU_TYPE=nvidia   # ou amd
```
```

***
