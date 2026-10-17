"""Restore bounded exact-provider quote selection hints after a Railway restart.

One read of the existing *public* canonical Supabase feed on cold start only,
never an odds-provider request. The current source quote capture time, not the
API response time, determines eligibility. Fail closed on absent/stale fields.
No odds values are published or modified by this helper; only fixture IDs.
"""
from __future__ import annotations

import json
import math
import re
from datetime import datetime, timedelta, timezone
from urllib.request import Request, urlopen

SOURCE_URL = ("https://hekqxhgjexzxnecwhyao.supabase.co"
              "/functions/v1/app-phase1-feed?view=compact&hours=48")
MAX_BYTES = 2_000_000
MAX_MATCHES = 800
MAX_IDS = 360
ID_RE = re.compile(r"^FS:([A-Za-z0-9_-]{5,32})$")


def _aware(value):
    if not isinstance(value, str):
        return None
    try:
        stamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return stamp.astimezone(timezone.utc) if stamp.tzinfo else None
    except (ValueError, OverflowError):
        return None


def valid_quote_ids(data, now=None):
    """Only recent, actual Bet365-labelled reference quotes, never guessed IDs."""
    now = now or datetime.now(timezone.utc)
    if not isinstance(data, dict) or data.get("source") != "flashscore-single-rpc-canonical":
        return set()
    rows = data.get("matches")
    if not isinstance(rows, list) or len(rows) > MAX_MATCHES:
        return set()
    received = _aware(data.get("generatedAt"))
    if received is None or not now-timedelta(minutes=30) <= received <= now+timedelta(minutes=1):
        return set()
    valid = set()
    rejected_duplicates = set()
    for row in rows:
        if not isinstance(row, dict):
            continue
        match = ID_RE.fullmatch(str(row.get("id") or ""))
        if not match or row.get("oddsLabel") != "Bookmaker reference":
            continue
        if (row.get("sourceContext") or {}).get("source") != "FLASHSCORE":
            continue
        event = match.group(1)
        if event in valid:
            valid.discard(event)
            rejected_duplicates.add(event)
            continue
        if event in rejected_duplicates:
            continue
        price = row.get("odds")
        if not isinstance(price, dict):
            continue
        values = [price.get(k) for k in ("home","draw","away")]
        if any(type(x) not in (int,float) or not math.isfinite(x) or
               not 1.01 <= x <= 100 for x in values):
            continue
        captured = _aware(row.get("oddsCapturedAt"))
        kickoff = _aware(row.get("kickoff"))
        if (captured is None or kickoff is None or kickoff <= now
            or kickoff > now+timedelta(hours=48)
            or captured > now+timedelta(minutes=1)
            or captured < now-timedelta(minutes=90)
            or captured >= kickoff):
            continue
        valid.add(event)
        if len(valid) > MAX_IDS:
            return set()
    return valid


def load_verified_quote_hints():
    """Best effort ONE bounded first-boot read; callers handle any failure."""
    request = Request(SOURCE_URL,headers={
        "Accept":"application/json","User-Agent":"FastTrackerOddsQuoteHints/1.0"
    })
    with urlopen(request,timeout=8) as response:
        if response.status != 200:
            return set()
        payload=response.read(MAX_BYTES+1)
    if len(payload)>MAX_BYTES:
        return set()
    return valid_quote_ids(json.loads(payload))
