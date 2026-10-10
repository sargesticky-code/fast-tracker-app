import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("parser", ROOT / "scripts/forebet_lean_parser.py")
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)


def fixture(cls="fprc", duplicate=False):
    if cls == "fprc":
        probabilities = '<div class="fprc"><span>42</span><span>38</span><span>20</span></div>'
    elif cls == "fprt":
        probabilities = '<span class="fprt">42%</span><span class="fprt">38%</span><span class="fprt">20%</span>'
    else:
        probabilities = '<span class="forebet_p1">42</span><span class="forebet_p2">38</span><span class="forebet_p3">20</span>'
    row = f'''<div class="rcnt"><div class="shortTag">Eng1</div>
      <a class="tnmscn" href="/en/football/match/abc">fixture</a>
      <div class="homeTeam"><span>Liverpool</span></div><div class="awayTeam"><span>Arsenal</span></div>
      <span class="date_bah">10/11/2026 6:00 PM</span>{probabilities}
      <span class="ex_sc">2 - 1</span><span class="avg_sc">2.95</span>
    </div>'''
    return row + row if duplicate else row


class TestForebetParser(unittest.TestCase):
    def test_three_2026_probability_layouts(self):
        for kind in ("fprc", "fprt", "forebet_p"):
            with self.subTest(kind=kind):
                parsed = p.parse_forebet_html(fixture(kind))
                self.assertEqual(parsed["parsed_count"], 1)
                row = parsed["parsed_rows"][0]
                self.assertEqual((row["prob_home"], row["prob_draw"], row["prob_away"]), (42, 38, 20))
                self.assertEqual(row["predicted_score"], "2 - 1")
                self.assertEqual(row["avg_goals"], "2.95")
                self.assertEqual(row["source_detail_url"], "https://www.forebet.com/en/football/match/abc")

    def test_nested_and_duplicate_rows(self):
        self.assertEqual(p.parse_forebet_html(fixture(duplicate=True))["parsed_count"], 1)

    def test_fake_probability_trio_is_not_accepted(self):
        html = fixture().replace("<span>20</span>", "<span>99</span>")
        parsed = p.parse_forebet_html(html)
        self.assertEqual(parsed["parsed_count"], 0)
        self.assertEqual(parsed["rejected_by_reason"]["DOM_ROWS_WITHOUT_COMPLETE_1X2"], 1)

    def test_other_host_is_not_provenance(self):
        row = fixture().replace('href="/en/football/match/abc"', 'href="https://evil.invalid/fixture"')
        self.assertIsNone(p.parse_forebet_html(row)["parsed_rows"][0]["source_detail_url"])

    def test_empty_or_block_page(self):
        self.assertEqual(p.parse_forebet_html("<html>403 Forbidden</html>")["parsed_count"], 0)


if __name__ == "__main__":
    unittest.main()
