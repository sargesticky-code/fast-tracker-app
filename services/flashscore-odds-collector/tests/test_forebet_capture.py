"""Provider-independent regression tests: no network and no paid scraping."""
import unittest
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from forebet_capture import parse_rows, merge_pages, SURFACES

def html(rows):
    return "<html><body><div class='schema'>" + "".join(rows) + "</div></body></html>"

def row(event="2549211", home="Xi'an Ronghai", away="Jiangxi Liansheng",
        probs=("38","25","37"),pick="1",score="1 - 0",average="1.63",day="2026-10-12"):
    spans="".join(f"<span>{s}</span>" for s in probs)
    return f"""<div class="rcnt">
    <span class="shortTag">Cn3</span><a class="tnmscn"
    href="https://www.forebet.com/en/football/matches/xian-ronghai-jiangxi-liansheng-{event}">
    <span class="homeTeam">{home}</span><span class="awayTeam">{away}</span>
    <time itemprop="startDate" datetime="{day}"><span class="date_bah">12/10/2026 8:00</span></time>
    </a><div class="fprc">{spans}</div>
    <div class="predict"><span class="forepr">{pick}</span></div>
    <div class="ex_sc tabonly">{score}</div><div class="avg_sc tabonly">{average}</div></div>"""

class ForebetParserContract(unittest.TestCase):
    def test_three_markets_source_id_merge(self):
        at="2026-10-12T02:00:00+00:00"
        base=parse_rows(html([row()]),"1X2",at)
        goals=parse_rows(html([row(probs=("67","33"),pick="Under")]),"OU25",at)
        corners=parse_rows(html([row(probs=("56","44"),pick="Under",score="5 - 3",average="8.75")]),"CORNERS95",at)
        joined,bad=merge_pages([("TODAY_1X2",base),("TODAY_OU25",goals),("TODAY_CORNERS95",corners)],at)
        self.assertEqual((len(joined),bad),(1,0))
        a=joined[0]
        self.assertEqual((a["prob_home"],a["prob_draw"],a["prob_away"]),(38,25,37))
        self.assertEqual((a["prob_under25"],a["prob_over25"]),(67,33))
        self.assertEqual((a["corner_prob_under95"],a["corner_prob_over95"]),(56,44))
        self.assertEqual(a["corner_predicted_score"],"5-3")
        self.assertEqual(a["avg_corners"],8.75)

    def test_source_conflict_quarantined(self):
        at="2026-10-12T02:00:00+00:00"
        a=parse_rows(html([row()]),"1X2",at)
        b=parse_rows(html([row(away="Unrelated Team",probs=("60","40"),pick="Over")]),"OU25",at)
        rows,fail=merge_pages([("TODAY_1X2",a),("TODAY_OU25",b)],at)
        self.assertEqual((len(rows),fail),(0,1))

    def test_invalid_probs_and_untrusted_urls_are_rejected(self):
        at="2026-10-12T02:00:00+00:00"
        a=parse_rows(html([row(probs=("50","50","50"))]),"1X2",at)
        self.assertEqual(a,{})
        b=parse_rows(html([row(probs=("50","40"),pick="Over")]),"OU25",at)
        self.assertEqual(b,{})
        c=html([row()]).replace("www.forebet.com","danger.example")
        self.assertEqual(parse_rows(c,"1X2",at),{})
        d=html([row()]).replace('datetime="2026-10-12"','datetime="2023-ABC"')
        self.assertEqual(parse_rows(d,"1X2",at),{})

    def test_no_unbounded_page_expansion(self):
        self.assertEqual(len(SURFACES),6)
        with self.assertRaisesRegex(ValueError,"FOREBET_PAGE_TOO_LARGE"):
            parse_rows("x"*750_100,"1X2","2026-10-12T00:00:00+00:00")
        with self.assertRaisesRegex(ValueError,"FOREBET_LAYOUT_INVALID"):
            parse_rows("<html><body>forebet blocked</body></html>","1X2","2026-10-12T00:00:00+00:00")

if __name__=="__main__":
    unittest.main()
