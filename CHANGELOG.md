# Changelog

Toutes les modifications notables de ce projet sont documentées ici.
Format basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).

---

## [4.0.0] — 2026-03-14

### Ajouté — Agent CyberDefence

- Monitoring actif de tous les agents et de l'orchestrateur (ping toutes les 15s)
- Alerte CRITICAL après 3 échecs consécutifs seulement (plus de bruit au démarrage)
- Découverte automatique de la route `/health` de l'orchestrateur
- Rate limiting par user/IP — 30 req/min configurable
- Détection de prompt injection (jailbreak, commandes OS, SQL injection) via regex extensibles
- Protection anti-replay : chaque `request_id` traité une seule fois (TTL 5 min)
- Blocage IP manuel via `POST /block-ip` et déblocage via `POST /unblock-ip`
- Blocage automatique (`auto_block: true`) après N incidents configurables
- Journal d'événements structuré INFO / WARNING / CRITICAL avec rotation à 1000 entrées
- Export du journal en CSV via `GET /events?format=csv`
- Endpoint `GET /metrics` avec taux de blocage, latences par agent, répartition par sévérité
- Alertes Discord automatiques via webhook (embeds colorés) sur événements CRITICAL et WARNING
- Middleware CORS pour accès depuis le dashboard
- Configuration entièrement lue depuis `config.yaml` (check_interval, max_req_per_min, etc.)
- Événement `AGENT_RECOVERED` / `ORCHESTRATOR_RECOVERED` quand un service revient en ligne

### Ajouté — Orchestrateur Go

- `Content-Type: application/json` sur toutes les réponses HTTP (corrige le parsing JSON)
- Route `GET /api/agents/{id}/health` — proxifie vers le port de l'agent externe
- Proxy `POST /api/chat/{agent}` vers agents externes (port déclaré dans config)
- Champ `AgentConfig.Port`, `AgentConfig.Type`, `AgentConfig.Endpoint` lus depuis `config.yaml`
- Uptime en secondes dans `GET /api/health`
- Statut Ollama dans `GET /api/health`
- Agents `type: external` ignorés lors de l'initialisation Go (pas d'instanciation inutile)

### Ajouté — Dashboard Web

- Onglet **CyberDefence** avec 4 compteurs temps réel (inspectées, bloquées, IPs bloquées, événements)
- Statut par agent avec badge couleur et temps de réponse
- Répartition des événements par sévérité + barre de taux de blocage
- Timeline des événements filtrables par sévérité, auto-rafraîchissement toutes les 10s
- Export CSV depuis l'interface
- Mini-résumé CyberDefence dans la sidebar (toujours visible)
- Sélection du modèle par agent dans l'onglet Paramètres (persisté dans localStorage)
- Sélecteur de modèle inline dans la barre de chat (par requête)
- Indicateur "Réflexion en cours..." animé pendant la génération (cycling label)
- Avatar de l'agent visible pendant la génération
- Compteur de caractères en temps réel dans le textarea
- Animation `fadeUp` sur chaque message entrant
- Bouton Envoyer désactivé pendant la génération, focus automatique après réponse
- Erreurs affichées en rouge dans la bulle de l'agent

### Ajouté — Infrastructure

- `docker-compose.yml` avec services : ollama, orchestrator, agents, cyberdefence
- Volume persistant `ollama_data` pour les modèles
- `Dockerfile.orchestrator` multi-stage (builder Go + runtime Alpine)
- `Dockerfile.agents` (Python 3.10-slim)
- Injection automatique du `.env` dans les conteneurs via `env_file`

### Corrigé

- `ORCHESTRATOR_DOWN` ne se déclenchait plus à chaque ping mais après 3 échecs consécutifs
- Dashboard se connectait sur le port 8080 hardcodé au lieu de `window.location.host`
- `TaskResponse` construit avec `ResponseContent` et `Metrics` (format protocole correct)
- Port 8080 en conflit sur VirtualBox — migré sur 8081

---

## [3.0.0] — 2026-03-13

### Ajouté

- Bot Discord Jarvis avec commandes naturelles et modération
- Mémoire contextuelle par session Discord
- Modes adaptatifs Discord : `discussion`, `code`, `moderation`
- Commandes `!backend`, `!gpu`, `!models`, `!mode`, `!memory`, `!ping`
- Logs structurés JSON bout-en-bout (orchestrateur Go + agents Python)
- Support GPU Apple Silicon (Metal via Ollama)

---

## [2.0.0] — 2026-03-10

### Ajouté

- Double backend Ollama / GGUF avec fallback automatique
- Support GPU AMD (ROCm) et NVIDIA (CUDA)
- Protocole JSON standardisé orchestrateur ↔ agents (request_id, codes d'erreur, streaming)
- Agent `email` avec support SMTP
- Agent `social` pour Twitter/LinkedIn
- Interface Web dashboard (chat + paramètres)

---

## [1.0.0] — 2026-03-07

### Ajouté

- Orchestrateur Go — routing, queue, WebSocket, API REST
- Agents Python : `coder`, `files`
- Support Ollama (llama3.2:3b, mistral:7b, phi3:mini)
- Config `config.yaml` avec profils prédéfinis
- `common/protocol.py` — protocole d'échange standardisé
- `common/logger.py` — logger JSON structuré