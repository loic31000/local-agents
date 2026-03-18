#!/usr/bin/env python3
"""
eval.py — Évaluation du modèle de modération Jarvis
Usage:
    python scripts/eval.py --model /models/jarvis-moderation-ft
    python scripts/eval.py --model /models/jarvis-moderation-ft --text "free airdrop connect wallet"
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np

LABELS = ["clean", "toxic", "scam", "phishing", "impersonation"]


def load_model(model_dir: str):
    from transformers import AutoTokenizer, AutoModelForSequenceClassification
    import torch

    tok = AutoTokenizer.from_pretrained(model_dir)
    model = AutoModelForSequenceClassification.from_pretrained(model_dir)
    model.eval()
    return tok, model


def predict(text: str, tok, model) -> dict:
    """Retourne les probabilités par label pour un texte."""
    import torch

    inputs = tok(text, return_tensors="pt", truncation=True, max_length=128, padding=True)
    with torch.no_grad():
        logits = model(**inputs).logits
    probs = torch.softmax(logits, dim=-1).squeeze().tolist()
    pred_idx = int(np.argmax(probs))
    scores = {LABELS[i]: round(probs[i], 4) for i in range(len(LABELS))}

    # Décision de modération
    if scores["toxic"] > 0.6:
        action = "warn"
    elif scores["scam"] > 0.6 or scores["phishing"] > 0.6:
        action = "delete"
    elif scores["impersonation"] > 0.6:
        action = "ban"
    else:
        action = "allow"

    return {
        "text":   text,
        "label":  LABELS[pred_idx],
        "scores": scores,
        "action": action,
    }


def evaluate_dataset(eval_file: str, tok, model) -> dict:
    """Évalue le modèle sur un fichier eval.jsonl et calcule accuracy/precision/recall/F1."""
    import torch

    rows = []
    with open(eval_file) as f:
        for line in f:
            rows.append(json.loads(line.strip()))

    all_preds, all_labels = [], []
    for row in rows:
        inputs = tok(row["text"], return_tensors="pt", truncation=True, max_length=128, padding=True)
        with torch.no_grad():
            logits = model(**inputs).logits
        pred = int(np.argmax(logits.squeeze().tolist()))
        all_preds.append(pred)
        all_labels.append(int(row["label"]))

    preds  = np.array(all_preds)
    labels = np.array(all_labels)
    num_classes = len(LABELS)

    acc = float((preds == labels).mean())
    per_class = {}
    macro_prec, macro_rec, macro_f1 = [], [], []

    for c in range(num_classes):
        tp = int(((preds == c) & (labels == c)).sum())
        fp = int(((preds == c) & (labels != c)).sum())
        fn = int(((preds != c) & (labels == c)).sum())
        p  = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        r  = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f  = 2 * p * r / (p + r) if (p + r) > 0 else 0.0
        per_class[LABELS[c]] = {"precision": round(p, 4), "recall": round(r, 4), "f1": round(f, 4), "tp": tp, "fp": fp, "fn": fn}
        macro_prec.append(p)
        macro_rec.append(r)
        macro_f1.append(f)

    return {
        "samples":   len(rows),
        "accuracy":  round(acc, 4),
        "precision": round(float(np.mean(macro_prec)), 4),
        "recall":    round(float(np.mean(macro_rec)), 4),
        "f1":        round(float(np.mean(macro_f1)), 4),
        "per_class": per_class,
    }


def main():
    parser = argparse.ArgumentParser(description="Évaluation du modèle de modération Jarvis")
    parser.add_argument("--model", default="/models/jarvis-moderation-ft", help="Chemin vers le modèle fine-tuné")
    parser.add_argument("--text", default=None, help="Texte à classifier en mode one-shot")
    parser.add_argument("--eval-file", default="/data/dataset/eval.jsonl", help="Fichier eval.jsonl pour évaluation complète")
    parser.add_argument("--output", default="/logs/eval_report.json", help="Fichier de sortie du rapport")
    args = parser.parse_args()

    model_path = Path(args.model)
    if not model_path.exists():
        print(f"[ERREUR] Modèle introuvable: {model_path}", file=sys.stderr)
        sys.exit(1)

    print(f"[INFO] Chargement du modèle depuis {model_path}...")
    tok, model = load_model(str(model_path))
    print("[INFO] Modèle chargé.")

    if args.text:
        # Mode one-shot
        result = predict(args.text, tok, model)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return

    # Mode évaluation complète
    eval_path = Path(args.eval_file)
    if not eval_path.exists():
        print(f"[ERREUR] Fichier eval introuvable: {eval_path}", file=sys.stderr)
        sys.exit(1)

    print(f"[INFO] Évaluation sur {eval_path}...")
    report = evaluate_dataset(str(eval_path), tok, model)

    print("\n" + "=" * 60)
    print("  RAPPORT D'ÉVALUATION")
    print("=" * 60)
    print(f"  Samples       : {report['samples']}")
    print(f"  Accuracy      : {report['accuracy']:.4f}")
    print(f"  Precision     : {report['precision']:.4f}")
    print(f"  Recall        : {report['recall']:.4f}")
    print(f"  F1 (macro)    : {report['f1']:.4f}")
    print("\n  Détail par classe:")
    for label, m in report["per_class"].items():
        print(f"    {label:15s}: precision={m['precision']:.3f}  recall={m['recall']:.3f}  f1={m['f1']:.3f}  (tp={m['tp']} fp={m['fp']} fn={m['fn']})")
    print("=" * 60 + "\n")

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"[INFO] Rapport sauvegardé dans {output_path}")


if __name__ == "__main__":
    main()
