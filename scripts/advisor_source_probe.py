#!/usr/bin/env python3
"""One-shot, read-only public advisor access/HTML-shape audit.

No Cloudflare/robot bypass, proxy, clearance solver, credentials, or DB writes.
No cron; verifies usability from the SAME GitHub cloud where Forebet failed.
"""
import json
import re
from datetime import datetime, timezone
from html.parser import HTMLParser
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from pathlib import Path
from urllib.parse import urljoin, urlparse

SOURCES = {
    "BETCLAN": "https://www.betclan.com/todays-football-predictions/",
    "PREDICTZ": "https://www.predictz.com/predictions/",
}
HEADERS = {"User-Agent": "FastTracker personal football data feasibility audit/1.0 (one-shot)"}
MAX_BYTES = 3_000_000
LIMIT_SECONDS = 18

class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
    def handle_starttag(self, tag, attrs):
        if tag == "a":
            for k,v in attrs:
                if k=="href" and v: self.links.append(v)

def get(url):
    req=Request(url,headers=HEADERS)
    with urlopen(req,timeout=LIMIT_SECONDS) as res:
        code=res.status
        content=res.read(MAX_BYTES+1)
        mime=res.headers.get("Content-Type","")
    if len(content)>MAX_BYTES:
        raise ValueError("TOO_LARGE")
    if "html" not in mime.lower():
        raise ValueError("UNEXPECTED_CONTENT_TYPE")
    return code,content.decode("utf-8","replace")

def investigate(source,url):
    result = {"source":source,"url":url,"retrieved_at":datetime.now(timezone.utc).isoformat(),
              "accessible":False,"parsed_examples":0,"status":None,"block_reason":None,
              "discovered_detail_links":0,"structured_probabilities":False,
              "predicted_score":False,"safe_to_schedule":False}
    try:
        code,html=get(url)
        result["status"]=code
        lo=html.lower()
        if any(w in lo[:8000] for w in ("just a moment", "access denied", "captcha", "verify you are human")):
            result["block_reason"]="ACCESS_CHALLENGE"
            return result
        parser=Links()
        parser.feed(html)
        if source=="BETCLAN":
            links=[urljoin(url,x) for x in parser.links]
            matches=sorted({x for x in links if urlparse(x).netloc in ("betclan.com","www.betclan.com")
                           and "/predictionsdetails/football/" in urlparse(x).path})
            result["discovered_detail_links"]=len(matches)
            if matches:
                try:
                    # One detail page only; never loop over entire football schedule.
                    c,detail=get(matches[0])
                    result["detail_status"]=c
                    lower=detail.lower()
                    result["structured_probabilities"]=("vote__stats" in lower or "win probability" in lower or "winner" in lower and "draw" in lower)
                    result["predicted_score"]=("correct score" in lower)
                    result["sample_detail_url"]=matches[0]
                except (HTTPError,URLError,ValueError) as exc:
                    result["detail_error"]=str(exc)[:180]
            result["parsed_examples"]=int(len(matches)>0 and result["structured_probabilities"])
        else:
            result["discovered_detail_links"]=len([x for x in parser.links if "/predictions/" in x])
            result["structured_probabilities"]="ptcnt" in lo or "ptpredbox" in lo
            result["predicted_score"]=bool(re.search(r"\b(?:Home|Away|Draw)\s+\d{1,2}\s*[-–]\s*\d{1,2}\b",html))
            result["parsed_examples"]=int(result["structured_probabilities"] and result["predicted_score"])
        result["accessible"]=code==200
        # One healthy page is only feasibility, not complete verified data ingest.
        result["safe_to_schedule"]=False
        if result["parsed_examples"]==0:result["block_reason"]="UNPROVEN_EXTRACTOR_SHAPE"
    except HTTPError as exc:
        result["status"]=exc.code
        result["block_reason"]="HTTP_"+str(exc.code)
    except (URLError,TimeoutError,OSError,ValueError) as exc:
        result["block_reason"]=type(exc).__name__+":"+str(exc)[:100]
    return result

def main():
    out=[investigate(key,url) for key,url in SOURCES.items()]
    Path("advisor-probe-results.json").write_text(json.dumps(out,indent=2)+"\n",encoding="utf-8")
    print("ADVISOR_PROBE_RESULTS",json.dumps(out,ensure_ascii=False))
    # Don't conflate HTTP 200 with usable predictions; status is diagnostic.
    return 0
if __name__=="__main__":
    raise SystemExit(main())
