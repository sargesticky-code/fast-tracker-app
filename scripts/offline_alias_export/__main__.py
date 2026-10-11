"""Produce editable Excel-compatible CSV and ZIP review package. No DB write."""
from collections import defaultdict
from pathlib import Path
from datetime import datetime,timezone
import json,csv,zipfile
from .sources import ROOT,norm,load_reep,load_clubs,load_leagues

OUT=ROOT/"dist"/"TEAM_ALIAS_EXPORT_20261011"
def write_csv(filename,columns,rows):
 with (OUT/filename).open("w",encoding="utf-8-sig",newline="") as f:
  w=csv.DictWriter(f,fieldnames=columns,extrasaction="ignore")
  w.writeheader()
  for row in rows:
   w.writerow({c:protect(row.get(c,"")) for c in columns})
def protect(value):
 s=str(value or "").strip().replace("\x00"," ")
 if s.startswith(("=","+","-","@")):s="'"+s
 return s
def build():
 OUT.mkdir(parents=True,exist_ok=True)
 raw=load_reep()
 files,club_rows=load_clubs()
 league_rows=load_leagues()
 league_index=defaultdict(set)
 for r in league_rows:league_index[norm(r["team_name"])].add(r["league"])
 def league(name):
  hits=league_index.get(norm(name),set())
  return list(hits)[0] if len(hits)==1 else ""
 groups=defaultdict(list)
 for r in raw:groups[str(r[0])].append(r)
 if len(groups)!=45337:raise RuntimeError("INCORRECT_REEP_ENTITY_COUNT")
 header=["source_entity_id","source_team_name","country","league_hint",
  "reep_id","wikidata_qid","flashscore_team_id","fotmob_team_id",
  "flashscore_confirmed_name","fotmob_confirmed_name","forebet_name",
  "betclan_name","sportytrader_name","football_data_name",
  "existing_canonical_team_key","proposed_canonical_team_key",
  "matching_confidence","evidence","review_status","reviewer_notes"]
 master=[];details=[];cross=[]
 for eid, variants in sorted(groups.items()):
  primary=next((v for v in variants if v[6]=="PRIMARY"),variants[0])
  master.append(dict(zip(header,[eid,primary[1],primary[2],league(primary[1]),
   eid,primary[3],primary[4],primary[5],"","","","","","","","","","","UNREVIEWED",""])))
  cross.append(dict(reep_id=eid,wikidata_qid=primary[3],
   flashscore_team_id=primary[4],fotmob_team_id=primary[5],team_name=primary[1]))
 for r in raw:
  details.append(dict(provider="REEP_CC0",provider_entity_id=r[0],
   team_name=r[1],alias_role=r[6],country=r[2],league_hint=league(r[1]),
   wikidata_qid=r[3],flashscore_team_id=r[4],fotmob_team_id=r[5],
   canonical_team_key="",source_file="withqwerty/reep CC0"))
 for file,root,name,role in club_rows:
  details.append(dict(provider="OPENFOOTBALL_CLUBS_CC0",
   provider_entity_id="CLUB:"+file+":"+norm(root),team_name=name,alias_role=role,
   country=file.split("/")[-1].split(".")[0],league_hint=league(name),
   wikidata_qid="",flashscore_team_id="",fotmob_team_id="",
   canonical_team_key="",source_file="openfootball/clubs CC0 / "+file))
 for r in league_rows:
  details.append(dict(provider="OPENFOOTBALL_LEAGUE_CC0",
   provider_entity_id=r["league_file"]+":"+norm(r["team_name"]),team_name=r["team_name"],
   alias_role="LEAGUE_OBSERVED",country="",league_hint=r["league"],
   wikidata_qid="",flashscore_team_id="",fotmob_team_id="",
   canonical_team_key="",source_file="openfootball/football.json CC0 / "+r["league_file"]))
 write_csv("01_TEAM_MATCHING_MASTER.csv",header,master)
 write_csv("02_ALL_ALIAS_NAMES_AND_IDS.csv",list(details[0]),details)
 write_csv("03_PROVIDER_IDS.csv",list(cross[0]),cross)
 write_csv("04_LEAGUE_MEMBERSHIP_EVIDENCE.csv",list(league_rows[0]),league_rows)
 manifest=dict(created_utc=datetime.now(timezone.utc).isoformat(),
  reep_names=len(raw),reep_entities=len(master),club_files=len(files),
  club_alias_names=len(club_rows),league_memberships=len(league_rows),
  total_alias_rows=len(details),review_status="NOT_REVIEWED",
  completeness="Full public Reep 24/24 plus all indexed CC0 openfootball/clubs files",
  caveat="Does not include private current Supabase mapping snapshot; site-specific names blank unless evidence exists",
  sources=["github.com/withqwerty/reep","github.com/openfootball/clubs",
    "github.com/openfootball/football.json"])
 (OUT/"05_MANIFEST.json").write_text(json.dumps(manifest,indent=2))
 (OUT/"06_REVIEW_INSTRUCTIONS.txt").write_text(
  "OFFLINE ONLY: do not modify source IDs. Merge on unique provider ID, not text alone.\n"
  "Review youth/women/reserve/namesakes; preserve unknown. Complete proposal, confidence, evidence, status.\n"
  "No automatic import to Supabase. Treat league_hint as verified ONLY for exact CC0 season fixture names.\n"
  "The existing canonical names/links require a separate authorized Supabase snapshot.\n"
  "Hand this ZIP to the next ChatGPT chat for dedicated one-time matching.\n")
 path=ROOT/"dist"/"TEAM_ALIAS_OFFLINE_PACKAGE_20261011.zip"
 with zipfile.ZipFile(path,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
  for f in OUT.iterdir():z.write(f,arcname=f.name)
 print("ALIAS_EXPORT_COMPLETE "+json.dumps(manifest))
if __name__=="__main__":build()
