#!/usr/bin/env python3
"""One-time BetClan public INDEX-only name/fixture inventory. No detail fetches.
A listing URL is evidence of an event, never an official club team ID.
"""
import csv, re, json, requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin,urlparse,unquote
from pathlib import Path
root=Path("ops/team-alias-export/listing-only");root.mkdir(parents=True,exist_ok=True)
urls=["https://www.betclan.com/todays-football-predictions/",
      "https://www.betclan.com/tomorrows-football-predictions/"]
events={};status=[]
for url in urls:
 try:
  r=requests.get(url,timeout=20,headers={"User-Agent":"Mozilla/5.0 (personal offline football team name research)"})
  state="HTTP_"+str(r.status_code)
  if r.status_code != 200:status.append([url,state,0]);continue
  soup=BeautifulSoup(r.text,"html.parser")
  before=len(events)
  for a in soup.select("a[href]"):
   absolute=urljoin(url,a["href"]);parsed=urlparse(absolute)
   if parsed.hostname not in ("betclan.com","www.betclan.com"):continue
   match=re.search(r"/predictionsdetails/football/(\d+)/([^/]+)/?",parsed.path)
   if not match:continue
   event_id,slug=match.groups()
   label=a.get_text(" ",strip=True)[:170]
   src="LINK_ONLY_UNVERIFIED"
   home=away=""
   m=re.search(r"(.{2,80}?)\s+(?:vs?\.?|versus)\s+(.{2,80})",label,re.I)
   if m:home,away=m.group(1).strip(),m.group(2).strip();src="EXACT_LISTING_LABEL"
   else:
    slug=unquote(slug).lower()
    m=re.match(r"(.+?)-(?:vs?|versus)-(.+?)(?:-prediction)?$",slug)
    if m:home=m.group(1).replace("-"," ").title();away=re.sub(r"-prediction$","",m.group(2)).replace("-"," ").title();src="URL_SLUG_UNVERIFIED"
   events[event_id]=[event_id,home,away,label,src,absolute,url]
  status.append([url,state,len(events)-before])
 except Exception as e:status.append([url,type(e).__name__+":"+str(e)[:75],0])
with (root/"BETCLAN_ALL_LISTING_TEAMS.csv").open("w",encoding="utf-8-sig",newline="") as f:
 w=csv.writer(f);w.writerow(["source_fixture_id_NOT_TEAM_ID","home_name_candidate",
 "away_name_candidate","source_listing_text","confidence_type","fixture_url","listing_url"])
 w.writerows(events.values())
(root/"listing_status.json").write_text(json.dumps(
 {"pages":status,"total_unique_fixture_ids":len(events),
 "names_with_home_away":sum(bool(e[1] and e[2]) for e in events.values()),
 "meaning":"Listing evidence not direct verified provider team ID"},indent=2))
print("BETCLAN_ALL_LISTING_INVENTORY",len(events),status)
