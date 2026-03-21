#!/usr/bin/env python3
"""Train a moderation classifier (DistilBERT, CPU/GPU)."""

from __future__ import annotations

import argparse
import inspect
import json
import os
import random
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

LABELS = ["clean", "toxic", "scam", "phishing", "impersonation"]

CLEAN_EX = [
    "hey guys how is everyone doing today",
    "anyone want to queue for valorant tonight",
    "just finished my homework finally",
    "check out my new setup what do you think",
    "gg everyone that was a great game",
    "thanks for the help really appreciate it",
    "what time is the event starting",
    "anyone else watching the stream right now",
    "good morning everyone hope you have a great day",
    "lol that was so funny i cant stop laughing",
    "can someone help me with this question please",
    "just got back from vacation it was amazing",
    "happy birthday have a wonderful day",
    "anyone playing minecraft tonight let me know",
    "this movie is actually really good not gonna lie",
    "who wants to do a raid together tonight",
    "congrats on the promotion well deserved",
    "congrats on the win good game",
    "what is your favorite game right now",
    "see you all tomorrow have a good night everyone",
]

TOXIC_EX = [
    "you are so trash uninstall",
    "shut up you are stupid nobody asked",
    "go away idiot",
    "you are a complete moron",
    "nobody wants you here get out",
    "trash player uninstall the game now",
    "you are worthless garbage",
    "you are literally braindead",
    "reported you for being a loser",
    "absolute garbage delete the game please",
    "you are the dumbest person i have seen",
    "stop talking you are annoying",
    "i hate you just leave already",
    "you are disgusting go away forever",
    "you are ugly and cringe",
    "you are pathetic nobody respects you",
    "everyone hates you",
    "what a useless teammate",
    "you ruined the whole match",
    "learn to play and stop feeding",
]

SCAM_EX = [
    "free nft airdrop connect your wallet now",
    "send 0.1 eth get 0.5 back guaranteed",
    "exclusive whitelist spot guaranteed gains dm me",
    "free bitcoin just verify your wallet address now",
    "crypto presale guaranteed returns limited time",
    "airdrop for first 100 members connect wallet",
    "earn 500 dollars daily with this crypto bot",
    "limited offer send first and receive double",
    "huge pump incoming buy now before too late",
    "token launch 1000x potential buy now",
    "guaranteed profit trading signals dm for access",
    "free usdt giveaway claim now",
    "investment opportunity 200 percent weekly returns",
    "nft mint live free gas for first wallets",
    "double your bitcoin in 24 hours",
    "official giveaway send 1 get 2 back",
    "yield farming 500 percent apy no risk",
    "wallet eligible for free token claim",
    "pump group guaranteed signals dm now",
    "new token launch connect metamask now",
]

PHISHING_EX = [
    "verify your discord account or it will be suspended",
    "you won free nitro claim it here",
    "steam trade offer verify your account now",
    "your account was flagged verify at support link",
    "click here to receive your free reward",
    "security alert verify account from unknown login",
    "your discord will be deleted unless you verify",
    "selected for free gift claim now",
    "verify your email or lose access",
    "inventory is being transferred stop it here",
    "verify your account to join private server",
    "suspicious activity detected click to secure account",
    "free boost claim reward at this link",
    "account at risk update credentials now",
    "pending verification complete now to avoid ban",
    "scan this qr code to verify account",
    "login required to receive your prize",
    "re authenticate due to policy change",
    "password reset required click here",
    "complete verification to unlock role",
]

IMPERSONATION_EX = [
    "i am the real server admin dm me for help",
    "this is official discord support cooperate now",
    "discord staff here your account is flagged",
    "mod team announcement all users must verify",
    "i am the owner of this server dm me",
    "official announcement from headquarters verify email",
    "staff message send your account details",
    "community manager here dm me your details",
    "administrator notice complete verification now",
    "i work for trust and safety team dm me",
    "important message from admin team account review",
    "verified partner here offering exclusive perks",
    "official bot developer whitelist my bot",
    "head moderator speaking register again today",
    "nitro support team your subscription has issue",
    "i am a verified developer trust me",
    "official nft team wallet selected for mint",
    "server founder speaking new rules dm me",
    "crypto team announcement dm for exclusive drop",
    "certified admin your verification expired renew",
]

BASE_DATA = [
    (CLEAN_EX, 0),
    (TOXIC_EX, 1),
    (SCAM_EX, 2),
    (PHISHING_EX, 3),
    (IMPERSONATION_EX, 4),
]


@dataclass
class TrainConfig:
    model_id: str = "distilbert-base-uncased"
    output_dir: str = "/models/jarvis-moderation-ft"
    train_file: str = "/data/dataset/train.jsonl"
    eval_file: str = "/data/dataset/eval.jsonl"
    logs_dir: str = "/logs"
    max_length: int = 128
    num_epochs: int = 5
    batch_size: int = 1
    gradient_accumulation_steps: int = 4
    learning_rate: float = 2e-5
    weight_decay: float = 0.01
    warmup_ratio: float = 0.1
    logging_steps: int = 1
    eval_split_ratio: float = 0.15
    seed: int = 42
    device: str = "cpu"


def _print_event(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=True), flush=True)


def _leet(text: str) -> str:
    mapping = {"a": "@", "e": "3", "i": "1", "o": "0", "s": "$", "t": "+", "l": "|", "g": "9"}
    return "".join(mapping.get(ch, ch) for ch in text.lower())


def _partial_leet(text: str, rng: random.Random) -> str:
    mapping = {"a": "@", "e": "3", "i": "1", "o": "0"}
    out = []
    for word in text.split():
        if rng.random() < 0.4:
            out.append("".join(mapping.get(ch, ch) for ch in word))
        else:
            out.append(word)
    return " ".join(out)


def _noise_char(text: str, rng: random.Random) -> str:
    words = text.split()
    if len(words) < 2:
        return text
    idx = rng.randint(0, len(words) - 1)
    word = words[idx]
    if len(word) < 3:
        return text
    pos = rng.randint(1, len(word) - 2)
    words[idx] = word[:pos] + rng.choice([".", "-", "_", "*"]) + word[pos:]
    return " ".join(words)


def _typo_drop(text: str, rng: random.Random) -> str:
    words = text.split()
    if len(words) < 2:
        return text
    idx = rng.randint(0, len(words) - 1)
    chars = list(words[idx])
    if len(chars) > 3:
        chars.pop(rng.randint(1, len(chars) - 2))
        words[idx] = "".join(chars)
    return " ".join(words)


def _augment(text: str, label: int, seed: int) -> list:
    rng = random.Random(seed)
    prefixes = {
        0: ["yo ", "hey ", "lol ", "ngl ", "omg "],
        1: ["wtf ", "omg ", "bruh ", "smh ", "bro "],
        2: ["guys ", "hey ", "omg ", "wow ", "attention "],
        3: ["urgent ", "notice ", "alert ", "warning ", "important "],
        4: ["official ", "admin ", "staff ", "mod ", "notice "],
    }
    return [
        text,
        _leet(text),
        _partial_leet(text, rng),
        text.upper(),
        _noise_char(text, rng),
        _typo_drop(text, rng),
        rng.choice(prefixes[label]) + text,
        text + rng.choice([" !", "!!", "...", "??", " lol"]),
        text.replace(" ", "  ").strip(),
        " ".join(word[::-1] if rng.random() < 0.1 else word for word in text.split()),
    ]


def generate_dataset(seed: int = 42) -> tuple:
    rows = []
    random.seed(seed)
    for examples, label in BASE_DATA:
        for text in examples:
            aug_seed = abs(hash((text, label, seed))) % (2**31)
            for variant in _augment(text, label, aug_seed):
                rows.append({"text": variant.strip(), "label": label})
    random.shuffle(rows)
    split_idx = int(len(rows) * 0.85)
    return rows[:split_idx], rows[split_idx:]


def save_jsonl(path: Path, rows: list) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def ensure_dataset(cfg: TrainConfig) -> tuple:
    train_path = Path(cfg.train_file)
    eval_path = Path(cfg.eval_file)

    def _is_valid(rows: list) -> bool:
        if not rows:
            return False
        for row in rows:
            if "text" not in row or "label" not in row:
                return False
            if not isinstance(row["text"], str) or not isinstance(row["label"], int):
                return False
        return True

    if train_path.exists() and eval_path.exists():
        _print_event({"event": "dataset_found", "train_file": cfg.train_file, "eval_file": cfg.eval_file})
        train_rows = [json.loads(l) for l in train_path.read_text(encoding="utf-8").splitlines() if l.strip()]
        eval_rows  = [json.loads(l) for l in eval_path.read_text(encoding="utf-8").splitlines() if l.strip()]
        if _is_valid(train_rows) and _is_valid(eval_rows):
            return train_rows, eval_rows
        _print_event({"event": "dataset_incompatible", "action": "regenerate"})

    train_rows, eval_rows = generate_dataset(seed=cfg.seed)
    save_jsonl(train_path, train_rows)
    save_jsonl(eval_path, eval_rows)
    _print_event({"event": "dataset_generated", "train": len(train_rows), "eval": len(eval_rows)})
    return train_rows, eval_rows


def _compute_metrics_builder(num_labels: int):
    import numpy as np

    def compute_metrics(eval_pred):
        logits, labels = eval_pred
        preds = np.argmax(logits, axis=-1)
        acc = float((preds == labels).mean())
        precision_scores, recall_scores, f1_scores = [], [], []
        for class_id in range(num_labels):
            tp = int(((preds == class_id) & (labels == class_id)).sum())
            fp = int(((preds == class_id) & (labels != class_id)).sum())
            fn = int(((preds != class_id) & (labels == class_id)).sum())
            precision = tp / (tp + fp) if (tp + fp) else 0.0
            recall   = tp / (tp + fn) if (tp + fn) else 0.0
            f1       = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0
            precision_scores.append(precision)
            recall_scores.append(recall)
            f1_scores.append(f1)
        return {
            "accuracy":  acc,
            "precision": float(sum(precision_scores) / len(precision_scores)),
            "recall":    float(sum(recall_scores)    / len(recall_scores)),
            "f1":        float(sum(f1_scores)        / len(f1_scores)),
        }
    return compute_metrics


def run_training(cfg: TrainConfig, train_rows: list, eval_rows: list) -> dict:
    import torch
    from datasets import Dataset
    from transformers import (
        AutoModelForSequenceClassification,
        AutoTokenizer,
        DataCollatorWithPadding,
        Trainer,
        TrainerCallback,
        TrainingArguments,
    )

    # ── Device setup ──────────────────────────────────────────────────
    device = cfg.device
    if device == "cuda":
        if torch.cuda.is_available():
            _print_event({"event": "log", "message": "GPU: " + torch.cuda.get_device_name(0)})
        else:
            _print_event({"event": "log", "message": "CUDA non disponible, fallback CPU"})
            device = "cpu"
    elif device == "mps":
        if not (hasattr(torch.backends, "mps") and torch.backends.mps.is_available()):
            _print_event({"event": "log", "message": "MPS non disponible, fallback CPU"})
            device = "cpu"

    use_gpu = device == "cuda"
    _print_event({"event": "log", "message": "Device: " + device})

    def supports_training_argument(name: str) -> bool:
        return name in inspect.signature(TrainingArguments.__init__).parameters

    def set_supported_argument(kwargs: dict, value: Any, *names: str) -> None:
        for name in names:
            if supports_training_argument(name):
                kwargs[name] = value
                return

    def supports_trainer_argument(name: str) -> bool:
        return name in inspect.signature(Trainer.__init__).parameters

    logs_path = Path(cfg.logs_dir)
    logs_path.mkdir(parents=True, exist_ok=True)
    step_log_file = logs_path / "step_metrics.jsonl"

    _print_event({"event": "start", "model": cfg.model_id, "labels": LABELS, "device": device})

    train_ds = Dataset.from_list(train_rows)
    eval_ds  = Dataset.from_list(eval_rows)

    tokenizer = AutoTokenizer.from_pretrained(cfg.model_id)

    def tokenize(batch: dict) -> dict:
        return tokenizer(batch["text"], truncation=True, max_length=cfg.max_length)

    train_tok = train_ds.map(tokenize, batched=True, remove_columns=["text"])
    eval_tok  = eval_ds.map(tokenize,  batched=True, remove_columns=["text"])
    train_tok = train_tok.rename_column("label", "labels")
    eval_tok  = eval_tok.rename_column("label",  "labels")

    model = AutoModelForSequenceClassification.from_pretrained(
        cfg.model_id,
        num_labels=len(LABELS),
        id2label={i: l for i, l in enumerate(LABELS)},
        label2id={l: i for i, l in enumerate(LABELS)},
    )
    model.gradient_checkpointing_enable()

    data_collator = DataCollatorWithPadding(tokenizer=tokenizer)

    class JsonLogCallback(TrainerCallback):
        def on_log(self, args, state, control, logs=None, **kwargs):
            if not logs:
                return
            payload = {"event": "log", "step": int(state.global_step)}
            payload.update({k: float(v) if isinstance(v, (int, float)) else v for k, v in logs.items()})
            _print_event(payload)
            with step_log_file.open("a", encoding="utf-8") as f:
                f.write(json.dumps(payload, ensure_ascii=False) + "\n")

        def on_epoch_end(self, args, state, control, **kwargs):
            _print_event({"event": "epoch_end", "epoch": float(state.epoch or 0.0), "step": int(state.global_step)})

        def on_evaluate(self, args, state, control, metrics=None, **kwargs):
            if metrics:
                _print_event({
                    "event":         "eval",
                    "step":          int(state.global_step),
                    "eval_loss":     metrics.get("eval_loss"),
                    "eval_accuracy": metrics.get("eval_accuracy"),
                    "eval_f1":       metrics.get("eval_f1"),
                })

    current_batch_size = cfg.batch_size
    train_result = None
    eval_result  = None
    trainer      = None

    while True:
        train_args_kwargs = {
            "output_dir":                    cfg.output_dir,
            "num_train_epochs":              cfg.num_epochs,
            "per_device_train_batch_size":   current_batch_size,
            "per_device_eval_batch_size":    current_batch_size,
            "gradient_accumulation_steps":   cfg.gradient_accumulation_steps,
            "learning_rate":                 cfg.learning_rate,
            "weight_decay":                  cfg.weight_decay,
            "warmup_ratio":                  cfg.warmup_ratio,
            "logging_steps":                 cfg.logging_steps,
            "logging_strategy":              "steps",
            "save_strategy":                 "epoch",
            "load_best_model_at_end":        True,
            "metric_for_best_model":         "f1",
            "greater_is_better":             True,
            "save_total_limit":              2,
            "gradient_checkpointing":        True,
            "dataloader_num_workers":        0,
            "report_to":                     [],
            "fp16":                          use_gpu and torch.cuda.is_available(),
            "bf16":                          False,
            "use_cpu":                       not use_gpu,
            "disable_tqdm":                  False,
        }
        set_supported_argument(train_args_kwargs, "epoch", "evaluation_strategy", "eval_strategy")

        train_args = TrainingArguments(**train_args_kwargs)

        trainer_kwargs = {
            "model":           model,
            "args":            train_args,
            "train_dataset":   train_tok,
            "eval_dataset":    eval_tok,
            "data_collator":   data_collator,
            "compute_metrics": _compute_metrics_builder(len(LABELS)),
            "callbacks":       [JsonLogCallback()],
        }
        if supports_trainer_argument("tokenizer"):
            trainer_kwargs["tokenizer"] = tokenizer
        elif supports_trainer_argument("processing_class"):
            trainer_kwargs["processing_class"] = tokenizer

        trainer = Trainer(**trainer_kwargs)

        try:
            _print_event({
                "event":                      "training_start",
                "epochs":                     cfg.num_epochs,
                "batch_size":                 current_batch_size,
                "gradient_accumulation_steps": cfg.gradient_accumulation_steps,
                "device":                     device,
            })
            train_result = trainer.train()
            eval_result  = trainer.evaluate()
            break
        except RuntimeError as exc:
            if "out of memory" in str(exc).lower() and current_batch_size > 1:
                current_batch_size = max(1, current_batch_size // 2)
                _print_event({"event": "oom_retry", "next_batch_size": current_batch_size})
                continue
            _print_event({"event": "training_error", "error": str(exc)})
            raise
        except Exception as exc:
            _print_event({"event": "training_error", "error": str(exc)})
            raise

    trainer.save_model(cfg.output_dir)
    tokenizer.save_pretrained(cfg.output_dir)

    train_metrics = {k: float(v) if isinstance(v, (int, float)) else v for k, v in (train_result.metrics or {}).items()}
    eval_metrics  = {k: float(v) if isinstance(v, (int, float)) else v for k, v in (eval_result or {}).items()}

    report = {
        "model":          cfg.model_id,
        "labels":         LABELS,
        "device":         device,
        "dataset":        {"train": len(train_rows), "eval": len(eval_rows)},
        "config":         asdict(cfg),
        "train_metrics":  train_metrics,
        "eval_metrics":   eval_metrics,
        "best_checkpoint": trainer.state.best_model_checkpoint,
        "output_dir":     cfg.output_dir,
        "step_log":       str(step_log_file),
    }

    report_path = logs_path / "training_report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    _print_event({"event": "complete", "report": str(report_path), "output_dir": cfg.output_dir})
    return report


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train moderation classifier")
    parser.add_argument("--model-id",    default=os.getenv("MODEL_ID",    "distilbert-base-uncased"))
    parser.add_argument("--output-dir",  default=os.getenv("OUTPUT_DIR",  "/models/jarvis-moderation-ft"))
    parser.add_argument("--train-file",  default=os.getenv("TRAIN_FILE",  "/data/dataset/train.jsonl"))
    parser.add_argument("--eval-file",   default=os.getenv("EVAL_FILE",   "/data/dataset/eval.jsonl"))
    parser.add_argument("--logs-dir",    default=os.getenv("LOGS_DIR",    "/logs"))
    parser.add_argument("--max-length",  type=int,   default=int(os.getenv("MAX_LEN",        "128")))
    parser.add_argument("--epochs",      type=int,   default=int(os.getenv("EPOCHS",         "5")))
    parser.add_argument("--batch-size",  type=int,   default=int(os.getenv("BATCH_SIZE",     "1")))
    parser.add_argument("--gradient-accumulation-steps", type=int, default=int(os.getenv("GRAD_ACC_STEPS", "4")))
    parser.add_argument("--learning-rate", type=float, default=float(os.getenv("LEARNING_RATE", "2e-5")))
    parser.add_argument("--weight-decay",  type=float, default=float(os.getenv("WEIGHT_DECAY",  "0.01")))
    parser.add_argument("--warmup-ratio",  type=float, default=float(os.getenv("WARMUP_RATIO",  "0.1")))
    parser.add_argument("--logging-steps", type=int,   default=int(os.getenv("LOGGING_STEPS",   "1")))
    parser.add_argument("--seed",          type=int,   default=int(os.getenv("SEED",            "42")))
    parser.add_argument("--device",        type=str,   default=os.getenv("DEVICE", "cpu"),
                        choices=["cpu", "cuda", "mps"],
                        help="Device (cpu/cuda/mps)")
    parser.add_argument("--generate-only", action="store_true", help="Only generate train/eval JSONL")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    cfg = TrainConfig(
        model_id=args.model_id,
        output_dir=args.output_dir,
        train_file=args.train_file,
        eval_file=args.eval_file,
        logs_dir=args.logs_dir,
        max_length=args.max_length,
        num_epochs=args.epochs,
        batch_size=args.batch_size,
        gradient_accumulation_steps=args.gradient_accumulation_steps,
        learning_rate=args.learning_rate,
        weight_decay=args.weight_decay,
        warmup_ratio=args.warmup_ratio,
        logging_steps=args.logging_steps,
        seed=args.seed,
        device=args.device,
    )

    random.seed(cfg.seed)
    train_rows, eval_rows = ensure_dataset(cfg)

    if args.generate_only:
        _print_event({"event": "dataset_ready", "train": len(train_rows), "eval": len(eval_rows)})
        return

    run_training(cfg, train_rows, eval_rows)


if __name__ == "__main__":
    main()
