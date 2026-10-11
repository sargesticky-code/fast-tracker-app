#!/usr/bin/env python3
"""ONE TIME public-source football alias evidence collector; no credentials/DB writes."""
import argparse,csv,datetime,hashlib,json,re,sys,time,zipfile
from collections import Counter
from pathlib import Path
from urllib.parse import urljoin,urlparse
import requests
from bs4 import BeautifulSoup

UA="FastTracker source evidence one-time audit (no login or access bypass)"
SITES={"betclan":"www.betclan.com","sportytrader":"www.sportytrader.com","forebet":"www.forebet.com"}
COLUMNS=["source","record_type","source_event_id","home_name","away_name","home_id","away_id","competition","kickoff_source_text","source_timezone","prob_home","prob_draw","prob_away","predicted_score","average_goals","single_outcome_prob_pct","source_url","listing_url","captured_utc","raw_sha256","note"]
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def norm(s):return " ".join(str(s or "").split())
def good(u,provider):
 p=urlparse(u)
 return p.scheme=="https" and p.hostname in (SITES[provider],SITES[provider].removeprefix("www."))
def row(provider,record_type,home="",away="",**kw):
 o=dict.fromkeys(COLUMNS,"");o.update(source=provider,record_type=record_type,home_name=norm(home),away_name=norm(away));o.update(kw);return o
class Grab:
 def __init__(self,p):
  self.p=p;self.session=requests.Session();self.session.headers.update({"User-Agent":UA,"Accept-Language":"en-US,en;q=0.9"})
  self.attempts=[];self.last=0
 def get(self,src,url,allow_local=False):
  u=urlparse(url)
  if not(allow_local and u.hostname=="127.0.0.1") and not good(url,src):raise ValueError("DISALLOWED_HOST")
  if self.last:time.sleep(max(0,1.35-(time.monotonic()-self.last)))
  self.last=time.monotonic();a={"source":src,"url":url,"attempt_utc":now()};self.attempts.append(a)
  try:
   response=self.session.get(url,timeout=23,allow_redirects=True)
   a["http_code"]=response.status_code
   if not(allow_local and urlparse(response.url).hostname=="127.0.0.1") and not good(response.url,src):raise ValueError("INVALID_REDIRECT")
   response.raise_for_status()
   b=response.content
   if len(b)>4000000:raise ValueError("PAGE_OVER_4_MB")
   if len(b)<35000 and re.search(rb"(?i)captcha|access denied|just a moment|cloudflare challenge",b[:7000]):raise ValueError("ACCESS_CHALLENGE")
   digest=hashlib.sha256(b).hexdigest();ext=".json" if allow_local else ".html"
   path=self.p/"raw"/src/(digest+ext);path.parent.mkdir(parents=True,exist_ok=True)
   if not path.exists():path.write_bytes(b)
   a.update(status="OK",sha256=digest,raw_file=str(path.relative_to(self.p)),bytes=len(b),captured_utc=now())
   return b.decode(response.encoding or "utf-8","replace"),a
  except Exception as e:
   a.update(status="BLOCKED" if a.get("http_code") in (401,403,429) else "ERROR",error=f"{type(e).__name__}: {str(e)[:180]}")
   return None,a
def betclan(g,max_details=500):
 src="betclan";pages=["https://www.betclan.com/todays-football-predictions/","https://www.betclan.com/tomorrows-football-predictions/","https://www.betclan.com/future-football-predictions/"]
 pat=re.compile(r"^/predictionsdetails/football/(\d+)/[a-z0-9-]+/?$",re.I);links={};results=[]
 for page in pages:
  html,stamp=g.get(src,page)
  if not html:continue
  soup=BeautifulSoup(html,"html.parser")
  for a in soup.select("a[href]"):
   link=urljoin(page,a["href"]);m=pat.fullmatch(urlparse(link).path)
   if not(m and good(link,src)):continue
   event=m.group(1);text=norm(a.get_text(" ",strip=True))
   mt=re.search(r"(?:\d{1,2}:\d{2}\s+)?(.+?)\s+vs\s+(.+)",text,re.I)
   first=norm(mt.group(1)) if mt else "";second=norm(mt.group(2)) if mt else ""
   if event not in links:links[event]={"url":link,"home":first,"away":second,"listing":page,"source_hash":stamp["sha256"],"captured":stamp["captured_utc"]}
 for event,item in links.items():
  results.append(row(src,"LISTING",item["home"],item["away"],source_event_id=event,source_url=item["url"],listing_url=item["listing"],captured_utc=item["captured"],raw_sha256=item["source_hash"],note="Listing text; parse quality unverified"))
 for event,item in list(links.items())[:max_details]:
  html,stamp=g.get(src,item["url"])
  if not html:continue
  soup=BeautifulSoup(html,"html.parser")
  t=soup.select_one(".teamstop")
  labs=[norm(x) for x in(t.stripped_strings if t else []) if norm(x).lower() not in ("vs","v","-")]
  if len(labs)<2:continue
  date=soup.select_one(".dategamedetailsis")
  dt=re.search(r"20\d{2}-\d{2}-\d{2}\s+\d{1,2}:\d{2}",date.get_text(" ",strip=True) if date else "")
  p=soup.select("div.cell.vote__stats.js-vote-stats-container");hda=["","",""]
  if p:
   body=p[0].get_text(" ",strip=True)
   val=[re.search(r"(?i)\b"+part+r"\s*:?\s*(\d{1,3})\s*%?",body) for part in ("home","draw","away")]
   if all(val):
    nums=[int(x.group(1)) for x in val]
    if all(0<=x<=100 for x in nums) and 98<=sum(nums)<=102:hda=nums
  score=""
  if len(p)>=4:
   mm=re.search(r"\b(\d{1,2})\s*-\s*(\d{1,2})\b",p[3].get_text(" ",strip=True))
   if mm:score=f"{mm.group(1)}-{mm.group(2)}"
  results.append(row(src,"DETAIL",labs[0],labs[-1],source_event_id=event,source_url=item["url"],listing_url=item["listing"],kickoff_source_text=dt.group(0) if dt else "",prob_home=hda[0],prob_draw=hda[1],prob_away=hda[2],predicted_score=score,captured_utc=stamp["captured_utc"],raw_sha256=stamp["sha256"],note="No fixture identity verification"))
 return results,{"listing_ids":len(links),"detail_budget":max_details}

def sporty(g,max_details=90,max_pages=40):
 src="sportytrader";urls=["https://www.sportytrader.com/en/betting-tips/football/today/","https://www.sportytrader.com/en/betting-tips/football/tomorrow/","https://www.sportytrader.com/en/betting-tips/football/1x2/"]
 detail_pat=re.compile(r"/en/betting-tips/[^/]+-(\d+)/?$",re.I)
 links={};results=[];visited=set();queue=list(urls)
 while queue and len(visited)<max_pages+2:
  page=queue.pop(0)
  if page in visited:continue
  visited.add(page);html,stamp=g.get(src,page)
  if not html:continue
  soup=BeautifulSoup(html,"html.parser")
  for a in soup.select("a[href]"):
   link=urljoin(page,a["href"])
   if not good(link,src):continue
   m=detail_pat.search(urlparse(link).path);text=norm(a.get_text(" ",strip=True))
   if m:
    match=re.match(r"(.+?)\s+vs\s+(.+?)\s+Prediction\s*$",text,re.I)
    if match and m.group(1) not in links:links[m.group(1)]=(link,norm(match.group(1)),norm(match.group(2)),page,stamp)
   # navigate only verified internal 1x2 page links or explicit next controls, avoid looping whole site
   if "1x2" in page and ("1x2" in link or re.search(r"(?i)next|[›»]",text)) and link not in visited and link not in queue and ("1x2" in urlparse(link).path or "page=" in link):
    if len(queue)<max_pages:queue.append(link)
  if "1x2" in page:
   for s in soup.find_all(string=re.compile(r"Probability of\s*\d+(?:\.\d+)?\s*%",re.I)):
    val=re.search(r"Probability of\s*(\d+(?:\.\d+)?)\s*%",str(s),re.I)
    if not val:continue
    cur=s.parent;names=[]
    for _ in range(7):
     if cur is None or cur.name in ("html","body"):break
     names=list(dict.fromkeys(norm(i.get("alt","")) for i in cur.select("img[alt]") if norm(i.get("alt"))))
     if len(names)==2:break
     cur=cur.parent
    if len(names)!=2:continue
    results.append(row(src,"MODEL_SINGLE_OUTCOME",*names,single_outcome_prob_pct=val.group(1),source_url=page,listing_url=page,captured_utc=stamp["captured_utc"],raw_sha256=stamp["sha256"],note="Single displayed outcome chance; never HDA triple"))
 for id,(link,h,a,page,stamp) in links.items():
  results.append(row(src,"EDITORIAL_LISTING",h,a,source_event_id=id,source_url=link,listing_url=page,captured_utc=stamp["captured_utc"],raw_sha256=stamp["sha256"]))
 for id,(link,h,a,page,oldstamp) in list(links.items())[:max_details]:
  html,stamp=g.get(src,link)
  if not html:continue
  soup=BeautifulSoup(html,"html.parser");txt=soup.get_text(" ",strip=True)
  p=re.search(r"Probabilities according to our algorithm",txt,re.I)
  nums=["","",""]
  if p:
   section=txt[p.end():p.end()+1100]
   vs=[float(x) for x in re.findall(r"(?<![\d.])(\d+(?:\.\d+)?)\s*%",section)[:3]]
   if len(vs)==3 and 99<=sum(vs)<=101 and "draw" in section.lower():nums=vs
  kickoff=re.search(r"\b\d{1,2}/\d{1,2}/20\d{2}\s+\d{1,2}:\d{2}\b",txt[:500])
  results.append(row(src,"EDITORIAL_DETAIL",h,a,source_event_id=id,source_url=link,listing_url=page,kickoff_source_text=kickoff.group(0) if kickoff else "",prob_home=nums[0],prob_draw=nums[1],prob_away=nums[2],captured_utc=stamp["captured_utc"],raw_sha256=stamp["sha256"],note="HDA only if algorithm triple is complete"))
 return results,{"pages_attempted":len(visited),"editorial_ids":len(links),"detail_budget":max_details}

def forebet(g):
 src="forebet";pages=["https://www.forebet.com/en/football-tips-and-predictions-for-today","https://www.forebet.com/en/football-tips-and-predictions-for-tomorrow"];out=[]
 for page in pages:
  html,stamp=g.get(src,page)
  if not html:continue
  soup=BeautifulSoup(html,"html.parser")
  for home in soup.select(".homeTeam"):
   parent=home.parent;box=None
   for _ in range(10):
    if parent is None or parent.name in ("body","html"):break
    if len(parent.select(".homeTeam"))==1 and len(parent.select(".awayTeam"))==1 and parent.select_one(".date_bah"):
     box=parent;break
    parent=parent.parent
   if not box:continue
   def tt(s):return norm(box.select_one(s).get_text(" ",strip=True)) if box.select_one(s) else ""
   home=tt(".homeTeam");away=tt(".awayTeam");date=tt(".date_bah");league=tt(".shortTag")
   if not home or not away:continue
   cells=box.select(".fprc span");probs=[int(re.search(r"\d+",norm(c.get_text())).group(0)) for c in cells[:3] if re.search(r"\d+",norm(c.get_text()))]
   if len(probs)!=3 or not 98<=sum(probs)<=102:probs=["","",""]
   score=tt(".ex_sc");avg=tt(".avg_sc")
   out.append(row(src,"LISTING",home,away,competition=league,kickoff_source_text=date,prob_home=probs[0],prob_draw=probs[1],prob_away=probs[2],predicted_score=score,average_goals=avg,source_url=page,listing_url=page,captured_utc=stamp["captured_utc"],raw_sha256=stamp["sha256"]))
 return out,{"pages_attempted":2}

def flashscore(g):
 src="flashscore";url="http://127.0.0.1:8000/matches?sport=football";html,stamp=g.get(src,url,True)
 rows=[]
 if html:
  doc=json.loads(html);comps=doc.get("competitions",[])
  if isinstance(comps,dict):comps=list(comps.values())
  for c in comps:
   competition=c.get("competition") or {}
   for m in c.get("matches",[]):
    h,a=m.get("home") or {},m.get("away") or {}
    if not (m.get("id") and h.get("name") and a.get("name")):continue
    rows.append(row(src,"MATCH_API",h["name"],a["name"],source_event_id=m["id"],home_id=h.get("id",""),away_id=a.get("id",""),competition=competition.get("name",""),kickoff_source_text=m.get("start_time",""),source_timezone="UTC" if str(m.get("start_time","")).endswith("Z") else "",source_url=m.get("link",""),listing_url=url,captured_utc=stamp["captured_utc"],raw_sha256=stamp["sha256"]))
 return rows,{"api_attempted":True}

def main():
 ap=argparse.ArgumentParser();ap.add_argument("source",choices=["betclan","sportytrader","forebet","flashscore"]);ap.add_argument("--out",default="capture-output");args=ap.parse_args()
 root=Path(args.out);root.mkdir(exist_ok=True,parents=True);g=Grab(root)
 try:
  if args.source=="betclan":rows,stat=betclan(g)
  elif args.source=="sportytrader":rows,stat=sporty(g)
  elif args.source=="forebet":rows,stat=forebet(g)
  else:rows,stat=flashscore(g)
 except Exception as e:rows=[];stat={"failed":type(e).__name__+": "+str(e)}
 # Dedup only within dataset and event/fixture identity; keep distinct kind
 seen={};conflicts=[]
 for r in rows:
  key=(r["source"],r["record_type"],r["source_event_id"] or (r["home_name"],r["away_name"],r["kickoff_source_text"]))
  if key not in seen:seen[key]=r
  elif (r["home_name"],r["away_name"])!=(seen[key]["home_name"],seen[key]["away_name"]):conflicts.append(str(key))
 rows=[r for k,r in seen.items() if str(k) not in conflicts]
 with (root/"captured_rows.csv").open("w",newline="",encoding="utf-8-sig") as f:
  w=csv.DictWriter(f,fieldnames=COLUMNS);w.writeheader();w.writerows(rows)
 names=sorted({n for r in rows for n in [r["home_name"],r["away_name"]] if n},key=str.casefold)
 with (root/"source_team_names.csv").open("w",newline="",encoding="utf-8-sig") as f:
  w=csv.writer(f);w.writerow(["provider","source_team_name"]);w.writerows((args.source,n) for n in names)
 status={"source":args.source,"attempts":g.attempts,"rows":len(rows),"distinct_teams":len(names),"with_event_id":sum(bool(r["source_event_id"]) for r in rows),"full_hda":sum(all(str(r[k]) for k in ("prob_home","prob_draw","prob_away")) for r in rows),"raw_responses":len(list((root/"raw").rglob("*.*"))) if (root/"raw").exists() else 0,"collisions":conflicts,"source_specific_stats":stat,"complete_provider_coverage":False,"identity_verified":False,"production_writes":False,"utc":now()}
 (root/"manifest.json").write_text(json.dumps(status,ensure_ascii=False,indent=2))
 with (root/"SHA256SUMS.txt").open("w") as f:
  for path in sorted(x for x in root.rglob("*") if x.is_file() and x.name!="SHA256SUMS.txt"):
   f.write(hashlib.sha256(path.read_bytes()).hexdigest()+"  "+path.relative_to(root).as_posix()+"\n")
 print(json.dumps({k:status[k] for k in ("source","rows","distinct_teams","with_event_id","full_hda","raw_responses")},indent=2))
if __name__=="__main__":main()
