#!/usr/bin/env python3
"""Read-only checks for isolated local-agents Security CI audit artifacts.

No secrets or raw scanner messages are copied into the summary. A successful
consistency check is NOT proof of absence of false positives or false negatives.
"""
import argparse
import json
import re
from collections import Counter
from pathlib import Path
from urllib.parse import unquote, urlsplit

SCANNERS = ("semgrep", "trivy", "gitleaks", "zizmor")
CALIBRATED_SCANNERS = ("semgrep", "gitleaks", "zizmor")
EXPECTED_TYPES = {"gomod", "pip", "pnpm"}


def fail(message):
    raise ValueError(message)


def only(root, filename):
    found = list(root.rglob(filename))
    if len(found) != 1:
        fail(f"expected one {filename}, found {len(found)}")
    return found[0]


def effective_level(result, rules):
    rule = rules.get(result.get("ruleId"), {})
    default = rule.get("defaultConfiguration") or {}
    return result.get("level") or default.get("level") or "warning"


def candidate_counts(doc):
    if doc.get("version") != "2.1.0" or not doc.get("runs"):
        fail("invalid SARIF version or missing runs")
    counts = Counter()
    for run in doc["runs"]:
        driver = (run.get("tool") or {}).get("driver") or {}
        if not driver.get("name"):
            fail("SARIF tool identity absent")
        for invocation in run.get("invocations", []):
            if invocation.get("executionSuccessful") is not True:
                fail("SARIF scanner invocation failed")
            for field in ("toolExecutionNotifications", "toolConfigurationNotifications"):
                if any(note.get("level") == "error" for note in invocation.get(field, [])):
                    fail("SARIF scanner reported configuration/execution errors")
        rules = {rule.get("id"): rule for rule in driver.get("rules", [])}
        if "results" not in run or not isinstance(run["results"], list):
            fail("SARIF results absent")
        for result in run["results"]:
            level = effective_level(result, rules)
            if level not in ("error", "warning", "note", "none"):
                fail("unsupported SARIF level")
            kind = result.get("kind", "fail")
            if kind not in ("fail", "pass", "review", "open", "informational", "notApplicable"):
                fail("unsupported SARIF result kind")
            accepted = any(s.get("status") == "accepted" for s in result.get("suppressions", []))
            typ = ("other" if kind != "fail" or level in ("none", "note")
                   else "suppressed" if accepted else "candidate")
            counts[typ] += 1
            for loc in result.get("locations", []):
                uri = ((loc.get("physicalLocation") or {}).get("artifactLocation") or {}).get("uri")
                if uri:
                    parts = urlsplit(uri)
                    path = Path(unquote(parts.path))
                    if parts.scheme or path.is_absolute() or ".." in path.parts:
                        fail("unsafe non-repository SARIF result path")
    return counts



def verify_calibrations(root):
    """Check completeness/consistency of the two actual labeled scanner suites.

    This does not authenticate the source of uploaded artifacts or infer
    real-world scanner accuracy.
    """
    report = {}
    expected_pair = {
        "status": "PASS", "labeled_positive_fixtures": 1,
        "labeled_negative_fixtures": 1,
        "true_positive_fixtures": 1, "true_negative_fixtures": 1,
        "false_positive_fixtures": 0, "false_negative_fixtures": 0,
        "unexpected_positive_locations": 0, "scanner_identity_checked": True,
    }
    expected_summary = {
        "status": "PASS", "pairs": 2,
        "true_positive_fixtures": 2, "true_negative_fixtures": 2,
        "false_positive_fixtures": 0, "false_negative_fixtures": 0,
    }
    for scanner in CALIBRATED_SCANNERS:
        for suffix in ("", "-second"):
            filename = f"precision-{scanner}{suffix}.json"
            evidence = json.loads(only(root, filename).read_text(encoding="utf-8"))
            if not isinstance(evidence, dict) or evidence.get("scanner") != scanner:
                fail(scanner + ": scanner identity mismatch in calibration")
            if any(evidence.get(key) != value or (
                    isinstance(value, int) and not isinstance(value, bool)
                    and type(evidence.get(key)) is not int)
                    for key, value in expected_pair.items()):
                fail(scanner + ": calibration case is missing or inconsistent")
        aggregate = json.loads(
            only(root, f"precision-{scanner}-summary.json").read_text(encoding="utf-8")
        )
        if not isinstance(aggregate, dict) or aggregate.get("scanner") != scanner:
            fail(scanner + ": calibration aggregate identity mismatch")
        if any(aggregate.get(key) != value or (
                isinstance(value, int) and not isinstance(value, bool)
                and type(aggregate.get(key)) is not int)
                for key, value in expected_summary.items()):
            fail(scanner + ": calibration aggregate differs from expected outcomes")
        report[scanner] = {
            "positive_fixtures": 2, "negative_fixtures": 2,
            "false_positive_fixtures": 0, "false_negative_fixtures": 0,
        }
    return report


def validate(root):
    root = Path(root)
    summary = {
        "schema": 1, "status": "PASS", "scanners": {}, "trivy": {},
        "limitations": [
            "Only verifies artifacts and declared coverage, not absence of missed findings",
            "No independent exploitability or secret-validation decision",
            "SARIF tool invocation absent for some scanners; GitHub job state is separate evidence",
        ],
    }
    for name in SCANNERS:
        sarif = json.loads(only(root, name + ".sarif").read_text(encoding="utf-8"))
        counts = candidate_counts(sarif)
        total = sum(len(run["results"]) for run in sarif["runs"])
        markdown = only(root, name + ".md").read_text(encoding="utf-8")
        match = re.search(r"Entrées SARIF brutes\s*:\s*(\d+)", markdown)
        if not match or int(match.group(1)) != total:
            fail(name + ": markdown / SARIF count mismatch")
        # Same effective severity as sarif_decision.py, even if SARIF omits level.
        expected_levels = []
        for run in sarif["runs"]:
            rules = {rule.get("id"): rule for rule in
                     ((run["tool"]["driver"]).get("rules") or [])}
            expected_levels.extend(effective_level(item, rules)
                                   for item in run["results"])
        displayed_levels = re.findall(
            r"\*\*Gravité SARIF :\*\*\s*(error|warning|note|none)\b",
            markdown,
        )
        if Counter(expected_levels) != Counter(displayed_levels):
            fail(name + ": Markdown severity disagrees with effective SARIF levels")
        summary["scanners"][name] = {
            "raw_results": total, "candidates": counts["candidate"],
            "suppressed": counts["suppressed"], "other": counts["other"],
        }

    inventory = json.loads(only(root, "trivy-targets.json").read_text(encoding="utf-8"))
    records = inventory.get("Results")
    if not isinstance(records, list) or not records:
        fail("Trivy returned no target inventory")
    kinds, classes = set(), set()
    vulns = misconfigs = 0
    for record in records:
        if not record.get("Target") or record.get("Class") not in ("lang-pkgs", "config"):
            fail("Trivy target missing identity/class")
        kinds.add(record.get("Type"))
        classes.add(record.get("Class"))
        vulns += len(record.get("Vulnerabilities") or [])
        misconfigs += len(record.get("Misconfigurations") or [])
    if not EXPECTED_TYPES.issubset(kinds) or classes != {"lang-pkgs", "config"}:
        fail("Trivy lacks expected Go/Python/pnpm/IaC coverage")
    if vulns + misconfigs != summary["scanners"]["trivy"]["raw_results"]:
        fail("Trivy inventory / SARIF results mismatch")
    summary["trivy"] = {
        "targets": len(records), "package_types": sorted(kinds),
        "vulnerability_advisories": vulns, "configuration_findings": misconfigs,
    }

    # Baseline assertions are scoped to this never-merged external test project.
    # If one vanishes, check scanner coverage/rules rather than claiming it is clean.
    for name in ("semgrep", "gitleaks"):
        if summary["scanners"][name]["raw_results"] < 1:
            fail("known baseline " + name + " results disappeared: review coverage")
    summary["calibration"] = verify_calibrations(root)
    return summary


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        result = validate(args.root)
    except (ValueError, OSError, TypeError, KeyError) as exc:
        result = {"schema": 1, "status": "FAIL", "error": str(exc)}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
