# README.md – Jarvis AI Platform (Kubernetes + Fine-Tuning)

## 1. Présentation

**Jarvis AI Platform** est une plateforme IA multi-agent locale, extensible et sécurisée, capable de :

- Dialogue en temps réel via Web, API et Discord.
- Multi-agents spécialisés : `Coder`, `Files`, `Email`, `Discord`, `CyberDefence`, `Vision`.
- Gestion de modèles LLM : `Mock`, `Ollama`, `GGUF`.
- Fine-tuning GPU pour améliorer les modèles LoRA / QLoRA.
- Stockage persistant via PostgreSQL et Redis.
- Observabilité et sécurité renforcée.

Cette version est déployée sur **Kubernetes 2026**, avec isolation par namespaces et pipelines GPU pour le fine-tuning.

---

## 2. Architecture Kubernetes

### 2.1 Namespaces

| **Namespace**      | **Contenu**                                      |
|---------------------|-------------------------------------------------|
| `jarvis-core`       | API, Orchestrator, Agents permanents            |
| `jarvis-llm`        | LLM backend (`Mock`, `Ollama`, `GGUF`)          |
| `jarvis-training`   | Jobs GPU pour fine-tuning                       |
| `jarvis-data`       | Redis, PostgreSQL, ChromaDB                     |

### 2.2 Agents et Workloads

```
Jarvis
│
├── Orchestrator
├── Agents
│   ├── Coder
│   ├── Files
│   ├── Email
│   ├── Discord
│   ├── CyberDefence
│   └── Vision
├── LLM Backends
├── Redis / PostgreSQL
└── Fine-tuning Jobs GPU
```

---

## 3. Redis & PostgreSQL

### Redis

- Mémoire court terme pour conversations et embeddings.
- Pub/Sub pour streaming et événements.
- Cache de modèles et sessions utilisateur.

### PostgreSQL

- Stockage permanent : utilisateurs, rôles, conversations, tâches, audit logs.
- Source de vérité pour dataset training et agents.
- Indexation et partitionnement pour performance.

---

## 4. Fine-Tuning Pipeline

Le fine-tuning est orchestré via **Kubernetes Jobs** et **CronJobs** pour GPU.

### Étape 1 – Collecte des données
- **CronJob** `dataset-collector` interroge PostgreSQL.
- Filtre feedback ≥ 4, supprime PII.
- Stocke dataset brut dans PVC `training-pvc`.

### Étape 2 – Construction du dataset
- **Job** `dataset-builder` transforme JSONL brut en format Alpaca ou ChatML.
- Split train/eval, dédoublonne et nettoie les données.

### Étape 3 – Entraînement GPU
- **Job** `finetune-job` avec Axolotl (LoRA / QLoRA).
- Ressources GPU limitées par pod (`nvidia.com/gpu: 1`).
- Modèle quantisé exporté vers PVC `model-pvc` et chargé par backend LLM.

### Étape 4 – Déploiement modèle
- Post-training : Ollama / GGUF backend recharge le nouveau modèle via PVC.
- Orchestrator route les requêtes vers le modèle fine-tuné.

---

## 5. Vision Agent

- Analyse d’images et vidéos.
- **Fonctionnalités** : Object Detection, Classification, OCR, Embeddings.
- Intégration multi-modale avec LLM.
- **Stockage embeddings** : Redis (court terme) / ChromaDB (long terme).

**Pipeline simplifié** :
```
Upload/Stream → Vision Agent → Embeddings / Texte → Orchestrator → LLM → User
```

---

## 6. Sécurité et Observabilité

### Sécurité

- RBAC complet sur tous les endpoints.
- Validation d’input, rate limiting, protection injection prompts.
- Audit logs pour toutes actions critiques.

### Observabilité

- **Metrics** : RPS, latence, erreurs, disponibilité.
- **Tracing** avec `request_id` pour débogage et monitoring.

---

## 7. Déploiement & Prérequis

- **Kubernetes** 1.27+ avec GPU nodes (`nvidia.com/gpu`).
- PVC pour training, models, vision-models.
- Secrets Kubernetes pour Postgres / Redis / API keys.
- Helm ou `kubectl apply` pour tous les manifests.

---

## 8. Bonnes pratiques

- **Dataset** : qualité > quantité pour fine-tuning.
- **LoRA / QLoRA** : privilégier ces méthodes plutôt que full fine-tuning sur 7B+.
- **Redis** : TTL sur clés pour éviter saturation.
- **PostgreSQL** : backup régulier et snapshot PVC.
- **Scalabilité** : séparer Vision Agent et LLM backend pour GPU.

---

## 9. Extensions futures

- RLHF local (feedback utilisateur).
- Multi-modal agents supplémentaires.
- Auto-training pipeline (collect → build → train → deploy).
- Multi-canal (Telegram, Slack, etc.).
- Marketplace agents/outils.

---

## 10. Diagramme Cluster & Pipeline

```
                ┌─────────────┐
                │  Users/CLI  │
                └─────┬───────┘
                      │ WebSocket / REST
             ┌────────┴─────────┐
             │   Orchestrator    │
             └────────┬─────────┘
         ┌─────────────┴─────────────┐
         │                             │
   ┌─────┴─────┐                 ┌─────┴─────┐
   │ LLM Backends │               │ Vision Agent│
   │ (Ollama/GGUF)│               │ GPU Nodes   │
   └─────┬─────┘                 └─────┬─────┘
         │                               │
         │                               │
    ┌────┴────┐                     ┌────┴─────┐
    │ PVC Models │                   │ Redis / Chroma │
    └───────────┘                   └───────────────┘

Training Pipeline (K8s Jobs):
1. dataset-collector → 2. dataset-builder → 3. finetune-job → 4. deploy model
```

💡 **Résumé** : Ce cluster Kubernetes permet à Jarvis de fonctionner multi-agent, multi-modal, GPU-ready, et de fine-tuner ses modèles automatiquement tout en restant sécurisé et observé.