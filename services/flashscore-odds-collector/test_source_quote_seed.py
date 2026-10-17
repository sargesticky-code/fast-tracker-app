"""Offline tests for one-shot canonical quote hints, no network calls."""
import io
import json
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parent))
from source_quote_seed import valid_quote_ids, load_verified_quote_hints

NOW=datetime(2026,10,17,8,35,tzinfo=timezone.utc)
def iso(dt): return dt.isoformat()
def quote(event="SxpU5PzH",captured=None,kickoff=None,label="Bookmaker reference"):
    return {
        "id":"FS:"+event,
        "sourceContext":{"source":"FLASHSCORE"},
        "oddsLabel":label,
        "odds":{"home":3.5,"draw":3.75,"away":1.91},
        "oddsCapturedAt":iso(captured or NOW-timedelta(minutes=20)),
        "kickoff":iso(kickoff or NOW+timedelta(hours=2)),
    }
def pack(rows=None,source="flashscore-single-rpc-canonical"):
    return {"source":source,"generatedAt":iso(NOW),
            "matches":rows if rows is not None else [quote()]}

class QuoteStartupSeedTests(unittest.TestCase):
    def test_verified_recent_fs_event_id_is_the_only_output(self):
        self.assertEqual(valid_quote_ids(pack(),NOW),{"SxpU5PzH"})

    def test_stale_future_or_post_kickoff_quote_is_rejected(self):
        for change in [
            {"captured":NOW-timedelta(hours=2)},
            {"captured":NOW+timedelta(minutes=2)},
            {"kickoff":NOW-timedelta(minutes=2)},
            {"kickoff":NOW+timedelta(hours=49)},
            {"captured":NOW+timedelta(minutes=40),"kickoff":NOW+timedelta(minutes=20)},
        ]:
            with self.subTest(change=change):
                self.assertFalse(valid_quote_ids(pack([quote(**change)]),NOW))

    def test_wrong_label_and_provider_are_rejected(self):
        self.assertFalse(valid_quote_ids(pack([quote(label="China 500 reference")]),NOW))
        r=quote()
        r["sourceContext"]["source"]="UNKNOWN"
        self.assertFalse(valid_quote_ids(pack([r]),NOW))
        self.assertFalse(valid_quote_ids(pack(),NOW) - {"SxpU5PzH"})

    def test_invalid_prices_cannot_seed_any_fixture(self):
        for price in [None,1.0,float("nan"),float("inf"),"2.6",-1,101]:
            r=quote()
            r["odds"]["home"]=price
            with self.subTest(price=price):
                self.assertEqual(valid_quote_ids(pack([r]),NOW),set())

    def test_malformed_identity_and_conflicting_duplicate_fail_closed(self):
        self.assertFalse(valid_quote_ids(pack([quote(event="bad!")]),NOW))
        r=quote()
        r["id"]="HKJC:12345"
        self.assertFalse(valid_quote_ids(pack([r]),NOW))
        self.assertFalse(valid_quote_ids(pack([quote(),quote()]),NOW))

    def test_invalid_source_or_broad_batch_not_accepted(self):
        self.assertFalse(valid_quote_ids(pack(source="supabase-lightweight-enrichment-recovery"),NOW))
        self.assertFalse(valid_quote_ids(pack([quote()]*801),NOW))
        self.assertFalse(valid_quote_ids({**pack(),"generatedAt":iso(NOW-timedelta(minutes=45))},NOW))
        self.assertFalse(valid_quote_ids({**pack(),"generatedAt":iso(NOW+timedelta(minutes=2))},NOW))

    def test_one_bounded_public_read_with_no_password_or_odds_provider(self):
        now=datetime.now(timezone.utc)
        body={"source":"flashscore-single-rpc-canonical",
              "generatedAt":iso(now),
              "matches":[quote(captured=now-timedelta(minutes=10),
                              kickoff=now+timedelta(hours=2))]}
        class Fake:
            status=200
            def __enter__(self): return self
            def __exit__(self,*args): pass
            def read(self,cap): return json.dumps(body).encode()
        with patch("source_quote_seed.urlopen",return_value=Fake()) as caller:
            self.assertEqual(load_verified_quote_hints(),{"SxpU5PzH"})
            caller.assert_called_once()
            url=caller.call_args.args[0].full_url
            self.assertIn("app-phase1-feed?view=compact&hours=48",url)
            self.assertNotIn("pq_graphql",url)

if __name__=="__main__": unittest.main()
