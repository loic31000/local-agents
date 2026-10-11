#!/usr/bin/env python3
"""Choose the newest *per-scanner* artifact from one GitHub Actions run.

GitHub reruns only failed jobs: successful scanner artifacts can be from
attempt 1 while a retried scanner is from attempt 2. Mixing files across
attempts or selecting arbitrary old files silently corrupts audit evidence.
"""
import argparse
import re
import shutil
from pathlib import Path

SCANNERS = ("semgrep", "trivy", "gitleaks", "zizmor")


def select(source, output, run_id, current_attempt):
    source, output = Path(source), Path(output)
    if not run_id.isdecimal() or type(current_attempt) is not int or current_attempt < 1:
        raise ValueError("invalid run identity")
    if not source.is_dir() or source.is_symlink():
        raise ValueError("scanner artifact download is unavailable")
    if output.exists() and any(output.iterdir()):
        raise ValueError("selected artifact destination must be empty")
    output.mkdir(parents=True, exist_ok=True)
    if output.resolve() == source.resolve() or source.resolve() in output.resolve().parents:
        raise ValueError("output must not be nested in input")
    selected = {}
    for scanner in SCANNERS:
        pattern = re.compile(rf"security-{scanner}-{re.escape(run_id)}-([1-9][0-9]*)")
        options = []
        for directory in source.iterdir():
            match = pattern.fullmatch(directory.name)
            if not match:
                continue
            attempt = int(match.group(1))
            if attempt > current_attempt:
                raise ValueError(scanner + ": artifact is from a future attempt")
            if directory.is_symlink() or not directory.is_dir():
                raise ValueError(scanner + ": invalid artifact directory")
            options.append((attempt, directory))
        if not options:
            raise ValueError(scanner + ": missing scanner artifact across attempts")
        _, latest = max(options, key=lambda entry: entry[0])
        entries = list(latest.iterdir())
        expected = {scanner + ".sarif", scanner + ".md"}
        if not expected.issubset({entry.name for entry in entries}):
            raise ValueError(scanner + ": latest artifact is incomplete (no fallback)")
        dst = output / scanner
        dst.mkdir()
        for entry in entries:
            if entry.is_symlink() or not entry.is_file():
                raise ValueError(scanner + ": invalid artifact member")
            if entry.suffix not in (".json", ".md", ".sarif"):
                raise ValueError(scanner + ": unexpected artifact type")
            shutil.copy2(entry, dst / entry.name)
        selected[scanner] = max(attempt for attempt, _ in options)
    return selected


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--input", required=True, type=Path)
    p.add_argument("--output", required=True, type=Path)
    p.add_argument("--run-id", required=True)
    p.add_argument("--attempt", required=True, type=int)
    args = p.parse_args()
    try:
        result = select(args.input, args.output, args.run_id, args.attempt)
    except (ValueError, OSError) as exc:
        raise SystemExit("Artifact selection failed: " + str(exc)) from exc
    print("Verified same-run scanner artifact attempts: " +
          ", ".join(f"{name}={attempt}" for name, attempt in sorted(result.items())))


if __name__ == "__main__":
    main()
