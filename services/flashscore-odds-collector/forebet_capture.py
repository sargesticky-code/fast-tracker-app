"""Bounded Forebet read-only acquisition; never dependent on one-shot Firecrawl.

Only six public listing pages, no per-match browser navigation, pagination or
anti-bot circumvention. All joins are by Forebet source ID, not club name.
Date labels are source-local/unknown timezone and are NOT an official kickoff.
"""
import asyncio
from datetime import datetime, timezone
import re
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

BASE = "https://www.forebet.com"
SURFACES = (
    ("TODAY_1X2", "/en/football-tips-and-predictions-for-today"),
    ("TODAY_OU25", "/en/football-tips-and-predictions-for-today/predictions-under-over-goals"),
    ("TODAY_CORNERS95", "/en/football-tips-and-predictions-for-today/corners"),
    ("TOMORROW_1X2", "/en/football-tips-and-predictions-for-tomorrow"),
    ("TOMORROW_OU25", "/en/football-tips-and-predictions-for-tomorrow/under-over-25-goals"),
    ("TOMORROW_CORNERS95", "/en/football-tips-and-predictions-for-tomorrow/corners"),
)
MATCH_URL = re.compile(r"^https://www[.]forebet[.]com/en/football/matches/[a-z0-9-]+-([0-9]{5,12})$")
SCORE = re.compile(r"^([0-9]{1,2})\s*-\s*([0-9]{1,2})$")
SOURCE_DATE = re.compile(r"^20\d\d-\d\d-\d\d$")
MAX_PAGE_BYTES = 750_000
MAX_ROWS_PER_SURFACE = 400
MAX_UNIQUE_ROWS = 650

def _txt(node):
    return node.get_text(" ", strip=True) if node else ""

def _integer(text):
    try:
        return int(str(text).strip())
    except (TypeError, ValueError):
        return None

def _decimal(text):
    try:
        v = float(str(text).strip())
        return v if v == v and 0 <= v <= 30 else None
    except (TypeError, ValueError):
        return None

def parse_rows(html, market, capture_at):
    if len(html.encode("utf-8")) > MAX_PAGE_BYTES:
        raise ValueError("FOREBET_PAGE_TOO_LARGE")
    soup = BeautifulSoup(html, "html.parser")
    rows = soup.select("div.schema div.rcnt")
    if not rows or len(rows) > MAX_ROWS_PER_SURFACE:
        raise ValueError("FOREBET_LAYOUT_INVALID")
    parsed = {}
    for row in rows:
        link = row.select_one("a.tnmscn[href]")
        if not link:
            continue
        url = link.get("href", "").split("?")[0]
        if url.startswith("/en/football/matches/"):
            url = BASE + url
        match = MATCH_URL.fullmatch(url)
        if not match:
            continue
        source_id = match.group(1)
        home, away = _txt(row.select_one("span.homeTeam")), _txt(row.select_one("span.awayTeam"))
        date_node = row.select_one("time[itemprop=startDate]")
        source_date = date_node.get("datetime", "") if date_node else ""
        if not SOURCE_DATE.fullmatch(source_date) or not (2 <= len(home) <= 140 and 2 <= len(away) <= 140):
            continue
        if home.casefold() == away.casefold():
            continue
        row_data = {
            "source_event_id": source_id,
            "source_url": url,
            "home": home,
            "away": away,
            "source_date": source_date,
            "source_time": _txt(row.select_one("span.date_bah")),
            "league": _txt(row.select_one("span.shortTag"))[:64],
            "captured_at": capture_at,
        }
        probs = [_integer(_txt(node)) for node in row.select("div.fprc > span")]
        predicted_score = _txt(row.select_one("div.ex_sc.tabonly")).replace(" ", "")
        pick = _txt(row.select_one("div.predict span.forepr"))
        avg = _decimal(_txt(row.select_one("div.avg_sc.tabonly")))
        if market == "1X2":
            if (len(probs) < 3 or any(v is None or not 0 <= v <= 100 for v in probs[:3])
                or not 98 <= sum(probs[:3]) <= 102 or pick not in ("1", "X", "2")
                or not SCORE.fullmatch(predicted_score) or avg is None or not 0 < avg <= 12):
                continue
            row_data.update({
                "prob_home": probs[0], "prob_draw": probs[1], "prob_away": probs[2],
                "pick": pick, "predicted_score": predicted_score, "avg_goals": avg,
            })
        elif market == "OU25":
            if (len(probs) < 2 or any(v is None or not 0 <= v <= 100 for v in probs[:2])
                or not 98 <= sum(probs[:2]) <= 102 or pick not in ("Over", "Under")):
                continue
            # Forebet's goals page orders the under/over columns as UNDER then OVER.
            row_data.update({"prob_under25": probs[0], "prob_over25": probs[1],
                             "prediction_ou25": pick, "ou_predicted_score": predicted_score if SCORE.fullmatch(predicted_score) else None})
        elif market == "CORNERS95":
            if (len(probs) < 2 or any(v is None or not 0 <= v <= 100 for v in probs[:2])
                or not 98 <= sum(probs[:2]) <= 102 or pick not in ("Over", "Under")
                or not SCORE.fullmatch(predicted_score) or avg is None):
                continue
            row_data.update({"corner_prob_under95": probs[0], "corner_prob_over95": probs[1],
                             "corner_prediction": pick, "corner_predicted_score": predicted_score,
                             "avg_corners": avg})
        else:
            raise ValueError("FOREBET_MARKET_INVALID")
        if source_id in parsed:
            # One source ID appearing twice on a page is ambiguous, not two events.
            parsed.pop(source_id, None)
            continue
        parsed[source_id] = row_data
    return parsed

def merge_pages(page_rows, capture_at):
    """Keep one source identity and reject cross-surface contradictions."""
    merged, bad = {}, set()
    for _, items in page_rows:
        for key, item in items.items():
            if key in bad:
                continue
            prior = merged.get(key)
            if prior is not None:
                if (prior["source_url"] != item["source_url"] or
                    prior["source_date"] != item["source_date"] or
                    prior["home"].casefold() != item["home"].casefold() or
                    prior["away"].casefold() != item["away"].casefold()):
                    bad.add(key)
                    merged.pop(key, None)
                    continue
                prior.update({k: v for k, v in item.items() if k not in
                             ("source_event_id", "source_url", "source_date",
                              "home", "away", "captured_at", "source_time", "league")})
            else:
                merged[key] = dict(item)
    for k in bad:
        merged.pop(k, None)
    if len(merged) > MAX_UNIQUE_ROWS:
        raise ValueError("FOREBET_SNAPSHOT_TOO_LARGE")
    eligible = [v for v in merged.values() if "prob_home" in v]
    return sorted(eligible, key=lambda r: r["source_event_id"]), len(bad)

async def collect_forebet_listing_snapshot():
    capture_time = datetime.now(timezone.utc).isoformat()
    pages, problems = [], []
    # One request at a time with a small gap; no page expansion or login.
    async with httpx.AsyncClient(
        headers={"User-Agent": "FastTrackerPrivateResearch/1.0 (bounded; six pages max)",
                 "Accept": "text/html"},
        follow_redirects=True,timeout=httpx.Timeout(12.0),
        limits=httpx.Limits(max_connections=1,max_keepalive_connections=1)
    ) as client:
        for label, path in SURFACES:
            market = label.split("_", 1)[1]
            try:
                response = await client.get(BASE + path)
                response.raise_for_status()
                if urlparse(str(response.url)).hostname != "www.forebet.com":
                    raise ValueError("FOREBET_REDIRECT_INVALID")
                if len(response.content) > MAX_PAGE_BYTES:
                    raise ValueError("FOREBET_PAGE_TOO_LARGE")
                parsed = parse_rows(response.text, market, capture_time)
                if len(parsed) < 1:
                    raise ValueError("FOREBET_ZERO_VALID_ROWS")
                pages.append((label, parsed))
            except (httpx.HTTPError, ValueError) as exc:
                problems.append({"surface": label, "reason":type(exc).__name__})
            await asyncio.sleep(0.5)
    merged, conflicts = merge_pages(pages, capture_time)
    succeeded = {name for name, _ in pages}
    # Never turn one failed/blocked partial page into a healthy complete capture.
    ok = ("TODAY_1X2" in succeeded and
          any(k.endswith("OU25") for k in succeeded) and
          any(k.endswith("CORNERS95") for k in succeeded) and
          len(merged) >= 10)
    return {"source":"FOREBET_DIRECT_LISTINGS", "captured_at":capture_time,
            "ok":ok, "rows":merged if ok else [],
            "source_events":len(merged), "conflicting_ids":conflicts,
            "surfaces_successful":sorted(succeeded), "surfaces_failed":problems}
