# 📋 ROADMAP — Local Agents (v4.0.0+)

> Feuille de route mise à jour intégrant **screenshots**, **agent cyberdefence**, **configs multiples**, **Justfile**, **Docker** et retours d'usage réels.

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

## 🚀 Priorités immédiates (v4.1.0)

### 1. **Documentation visuelle**
```
✅ [x] Screenshots déplacés → docs/screenshots/
✅ [x] README.md mis à jour avec 4 nouvelles captures
✅ [x] Liens relatifs vers docs/screenshots/ dans le markdown
```
- [ ] **Troubleshooting** section dans README (port 8080 occupé, Ollama down, token Discord)
- [ ] **Gallery** page dans le dashboard web avec thumbnails cliquables

### 2. **Séparation repos** (fortement recommandé)
```
local-agents/     ← Framework core (orchestrateur + agents)
└── jarvis-discord/ ← Bot Discord standalone
```
- [ ] Extraire bot Discord → repo `loic31000/jarvis-discord`
- [ ] `local-agents` → framework pur (API REST + agents)
- [ ] Dépendance croisée via Docker ou Go modules
- [ ] READMEs synchronisés + guides d'intégration

### 3. **CyberDefence Dashboard**
```
Agent cyberdefence détecté dans les logs → À exploiter !
```
- [ ] Page dédiée `/cyberdefence` dans le dashboard
- [ ] Timeline des alertes (prompt injection, rate limit, IP bloquée)
- [ ] Commande Discord `@Jarvis status cyberdefence`
- [ ] Export logs sécurité → CSV/JSON

***

## 🔐 Sécurité renforcée (v4.2.0)

### Discord
- [ ] **Rôles autorisés** pour commandes dangereuses (ban/kick/roles)
- [ ] **Confirmation** avant actions destructives (✅/❌)
- [ ] **Logs modération** → canal configurable
- [ ] **Anti-spam** : cooldown 3s par commande

### API + Web
- [ ] **Token API** simple (`Authorization: Bearer xxx`)
- [ ] **Flag READ_ONLY** dans `.env`
- [ ] **Rate limiting** : 30 req/min par IP

***

## ⚡ Performance & Observabilité (v4.3.0)

```
Observé : timeout mistral:7b, 5 workers OK mais pas de métriques
```
- [ ] **Endpoint `/api/metrics`** : req/agent, latence, erreurs
- [ ] **Timeouts configurables** par modèle dans `config.yaml`
- [ ] **Dashboard stats** : top agents, modèles, temps réponse
- [ ] **Circuit breaker** : agent défaillant → `degraded` status

***

## 🧠 Agents avancés (v5.0.0)

### Agents on-demand
```
Plus de 6 agents actifs → architecture à optimiser
```
- [ ] **Agents lazy** : spawn à la demande (économie RAM)
- [ ] **Agents custom** via `config.yaml` uniquement
- [ ] **Mémoire SQLite** par `guild_id + channel_id`

### Nouveaux agents
- [ ] **knowledge** : RAG sur documents locaux (PDF/MD)
- [ ] **backup** : snapshots auto + Git integration
- [ ] **deploy** : one-click VPS/Raspberry Pi

***

## 🏗️ Developer Experience (v5.1.0)

```
Justfile existant → À compléter
```
```bash
just test          # Tests Go + Python
just lint          # gofmt + black + mypy
just docs          # Génère README + screenshots
just ci            # GitHub Actions local
```

- [ ] **Tests unitaires** : Ollama client, router, agents
- [ ] **CI GitHub Actions** : lint, build, tests
- [ ] **Guide "Créer un agent"** → 5min chrono
- [ ] **Plugin VSCode** pour interagir avec l'API

***

## 📖 Documentation & Positionnement

### README v2.0
```
✅ [x] Screenshots ajoutés
✅ [x] Configs multiples documentées
```
- [ ] **Use cases** : Dev solo, Discord community, VPS
- [ ] **Comparatif** : AutoGen, LangGraph, Phidata, n8n
- [ ] **Recipes** : "Agent custom en 10min", "Deploy VPS"

### Quickstarts
```
just quickstart solo-dev    # Setup dev solo
just quickstart discord     # Serveur Discord
just quickstart docker      # Docker one-shot
```

***

## 🔮 Vision 2027 (backlog)

```
[ ] PWA mobile
[ ] Telegram bot
[ ] VSCode extension
[ ] Grafana dashboard
[ ] Plugin system (marketplace agents)
```

***

## 📊 Statut actuel = **Production Ready v4.0.0** ✅

```
✅ Dashboard + 4 screenshots
✅ Cyberdefence actif (détecté logs)
✅ 6 agents fonctionnels
✅ Bot Discord v3.0.0 (GGUF ready)
✅ Docker + Justfile + configs multiples
✅ API REST + WebSocket OK
```

<div align="center">

**Prochaines étapes concrètes :**
1. `docs/screenshots/` → Git + README
2. Issue GitHub : "Séparer jarvis-discord"
3. Page CyberDefence dans dashboard
4. `just quickstart solo-dev`

**Contributions bienvenues !** ⭐  
[github.com/loic31000/local-agents](https://github.com/loic31000/local-agents)

</div>
