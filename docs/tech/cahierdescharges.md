# CAHIER DES CHARGES
## Plateforme Jarvis IA (Local Agents)

Projet : Assistant IA multi-agent local (Jarvis)   
Date : Mars 2026

---

## Sommaire
1. Synopsis  
A. Présentation du projet et objectifs  
B. Authentification et rôles  
C. Gestion des interactions et workflow  
D. Fonctionnalités avancées  
E. Sécurité et performance  
F. Modules optionnels

2. Cahier des Charges Client Front-End  
2.1 Fonctionnel  
2.2 Non-fonctionnel

3. Cahier des Charges Client Back-End  
3.1 Fonctionnel  
3.2 Non-fonctionnel

4. Annexes  
A. DTO de référence  
B. User stories majeures  
C. Critères d'acceptation globaux

---

## 1. Synopsis

### A. Présentation du Projet et Objectifs

Description de l'application  
La plateforme Jarvis IA (Local Agents) est une application web + API permettant de piloter un assistant IA multi-agent en local.  
Elle couvre :
- Dialogue en temps réel via WebSocket et API REST.
- Routage des requêtes vers des agents spécialisés (code, fichiers, Discord, sécurité).
- Gestion des modèles LLM (Mock, Ollama, GGUF).
- Supervision sécurité (CyberDefence).
- Observabilité (statuts, métriques, logs).

Objectifs  
- Fournir un assistant IA local, extensible et sécurisé.
- Permettre un usage fluide via Web, API et Discord.
- Garantir un comportement robuste même en cas de panne backend (fallback Mock).
- Offrir un cadre de gouvernance clair (rôles, audit, permissions).

Cibles  
- Utilisateur final : poser des questions, générer du contenu, automatiser des tâches.
- Développeur : tester rapidement des workflows IA (mode Mock).
- Modérateur/SecOps : surveiller et limiter les abus.
- Administrateur : configurer agents, modèles, sécurité et exploitation.

---

### B. Système d'Authentification et Rôles

Méthodes d'accès  
- Connexion classique email/mot de passe.
- Option OAuth (Google/GitHub) en module optionnel.

Rôles  
- `VISITOR` : consultation du dashboard public de statut.
- `USER` : accès chat, agents autorisés, historique perso.
- `MODERATOR` : modération des contenus et incidents.
- `ADMIN` : configuration globale, modèles, agents, permissions, logs.
- `OBSERVER` (optionnel) : accès à un périmètre défini et de tâches précises (intégrations externes).

---

### C. Gestion des Interactions et Workflow

Workflow principal  
1. Saisie utilisateur (web/API/Discord).
2. Validation requête (format, droits, limites).
3. Routage orchestrateur -> agent cible.
4. Exécution via backend LLM (`mock`, `ollama`, ou `gguf`).
5. Réponse structurée (succès/erreur/partiel/streaming).
6. Journalisation + métriques + diffusion WS.

Contraintes clés  
- Réponses streamees possibles (WebSocket).
- Historique contextuel limité et configurable.
- Timeouts configurables par requête/agent.
- Dégradation gracieuse en cas d'indisponibilité LLM.

---

### D. Fonctionnalités Avancées

- Multi-agent : `coder`, `files`, `email`, `discord`, `cyberdefence`.
- Commandes Discord :
  - `!backend` : changer de backend (mock/ollama/gguf).
  - `!model` : sélectionner un modèle spécifique.
  - `!mode` : basculer entre les modes (discussion, code, modération).
  - `!memory` : gérer la mémoire contextuelle.
  - `!gpu` : afficher l'état des GPU.
- Modes Jarvis : discussion, code, modération.
- Actions d'outils encadrées (filesystem, terminal, git, vscode).
- Dashboard cyber (événements, sévérité, état agents).
- Intégration GGUF pour accélération GPU.

---

### E. Sécurité et Performance

Sécurité  
- Validation stricte des entrées serveur.
- RBAC sur routes sensibles.
- Rate limiting et anti-abus.
- Protection injection prompt (détection/filtrage/alerte).
- Journal d'audit des actions critiques.

Performance  
- Temps de réponse cible :
  - Mock : <1s en moyenne.
  - Ollama local : cible <8s selon modèle.
  - GGUF : accélération GPU pour latence réduite.
- Support de burst de requêtes.
- Healthchecks et supervision continue.

---

### F. Modules Optionnels

- Notifications temps réel enrichies (push).
- Marketplace agents/outils.
- Mémoire long terme (ReMe/SQLite).
- Multi-canaux (Telegram/Slack).
- Planning/réservation d'événements IA (si besoin produit).

---

## 2. Cahier des Charges Client Front-End

### 2.1 Cahier des Charges Fonctionnel

Besoins principaux  
- Interface multilingue FR/EN.
- Chat temps réel + statut backend.
- Sélection agent/modèle simple.
- Espace sécurité lisible (CyberDefence).
- Paramètres utilisateur (préférences, mémoire, notifications).

Routes Front (exemple)  
Public :
- `/`
- `/about`
- `/status`
- `/terms`
- `/privacy`

Auth :
- `/login`
- `/register`
- `/forgot-password`

User :
- `/chat`
- `/agents`
- `/settings`
- `/history`

Moderation :
- `/moderator`
- `/moderator/incidents`

Admin :
- `/admin`
- `/admin/agents`
- `/admin/models`
- `/admin/logs`
- `/admin/analytics`

Cyber :
- `/cyber`
- `/cyber/events`
- `/cyber/metrics`

Contraintes de validation UI  
- États visuels explicites : loading/success/error/disabled.
- Erreurs claires sans fuite sensible.
- Accessibilité clavier et lecteur d'écran.
- Messages d'action confirmés (modif modèle, clear mémoire, etc.).

---

### 2.2 Cahier des Charges Non-Fonctionnel (Front-End)

Stack  
- WebSocket client

Sécurité Front  
- Routes protégées par rôle.
- Tokens sécurisés (cookies HttpOnly recommandés).
- Aucune info sensible en localStorage (hors préférences non critiques).

Qualité  
- Lighthouse cible : Performance 85+, Accessibility 90+.
- UI responsive desktop/tablette/mobile.
- CI front : lint + test + build.

---

## 3. Cahier des Charges Client Back-End

### 3.1 Cahier des Charges Fonctionnel

Stack cible  
- Go et Python.
- DB : PostgreSQL
- Redis optionnel pour cache/rate limit.
- Docker Compose.

API principales

Auth  
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`

Chat / Orchestration  
- `POST /api/v1/chat/:agent`
- `POST /api/v1/tasks`
- `GET /api/v1/tasks/:id`
- `GET /api/v1/agents`
- `GET /api/v1/agents/:id/health`
- `GET /api/v1/health`

LLM / Modèles  
- `GET /api/v1/ollama/models`
- `POST /api/v1/ollama/pull`
- `DELETE /api/v1/ollama/delete`
- `POST /api/v1/backend/switch` (mock/ollama/gguf)

Cyber / Sécurité  
- `GET /api/v1/cyber/status`
- `GET /api/v1/cyber/events`
- `GET /api/v1/cyber/metrics`
- `POST /api/v1/cyber/unblock-ip` (admin)

Admin  
- `GET /api/v1/admin/logs`
- `GET /api/v1/admin/analytics`
- `PUT /api/v1/admin/settings`
- `GET /api/v1/admin/settings`

---

### 3.2 Cahier des Charges Non-Fonctionnel (Back-End)

Contraintes API  
- DTO stricts.
- Pagination standard (`limit`, `offset`).
- Codes HTTP normalisés (`200/201/400/401/403/404/409/429/500`).
- Validation systématique des payloads.

Sécurité  
- RBAC complet.
- Protection SQLi/XSS/CSRF/bruteforce.
- CORS durci par environnement.
- Rotation clés/tokens.

Observabilité  
- Logs structurés : `DEBUG/INFO/WARNING/ERROR`.
- Traces requête (`request_id`, latence, agent, backend).
- Dashboard métriques (RPS, p95, erreurs, disponibilité).

Performance  
- Objectif disponibilité : 99.5% (MVP), 99.9% (cible).
- Healthcheck + readiness + liveness.
- Plan de charge (k6/Locust) : burst et endurance.
- Caching cible et indexation BDD.

Déploiement  
- Environnements : DEV/STAGING/PROD.
- CI/CD : tests + lint + security scan + build image.
- Versionnement sémantique.

---

## 4. Annexes

### A. DTO de Référence (extraits)

UserDTO  
```json
{
	"id": 0,
	"email": "",
	"displayName": "",
	"role": "USER",
	"createdAt": "2026-03-16T12:00:00Z",
	"status": "ACTIVE"
}
```

AgentDTO  
```json
{
	"id": "coder",
	"enabled": true,
	"model": "qwen2.5-coder:1.5b",
	"capabilities": ["chat", "code", "tools"]
}
```

ChatRequestDTO  
```json
{
	"agent": "coder",
	"message": "Explique ce bug",
	"model": "qwen2.5-coder:1.5b",
	"stream": false
}
```

ChatResponseDTO  
```json
{
	"success": true,
	"agent_id": "coder",
	"output": "Réponse...",
	"duration_ms": 840,
	"backend": "mock"
}
```

SecurityEventDTO  
```json
{
	"id": "evt_123",
	"severity": "WARNING",
	"event_type": "PROMPT_INJECTION",
	"description": "Payload suspect détecté",
	"timestamp": "2026-03-16T12:00:00Z"
}
```

---

### B. User Stories Majeures (MVP)

1. En tant qu'utilisateur, je veux discuter avec Jarvis par agent pour obtenir une réponse adaptée.  
2. En tant qu'utilisateur, je veux changer de modèle pour comparer qualité/vitesse.  
3. En tant qu'admin, je veux activer/désactiver un agent sans redéployer.  
4. En tant que modérateur, je veux voir les incidents sécurité et agir rapidement.  
5. En tant que dev, je veux basculer en backend mock pour itérer vite.  
6. En tant qu'utilisateur Discord, je veux appeler Jarvis avec des commandes simples (`!mode`, `!backend`).

---

### C. Critères d'Acceptation Globaux

- Le chat fonctionne via API et WebSocket.
- Le routage agent est déterministe et tracé.
- La bascule Mock/Ollama/GGUF est opérationnelle sans redémarrage complet.
- Les routes sensibles sont protégées par rôle.
- Les incidents sécurité sont visibles et exploitables.
- Les tests unitaires/intégration/E2E critiques sont verts.
- Le front est responsive, accessible, FR/EN.
