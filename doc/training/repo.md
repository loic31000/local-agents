# 🚀 Jarvis ML Pipeline (Kubernetes)

Pipeline complet de fine-tuning, évaluation et déploiement d’un modèle de langage léger pour modération (Discord / NLP), optimisé pour environnement local (**Minikube – 4GB RAM**).

---

## 🧠 Architecture

```
Dataset
   ↓
Training Job (K8s)
   ↓
Evaluation Job (K8s)
   ↓
Model Registry (PVC)
   ↓
Inference API (Deployment)
   ↓
Discord Bot / Client
```

---

## ⚙️ Stack technique

* Kubernetes (Minikube)
* Python (Transformers / HuggingFace)
* FastAPI (inference API)
* PersistentVolumeClaim (modèles + logs)
* Docker

---

## 📁 Structure du projet

```
.
├── k8s/
│   ├── training-job.yaml
│   ├── eval-job.yaml
│   ├── inference-deployment.yaml
│   ├── service.yaml
│
├── app/
│   ├── train.py
│   ├── eval.py
│   ├── api.py
│
├── data/
│   └── dataset.json
│
├── logs/              # via PVC
├── models/            # via PVC
└── README.md
```

---

## 🚀 Setup Minikube

```bash
minikube start --memory=4096 --cpus=2
minikube addons enable metrics-server
```

---

## 📦 Déploiement

### 1. Créer les volumes persistants

```bash
kubectl apply -f k8s/pvc.yaml
```

---

### 2. Lancer le training

```bash
kubectl apply -f k8s/training-job.yaml
kubectl logs -f job/finetune-job -n jarvis-training
```

---

### 3. Lancer l’évaluation

```bash
kubectl apply -f k8s/eval-job.yaml
kubectl logs -f job/eval-job -n jarvis-training
```

---

### 4. Déployer l’API

```bash
kubectl apply -f k8s/inference-deployment.yaml
kubectl apply -f k8s/service.yaml
```

---

### 5. Accéder à l’API

```bash
minikube service model-service -n jarvis-training
```

---

## 🧪 Exemple d’appel API

```
GET /generate?text=bonjour
```

Réponse :

```json
{
  "output": "bonjour comment ça va..."
}
```

---

## 🧠 Modèle

* Modèle léger (ex: GPT2 tiny / SmolLM2)
* Fine-tuning rapide (CPU-friendly)
* Optimisé pour faible RAM

---

## 📊 Logging (important)

### ✅ Bonnes pratiques

* Logs visibles via Kubernetes
* Logs persistés sur disque

```bash
python -u train.py 2>&1 | tee /logs/train.log
```

---

### 🔍 Voir les logs

```bash
kubectl logs -f job/finetune-job
```

---

### 📁 Accéder aux logs fichiers

```bash
kubectl run debug --image=busybox -it --rm \
  -- /bin/sh

cat /logs/train.log
```

---

## ⚠️ Limitations

* Environnement limité (4GB RAM)
* Modèles petits uniquement
* Pas de GPU

---

## ⚡ Optimisations

* Batch size = 1 ou 2
* Sequence length ≤ 512
* Gradient accumulation
* Streaming dataset

---

## 🔄 Workflow recommandé

1. Lancer training
2. Vérifier logs
3. Lancer eval
4. Déployer modèle
5. Connecter client (Discord bot)

---

## 🧹 Cleanup

```bash
kubectl delete job finetune-job
kubectl delete job eval-job
kubectl delete deployment model-api
```

---

## 🎯 Roadmap

* [ ] Ajout LoRA (fine-tuning optimisé)
* [ ] Quantization (GGUF)
* [ ] Monitoring (Prometheus / Grafana)
* [ ] Auto pipeline (Argo Workflows)
* [ ] Intégration Discord bot

# 🤖 Jarvis Moderation Pipeline (README2)

Pipeline complet de modération intelligente pour Discord basé sur IA :

* compréhension sémantique (embeddings)
* classification multi-label (toxicité, scam, phishing…)
* déploiement Kubernetes
* intégration bot Discord

---

# 🧠 🎯 Objectif

Créer un système capable de :

* détecter insultes (même déguisées)
* détecter scams crypto / phishing
* comprendre le contexte (pas juste des mots)
* agir automatiquement (warn / delete / alert)

---

# 🏗️ Architecture globale

```text
Discord Message
   ↓
[1] Normalization
   ↓
[2] Embedding Model
   ↓
[3] Classifier (multi-label)
   ↓
[4] Scoring & Rules Engine
   ↓
[5] Action (delete / warn / alert)
   ↓
[6] Logging & Monitoring
```

---

# 📦 Composants

## 1. Dataset

Fichier : `dataset.jsonl`

Format :

```json
{"text": "tg sale noob", "labels": ["toxic"]}
{"text": "free airdrop connect wallet", "labels": ["scam","phishing"]}
```

👉 multi-label obligatoire

---

## 2. Normalization Layer

But : détecter les contournements

Exemples :

* `id10t` → `idiot`
* `fr33` → `free`

```python
def normalize(text):
    text = text.lower()
    text = text.replace("0", "o").replace("1", "i")
    text = text.replace("*", "")
    return text
```

---

## 3. Embedding Model

Modèle recommandé :

* all-MiniLM-L6-v2

Rôle :

* transformer texte → vecteurs
* capturer le sens

---

## 4. Classifier (multi-label)

Modèle :

* DistilBERT fine-tuné

Sortie :

```json
{
  "toxic": 0.91,
  "scam": 0.02,
  "phishing": 0.01
}
```

---

## 5. Rules Engine

Décision automatique :

```python
if toxic > 0.8:
    action = "delete + warn"

elif scam > 0.7:
    action = "alert_mods"

else:
    action = "allow"
```

---

# ⚙️ Pipeline Kubernetes

## 🔁 Workflow

```text
Training Job
   ↓
Evaluation Job
   ↓
Model Storage (PVC)
   ↓
Inference API (Deployment)
   ↓
Discord Bot
```

---

## 📁 Structure

```text
k8s/
  training-job.yaml
  eval-job.yaml
  inference-deployment.yaml
  service.yaml

app/
  train.py
  eval.py
  api.py
  bot.py
```

---

## 🚀 Déploiement

### 1. Training

```bash
kubectl apply -f k8s/training-job.yaml
kubectl logs -f job/finetune-job
```

---

### 2. Evaluation

```bash
kubectl apply -f k8s/eval-job.yaml
kubectl logs -f job/eval-job
```

---

### 3. API

```bash
kubectl apply -f k8s/inference-deployment.yaml
kubectl apply -f k8s/service.yaml
```

---

# 🌐 Inference API

## Endpoint

```http
GET /moderate?text=...
```

## Response

```json
{
  "toxic": 0.85,
  "scam": 0.10,
  "action": "warn"
}
```

---

# 🤖 Discord Bot

## Flow

```text
Message Discord
   ↓
API /moderate
   ↓
Décision
   ↓
Action (delete / warn / log)
```

---

## Exemple (pseudo-code)

```python
if result["toxic"] > 0.8:
    delete_message()
    send_warning()

elif result["scam"] > 0.7:
    alert_mods()
```

---

# 👁️ Observabilité

## Logs temps réel

```bash
kubectl logs -f job/finetune-job
```

---

## Logging dual

```bash
python -u train.py 2>&1 | tee /logs/train.log
```

---

## TensorBoard (optionnel)

```bash
tensorboard --logdir=/logs/tensorboard
```

---

# 📊 Amélioration du modèle

## Dataset

* ajouter langage Discord
* ajouter fautes / leet speak
* ajouter scams crypto

---

## Techniques

* data augmentation
* multi-label classification
* hard negatives (phrases ambiguës)

---

# ⚠️ Limitations (Minikube 4GB)

* petits modèles uniquement
* pas de GPU
* batch size faible

---

# 🚀 Roadmap

* [ ] LoRA fine-tuning
* [ ] Quantization (GGUF)
* [ ] Memory utilisateur (historique)
* [ ] Détection multi-message (contexte)
* [ ] Dashboard monitoring

---

# 🧠 Vision JARVIS

Objectif long terme :

* compréhension du contexte utilisateur
* détection de manipulation sociale
* modération proactive
* système auto-améliorant

---

# 🏁 Conclusion

Ce pipeline permet de construire un bot de modération :

* intelligent (compréhension)
* robuste (anti-contournement)
* scalable (Kubernetes)
* évolutif (dataset-driven)

---

