# TRAINING.md

## Jarvis AI – Fine-Tuning Pipeline

Version : 1.0
Date : Mars 2026

---

# 1. Introduction

Le système **Jarvis Training** permet de fine-tuner des modèles LLM utilisés par les agents Jarvis.

L'objectif est de :

* améliorer les performances des agents
* adapter les modèles aux interactions réelles des utilisateurs
* créer des modèles spécialisés (code, sécurité, fichiers, etc.)
* maintenir une pipeline reproductible et automatisée

Le training est conçu pour fonctionner avec **Kubernetes Jobs GPU**, afin d'éviter d'allouer des ressources GPU en permanence.

---

# 2. Architecture générale

Le pipeline de training suit une architecture **MLOps simple et reproductible**.

```id="a1v1xk"
Jarvis Logs
     │
     ▼
Dataset Collector
     │
     ▼
Dataset Builder
     │
     ▼
Fine-Tuning Job
     │
     ▼
Model Export (GGUF)
     │
     ▼
Deployment vers Jarvis LLM
```

Chaque étape est exécutée par un **Job Kubernetes** indépendant.

---

# 3. Namespace Kubernetes

Le training utilise un namespace dédié.

```id="p9n6gn"
jarvis-training
```

Cela permet :

* isolation des ressources GPU
* séparation avec les services runtime
* gestion indépendante des volumes et quotas

---

# 4. Stockage

Trois types de stockage sont nécessaires :

```id="5s4g2b"
raw data
dataset
trained models
```

Volumes recommandés :

| Volume            | Usage                     |
| ----------------- | ------------------------- |
| training-pvc      | données brutes et dataset |
| model-pvc         | modèles entraînés         |
| cache (optionnel) | cache HuggingFace         |

---

# 5. Étape 1 — Dataset Collector

Le collector extrait les interactions depuis la base de données Jarvis.

Sources possibles :

* conversations utilisateur
* logs agents
* feedback utilisateur

Le collector :

1. filtre les interactions utiles
2. supprime les données sensibles
3. génère un fichier JSONL brut

Format exemple :

```json
{
 "instruction": "Explique cette erreur Python",
 "input": "TypeError: NoneType is not iterable",
 "output": "Cette erreur signifie..."
}
```

Critères de sélection recommandés :

* score utilisateur ≥ 4
* longueur minimale de réponse
* suppression des messages système

Le collector s'exécute via un **CronJob Kubernetes**.

---

# 6. Étape 2 — Dataset Builder

Le dataset builder transforme les données brutes en dataset utilisable pour l'entraînement.

Actions principales :

* nettoyage
* déduplication
* formatage
* split train/eval

Formats supportés :

| Format | Modèles        |
| ------ | -------------- |
| alpaca | Llama, Mistral |
| chatml | Qwen           |
| openai | modèles chat   |

Exemple ChatML :

```json
{
 "messages": [
  {"role": "user", "content": "Explique Docker"},
  {"role": "assistant", "content": "Docker est une plateforme..."}
 ]
}
```

---

# 7. Étape 3 — Fine-Tuning

Le fine-tuning est exécuté via un **Job Kubernetes GPU**.

Le framework recommandé est :

**Axolotl**

Avantages :

* configuration YAML
* support Llama / Mistral / Qwen
* compatible LoRA / QLoRA
* facile à intégrer dans Kubernetes

---

# 8. Méthode d'entraînement

Jarvis utilise **LoRA / QLoRA** pour réduire les besoins GPU.

Pourquoi :

| Méthode          | VRAM requise |
| ---------------- | ------------ |
| Full fine-tuning | ~80GB        |
| LoRA             | ~16GB        |
| QLoRA            | ~12GB        |

La plupart des installations locales utilisent **QLoRA**.

---

# 9. Configuration Axolotl

Exemple simplifié :

```yaml
base_model: Qwen/Qwen2.5-Coder-7B

adapter: lora

datasets:
  - path: /data/dataset/train.jsonl
    type: chatml

micro_batch_size: 2
gradient_accumulation_steps: 4

num_epochs: 3
learning_rate: 2e-4

output_dir: /models/jarvis-qwen2.5
```

---

# 10. Export du modèle

Après l'entraînement :

1. conversion vers GGUF
2. quantization
3. import dans Ollama

Exemple :

```bash
python convert_to_gguf.py
```

Puis :

```bash
ollama create jarvis-coder -f Modelfile
```

---

# 11. Déploiement du modèle

Une fois le modèle exporté :

1. copier dans le volume du service LLM
2. redémarrer le service Ollama

Exemple :

```bash
kubectl rollout restart deployment ollama -n jarvis-llm
```

Le nouveau modèle devient disponible immédiatement.

---

# 12. Évaluation

Avant chaque déploiement, il est recommandé d'évaluer le modèle.

Types d'évaluation :

| Test        | Description                     |
| ----------- | ------------------------------- |
| benchmark   | comparaison avec modèle de base |
| QA dataset  | questions/réponses connues      |
| agent tasks | tests sur agents Jarvis         |

Objectif :

* éviter la dégradation du modèle
* vérifier la cohérence des réponses

---

# 13. Bonnes pratiques

### dataset

* privilégier la qualité à la quantité
* 500 exemples propres minimum
* éviter les données contradictoires

### training

* commencer par LoRA
* utiliser un dataset équilibré
* tester sur petit nombre d'époques

### sécurité

* supprimer PII
* filtrer prompts malveillants
* auditer les datasets

---

# 14. Évolution future

Plusieurs améliorations sont prévues :

### RLHF local

Amélioration via feedback utilisateur.

### Dataset automatique

Extraction intelligente des interactions utiles.

### Multi-modèle

Modèles spécialisés par agent :

```text
coder model
security model
assistant model
```

### Auto-training

Pipeline automatique :

```text
collect → build → train → deploy
```

---

# 15. Conclusion

Le système **Jarvis Training** permet d'entraîner et d'améliorer les modèles utilisés par les agents.

La pipeline :

* isole le training du runtime
* optimise l'utilisation GPU
* permet un entraînement reproductible

Jarvis devient ainsi une **plateforme IA évolutive capable d'apprendre de ses interactions**.

---
