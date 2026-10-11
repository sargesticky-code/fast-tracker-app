import sys
import tempfile
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bounded_capture import run_bounded_capture, CaptureTimeout


class TestBoundedCollector(unittest.TestCase):
    def test_reads_one_atomic_child_payload(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "worker.py"
            path.write_text(
                "import json,sys;from pathlib import Path;"
                "Path(sys.argv[1]).write_text(json.dumps({"
                "'fixtures':[{'event_id':'ABC123'}],"
                "'snapshot':[{'event_id':'ABC123'}]}))",
                encoding="utf-8",
            )
            fixtures, snapshot = run_bounded_capture(path, 3)
            self.assertEqual(fixtures[0]["event_id"], "ABC123")
            self.assertEqual(len(snapshot), 1)

    def test_kills_stalled_child_without_locking_service(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "worker.py"
            path.write_text("import time;time.sleep(5)", encoding="utf-8")
            with self.assertRaises(CaptureTimeout):
                run_bounded_capture(path, 0.2)

    def test_fails_closed_on_missing_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "worker.py"
            path.write_text("pass", encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, "NO_OUTPUT"):
                run_bounded_capture(path, 3)

    def test_fails_closed_on_invalid_counts(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "worker.py"
            path.write_text(
                "import json,sys;from pathlib import Path;"
                "Path(sys.argv[1]).write_text(json.dumps({"
                "'fixtures':[],'snapshot':[{}]}))", encoding="utf-8",
            )
            with self.assertRaisesRegex(RuntimeError, "INVALID_COUNTS"):
                run_bounded_capture(path, 3)


if __name__ == "__main__":
    unittest.main()
