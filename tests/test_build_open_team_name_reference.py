import importlib.util
from pathlib import Path
import unittest

f=Path(__file__).resolve().parents[1]/"scripts/build_open_team_name_reference.py"
spec=importlib.util.spec_from_file_location("open_team_reference",f)
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class TestOpenTeamReference(unittest.TestCase):
    def test_no_person_alias_and_explicit_reference_only(self):
        teams=[{"reep_id":"reep_t11","key_wikidata":"Q1","name":"Club One","country":"England",
                "key_flashscore":"club-one/abc123","key_fotmob":"123"},
               {"reep_id":"reep_t12","key_wikidata":"Q2","name":"Club Two","country":"Ireland"}]
        names=[{"key_wikidata":"Q1","alias":"C. One"},{"key_wikidata":"Q1","alias":"Club One"},
               {"key_wikidata":"Q3","alias":"Some Person"}]
        out,n=m.build(teams,names)
        self.assertEqual(len(out),3)
        self.assertEqual(n,1)
        self.assertTrue(all(r["identity_status"]=="REFERENCE_ONLY" for r in out))
        self.assertEqual(next(r for r in out if r["name_role"]=="ALIAS")["flashscore_team_id"],"club-one/abc123")

    def test_duplicate_qid_not_promoted(self):
        teams=[{"reep_id":"reep_t11","key_wikidata":"Q1","name":"A"},
               {"reep_id":"reep_t12","key_wikidata":"Q1","name":"B"}]
        out,n=m.build(teams,[{"key_wikidata":"Q1","alias":"ambiguous"}])
        self.assertEqual(len(out),2)
        self.assertEqual(n,0)

if __name__=="__main__":
    unittest.main()
