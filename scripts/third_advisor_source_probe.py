#!/usr/bin/env python3
"""One-shot third-advisor (WDW) and downloadable market baseline feasibility.

At most ONE request per source. No proxy, login, cookies, bypass or DB action.
"""
import json
import re
from datetime import datetime, timezone
from urllib.request import urlopen, Request
from urllib.error import HTTPError, URLError
from pathlib import Path
URLS={
 "SPORTYTRADER":"https://www.sportytrader.com/en/betting-tips/football/",
 "FOOTBALL_DATA_FIXTURES":"https://www.football-data.co.uk/matches/fixtures.csv",
}
def probe(name,url):
 r={"source":name,"url":url,"capture_time_utc":datetime.now(timezone.utc).isoformat(),
    "status":None,"usable":False,"block_reason":None}
 try:
  with urlopen(Request(url,headers={"User-Agent":"FastTracker read-only feasibility/1.0"}),timeout=20) as resp:
   r["status"]=resp.status
   ctype=resp.headers.get("Content-Type","")
   raw=resp.read(4_000_001)
  if len(raw)>4_000_000:raise ValueError("UNEXPECTED_LARGE_RESPONSE")
  text=raw.decode("utf-8-sig","replace")
  if any(x in text[:3000].lower() for x in ("captcha","access denied","just a moment")):
   r["block_reason"]="CHALLENGE"
  elif name=="SPORTYTRADER":
   r["html"]=("html" in ctype.lower())
   r["matches_selector"]=text.lower().count("football prediction") + text.lower().count("betting tips")
   r["score_selector"]=text.lower().count("our prediction") + text.lower().count("prediction")
   r["usable"]=r["html"] and r["matches_selector"]>0 and r["score_selector"]>0
  else:
   header=next((line.strip() for line in text.splitlines() if line.strip()), "")
   r["csv_header"]=header[:190]\n   r["body_prefix"]=text[:100].replace("\\n"," ")
   r["rows_estimate"]=text.count("\n")
   r["usable"]= ("Date" in header and "HomeTeam" in header and "AwayTeam" in header
        and r["rows_estimate"]>1)
  if not r["usable"] and not r["block_reason"]:r["block_reason"]="UNVERIFIED_SOURCE_SHAPE"
 except HTTPError as e:r["status"]=e.code;r["block_reason"]="HTTP_"+str(e.code)
 except (OSError,ValueError,URLError) as e:r["block_reason"]=type(e).__name__+":"+str(e)[:150]
 return r
if __name__=="__main__":
 results=[probe(name,url) for name,url in URLS.items()]
 Path("third-source-probe.json").write_text(json.dumps(results,indent=2)+"\n")
 print("THIRD_SOURCE_PROBE",json.dumps(results))
