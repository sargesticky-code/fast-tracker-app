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

    def test_source_aware_selection_preserves_previous_prices_and_samples_unseen(self):
        # 210 source fixtures, 120 daily requests (unchanged): yesterday's
        # 44 successful markets survive while 76 old gaps give 90 unknown
        # fixtures an opportunity without increasing total requests.
        rows=[{"event_id":"good"+str(i),"home":"A","away":"B",
               "league":"Z League","time_text":"20:00"} for i in range(44)]
        rows += [{"event_id":"missing"+str(i),"home":"A","away":"B",
                  "league":"A League","time_text":"20:00"} for i in range(76)]
        rows += [{"event_id":"new"+str(i),"home":"A","away":"B",
                  "league":"M League","time_text":"20:00"} for i in range(90)]
        selected=allocate(rows,120,set(),"2026-10-13",virtual,
            previous_priced={"good"+str(i) for i in range(44)},
            previous_unpriced={"missing"+str(i) for i in range(76)})
        ids={x["event_id"] for x in selected}
        self.assertEqual(len(ids),120)
        self.assertTrue(all("good"+str(i) in ids for i in range(44)))
        self.assertEqual(sum(x.startswith("new") for x in ids),76)
        self.assertFalse(any(x.startswith("missing") for x in ids))

    def test_source_gap_is_deprioritized_not_permanently_excluded(self):
        rows=[{"event_id":"had_gap","home":"A","away":"B","league":"A Cup"},
              {"event_id":"not_tried","home":"A","away":"B","league":"Z Cup"}]
        first=allocate(rows,1,set(),"2026-10-13",virtual,
                       previous_unpriced={"had_gap"})
        self.assertEqual(first[0]["event_id"],"not_tried")
        # Next cycle, the previously omitted gap was not probed, so it
        # becomes untried; the previously selected event becomes the old gap.
        second=allocate(rows,1,set(),"2026-10-13",virtual,
                        previous_unpriced={"not_tried"})
        self.assertEqual(second[0]["event_id"],"had_gap")

    def test_major_competition_always_precedes_lower_league_prior_success(self):
        rows=[{"event_id":"minor_success","home":"A","away":"B",
               "league":"A Friendly"},
              {"event_id":"ucl_gap","home":"A","away":"B",
               "league":"Champions League - League phaseEUROPE: Standings"}]
        result=allocate(rows,1,set(),"2026-10-13",virtual,
                        previous_priced={"minor_success"},
                        previous_unpriced={"ucl_gap"})
        self.assertEqual(result[0]["event_id"],"ucl_gap")

    def test_rotation_prioritizes_unseen_without_eviction_of_proven_prices(self):
        # Regression from live 360/cycle source: many source rows were never
        # visited because previous successes and gaps consumed the whole quota.
        rows = [
            {"event_id":f"priced{i:03d}","home":"A","away":"B",
             "league":"Minor Division","time_text":"20:00"}
            for i in range(90)
        ]
        rows.extend([
            {"event_id":f"unpriced{i:03d}","home":"A","away":"B",
             "league":"Minor Division","time_text":"20:00"}
            for i in range(90)
        ])
        rows.extend([
            {"event_id":f"new{i:03d}","home":"A","away":"B",
             "league":"Minor Division","time_text":"20:00"}
            for i in range(120)
        ])
        priced={f"priced{i:03d}" for i in range(90)}
        missed={f"unpriced{i:03d}" for i in range(90)}
        one=allocate(rows,120,set(),"2026-10-18",virtual,
                     previous_priced=priced,previous_unpriced=missed,
                     rotation_epoch=100)
        two=allocate(rows,120,set(),"2026-10-18",virtual,
                     previous_priced=priced,previous_unpriced=missed,
                     rotation_epoch=101)
        ids1={row["event_id"] for row in one}
        ids2={row["event_id"] for row in two}
        self.assertEqual((len(ids1),len(ids2)),(120,120))
        self.assertTrue(priced <= ids1)
        self.assertTrue(priced <= ids2)
        self.assertGreater(len(ids1 - ids2),0,"next cycle explores different event IDs")
        self.assertGreater(len(ids1 - priced - missed),0,
                           "previously skipped fixtures get an odds request")
        old=allocate(rows,120,set(),"2026-10-18",virtual,
                     previous_priced=priced,previous_unpriced=missed)
        self.assertNotEqual(ids1,{r["event_id"] for r in old})

    def test_rotation_does_not_displace_priority_match_or_add_requests(self):
        rows = [{
            "event_id":"important_without_odds","home":"Home","away":"Away",
            "league":"Premier LeagueENGLAND: Live Standings","time_text":"18:00",
        }]
        rows += [
            {"event_id":f"minor{i:03d}","home":"A","away":"B",
             "league":"Local Cup","time_text":"20:00"}
            for i in range(200)
        ]
        out=allocate(rows,120,set(),"2026-10-18",virtual,
                     previous_unpriced={"important_without_odds"},
                     rotation_epoch=5)
        self.assertEqual(len(out),120)
        self.assertEqual(out[0]["event_id"],"important_without_odds")
        self.assertEqual(len({r["event_id"] for r in out}),120)

    def test_rotation_never_replaces_success_even_if_only_few_gaps_exist(self):
        rows=[
            {"event_id":f"priced{i:03d}","home":"A","away":"B",
             "league":"Local Cup","time_text":"20:00"}
            for i in range(115)
        ]
        rows.extend([
            {"event_id":f"candidate{i:03d}","home":"A","away":"B",
             "league":"Local Cup","time_text":"20:00"}
            for i in range(115)
        ])
        good={f"priced{i:03d}" for i in range(115)}
        out=allocate(rows,120,set(),"2026-10-18",virtual,
                     previous_priced=good,rotation_epoch=90)
        selected={r["event_id"] for r in out}
        self.assertEqual(len(selected),120)
        self.assertTrue(good <= selected)
        self.assertEqual(len(selected-good),5)

    def test_rotation_does_not_explore_finished_or_virtual_events(self):
        rows = [
            {"event_id":"closed","home":"A","away":"B","league":"Cup","time_text":"FT"},
            {"event_id":"virtual","home":"A","away":"B","league":"Virtual League","time_text":"12:00"},
        ]+[
            {"event_id":f"live{i}","home":"A","away":"B","league":"Cup","time_text":"20:00"}
            for i in range(20)
        ]
        out=allocate(rows,10,set(),"2026-10-18",virtual,
                     previous_unpriced={"live1"},rotation_epoch=12)
        ids={r["event_id"] for r in out}
        self.assertEqual(len(ids),10)
        self.assertNotIn("closed",ids)
        self.assertNotIn("virtual",ids)

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
