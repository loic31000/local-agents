"""Adversarial negative controls for the isolated audit artifact verifier."""
import tempfile
import unittest
from pathlib import Path
import verify_external_reports as qa


def sarif(result=None):
    return {"version": "2.1.0", "runs": [{
        "tool": {"driver": {"name": "Scanner"}},
        "invocations": [{"executionSuccessful": True}],
        "results": [] if result is None else [result],
    }]}


class QualityVerifierTest(unittest.TestCase):
    def test_empty_report_distinct_from_missing_report(self):
        self.assertEqual(qa.candidate_counts(sarif())["candidate"], 0)
        broken = sarif()
        del broken["runs"][0]["results"]
        with self.assertRaises(ValueError):
            qa.candidate_counts(broken)

    def test_missing_level_defaults_to_warning(self):
        self.assertEqual(qa.candidate_counts(sarif({"ruleId": "synthetic"}))["candidate"], 1)

    def test_config_errors_and_failed_invocations_are_not_clean(self):
        for update in (
            {"executionSuccessful": False},
            {"toolConfigurationNotifications": [{"level": "error"}]},
            {"toolExecutionNotifications": [{"level": "error"}]},
        ):
            document = sarif()
            document["runs"][0]["invocations"][0].update(update)
            with self.subTest(update=update):
                with self.assertRaises(ValueError):
                    qa.candidate_counts(document)
        document = sarif()
        document["version"] = "1.0"
        with self.assertRaises(ValueError):
            qa.candidate_counts(document)

    def test_suppression_kept_separate(self):
        item = {"ruleId": "synthetic", "suppressions": [{"status": "accepted"}]}
        self.assertEqual(qa.candidate_counts(sarif(item))["suppressed"], 1)

    def test_untrusted_path_rejected(self):
        item = {"ruleId": "synthetic", "locations": [{"physicalLocation": {
            "artifactLocation": {"uri": "../outside-file"}}}]}
        with self.assertRaises(ValueError):
            qa.candidate_counts(sarif(item))

    def test_missing_artifact_not_a_clean_scan(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError):
                qa.validate(Path(directory))


    def test_full_artifact_consistency_detects_tampering(self):
        import json
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in qa.SCANNERS:
                finding = {"ruleId": "synthetic"} if name != "zizmor" else None
                (root / (name + ".sarif")).write_text(json.dumps(sarif(finding)))
                count = 1 if finding else 0
                severity = "- **Gravité SARIF :** warning" if finding else ""
                (root / (name + ".md")).write_text(
                    f"Entrées SARIF brutes : {count}\n{severity}\n")
            targets = {"Results": [
                {"Target": "go.mod", "Class": "lang-pkgs", "Type": "gomod",
                 "Vulnerabilities": [{"VulnerabilityID": "QA-synthetic"}]},
                {"Target": "requirements.txt", "Class": "lang-pkgs", "Type": "pip"},
                {"Target": "frontend/pnpm-lock.yaml", "Class": "lang-pkgs", "Type": "pnpm"},
                {"Target": "config/Dockerfile", "Class": "config", "Type": "dockerfile"},
            ]}
            inventory = root / "trivy-targets.json"
            inventory.write_text(json.dumps(targets))
            for scanner in qa.CALIBRATED_SCANNERS:
                case = {
                    "scanner": scanner, "status": "PASS",
                    "labeled_positive_fixtures": 1,
                    "labeled_negative_fixtures": 1,
                    "true_positive_fixtures": 1, "true_negative_fixtures": 1,
                    "false_positive_fixtures": 0, "false_negative_fixtures": 0,
                    "unexpected_positive_locations": 0,
                    "scanner_identity_checked": True,
                }
                for suffix in ("", "-second"):
                    (root / f"precision-{scanner}{suffix}.json").write_text(
                        json.dumps(case))
                aggregate = {"scanner": scanner, "status": "PASS", "pairs": 2,
                             "true_positive_fixtures": 2, "true_negative_fixtures": 2,
                             "false_positive_fixtures": 0, "false_negative_fixtures": 0}
                (root / f"precision-{scanner}-summary.json").write_text(
                    json.dumps(aggregate))
            self.assertEqual(qa.validate(root)["status"], "PASS")

            secondary = root / "precision-semgrep-second.json"
            secondary.write_text(json.dumps({**case, "scanner": "semgrep",
                                             "false_negative_fixtures": 1}))
            with self.assertRaisesRegex(ValueError, "calibration case"):
                qa.validate(root)
            secondary.write_text(json.dumps({**case, "scanner": "semgrep"}))
            second_summary = root / "precision-gitleaks-summary.json"
            second_summary.unlink()
            with self.assertRaisesRegex(ValueError, "precision-gitleaks-summary"):
                qa.validate(root)
            second_summary.write_text(json.dumps({
                "scanner": "gitleaks", "status": "PASS", "pairs": 2,
                "true_positive_fixtures": 2, "true_negative_fixtures": 2,
                "false_positive_fixtures": 0, "false_negative_fixtures": 0
            }))

            gitleaks = root / "gitleaks.md"
            gitleaks.write_text("Entrées SARIF brutes : 1\n- **Gravité SARIF :** non précisée\n")
            with self.assertRaisesRegex(ValueError, "severity"):
                qa.validate(root)
            gitleaks.write_text("Entrées SARIF brutes : 1\n- **Gravité SARIF :** warning\n")
            targets["Results"].pop(1)  # remove Python coverage
            inventory.write_text(json.dumps(targets))
            with self.assertRaisesRegex(ValueError, "coverage"):
                qa.validate(root)


if __name__ == "__main__":
    unittest.main()
