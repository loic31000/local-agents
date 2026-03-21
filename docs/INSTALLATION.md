# Installation — Nexus

---

## ⚡ Installation en une commande

### 🪟 Windows (PowerShell Admin)

```powershell
irm https://raw.githubusercontent.com/loic31000/local-agents/main/scripts/install.ps1 | iex
```

### 🐧 Linux

```bash
curl -fsSL https://raw.githubusercontent.com/loic31000/local-agents/main/scripts/install.sh | bash
```

---

## Ce que fait le script automatiquement

| Étape | Windows | Linux |
|-------|---------|-------|
| Gestionnaire paquets | winget / Chocolatey | apt / dnf / pacman |
| Git | ✅ | ✅ |
| Docker | Docker Desktop | Docker Engine |
| Go 1.22+ | ✅ | ✅ |
| Python 3.10+ | ✅ | ✅ |
| Node.js + pnpm | ✅ | ✅ |
| Just | ✅ | ✅ |
| Ollama | ✅ | ✅ |
| Config `.env` | prompt interactif | prompt interactif |
| Détection GPU | Win32_VideoController | nvidia-smi / rocm-smi |
| Pull modèle | qwen2.5-coder:1.5b | qwen2.5-coder:1.5b |
| Build frontend | pnpm build | pnpm build |
| Ouvre dashboard | http://localhost:5173 | http://localhost:5173 |

---

## Installation manuelle complète

```bash
# 1. Cloner
git clone https://github.com/loic31000/local-agents
cd local-agents

# 2. Ollama natif
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5-coder:1.5b

# 3. Configurer
cp .env.example .env
# Éditer : OLLAMA_URL, DATABASE_URL, DISCORD_TOKEN (optionnel)

# 4. Backend Go
go mod download
go build -o bin/orchestrator ./cmd/orchestrator

# 5. Frontend
cd frontend
pnpm install
pnpm dev          # dev → http://localhost:5173
# ou
pnpm build        # prod → ../web/static/

# 6. Lancer tout
just start
```

---

## Frontend seul (développement)

```bash
cd frontend
pnpm install
pnpm dev
```

Le proxy Vite redirige `/api` → `http://localhost:8081` et `/ws` → `ws://localhost:8081`.

```typescript
// vite.config.ts
server: {
  proxy: {
    '/api': { target: 'http://localhost:8081', changeOrigin: true },
    '/ws':  { target: 'ws://localhost:8081', ws: true, changeOrigin: true }
  }
}
```

---

## Configuration `.env`

```bash
# Ollama (natif sur l'hôte)
OLLAMA_URL=http://localhost:11434
# Docker Windows/macOS
# OLLAMA_URL=http://host.docker.internal:11434
# Docker Linux
# OLLAMA_URL=http://host-gateway:11434

# Base de données (Training + Datasets)
DATABASE_URL=postgres://nexus:nexus@localhost:5432/nexus

# GPU (détecté auto par les scripts d'install)
GPU_ENABLED=false
GPU_TYPE=           # nvidia | amd

# Discord (optionnel)
DISCORD_TOKEN=
DISCORD_GUILD_ID=
CYBERDEFENCE_DISCORD_WEBHOOK=https://discord.com/api/webhooks/...

# Email (optionnel)
EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_SMTP_PORT=587
EMAIL_USER=
EMAIL_PASS=

LOG_LEVEL=info
```

---

## Dépendances frontend

```bash
pnpm add react-markdown react-syntax-highlighter recharts
pnpm add -D @types/react-syntax-highlighter
```

---

## Commandes post-install

```bash
just status           # état des containers
just logs             # logs en direct
just build            # rebuild images Docker

# Vérification manuelle
curl http://localhost:8081/api/health       # orchestrateur
curl http://localhost:8081/api/metrics/system  # métriques CPU/RAM/GPU
curl http://localhost:8086/health           # CyberDefence
curl http://localhost:11434/api/tags        # Ollama
```

---

## Problèmes fréquents

**Port 8081 déjà utilisé**
```bash
just check-port 8081
just kill-port 8081
```

**`/api/metrics/system` retourne 404**
Vérifier que `metrics_handler.go` est dans `cmd/orchestrator/` et que la route est enregistrée dans `main.go` :
```go
router.HandleFunc("/api/metrics/system", o.handleSystemMetrics).Methods("GET")
```
Puis rebuilder : `docker compose build --no-cache orchestrator`

**GPU non détecté dans la navbar**
Normal si pas de NVIDIA ou `nvidia-smi` absent. Les métriques GPU sont omises silencieusement.

**Docker Desktop ne démarre pas (Windows)**
Lance Docker Desktop manuellement, attends qu'il soit prêt (`docker ps` sans erreur), puis relance.

**Espace disque insuffisant**
```bash
ollama rm tinyllama:1.1b   # libère 0.6GB
just clean                 # nettoie Docker
```
EOF
echo "INSTALLATION: $(wc -l < /home/claude/docs/INSTALLATION.md) lines"
Sortie# Installation — Nexus

---

## ⚡ Installation en une commande

### 🪟 Windows (PowerShell Admin)

```powershell
irm https://raw.githubusercontent.com/loic31000/local-agents/main/scripts/install.ps1 | iex
```

### 🐧 Linux

```bash
curl -fsSL https://raw.githubusercontent.com/loic31000/local-agents/main/scripts/install.sh | bash
```

---

## Ce que fait le script automatiquement

| Étape | Windows | Linux |
|-------|---------|-------|
| Gestionnaire paquets | winget / Chocolatey | apt / dnf / pacman |
| Git | ✅ | ✅ |
| Docker | Docker Desktop | Docker Engine |
| Go 1.22+ | ✅ | ✅ |
| Python 3.10+ | ✅ | ✅ |
| Node.js + pnpm | ✅ | ✅ |
| Just | ✅ | ✅ |
| Ollama | ✅ | ✅ |
| Config `.env` | prompt interactif | prompt interactif |
| Détection GPU | Win32_VideoController | nvidia-smi / rocm-smi |
| Pull modèle | qwen2.5-coder:1.5b | qwen2.5-coder:1.5b |
| Build frontend | pnpm build | pnpm build |
| Ouvre dashboard | http://localhost:5173 | http://localhost:5173 |

---

## Installation manuelle complète

```bash
# 1. Cloner
git clone https://github.com/loic31000/local-agents
cd local-agents

# 2. Ollama natif
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5-coder:1.5b

# 3. Configurer
cp .env.example .env
# Éditer : OLLAMA_URL, DATABASE_URL, DISCORD_TOKEN (optionnel)

# 4. Backend Go
go mod download
go build -o bin/orchestrator ./cmd/orchestrator

# 5. Frontend
cd frontend
pnpm install
pnpm dev          # dev → http://localhost:5173
# ou
pnpm build        # prod → ../web/static/

# 6. Lancer tout
just start
```

---

## Frontend seul (développement)

```bash
cd frontend
pnpm install
pnpm dev
```

Le proxy Vite redirige `/api` → `http://localhost:8081` et `/ws` → `ws://localhost:8081`.

```typescript
// vite.config.ts
server: {
  proxy: {
    '/api': { target: 'http://localhost:8081', changeOrigin: true },
    '/ws':  { target: 'ws://localhost:8081', ws: true, changeOrigin: true }
  }
}
```

---

## Configuration `.env`

```bash
# Ollama (natif sur l'hôte)
OLLAMA_URL=http://localhost:11434
# Docker Windows/macOS
# OLLAMA_URL=http://host.docker.internal:11434
# Docker Linux
# OLLAMA_URL=http://host-gateway:11434

# Base de données (Training + Datasets)
DATABASE_URL=postgres://nexus:nexus@localhost:5432/nexus

# GPU (détecté auto par les scripts d'install)
GPU_ENABLED=false
GPU_TYPE=           # nvidia | amd

# Discord (optionnel)
DISCORD_TOKEN=
DISCORD_GUILD_ID=
CYBERDEFENCE_DISCORD_WEBHOOK=https://discord.com/api/webhooks/...

# Email (optionnel)
EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_SMTP_PORT=587
EMAIL_USER=
EMAIL_PASS=

LOG_LEVEL=info
```

---

## Dépendances frontend

```bash
pnpm add react-markdown react-syntax-highlighter recharts
pnpm add -D @types/react-syntax-highlighter
```

---

## Commandes post-install

```bash
just status           # état des containers
just logs             # logs en direct
just build            # rebuild images Docker

# Vérification manuelle
curl http://localhost:8081/api/health       # orchestrateur
curl http://localhost:8081/api/metrics/system  # métriques CPU/RAM/GPU
curl http://localhost:8086/health           # CyberDefence
curl http://localhost:11434/api/tags        # Ollama
```

---

## Problèmes fréquents

**Port 8081 déjà utilisé**
```bash
just check-port 8081
just kill-port 8081
```

**`/api/metrics/system` retourne 404**
Vérifier que `metrics_handler.go` est dans `cmd/orchestrator/` et que la route est enregistrée dans `main.go` :
```go
router.HandleFunc("/api/metrics/system", o.handleSystemMetrics).Methods("GET")
```
Puis rebuilder : `docker compose build --no-cache orchestrator`

**GPU non détecté dans la navbar**
Normal si pas de NVIDIA ou `nvidia-smi` absent. Les métriques GPU sont omises silencieusement.

**Docker Desktop ne démarre pas (Windows)**
Lance Docker Desktop manuellement, attends qu'il soit prêt (`docker ps` sans erreur), puis relance.

**Espace disque insuffisant**
```bash
ollama rm tinyllama:1.1b   # libère 0.6GB
just clean                 # nettoie Docker
```
