#!/usr/bin/env python3
"""BetClan read-only 1X2/correct-score adapter based on its public page structure.

Adapted from the extraction layout in Ezee-Kits/SPORTYBET-AUTO-TRADING-Bot
betclan.py. No Firebase, betting operations, proxy, clearance or DB writes.
"""
import argparse
from datetime import datetime,timezone
from pathlib import Path
import json
import re
from urllib.parse import urlparse,urljoin
from urllib.request import Request,urlopen
from bs4 import BeautifulSoup

BASE="https://www.betclan.com"
PAGES={"today":BASE+"/todays-football-predictions/",
       "tomorrow":BASE+"/tomorrows-football-predictions/"}
EVENT=re.compile(r"^/predictionsdetails/football/(\d+)/[a-z0-9-]+/?$")
DATE=re.compile(r"\b(20\d{2}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\b")
SCORE=re.compile(r"\b(\d{1,2})\s*-\s*(\d{1,2})\b")
LIMIT=3_000_000

def listing_links(html):
    soup=BeautifulSoup(html,"html.parser")
    links={}
    for a in soup.select("a[href]"):
        url=urljoin(BASE,a.get("href",""))
        parsed=urlparse(url)
        if parsed.hostname not in ("www.betclan.com","betclan.com"):continue
        match=EVENT.fullmatch(parsed.path)
        if match:links[match.group(1)]=url
    return list(links.values())

def probabilities(container):
    # Real source markup: .cell.vote__stats.js-vote-stats-container
    text=" ".join(container.stripped_strings)
    out={}
    for side in ("home","draw","away"):
        found=re.search(r"(?i)\b"+side+r"\s*:?\s*(\d{1,3})\s*%?",text)
        if found:out[side]=int(found.group(1))
    if len(out)!=3 or not 98<=sum(out.values())<=102 or any(x<0 or x>100 for x in out.values()):
        raise ValueError("INVALID_HDA")
    return out

def parse_detail(html,url):
    soup=BeautifulSoup(html,"html.parser")
    parsed=urlparse(url)
    m=EVENT.fullmatch(parsed.path)
    if not m:raise ValueError("INVALID_BETCLAN_EVENT_URL")
    team=soup.select_one(".teamstop")
    raw=list(team.stripped_strings) if team else []
    # Upstream extractor relies on first and last distinct team labels.
    raw=[s.strip() for s in raw if s.strip() and s.strip().lower() not in ("vs","v")]
    if len(raw)<2 or raw[0].casefold()==raw[-1].casefold():
        raise ValueError("MISSING_TEAMS")
    date=soup.select_one(".dategamedetailsis")
    dt=DATE.search(date.get_text(" ",strip=True)) if date else None
    if not dt:raise ValueError("UNKNOWN_SOURCE_KICKOFF")
    datetime.strptime(dt.group(1)+" "+dt.group(2),"%Y-%m-%d %H:%M")
    containers=soup.select("div.cell.vote__stats.js-vote-stats-container")
    if not containers:raise ValueError("MISSING_ADVISOR_PREDICTION")
    pred=probabilities(containers[0])
    score=None
    # Correct score is optional when layout no longer supplies it.
    if len(containers)>=4:
        match=SCORE.search(containers[3].get_text(" ",strip=True))
        if match:score=f"{int(match.group(1))}-{int(match.group(2))}"
    return {
      "source":"BETCLAN","source_event_id":m.group(1),
      "source_home_team":raw[0],"source_away_team":raw[-1],
      "source_kickoff_local_text":dt.group(1)+" "+dt.group(2),
      "source_timezone":None,
      "source_url":url,"prob_home":pred["home"],
      "prob_draw":pred["draw"],"prob_away":pred["away"],
      "predicted_score":score,"avg_goals":None,
      "canonical_match_id":None,"identity_status":"UNVERIFIED",
    }

def fetch(url):
    with urlopen(Request(url,headers={"User-Agent":"FastTracker personal football match research/1.0"}),timeout=18) as res:
        if res.status!=200:raise RuntimeError("SOURCE_HTTP_"+str(res.status))
        body=res.read(LIMIT+1)
    if len(body)>LIMIT:raise ValueError("SOURCE_RESPONSE_TOO_LARGE")
    return body.decode("utf-8","replace")

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--day",choices=list(PAGES),default="today")
    ap.add_argument("--max-details",type=int,default=1)
    ap.add_argument("--output",default="betclan-pilot-candidates.json")
    args=ap.parse_args()
    if not 1<=args.max_details<=20:ap.error("Pilot 1..20 details, not bulk crawling")
    urls=listing_links(fetch(PAGES[args.day]))
    rows=[]; errors=[]
    for url in urls[:args.max_details]:
        try: rows.append(parse_detail(fetch(url),url))
        except (OSError,ValueError,RuntimeError) as e: errors.append(str(e)[:110])
    report={"capture_time_utc":datetime.now(timezone.utc).isoformat(),
      "source_url":PAGES[args.day],"listing_count":len(urls),
      "rows":rows,"errors":errors,"production_writes":False,
      "coverage_complete":False,"identity_verified":False}
    Path(args.output).write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
    print("BETCLAN_PILOT",json.dumps({"links":len(urls),"parsed":len(rows),"errors":errors,
            "samples":[{"id":r["source_event_id"],"home":r["source_home_team"],"away":r["source_away_team"],"date":r["source_kickoff_local_text"],"hda":[r["prob_home"],r["prob_draw"],r["prob_away"]],"score":r["predicted_score"]} for r in rows[:6]]},ensure_ascii=False))
    if not rows:raise RuntimeError("NO_VALID_BETCLAN_DETAILS")
if __name__=="__main__":
    main()
