import sys
import ast
import tempfile
import asyncio
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bounded_capture import run_bounded_capture, CaptureTimeout
from browser_resources import should_abort_browser_resource
from odds_batch import bounded_map


class TestBoundedCollector(unittest.TestCase):
    def test_refresh_loop_uses_15min_start_to_start_not_extra_capture_delay(self):
        source = (Path(__file__).resolve().parents[1] / "app.py").read_text(encoding="utf-8")
        tree = ast.parse(source)
        loop_node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name=="loop")
        body = ast.unparse(loop_node)
        self.assertEqual(body.count("run_refresh()"), 1)
        self.assertIn("started = time.monotonic()", body)
        self.assertIn("elapsed = time.monotonic() - started", body)
        self.assertIn("time.sleep(max(0.0, REFRESH_SECONDS - elapsed))", body)
        self.assertNotIn("time.sleep(REFRESH_SECONDS)", body)

    def test_odds_requests_use_only_two_workers_and_keep_fixture_order(self):
        async def run():
            active = 0
            peak = 0

            async def fetch(item):
                nonlocal active, peak
                active += 1
                peak = max(peak, active)
                await asyncio.sleep(0.01)
                active -= 1
                return item * 10

            results, completed, timed_out = await bounded_map(
                list(range(8)), fetch, concurrency=2, timeout_seconds=1
            )
            return results, completed, timed_out, peak

        results, completed, timed_out, peak = asyncio.run(run())
        self.assertEqual(results, [0, 10, 20, 30, 40, 50, 60, 70])
        self.assertEqual(completed, 8)
        self.assertFalse(timed_out)
        self.assertEqual(peak, 2)

    def test_odds_batch_deadline_cancels_in_flight_work(self):
        async def run():
            calls = 0

            async def fetch(item):
                nonlocal calls
                calls += 1
                await asyncio.sleep(1)
                return item

            _, _, timed_out = await bounded_map(
                list(range(20)), fetch, concurrency=2, timeout_seconds=0.02
            )
            return calls, timed_out

        calls, timed_out = asyncio.run(run())
        self.assertLessEqual(calls, 2)
        self.assertTrue(timed_out)

    def test_only_non_data_browser_assets_are_blocked(self):
        self.assertTrue(should_abort_browser_resource("image"))
        self.assertTrue(should_abort_browser_resource("media"))
        self.assertTrue(should_abort_browser_resource("font"))
        for resource_type in ("document", "script", "stylesheet", "xhr", "fetch"):
            self.assertFalse(should_abort_browser_resource(resource_type))

    def test_reads_one_atomic_child_payload(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "worker.py"
            path.write_text(
                "import json,sys;from pathlib import Path;"
                "Path(sys.argv[1]).write_text(json.dumps({"
                "'fixtures':[{'event_id':'ABC123'}],"
                "'snapshot':[{'event_id':'ABC123'}],"
                "'gap_reasons':{'COMPLETE':1}}))",
                encoding="utf-8",
            )
            fixtures, snapshot, reasons = run_bounded_capture(path, 3)
            self.assertEqual(fixtures[0]["event_id"], "ABC123")
            self.assertEqual(len(snapshot), 1)
            self.assertEqual(reasons, {"COMPLETE": 1})

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
