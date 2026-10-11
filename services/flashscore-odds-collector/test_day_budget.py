"""Does not touch network, Supabase, APIs or real source pages."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from day_budget import day_plan,allocate

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
