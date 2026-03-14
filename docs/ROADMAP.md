# 📋 ROADMAP — Local Agents

> Feuille de route complète du projet, intégrant les retours d'usage réels (Discord, tests GPU, protocole).

---

## ✅ Déjà réalisé (v1.0.0 → v3.0.0)

- [x] Orchestrateur Go (routing, queue, WebSocket, API REST)
- [x] Agents Python (coder, files, email, social, discord)
- [x] Bot Discord Jarvis (commandes naturelles, modération, mémoire contextuelle)
- [x] Double backend Ollama / GGUF avec fallback automatique
- [x] Support GPU AMD (ROCm), NVIDIA (CUDA), Apple Silicon
- [x] Protocole JSON standardisé orchestrateur ↔ agents (`request_id`, codes d'erreur, streaming)
- [x] Logs structurés JSON bout-en-bout
- [x] Modes adaptatifs Discord (discussion, code, modération)
- [x] Commandes `!backend`, `!gpu`, `!models`, `!mode`, `!memory`, `!ping`
- [x] Interface Web dashboard (http://localhost:8080)

---

## 🗂️ Séparation des repos (priorité immédiate)

> Basé sur les retours d'usage : le framework core et le bot Discord ont des cycles de vie différents.

- [ ] Extraire le bot Discord dans un repo séparé **`jarvis-discord`**
- [ ] `local-agents` devient le framework pur (orchestrateur + agents + API REST)
- [ ] `jarvis-discord` consomme `local-agents` comme dépendance externe
- [ ] Documenter l'intégration entre les deux repos

---

## 🔐 Sécurité et permissions

> Observé en test : n'importe quel membre peut déclencher ban/kick/rôle admin.

### Discord
- [ ] Système de rôles autorisés pour les commandes dangereuses (ban, kick, assign admin)
- [ ] Confirmation avant actions destructives (réaction ✅/❌ ou délai d'annulation)
- [ ] Ne plus demander la permission `Administrator` — utiliser des permissions granulaires
- [ ] Logger les actions de modération dans un canal dédié optionnel (configurable dans `.env`)

### API REST
- [ ] Token d'API simple (header `Authorization`) pour protéger les endpoints en production
- [ ] Flag `READ_ONLY` dans `.env` pour désactiver les endpoints destructifs
- [ ] Rate limiting basique sur `/api/chat/{agent}`

---

## ⚡ Performance & modèles

> Observé en test : timeout sur `mistral:7b` pour du code Node.js, ~2min de réponse.

- [ ] `num_ctx` configurable par agent (le coder a besoin de plus de contexte)
- [ ] Cache du modèle GGUF en mémoire entre les requêtes (éviter le rechargement)
- [ ] Timeout configurable par modèle dans `config.yaml` (mistral:7b nécessite plus de temps)
- [ ] `repeat_penalty: 1.1` + `temperature: 0.3` pour l'agent coder, `0.7` pour le chat
- [ ] Retry exponentiel automatique sur `ERR_TIMEOUT` et `ERR_OLLAMA_UNAVAILABLE`

---

## 🧠 Mémoire contextuelle

> Observé en test : mémoire vide après reconnexion, pas de persistance entre sessions.

- [ ] Mémoire persistante via SQLite (par `guild_id` + `channel_id`)
- [ ] Résumé automatique de l'historique quand il dépasse 10 messages (au lieu de tronquer)
- [ ] Commande `!memory export` pour sauvegarder une conversation en fichier
- [ ] TTL configurable sur la mémoire (ex: effacement auto après 24h d'inactivité)

---

## 🏗️ Architecture agents / orchestrateur

- [ ] Agents **on-demand** (se lancent à la demande, ne tournent pas en permanence)
- [ ] Circuit breaker : si un agent échoue 3x, le marquer `degraded` dans `/api/health`
- [ ] Définition d'agents custom via fichier de config uniquement (sans toucher au code Go)
- [ ] Streaming Discord : afficher la réponse progressivement avec `message.edit()`
- [ ] Endpoint `/api/agents/register` documenté pour les agents tiers

---

## 🌐 Interface Web

- [ ] Sélecteur de modèle par agent dans le dashboard
- [ ] Historique minimal des conversations par agent
- [ ] Affichage du temps de réponse et du modèle utilisé par requête
- [ ] Édition des paramètres de base depuis l'UI (modèle par défaut, température, max tokens)
- [ ] Indicateur de statut en temps réel (Ollama ✅/❌, agents Python ✅/❌, Discord ✅/❌)

---

## 📊 Observabilité et monitoring

- [ ] Endpoint `/api/metrics` : nombre de requêtes par agent, latence moyenne, taux d'erreur
- [ ] Page "Statistiques" dans le dashboard (usage par agent, par modèle, top commandes Discord)
- [ ] Niveau de log configurable via `.env` : `DEBUG`, `INFO`, `ERROR`
- [ ] Dashboard Grafana optionnel (export métriques Prometheus)

---

## 🧪 Qualité du code & DX

- [ ] Tests unitaires Go : client Ollama, router d'agents, handlers HTTP principaux
- [ ] Tests de validation des schémas JSON du protocole
- [ ] `docker-compose.yml` pour lancer tout l'environnement en une commande
- [ ] CI GitHub Actions : lint Go + Python, build, tests
- [ ] Guide "Créer un nouvel agent Python" (structure minimale, entrypoint, protocole)
- [ ] Script `just test` dans le Justfile

---

## 📖 Positionnement & documentation

- [ ] Section **"Use cases"** dans le README :
  - Dev solo (agent coder + files)
  - Admin serveur Discord (modération + Jarvis)
  - Setup offline pour petite équipe / VPS
- [ ] **"Recipes"** pas à pas :
  - Créer un agent "knowledge base locale"
  - Brancher un SMTP réel pour l'agent email
  - Déployer sur un mini-serveur (VPS / NUC / Raspberry Pi)
- [ ] Tableau comparatif dans le README (AutoGen, LangGraph, Phidata, n8n) pour clarifier le positionnement 100% local + Go + Python + Discord
- [ ] `config.yaml` entièrement commenté avec toutes les options disponibles

---

## 🔮 Idées futures (backlog)

- [ ] Agent **"knowledge base"** : indexation de documents locaux (PDF, Markdown) avec RAG
- [ ] Support **Telegram** en parallèle de Discord
- [ ] Interface mobile (PWA)
- [ ] Plugin VSCode pour interagir avec l'orchestrateur directement depuis l'éditeur
- [ ] Export des conversations en PDF/Markdown

---

## 🛡️ Agent CyberDefence (v4.0.0)

- [x] Monitoring actif de tous les agents (ping toutes les 15s)
- [x] Rate limiting par user/IP (30 req/min configurable)
- [x] Détection prompt injection (jailbreak, OS commands, SQL injection)
- [x] Protection anti-replay via `request_id` (TTL 5min)
- [x] Blocage IP manuel et automatique
- [x] Journal d'événements structuré (INFO / WARNING / CRITICAL, rotation 1000)
- [x] Endpoint `/inspect` intégré dans le pipeline de routing orchestrateur
- [x] Commandes Discord `@Jarvis status agents` / `@Jarvis alertes`
- [ ] Règles de détection custom via `config.yaml`
- [ ] Alertes Discord automatiques sur événements CRITICAL
- [ ] Dashboard dédié dans l'interface web (timeline des événements)
- [ ] Export des logs sécurité en CSV/JSON
- [ ] Blocage automatique après N échecs (fail2ban-like)
- [ ] Scan des réponses agents (fuites de données sensibles)

<div align="center">

**Les contributions sont les bienvenues !**  
Ouvre une issue ou une PR sur [github.com/loic31000/local-agents](https://github.com/loic31000/local-agents)

</div>