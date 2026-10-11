import importlib.util
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("betclan",ROOT/"scripts/betclan_pilot_adapter.py")
adapter=importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)
URL="https://www.betclan.com/predictionsdetails/football/1234/arsenal-v-leeds-prediction/"
HTML="""<html><div class="teamstop">Arsenal<br>vs<br>Leeds</div>
<span class="dategamedetailsis">Date 2026-10-11 18:00</span>
<div class="cell vote__stats js-vote-stats-container">Home 69% Draw 19% Away 12%</div>
<div class="cell vote__stats js-vote-stats-container">Under 60% Over 40%</div>
<div class="cell vote__stats js-vote-stats-container">Yes 42% No 58%</div>
<div class="cell vote__stats js-vote-stats-container">1-0 19% Others 81%</div></html>"""
class TestBetClanAdapter(unittest.TestCase):
 def test_1x2_and_correct_score(self):
  r=adapter.parse_detail(HTML,URL)
  self.assertEqual((r["prob_home"],r["prob_draw"],r["prob_away"]),(69,19,12))
  self.assertEqual(r["predicted_score"],"1-0")
  self.assertEqual(r["identity_status"],"UNVERIFIED")
  self.assertIsNone(r["source_timezone"])
 def test_fail_closed_on_bad_probability(self):
  with self.assertRaisesRegex(ValueError,"INVALID_HDA"):
   adapter.parse_detail(HTML.replace("Away 12%","Away 99%"),URL)
 def test_scope_hostname_id(self):
  links=adapter.listing_links('<a href="/predictionsdetails/football/1234/arsenal-v-leeds-prediction/">one</a><a href="https://evil.test/predictionsdetails/football/1234/evil/">bad</a>')
  self.assertEqual(links,[URL])
if __name__=="__main__":
 unittest.main()
