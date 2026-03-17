# JARVIS.md

## Jarvis AI Platform – Global Overview

Version : 1.0
Date : Mars 2026

---

# 1. Présentation générale

**Jarvis** est une **plateforme IA multi-agent locale**, extensible et sécurisée, capable de :

* Dialogue temps réel (Web, API, Discord)
* Multi-agents spécialisés (Coder, Files, Email, Discord, CyberDefence, Vision)
* Gestion de modèles LLM (Mock, Ollama, GGUF)
* Observabilité (logs, métriques, tracing)
* Sécurité renforcée (RBAC, prompt injection, rate limiting)
* Fine-tuning et apprentissage continu (LoRA / QLoRA)

---

# 2. Architecture des Agents

```text
Jarvis
│
├── Orchestrator
│   ├── Request Validator
│   ├── Workflow Manager
│   └── Agent Router
│
├── Agents
│   ├── Coder Agent
│   ├── Files Agent
│   ├── Email Agent
│   ├── Discord Agent
│   ├── CyberDefence Agent
│   └── Vision Agent
│       ├── Image Classification
│       ├── Object Detection
│       ├── OCR
│       └── Embedding Generator
│
├── Memory
│   ├── Contextual (Redis)
│   ├── Persistent (PostgreSQL / Chroma)
│   └── Shared Memory
│
├── LLM Backends
│   ├── Mock Backend
│   ├── Ollama Backend
│   └── GGUF Backend
│
├── Security Layer
│   ├── RBAC
│   ├── Input Validation
│   ├── Rate Limiting
│   └── Prompt Injection Protection
│
├── Observability
│   ├── Logging
│   ├── Metrics
│   └── Tracing
│
└── Interfaces
    ├── Web
    ├── API
    └── Discord Bot
```

---

# 3. Architecture Data

## PostgreSQL – Source de vérité

Stocke toutes les données critiques et persistantes :

* Utilisateurs, rôles, sessions
* Conversations, messages
* Agents et capabilities
* Tâches et résultats
* Événements de sécurité, audit logs
* Feedback et candidates pour training

### Exemples de tables :

```text
users, sessions, agents, agent_capabilities
conversations, messages
tasks, task_results
security_events, blocked_ips, audit_logs
training_feedback, dataset_candidates
```

## Redis – Mémoire et cache rapide

Utilisé pour :

* Cache (agents, modèles)
* Sessions utilisateur
* Rate limiting
* Pub/Sub pour streaming et événements
* Mémoire court terme (conversation contextuelle)

---

# 4. Pipeline Training

1. **Collecte des données** depuis PostgreSQL → JSONL brut
2. **Construction du dataset** : nettoyage, formatage, split train/eval
3. **Fine-tuning** GPU via Kubernetes Job (LoRA / QLoRA)
4. **Export modèle** : conversion GGUF + quantization
5. **Déploiement** : mise à jour Ollama backend
6. **Évaluation** : benchmark, QA, tests agents

---

# 5. Kubernetes Training Architecture

Namespace : `jarvis-training`

```text
jarvis-training
│
├── CronJob collector → collecte données PostgreSQL
├── Job dataset-builder → formatage / split
└── Job trainer → fine-tuning GPU (Axolotl)
```

Volumes :

* `training-pvc` → données brutes et dataset
* `model-pvc` → modèles entraînés
* `cache` → optionnel HuggingFace

---

# 6. Vision et Multi-modalité

**Vision Agent** ajouté pour analyser images et vidéos :

* Image Classification (ViT, SAM)
* Object Detection (DETR, SAM)
* OCR (TrOCR, PaddleOCR)
* Embedding Generator pour vector DB

### Pipeline Vision

```text
Upload / capture → Vision Agent → Embeddings / texte → Orchestrator → LLM → User
```

* Stockage court terme : Redis
* Stockage long terme : Chroma / Vector DB
* Fine-tuning multi-modal : Qwen-VL ou LLaVA avec dataset image+texte

---

# 7. Sécurité

* Validation stricte des entrées
* RBAC sur toutes routes et actions sensibles
* Rate limiting par utilisateur/IP
* Audit logs et alertes cyber
* Protection prompt injection

---

# 8. Observabilité et Monitoring

* Logs structurés (DEBUG, INFO, WARN, ERROR)
* Tracing : `request_id`, agent, backend, durée
* Metrics : RPS, p95, erreurs, disponibilité
* Dashboard CyberDefence : incidents, sévérité, état agents

---

# 9. Best Practices

* Qualité dataset > quantité
* LoRA / QLoRA pour fine-tuning local
* TTL sur toutes les clés Redis
* Backup régulier PostgreSQL
* Indexation et partition sur tables volumineuses
* Séparer Vision Agent et LLM backend pour scalabilité GPU

---

# 10. Évolution future

* RLHF local (feedback utilisateur)
* Multi-modèle spécialisé par agent
* Auto-training pipeline : collect → build → train → deploy
* Vector DB pour recherche sémantique multi-modal
* Extension multi-canal (Telegram, Slack, etc.)

---

# 11. Conclusion

Jarvis devient une **plateforme IA multi-agent évolutive** capable de :

* comprendre texte, code et images
* gérer la mémoire court et long terme
* fine-tuner ses modèles automatiquement
* rester sécurisé et observé en production

Cette structure est **extensible, robuste, et adaptée aux workloads GPU et multi-modalité 2026**.
