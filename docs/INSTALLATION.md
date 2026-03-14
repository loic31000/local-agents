# Installation — Local Agents

---

## Windows (Docker — recommandé)

**Prérequis : Docker Desktop**  
Télécharger et installer depuis https://docker.com/products/docker-desktop

```powershell
git clone https://github.com/loic31000/local-agents.git
cd local-agents
copy .env.example .env
docker compose up -d
docker compose exec ollama ollama pull llama3.2:3b
```

Ouvrir http://localhost:8081 — c'est tout.

> Première fois que Docker télécharge les images : ~5 minutes.  
> Le modèle llama3.2:3b : ~2GB à télécharger une seule fois.

---

## Linux / macOS (Docker)

```bash
git clone https://github.com/loic31000/local-agents.git
cd local-agents
cp .env.example .env
docker compose up -d
docker compose exec ollama ollama pull llama3.2:3b
```

Ouvrir http://localhost:8081

---

## Sans Docker (Linux / macOS)

Pour ceux qui préfèrent lancer directement sans Docker.

**Prérequis :** Go 1.22+, Python 3.10+, Ollama

```bash
# Ollama
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.2:3b

# Projet
git clone https://github.com/loic31000/local-agents.git
cd local-agents
cp .env.example .env

# Dépendances
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
go build -o bin/orchestrator ./cmd/orchestrator

# Lancer
./bin/orchestrator &
set -a && source .env && set +a
python -m agents.cyberdefence.agent
```

---

## Configuration .env

Seuls ces deux tokens sont nécessaires pour les fonctions avancées.  
Le projet fonctionne sans eux pour le chat de base.

```bash
# Alertes Discord depuis CyberDefence (optionnel)
CYBERDEFENCE_DISCORD_WEBHOOK=https://discord.com/api/webhooks/...

# Bot Discord Jarvis (optionnel)
DISCORD_TOKEN=your_token_here
```

---

## Migration VM Linux → Windows

Tu as déjà le projet qui tourne sur une VM Linux.  
Sur le Windows cible :

```powershell
# 1. Installer Docker Desktop
# 2. Cloner la bonne branche
git clone https://github.com/loic31000/local-agents.git
cd local-agents
git checkout 2-suite-de-la-roadmap-bitnet-mock-v410

# 3. Copier tes tokens depuis .env de la VM
copy .env.example .env
# Éditer .env et coller DISCORD_TOKEN + CYBERDEFENCE_DISCORD_WEBHOOK

# 4. Lancer
docker compose up -d
docker compose exec ollama ollama pull llama3.2:3b
```

Les modèles Ollama ne se transfèrent pas — il faut les retélécharger.  
Tout le reste (code, config, agents) est dans le repo Git.

---

## Vérification

```bash
# Santé de l'orchestrateur
curl http://localhost:8081/api/health

# Test sans LLM (Mock Layer — réponse instantanée)
just mock-on
just chat coder "bonjour"
just ollama-on

# État CyberDefence
curl http://localhost:8086/health
```

---

## Problèmes fréquents

**Port déjà utilisé**
```bash
just check-port 8081
just kill-port 8081
```

**CyberDefence ne démarre pas**
```bash
# Le .env doit être chargé manuellement hors Docker
set -a && source .env && set +a
python -m agents.cyberdefence.agent
# ou simplement :
just cyberdefence
```

**Espace disque insuffisant**
```bash
ollama rm phi3:mini        # libère 2.2GB
ollama rm tinyllama:1.1b   # libère 0.6GB
just clean
```

**Windows — variables d'environnement**
```powershell
# PowerShell ne charge pas .env automatiquement
# Utiliser Docker Compose qui le charge via env_file
# ou définir manuellement :
$env:CYBERDEFENCE_DISCORD_WEBHOOK="https://discord.com/api/webhooks/..."
```
