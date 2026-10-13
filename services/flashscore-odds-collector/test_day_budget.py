"""Does not touch network, Supabase, APIs or real source pages."""
import sys
import unittest
from datetime import datetime, timezone, date
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from day_budget import day_plan,allocate,league_priority,collector_calendar_date

def virtual(league,home,away):
    return any(x in (league+" "+home+" "+away).lower() for x in ("virtual","esoccer"))

class DayBudgetTests(unittest.TestCase):
    def test_360_budget_reserves_next_day(self):
        self.assertEqual(day_plan(2,360),[(0,120),(1,240)])
        self.assertEqual(sum(q for _,q in day_plan(2,360)),360)
    def test_today_is_finite_and_next_day_is_not_starved(self):
        seen=set()
        today=[{"event_id":"today"+str(i),"home":"A","away":"B","league":"Premier"} for i in range(552)]
        tomorrow=[{"event_id":"next"+str(i),"home":"A","away":"B","league":"Premier"} for i in range(500)]
        a=allocate(today,120,seen,"2026-10-10",virtual)
        b=allocate(tomorrow,240,seen,"2026-10-11",virtual)
        self.assertEqual((len(a),len(b),len(seen)),(120,240,360))
        self.assertTrue(all(x["date"]=="2026-10-11" for x in b))
    def test_duplicates_in_tomorrow_do_not_double_capture(self):
        seen={"shared"}
        fixtures=[{"event_id":"shared","home":"A","away":"B","league":"Premier"},
                  {"event_id":"new","home":"A","away":"B","league":"Premier"}]
        x=allocate(fixtures,10,seen,"2026-10-11",virtual)
        self.assertEqual([a["event_id"] for a in x],["new"])
    def test_reject_ghosts_and_virtual_sources(self):
        rows=[{"event_id":"v","home":"A","away":"B","league":"virtual"},
              {"event_id":"x","home":"","away":"B","league":"Premier"},
              {"event_id":None,"home":"A","away":"B","league":"Premier"},
              {"event_id":"ok","home":"A","away":"B","league":"Premier"}]
        self.assertEqual([a["event_id"] for a in allocate(rows,2,set(),"2026-10-11",virtual)],["ok"])
    def test_top_leagues_beat_source_order_without_more_requests(self):
        # Source ordering used to spend all today's quota on low-value rows.
        rows=[{"event_id":"minor"+str(i),"home":"A","away":"B",
               "league":"Southern League Premier SouthENGLAND: Live Standings",
               "time_text":"20:00"} for i in range(160)]
        rows.extend([
            {"event_id":"epl","home":"Home","away":"Away",
             "league":"Premier LeagueENGLAND: Live Standings","time_text":"17:00"},
            {"event_id":"laliga","home":"Home","away":"Away",
             "league":"LaLigaSPAIN: Live Standings","time_text":"19:00"},
            {"event_id":"ucl","home":"Home","away":"Away",
             "league":"Champions League - League phase","time_text":"20:00"},
        ])
        result=allocate(rows,120,set(),"2026-10-13",virtual)
        self.assertEqual(len(result),120)
        self.assertEqual([x["event_id"] for x in result[:3]],
                         ["epl","laliga","ucl"])
        self.assertEqual(sum(x["event_id"].startswith("minor") for x in result),117)

    def test_country_aware_classification_never_conflates_same_named_leagues(self):
        self.assertEqual(league_priority("Premier LeagueENGLAND: Live Standings"),0)
        self.assertEqual(league_priority("LaLigaSPAIN: Standings"),1)
        self.assertEqual(league_priority("BundesligaGERMANY: Draw"),2)
        self.assertEqual(league_priority("Serie AITALY"),3)
        self.assertEqual(league_priority("Ligue 1FRANCE"),4)
        self.assertEqual(league_priority("Champions League - League phase"),5)
        for label in ["Premier LeagueJAMAICA: Live Standings",
                      "Premier League WomenENGLAND",
                      "AFC Champions League - League phase",
                      "UEFA Youth League - League phase",
                      "Serie ABRAZIL"]:
            self.assertEqual(league_priority(label),100,label)

    def test_final_results_do_not_displace_unplayed_matches(self):
        rows=[{"event_id":"finished","home":"A","away":"B",
               "league":"Premier LeagueENGLAND: Standings","time_text":"FT"},
              {"event_id":"live","home":"A","away":"B",
               "league":"Premier LeagueENGLAND: Standings","time_text":"63'"},
              {"event_id":"upcoming","home":"A","away":"B",
               "league":"Premier LeagueENGLAND: Standings","time_text":"22:00"}]
        selection=allocate(rows,2,set(),"2026-10-13",virtual)
        self.assertEqual([x["event_id"] for x in selection],["live","upcoming"])

    def test_equal_weight_competitions_are_sorted_alphabetically_then_kickoff(self):
        rows=[{"event_id":"late","home":"A","away":"B","league":"Zeta Cup","time_text":"20:00"},
              {"event_id":"early","home":"A","away":"B","league":"Alpha Cup","time_text":"10:00"},
              {"event_id":"later","home":"A","away":"B","league":"Alpha Cup","time_text":"12:00"},
              {"event_id":"earlier","home":"A","away":"B","league":"Alpha Cup","time_text":"09:00"}]
        selection=allocate(rows,4,set(),"2026-10-13",virtual)
        self.assertEqual([x["event_id"] for x in selection],
                         ["earlier","early","later","late"])

    def test_uk_calendar_boundary_and_gmt_switch(self):
        self.assertEqual(
            collector_calendar_date(datetime(2026,10,13,23,30,tzinfo=timezone.utc)),
            date(2026,10,14))  # UK still BST; tomorrow has already begun
        self.assertEqual(
            collector_calendar_date(datetime(2026,11,1,23,30,tzinfo=timezone.utc)),
            date(2026,11,1))  # UK now GMT
        self.assertRaises(ValueError,collector_calendar_date,datetime(2026,10,13,23,30))

    def test_single_day_or_small_capacity(self):
        self.assertEqual(day_plan(0,360),[(0,360)])
        self.assertEqual(day_plan(3,60),[(0,20),(1,40)])
        self.assertRaises(ValueError,day_plan,1,0)
    def test_no_mutation_original_rows(self):
        source={"event_id":"ok","home":"A","away":"B","league":"Premier"}
        self.assertEqual(allocate([source],5,set(),"2026-10-11",virtual)[0]["date"],"2026-10-11")
        self.assertNotIn("date",source)

if __name__=="__main__":
    unittest.main()
