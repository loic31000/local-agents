#!/usr/bin/env python3
"""
api.py — API FastAPI de modération Jarvis
Usage:
    uvicorn agents.moderate.api:app --host 0.0.0.0 --port 8080

Endpoint:
    GET  /moderate?text=<message>
    POST /moderate  {"text": "<message>"}

Réponse:
    {
        "text":   "free airdrop connect wallet",
        "label":  "scam",
        "scores": {"clean": 0.01, "toxic": 0.02, "scam": 0.95, "phishing": 0.01, "impersonation": 0.01},
        "action": "delete"
    }
"""
import json
import os
from functools import lru_cache
from pathlib import Path

import numpy as np
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel

MODEL_DIR = os.getenv("MODEL_DIR", "/models/jarvis-moderation-ft")
LABELS    = ["clean", "toxic", "scam", "phishing", "impersonation"]
MAX_LEN   = 128

app = FastAPI(title="Jarvis Moderation API", version="1.0.0")


class ModerateRequest(BaseModel):
    text: str


class ModerateResponse(BaseModel):
    text:   str
    label:  str
    scores: dict
    action: str


@lru_cache(maxsize=1)
def load_model():
    """Chargement du modèle en mémoire (singleton)."""
    from transformers import AutoTokenizer, AutoModelForSequenceClassification

    path = Path(MODEL_DIR)
    if not path.exists():
        raise RuntimeError(f"Modèle introuvable: {MODEL_DIR}")

    tok   = AutoTokenizer.from_pretrained(str(path))
    model = AutoModelForSequenceClassification.from_pretrained(str(path))
    model.eval()
    return tok, model


def _classify(text: str) -> ModerateResponse:
    """Classify un texte et retourne label + scores + action."""
    import torch

    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="Le texte ne peut pas être vide.")

    tok, model = load_model()
    inputs = tok(text, return_tensors="pt", truncation=True, max_length=MAX_LEN, padding=True)
    with torch.no_grad():
        logits = model(**inputs).logits
    probs    = torch.softmax(logits, dim=-1).squeeze().tolist()
    pred_idx = int(np.argmax(probs))
    scores   = {LABELS[i]: round(probs[i], 4) for i in range(len(LABELS))}

    # Règles de décision de modération
    if scores["toxic"] >= 0.6:
        action = "warn"          # Avertir l'utilisateur
    elif scores["scam"] >= 0.6 or scores["phishing"] >= 0.6:
        action = "delete"        # Supprimer le message
    elif scores["impersonation"] >= 0.6:
        action = "ban"           # Bannir l'utilisateur
    else:
        action = "allow"         # Laisser passer

    return ModerateResponse(
        text=text,
        label=LABELS[pred_idx],
        scores=scores,
        action=action,
    )


@app.on_event("startup")
async def startup():
    """Pré-chargement du modèle au démarrage."""
    try:
        load_model()
        print(f"[INFO] Modèle chargé depuis {MODEL_DIR}", flush=True)
    except Exception as e:
        print(f"[WARN] Modèle non disponible au démarrage: {e}", flush=True)


@app.get("/moderate", response_model=ModerateResponse)
async def moderate_get(text: str = Query(..., description="Texte à modérer")):
    """Modère un texte passé en query string."""
    return _classify(text)


@app.post("/moderate", response_model=ModerateResponse)
async def moderate_post(req: ModerateRequest):
    """Modère un texte passé dans le body JSON."""
    return _classify(req.text)


@app.get("/health")
async def health():
    """Vérification de santé de l'API."""
    try:
        load_model()
        return {"status": "ok", "model": MODEL_DIR}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


@app.get("/labels")
async def labels():
    """Retourne la liste des labels supportés."""
    return {"labels": LABELS}
