"""Prove collector worker accounting prevents silently partial snapshots."""
import json
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from bounded_capture import run_bounded_capture


class DiagnosticBridgeTests(unittest.TestCase):
    def run_stub(self, payload):
        with tempfile.TemporaryDirectory(prefix="ft-odds-diagnostics-test-") as d:
            script = Path(d) / "worker.py"
            script.write_text(
                "import json,sys\n"
                "from pathlib import Path\n"
                f"Path(sys.argv[1]).write_text({json.dumps(json.dumps(payload))})\n",
                encoding="utf-8",
            )
            return run_bounded_capture(str(script),timeout_seconds=5)

    def test_valid_complete_and_missing_results_sum_to_fixtures(self):
        fixtures=[{"event_id":"1"},{"event_id":"2"},{"event_id":"3"}]
        quotes=[{"provider_event_id":"1","hda":{"home":2,"draw":3,"away":4}}]
        rows, actual, reasons=self.run_stub({"fixtures":fixtures,"snapshot":quotes,
            "gap_reasons":{"COMPLETE":1,"NO_REQUESTED_BOOKMAKER_HDA":2}})
        self.assertEqual(len(rows),3)
        self.assertEqual(actual,quotes)
        self.assertEqual(reasons["COMPLETE"],1)

    def test_reject_partial_diagnostics(self):
        payload={"fixtures":[{"event_id":"1"},{"event_id":"2"}],
                 "snapshot":[],"gap_reasons":{"NO_EVENT_ODDS_IN_RESPONSE":1}}
        with self.assertRaisesRegex(RuntimeError,"DIAGNOSTICS_COUNT_MISMATCH"):
            self.run_stub(payload)

    def test_reject_silent_quote_count_mismatch(self):
        payload={"fixtures":[{"event_id":"1"}],
                 "snapshot":[{"provider_event_id":"1"}],
                 "gap_reasons":{"NO_EVENT_ODDS_IN_RESPONSE":1}}
        with self.assertRaisesRegex(RuntimeError,"SUCCESS_COUNT_MISMATCH"):
            self.run_stub(payload)

    def test_reject_missing_diagnostics(self):
        with self.assertRaisesRegex(RuntimeError,"MISSING_GAP_DIAGNOSTICS"):
            self.run_stub({"fixtures":[{"event_id":"1"}],"snapshot":[]})

    def test_public_manual_refresh_is_permanently_disabled(self):
        source=(Path(__file__).resolve().parent/"app.py").read_text(encoding="utf8")
        marker='@app.post("/refresh")'
        self.assertEqual(source.count(marker),1)
        block=source.split(marker,1)[1].split("# The isolated worker",1)[0]
        self.assertIn('"scheduled_refresh_only"',block)
        self.assertIn(", 410",block)
        self.assertNotIn("Thread(",block)
        docker=(Path(__file__).resolve().parent/"Dockerfile").read_text(encoding="utf8")
        self.assertIn("--workers 1",docker)

if __name__=="__main__":
    unittest.main()
