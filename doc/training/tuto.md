# Tutoriel : Debug & Extraction des logs d'un Job ML Kubernetes

Ce guide explique comment diagnostiquer l'absence de logs visibles avec `kubectl logs` pour un job de fine-tuning ML, et comment extraire les logs et métriques même après la fin du pod.

---

## 1. Symptôme
- `kubectl logs <pod>` retourne vide alors que le job est bien en statut Succeeded ou Running.

## 2. Diagnostic rapide
- Le script Python ou la commande du container redirige toute la sortie vers un fichier (ex: `/logs/finetune.log`) au lieu de stdout.
- Conséquence : `kubectl logs` ne montre rien, mais le fichier existe sur le volume persistant.

## 3. Vérification de la chaîne d'exécution

### a. Vérifier l'état du pod
```bash
kubectl get pods -n <namespace> -o wide
kubectl describe pod <pod-name> -n <namespace>
```

### b. Vérifier la commande d'entrée
```bash
kubectl get pod <pod-name> -n <namespace> -o jsonpath='{.spec.containers[0].command}'
kubectl get pod <pod-name> -n <namespace> -o jsonpath='{.spec.containers[0].args}'
```

### c. Vérifier le volume de logs
```bash
kubectl describe pod <pod-name> -n <namespace> | grep -i volume
```

---

## 3bis. Comprendre et modifier le training

### a. Ce que fait le job de training
- **Génère un dataset synthétique** (questions/réponses et commandes de modération) directement dans le script Python embarqué dans le manifest.
- **Entraîne un modèle LLM** (par défaut : `sshleifer/tiny-gpt2` pour la démo) avec HuggingFace Transformers et Datasets.
- **Sauvegarde le modèle fine-tuné** dans `/models/jarvis-smollm2-ft` et les logs/rapports dans `/logs` (volumes persistants).
- **Pipeline intégré** : tout est lancé dans le container via un script Python inline (voir manifest-training.yaml, section Job).

### b. Modifier le dataset
- Le dataset est généré dans le script Python (voir la variable `base` pour les Q/R et `mods` pour les commandes de modération).
- Pour ajouter des cas, modifie ou enrichis ces listes dans le manifest YAML (section `command:` du Job).
- Pour utiliser un dataset réel, monte-le dans `/data/dataset` et adapte le script pour le charger.

### c. Changer le modèle ou les hyperparamètres
- **Modèle** : change la valeur de `model_id` dans le script Python (ex : "sshleifer/tiny-gpt2" → "HuggingFaceTB/SmolLM2-360M-Instruct" ou autre modèle HF compatible).
- **Hyperparamètres** : modifie les arguments de `TrainingArguments` (batch size, learning rate, max_steps, logging_steps, etc.)
- **Exemple** :
  ```python
  args = TrainingArguments(
      output_dir=out_dir,
      per_device_train_batch_size=2,  # ← batch size
      gradient_accumulation_steps=2,
      max_steps=120,                  # ← nombre d'itérations
      learning_rate=2e-4,             # ← learning rate
      logging_steps=5,
      save_steps=40,
      save_total_limit=2,
      report_to=[],
      fp16=False,
      bf16=False
  )
  ```

### d. Modifier le script d'entraînement
- Le script Python est inclus inline dans le manifest YAML (section `command:` du container du Job).
- Pour des workflows plus complexes, tu peux :
  - Monter un script `.py` externe dans l'image ou via un volume
  - Utiliser un Dockerfile custom pour builder l'image avec ton code

### e. Relancer le training après modification
- Applique le manifest modifié :
  ```bash
  kubectl delete job finetune-job -n jarvis-training
  kubectl apply -f docs/tech/manifest-training.yaml
  kubectl wait --for=condition=complete job/finetune-job -n jarvis-training --timeout=600s
  ```
- Suis les logs comme décrit dans ce tuto.

---

## 4. Extraction des logs après la fin du pod

### a. Créer un pod de debug qui monte le même volume
```bash
kubectl run debug-logs --rm -it --image=busybox -n <namespace> --overrides='{
  "spec": {
    "containers": [{
      "name": "debug",
      "image": "busybox",
      "command": ["sh", "-c", "sleep 3600"],
      "volumeMounts": [{"name": "logs", "mountPath": "/logs"}]
    }],
    "volumes": [{"name": "logs", "persistentVolumeClaim": {"claimName": "logs-pvc"}}]
  }
}'
```

### b. Extraire les logs
```bash
kubectl exec debug-logs -n <namespace> -- cat /logs/finetune.log > finetune.log
kubectl exec debug-logs -n <namespace> -- cat /logs/training_report.json > training_report.json
```

---

## 5. Bonnes pratiques pour les logs ML sur Kubernetes

- **Toujours écrire les logs à la fois sur stdout ET dans un fichier** :
  ```bash
  python script.py 2>&1 | tee /logs/training.log
  ```
- **Utiliser l'option unbuffered** pour un affichage temps réel :
  ```bash
  python -u script.py
  # ou
  export PYTHONUNBUFFERED=1
  ```
- **Pour suivre les logs en live** :
  ```bash
  kubectl logs job/<job-name> -n <namespace> -f --tail=100
  ```
- **Pour accéder aux logs après la fin du pod** :
  - Monter le volume dans un pod de debug (voir ci-dessus)

---

## 6. Nettoyage
```bash
kubectl delete pod debug-logs -n <namespace>
```

---

## 7. Référence
- [doc/training/logs.txt](logs.txt) : Rapport complet d'une session réelle
- [doc/training/log.txt](log.txt) : Logs bruts

---

---

## 8. Stratégie modèle — Pourquoi DistilBERT ?

| Critère              | DistilBERT (choix actuel) | SmolLM2-360M / GPT2    |
|----------------------|--------------------------|------------------------|
| Paramètres           | 66M                      | 360M / 117M            |
| RAM sous CPU         | ~700MB                   | ~2-4GB                 |
| Tâche cible          | Classification native [CLS] | Génération de texte |
| F1 attendu (1000ex)  | > 0.85                   | < 0.5 (mauvais fit)    |
| Vitesse inférence    | ~10ms/req                | ~200ms/req             |

**Conclusion :** pour la modération Discord (classification multi-classe), DistilBERT est l'architecture correcte. SmolLM2/GPT2 sont des modèles génératifs qui ne produisent pas de scores de classification fiables.

---

## 9. Évaluation du modèle

```bash
# Évaluation complète avec accuracy/precision/recall/F1 par classe
python scripts/eval.py --model /models/jarvis-moderation-ft --eval-file /data/dataset/eval.jsonl

# Classification one-shot
python scripts/eval.py --model /models/jarvis-moderation-ft --text "free airdrop connect wallet"
```

Sortie attendue :
```json
{
  "text": "free airdrop connect wallet",
  "label": "scam",
  "scores": {"clean": 0.01, "toxic": 0.02, "scam": 0.95, "phishing": 0.01, "impersonation": 0.01},
  "action": "delete"
}
```

---

## 10. API de modération (FastAPI)

```bash
# Démarrer l'API
uvicorn agents.moderate.api:app --host 0.0.0.0 --port 8080

# Tester
curl "http://localhost:8080/moderate?text=free+airdrop+connect+wallet"
curl -X POST http://localhost:8080/moderate -H "Content-Type: application/json" -d '{"text": "kys loser"}'

# Santé
curl http://localhost:8080/health
```

---

## 11. Dataset — Structure et augmentation

**5 catégories × 20 exemples × 10 variantes = 1000 exemples**

| Catégorie       | Label | Exemples                                              |
|-----------------|-------|-------------------------------------------------------|
| clean           | 0     | "gg everyone great game", "hey how are you"           |
| toxic           | 1     | "kys loser", "ur trash get rekt"                      |
| scam            | 2     | "free nft airdrop connect wallet", "send 0.1 eth"     |
| phishing        | 3     | "verify account discord-support.net", "click here"    |
| impersonation   | 4     | "i am real admin dm me", "discord staff here"         |

**Augmentations automatiques par exemple :**
1. Original
2. Leet speak complet (`fr33 @irdrop`)
3. Leet speak partiel
4. Tout en majuscules
5. Caractère bruit (`.`, `-`, `*`)
6. Typo (suppression d'un caractère)
7. Préfixe Discord contextuel (`urgent: `, `omg `)
8. Suffixe (`!!`, `...`, `??`)
9. Double espace
10. Inversion aléatoire d'un mot

---

**Auteur :** Jarvis et sa fine équipe d'IA
**Date :** 18 mars 2026
