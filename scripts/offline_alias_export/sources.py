"""Read public CC0 football identity sources once, with bounded downloads."""
import json,re,unicodedata
from pathlib import Path
from urllib.request import Request,urlopen
from concurrent.futures import ThreadPoolExecutor

ROOT=Path(__file__).resolve().parents[2]
def norm(s):
 s=unicodedata.normalize("NFKD",str(s).lower())
 return "".join(c for c in s if c.isalnum() and not unicodedata.combining(c))
def fetch(url):
 with urlopen(Request(url,headers={"User-Agent":"FastTracker-one-time-public-CC0-alias-export"}),timeout=25) as r:
  data=r.read(1200001)
 if len(data)>1200000:raise RuntimeError("TOO_LARGE")
 return data.decode("utf-8-sig","replace")
def load_reep():
 files=sorted((ROOT/"ops/reep-full-20261011").glob("chunk_*.json"))
 if len(files)!=24:raise RuntimeError("24 Reep chunks required")
 rows=[item for f in files for item in json.loads(f.read_text(encoding="utf-8"))]
 if len(rows)!=47407:raise RuntimeError("REEP_SNAPSHOT_INCOMPLETE")
 return rows
def parse_clubs(path,body):
 rows=[];root=None
 for line in body.splitlines():
  s=line.strip()
  if not s or s.startswith("#"):continue
  if s.startswith("="):root=None;continue
  if line[:1].isspace() and s.startswith("|"):
   if root:
    for field in s[1:].split("|"):
     name=re.sub(r"\s*\[[a-z]{2,3}\]$","",field.split("#")[0].strip(),flags=re.I)
     if 1<len(name)<130:rows.append((path,root,name,"ALIAS"))
  elif not line[:1].isspace():
   name=re.split("[,#@]",re.sub(r"^ii\)\s*","",s,flags=re.I),maxsplit=1)[0].strip()
   root=name if 1<len(name)<130 else None
   if root:rows.append((path,root,root,"PRIMARY"))
 return rows
def load_clubs():
 url="https://api.github.com/repos/openfootball/clubs/git/trees/master?recursive=1"
 tree=json.loads(fetch(url))
 paths=sorted(t["path"] for t in tree["tree"] if t["path"].endswith(".clubs.txt")
  and not re.search(r"\.(history|props|lang)\.",t["path"]))
 if len(paths)<80:raise RuntimeError("INCOMPLETE_COUNTRY_INDEX")
 base="https://raw.githubusercontent.com/openfootball/clubs/master/"
 with ThreadPoolExecutor(max_workers=6) as pool:
  bodies=list(pool.map(lambda x:fetch(base+x),paths))
 return paths,sorted(set(row for p,b in zip(paths,bodies) for row in parse_clubs(p,b)))
def load_leagues():
 paths=["2026-27/"+s+".json" for s in
  ("en.1","en.2","de.1","es.1","fr.1","it.1","nl.1","pt.1")]+["2026/br.1.json"]
 out=[]
 for path in paths:
  data=json.loads(fetch("https://raw.githubusercontent.com/openfootball/football.json/master/"+path))
  names=sorted(set(t.strip() for m in data["matches"] for t in
   (m.get("team1"),m.get("team2")) if isinstance(t,str) and t.strip()))
  out.extend({"league":data["name"],"league_file":path,"team_name":n} for n in names)
 return out
