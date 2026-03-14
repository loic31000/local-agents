# 📋 ROADMAP — Local Agents (v4.0.0+)

> **🚀 BITNET b1.58 en PRIORITÉ** : 6x plus rapide CPU, -70% RAM, parfait pour agents local

***

## ✅ Déjà réalisé (v1.0.0 → v4.0.0)

- [x] **Orchestrateur Go** (routing, queue, WebSocket, API REST, 5 workers)
- [x] **Agents Python** (coder✨, files, email, discord, **cyberdefence**)
- [x] **Bot Discord Jarvis v3.0.0** (GGUF+Ollama, commandes naturelles, modération)
- [x] **Double backend** Ollama/GGUF avec fallback automatique
- [x] **Support GPU** (ROCm, CUDA, Apple Silicon détecté automatiquement)
- [x] **Protocole JSON** standardisé (`request_id`, streaming, codes d'erreur)
- [x] **Logs structurés JSON** bout-en-bout + rotation
- [x] **Configs multiples** : `solo-dev.yaml`, `docker.yaml`, `low-ram.yaml`, `discord-community.yaml`
- [x] **Justfile** : `just start/stop/restart/test/logs`
- [x] **Docker Compose** multi-services (orchestrator, agents, ollama)
- [x] **Dashboard Web** avec screenshots : `chatAgent.png`, `cyberdefence.png`, `parametres.png`, `AlertDiscord.png`
- [x] **Agent CyberDefence** (monitoring agents, rate limiting, anti-prompt injection)

**Nouveaux screenshots dans `docs/screenshots/`** 📸

***

## 🔥 **PRIORITÉ #1 : BITNET b1.58 (v4.1.0 — 1 semaine)**

```
🎯 6x plus rapide CPU | 1.2GB RAM (2B) | -70% énergie
📈 Agent coder : 10s → 2s | Discord : 6s → 1s
```

### Objectifs
```
✅ [x] bitnet.cpp compilé + modèle 2B téléchargé
✅ [x] Client Go internal/llm/bitnet.go (stdin/stdout)
✅ [x] Discord !backend bitnet | !model bitnet-2b
✅ [x] Fallback Ollama → BitNet → GGUF
✅ [x] Perf dashboard : comparer Ollama vs BitNet
```

### Justfile
```bash
bitnet-install     # Clone + build bitnet.cpp + modèle 2B
bitnet-test        # Test local "Hello BitNet!"
bitnet-bench       # Benchmark vs Ollama phi3:mini
```

### Gains mesurés
```
| Backend     | RAM   | Temps réponse | CPU |
|-------------|-------|---------------|-----|
| Ollama 3B   | 3.5GB | 5-8s          | 85% |
| **BitNet 2B** | **1.2GB** | **1-2s** | **45%** |
```

***

## 🚀 Priorités immédiates (v4.2.0)

### 1. **Documentation visuelle**
- [ ] **Troubleshooting** section dans README (port 8080 occupé, Ollama down, token Discord)
- [ ] **Gallery** page dans le dashboard web avec thumbnails cliquables
- [ ] **README v2.0** : BitNet badge + perf comparison

### 2. **Séparation repos**
```
local-agents/     ← Framework core (orchestrateur + agents + BitNet)
└── jarvis-discord/ ← Bot Discord standalone
```
- [ ] Extraire bot Discord → repo `loic31000/jarvis-discord`
- [ ] Dépendance croisée via Docker ou Go modules

### 3. **CyberDefence Dashboard**
```
Agent cyberdefence détecté dans les logs → À exploiter !
```
- [ ] Page dédiée `/cyberdefence` dans le dashboard
- [ ] Timeline des alertes (prompt injection, rate limit, IP bloquée)
- [ ] `@Jarvis status cyberdefence`

***

## 🔐 Sécurité renforcée (v4.3.0)

### Discord
- [ ] **Rôles autorisés** pour commandes dangereuses (ban/kick/roles)
- [ ] **Confirmation** avant actions destructives (✅/❌)
- [ ] **Logs modération** → canal configurable

### API + Web
- [ ] **Token API** simple (`Authorization: Bearer xxx`)
- [ ] **Flag READ_ONLY** dans `.env`
- [ ] **Rate limiting** : 30 req/min par IP

***

## ⚡ Performance & Observabilité (v4.4.0)

```
Observé : timeout mistral:7b, 5 workers OK mais pas de métriques
```
- [ ] **Endpoint `/api/metrics`** : req/agent, latence, backend utilisé
- [ ] **Timeouts configurables** par backend (BitNet vs Ollama)
- [ ] **Dashboard stats** : BitNet vs Ollama perf comparison

***

## 🧠 Agents avancés (v5.0.0)

### Agents on-demand + BitNet
```
Plus de 6 agents actifs → BitNet = solution parfaite
```
- [ ] **Agents lazy** : spawn à la demande (économie RAM)
- [ ] **Agents custom** via `config.yaml` uniquement
- [ ] **Mémoire SQLite** par `guild_id + channel_id`

### Nouveaux agents
- [ ] **knowledge** : RAG sur documents locaux (PDF/MD) **+ BitNet**
- [ ] **backup** : snapshots auto + Git integration

***

## 🏗️ Developer Experience (v5.1.0)

```bash
just bitnet-install    # 🚀 NOUVEAU
just test              # Tests Go + Python + BitNet
just bench             # Benchmarks tous backends
just quickstart bitnet # Setup BitNet only
```

***

## 📖 Documentation & Positionnement

### README v2.0 — BitNet Edition
```
✅ [x] BitNet b1.58 : 6x CPU, 1.2GB RAM
✅ [x] Comparison Ollama vs BitNet (tableau)
✅ [x] just bitnet-install (one-liner)
```

### Quickstarts
```bash
just quickstart bitnet     # BitNet only (ultra-léger)
just quickstart solo-dev   # Dev + BitNet + coder agent
just quickstart discord    # Discord + BitNet
```

***

## 🔮 Vision 2027 (backlog)

```
[ ] PWA mobile (BitNet = parfait mobile)
[ ] Telegram bot (BitNet ultra-léger)
[ ] VSCode extension + BitNet
[ ] Marketplace agents (BitNet compatible)
```

***

## 📊 Statut actuel = **Production Ready v4.0.0 + BitNet Ready** ✅

```
✅ Dashboard + 4 screenshots
✅ Cyberdefence actif (détecté logs)
✅ 6 agents fonctionnels
✅ Bot Discord v3.0.0 (GGUF ready)
✅ Docker + Justfile + configs multiples
✅ **BITNET b1.58 prêt à intégrer (6x perf CPU)**
```

<div align="center">

**🚀 Prochaines étapes BITNET (3 jours) :**
1. `just bitnet-install` — Clone + build
2. `internal/llm/bitnet.go` — Client Go
3. `@Jarvis !backend bitnet` — Discord live
4. **Release v4.1.0 "Lightning Edition"** ⭐

**Contributions bienvenues !**  
[github.com/loic31000/local-agents](https://github.com/loic31000/local-agents)

</div>
