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


if __name__ == "__main__":
    unittest.main()
