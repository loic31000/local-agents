"""Adversarial tests for per-scanner artifact selection across job reruns."""
import tempfile
import unittest
from pathlib import Path
from select_latest_artifacts import select, SCANNERS


def artifact(root, scanner, attempt, run_id="12345", marker=None):
    directory = root / f"security-{scanner}-{run_id}-{attempt}"
    directory.mkdir()
    (directory / f"{scanner}.sarif").write_text(marker or str(attempt))
    (directory / f"{scanner}.md").write_text("synthetic")
    return directory


class ArtifactSelectionTest(unittest.TestCase):
    def test_partial_rerun_uses_newest_of_each_scanner(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            downloaded, output = root / "raw", root / "selected"
            downloaded.mkdir()
            for scanner in SCANNERS:
                artifact(downloaded, scanner, 1)
            artifact(downloaded, "semgrep", 2)
            selected = select(downloaded, output, "12345", 2)
            self.assertEqual(selected["semgrep"], 2)
            for scanner in ("trivy", "gitleaks", "zizmor"):
                self.assertEqual(selected[scanner], 1)
            self.assertEqual((output / "semgrep/semgrep.sarif").read_text(), "2")
            self.assertEqual((output / "trivy/trivy.sarif").read_text(), "1")

    def test_incomplete_latest_artifact_never_falls_back(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            raw = root / "raw"
            raw.mkdir()
            for name in SCANNERS:
                artifact(raw, name, 1)
            newer = artifact(raw, "semgrep", 2)
            (newer / "semgrep.sarif").unlink()
            with self.assertRaisesRegex(ValueError, "latest artifact is incomplete"):
                select(raw, root / "out", "12345", 2)

    def test_old_run_or_missing_scanner_is_not_a_success(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            raw = root / "raw"
            raw.mkdir()
            for name in SCANNERS:
                artifact(raw, name, 1, run_id="99999")
            with self.assertRaisesRegex(ValueError, "missing scanner artifact"):
                select(raw, root / "out", "12345", 1)

    def test_future_attempt_and_symlink_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            raw = root / "raw"
            raw.mkdir()
            for name in SCANNERS:
                artifact(raw, name, 1)
            artifact(raw, "semgrep", 3)
            with self.assertRaisesRegex(ValueError, "future attempt"):
                select(raw, root / "out", "12345", 2)

            (raw / "security-semgrep-12345-3").rename(raw / "hidden")
            (raw / "security-semgrep-12345-1").rename(raw / "hidden2")
            (raw / "security-semgrep-12345-1").symlink_to(raw / "hidden2", target_is_directory=True)
            with self.assertRaisesRegex(ValueError, "invalid artifact directory"):
                select(raw, root / "out2", "12345", 2)

    def test_refuses_empty_or_untrusted_destination(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            raw = root / "raw"
            raw.mkdir()
            for name in SCANNERS:
                artifact(raw, name, 1)
            with self.assertRaisesRegex(ValueError, "invalid run identity"):
                select(raw, root / "output", "bad", 1)
            with self.assertRaisesRegex(ValueError, "output must not be nested"):
                select(raw, raw / "output", "12345", 1)


if __name__ == "__main__":
    unittest.main()
