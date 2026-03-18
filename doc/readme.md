# Tutoriel : Comprendre et interpréter les logs d'entraînement

## 1. Où trouver les logs ?

- **doc/training/logs.txt** : déroulement complet de l'entraînement (messages, warnings, progression, erreurs éventuelles).
- **doc/training/step_metrics.jsonl** : métriques détaillées à chaque étape (loss, learning rate, etc.).
- **doc/training/stdout.log** (si présent) : sortie brute du script.

## 2. Structure typique d'un log

- **Initialisation**
  - Chargement des datasets (train/eval)
  - Téléchargement du modèle (ex : distilbert-base-uncased)
  - Affichage des classes cibles
- **Warnings**
  - Problèmes de version, absence de token HuggingFace, options dépréciées (souvent non bloquant)
- **Chargement du modèle**
  - Certains poids peuvent être marqués `UNEXPECTED` ou `MISSING` (normal en fine-tuning)
- **Déroulement de l'entraînement**
  - Affichage de la progression (steps, epochs)
  - Logs réguliers avec :
    - `loss` : erreur du modèle (doit baisser)
    - `grad_norm` : stabilité de l'apprentissage
    - `learning_rate` : taux d'apprentissage
    - `epoch` : progression dans les données

Exemple :
```
{"event": "log", "step": 10, "loss": 6.538, "grad_norm": 4.001, "learning_rate": 2.813e-06, "epoch": 0.047}
```

## 3. Comment interpréter ?

- **Loss** : plus elle baisse, mieux le modèle apprend. Si elle stagne, revoir les données ou les paramètres.
- **Warnings** : la plupart sont informatifs. Seuls les "Traceback" ou "Error" sont bloquants.
- **Métriques** : pour suivre la qualité de l'apprentissage, extraire la courbe de loss depuis `step_metrics.jsonl`.

## 4. Conseils pratiques

- Authentifie-toi sur HuggingFace pour accélérer les téléchargements (`HF_TOKEN`).
- Remplace `warmup_ratio` par `warmup_steps` si tu vois un warning.
- Vérifie la cohérence des labels dans tes datasets.
- Utilise les logs pour détecter rapidement un problème de données ou de configuration.

---

Pour toute analyse avancée (graphique, détection d'anomalies), tu peux demander une extraction ou un script dédié.
