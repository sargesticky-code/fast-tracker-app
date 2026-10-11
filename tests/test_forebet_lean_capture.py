"""Offline-only evidence/provenance and duplicate safety tests."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
spec = importlib.util.spec_from_file_location("fb_capture", ROOT / "scripts/forebet-lean-capture.py")
capture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capture)


def source_html(home_prob="42"):
    return f'''<html><body><div class="rcnt"><span class="shortTag">Eng1</span>
    <div class="homeTeam"><span>Liverpool</span></div>
    <div class="awayTeam"><span>Arsenal</span></div>
    <span class="date_bah">10/11/2026 6:00 PM</span>
    <div class="fprc"><span>{home_prob}</span><span>38</span><span>20</span></div>
    <span class="ex_sc">2 - 1</span><span class="avg_sc">2.95</span>
    </div></body></html>'''


class TestSnapshotCapture(unittest.TestCase):
    def test_snapshot_contains_provenance_but_no_implied_freshness(self):
        result = capture.parse_snapshot(source_html(), "today", 50, capture.SOURCE_PAGES["today"], offline=True)
        self.assertEqual(len(result["rows"]), 1)
        self.assertEqual(result["rows"][0]["identity_status"], "UNVERIFIED")
        self.assertIsNone(result["rows"][0]["canonical_match_id"])
        self.assertIsNone(result["retrieved_at"])
        self.assertEqual(result["capture_provenance"], "LOCAL_HTML_UNVERIFIED_TIME")
        self.assertFalse(result["source_timestamp_verified"])
        self.assertFalse(result["coverage_complete"])
        self.assertEqual(len(result["snapshot_sha256"]), 64)

    def test_empty_or_invalid_html_fails_closed(self):
        with self.assertRaises(RuntimeError):
            capture.parse_snapshot("<html>403 Forbidden</html>", "today", 20, capture.SOURCE_PAGES["today"], offline=True)
        with self.assertRaises(RuntimeError):
            capture.parse_snapshot(source_html("99"), "today", 20, capture.SOURCE_PAGES["today"], offline=True)

    def test_offline_two_surfaces_deduplicate_same_evidence(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            today, tomorrow, out = base / "today.html", base / "tomorrow.html", base / "out.json"
            today.write_text(source_html(), encoding="utf8")
            tomorrow.write_text(source_html(), encoding="utf8")
            with patch.object(sys, "argv", ["forebet-lean-capture.py",
                "--html-today", str(today), "--html-tomorrow", str(tomorrow), "--out", str(out)]):
                capture.main()
            body = json.loads(out.read_text(encoding="utf8"))
            self.assertFalse(body["production_writes"])
            self.assertFalse(body["identity_verified"])
            self.assertEqual(body["conflicting_duplicate_keys"], 0)
            self.assertEqual(len(body["candidates"]), 1)

    def test_offline_two_surfaces_quarantine_conflicting_evidence(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            today, tomorrow, out = base / "today.html", base / "tomorrow.html", base / "out.json"
            today.write_text(source_html(), encoding="utf8")
            tomorrow.write_text(source_html("43").replace("<span>38</span>", "<span>37</span>"), encoding="utf8")
            with patch.object(sys, "argv", ["forebet-lean-capture.py",
                "--html-today", str(today), "--html-tomorrow", str(tomorrow), "--out", str(out)]):
                with self.assertRaises(RuntimeError):
                    capture.main()
            body = json.loads(out.read_text(encoding="utf8"))
            self.assertEqual(body["conflicting_duplicate_keys"], 1)
            self.assertEqual(body["candidates"], [])


if __name__ == "__main__":
    unittest.main()
