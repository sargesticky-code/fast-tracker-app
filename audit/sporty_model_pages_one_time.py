#!/usr/bin/env python3
"""One-time documented SportyTrader 1X2 pagination audit. Read-only, no bypass."""
import csv,hashlib,json,re,time
from datetime import datetime,timezone
from pathlib import Path
from urllib.parse import urljoin,urlparse
import requests
from bs4 import BeautifulSoup
SRC="https://www.sportytrader.com/en/betting-tips/football/1x2/"
OUT=Path("sporty-model-pages");RAW=OUT/"raw"
def utc():return datetime.now(timezone.utc).isoformat()
def sha(b):return hashlib.sha256(b).hexdigest()
def clean(s):return " ".join(str(s or "").split())
def parse(html,page_url,h):
 soup=BeautifulSoup(html,"html.parser");out={}
 for node in soup.find_all(string=re.compile(r"Probability of\s*\d+(?:\.\d+)?\s*%",re.I)):
  match=re.search(r"Probability of\s*(\d+(?:\.\d+)?)\s*%",str(node),re.I)
  if not match:continue
  cur=node.parent;teams=[]
  for i in range(8):
   if cur is None or cur.name in ("body","html"):break
   teams=list(dict.fromkeys(clean(x.get("alt")) for x in cur.select("img[alt]") if clean(x.get("alt"))))
   if len(teams)==2 and teams[0].casefold()!=teams[1].casefold():break
   cur=cur.parent
  if len(teams)!=2:continue
  key=(teams[0].casefold(),teams[1].casefold())
  if key in out:continue
  out[key]={"source":"SPORTYTRADER","home_name":teams[0],"away_name":teams[1],"single_outcome_probability_pct":match.group(1),"prob_home":"","prob_draw":"","prob_away":"","source_url":page_url,"raw_sha256":h,"source_event_id":"","captured_at_utc":utc(),"identity_status":"UNVERIFIED"}
 return list(out.values())
def main():
 OUT.mkdir(exist_ok=True,parents=True);RAW.mkdir(exist_ok=True)
 s=requests.Session();s.headers.update({"User-Agent":"FastTracker one-time read-only football alias audit","Accept-Language":"en-US,en;q=0.9","X-Requested-With":"XMLHttpRequest"})
 attempts=[];rows=[];seen=set();maxpages=121;status="UNKNOWN";last=0;page_url_base=None
 for page in range(1,maxpages+1):
  if last:time.sleep(max(0,1.5-(time.monotonic()-last)))
  last=time.monotonic()
  url=SRC if page==1 else page_url_base.rsplit("/",2)[0]+"/"+str(page)+"/"
  entry={"page":page,"url":url,"attempted_utc":utc()};attempts.append(entry)
  try:
   p=urlparse(url)
   if p.hostname!="www.sportytrader.com" or p.scheme!="https":raise ValueError("DISALLOWED_URL")
   r=s.get(url,timeout=25);entry["http_code"]=r.status_code;r.raise_for_status()
   if urlparse(r.url).hostname!="www.sportytrader.com":raise ValueError("REDIRECT_DOMAIN")
   raw=r.content
   if len(raw)>4000000:raise ValueError("OVERSIZED_RESPONSE")
   digest=sha(raw)
   f=RAW/(digest+".html");f.write_bytes(raw)
   entry.update(hash=digest,bytes=len(raw),status="OK")
   # AJAX may return JSON with content as HTML; preserve original raw.
   html=raw.decode(r.encoding or "utf-8","replace")
   if "application/json" in r.headers.get("content-type",""):
    data=r.json()
    if isinstance(data,dict):
     html=" ".join(str(v) for v in data.values() if isinstance(v,str))
   soup=BeautifulSoup(html,"html.parser")
   if page==1:
    node=soup.select_one("[data-competition-select-path-value]")
    base=node.get("data-competition-select-path-value","") if node else ""
    if not re.fullmatch(r"/en/ajax/pronostics1x2/football/competition-0/1/",base):
     status="UNEXPECTED_PAGINATION_PATH";break
    page_url_base=urljoin(SRC,base)
    txt=soup.get_text(" ",strip=True)
    match=re.search(r"\b1\s*/\s*(\d{1,3})\b",txt)
    if match:maxpages=min(121,int(match.group(1)))
   found=parse(html,url,digest)
   if page>1 and (not found or digest in seen):
    status="EMPTY_OR_REPEATED_PAGE_STOP";break
   seen.add(digest);rows.extend(found)
   entry["model_cards"]=len(found)
   if not found:status="NO_MODEL_ROWS";break
   status="CAPPED_AT_SOURCE_PAGE_COUNT"
  except Exception as e:
   entry.update(status="ERROR",error=type(e).__name__+": "+str(e)[:180]);status="REQUEST_FAILED";break
 # Keep rows page-labelled. Never infer event ID or the HDA triple.
 cols=["source","home_name","away_name","single_outcome_probability_pct","prob_home","prob_draw","prob_away","source_url","raw_sha256","source_event_id","captured_at_utc","identity_status"]
 with (OUT/"captured_model_cards.csv").open("w",encoding="utf-8-sig",newline="") as f:
  w=csv.DictWriter(f,fieldnames=cols);w.writeheader();w.writerows(rows)
 names=sorted({v for r in rows for v in (r["home_name"],r["away_name"])},key=str.casefold)
 with (OUT/"team_names.csv").open("w",encoding="utf-8-sig",newline="") as f:
  w=csv.writer(f);w.writerow(["provider","observed_name"]);w.writerows(("SPORTYTRADER",x) for x in names)
 report={"source":"SPORTYTRADER","source_surface":SRC,"attempts":attempts,"status":status,"pages_attempted":len(attempts),"pages_with_model_rows":len({r["source_url"] for r in rows}),"model_records":len(rows),"distinct_team_names":len(names),"coverage_complete":status=="CAPPED_AT_SOURCE_PAGE_COUNT" and len(attempts)==maxpages,"full_hda_records":0,"identity_verified":False,"production_writes":0,"captured_utc":utc()}
 (OUT/"manifest.json").write_text(json.dumps(report,indent=2,ensure_ascii=False))
 with (OUT/"SHA256SUMS.txt").open("w") as f:
  for p in sorted(x for x in OUT.rglob("*") if x.is_file() and x.name!="SHA256SUMS.txt"):
   f.write(sha(p.read_bytes())+"  "+p.relative_to(OUT).as_posix()+"\n")
 print(json.dumps({k:report[k] for k in ["status","pages_attempted","pages_with_model_rows","model_records","distinct_team_names"]},indent=2))
if __name__=="__main__":main()
