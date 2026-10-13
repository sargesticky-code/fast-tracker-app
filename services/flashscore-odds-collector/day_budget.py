"""Fixed-size, priority-aware allocation for the existing Flashscore odds collector.

Selection changes WHICH fixtures receive the same bounded number of requests.
No extra odds calls, days, workers, or retries are introduced.
"""
import re
from datetime import datetime, timezone
from zoneinfo import ZoneInfo


def collector_calendar_date(now_utc=None):
    """Use the Flashscore UK fixture-day calendar, including BST/GMT changes."""
    at = now_utc if now_utc is not None else datetime.now(timezone.utc)
    if at.tzinfo is None:
        raise ValueError("COLLECTOR_CALENDAR_REQUIRES_AWARE_UTC_TIME")
    return at.astimezone(ZoneInfo("Europe/London")).date()



def day_plan(days_ahead, capacity):
    if capacity < 10:
        raise ValueError("BOOKMAKER_CAPACITY_TOO_SMALL")
    count = 2 if days_ahead >= 1 else 1
    if count == 1:
        return [(0, capacity)]
    today = max(1, capacity // 3)
    return [(0, today), (1, capacity - today)]


_COUNTRIES = (
    "ENGLAND", "SPAIN", "GERMANY", "ITALY", "FRANCE", "EUROPE", "NETHERLANDS",
    "PORTUGAL", "SCOTLAND", "JAMAICA", "AUSTRALIA", "UNITED STATES", "USA",
    "BRAZIL", "ARGENTINA", "SAUDI ARABIA", "TURKEY", "BELGIUM", "AFRICA",
    "ASIA", "WORLD", "CHINA", "INDIA", "JAPAN", "SOUTH KOREA", "MEXICO",
)


def league_priority(value):
    """Explicit competition + country match, not substring promotion.

    E.g. Premier League Jamaica is NOT the English Premier League;
    AFC Champions League is NOT UEFA Champions League.
    """
    league = re.sub(
        r":\s*(?:Live Standings|Standings|Draw|Results|Fixtures)\s*$", "",
        str(value or "").strip(), flags=re.I,
    ).upper().strip()
    country = ""
    for suffix in sorted(_COUNTRIES, key=len, reverse=True):
        if league.endswith(suffix) and len(league) > len(suffix):
            country = suffix
            league = league[:-len(suffix)].strip()
            break
    league = re.sub(r"[._-]+", " ", league)
    league = re.sub(r"\s+", " ", league).strip()
    if league in ("PREMIER LEAGUE", "ENGLISH PREMIER LEAGUE") and country == "ENGLAND":
        return 0
    if league in ("LA LIGA", "LALIGA", "PRIMERA DIVISION", "LA LIGA EA SPORTS") and country == "SPAIN":
        return 1
    if league == "BUNDESLIGA" and country == "GERMANY":
        return 2
    if league == "SERIE A" and country == "ITALY":
        return 3
    if league in ("LIGUE 1", "LIGUE 1 MCDONALDS", "LIGUE 1 UBER EATS") and country == "FRANCE":
        return 4
    if ("CHAMPIONS LEAGUE" in league and
            not any(x in league for x in ("YOUTH", "WOMEN", "U17", "U19", "U21", "AFC")) and
            country in ("", "EUROPE") and
            (league == "CHAMPIONS LEAGUE" or league == "UEFA CHAMPIONS LEAGUE"
             or league.startswith("CHAMPIONS LEAGUE LEAGUE PHASE"))):
        return 5
    if league in ("EUROPA LEAGUE", "UEFA EUROPA LEAGUE") and country in ("", "EUROPE"):
        return 6
    if league in ("CONFERENCE LEAGUE", "UEFA CONFERENCE LEAGUE") and country in ("", "EUROPE"):
        return 7
    if league == "EREDIVISIE" and country == "NETHERLANDS":
        return 8
    if league in ("PRIMEIRA LIGA", "LIGA PORTUGAL") and country == "PORTUGAL":
        return 9
    if league == "CHAMPIONSHIP" and country == "ENGLAND":
        return 10
    return 100


_FINAL_STATUS = re.compile(
    r"^(?:FT|FULL.?TIME|FINISHED|AET|AFTER PEN(?:ALTIES)?|"
    r"CANCELLED|POSTPONED|ABANDONED|WALKOVER)$", re.I,
)
_CLOCK = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")
_IN_PLAY = re.compile(r"^(?:(?:\d{1,3})(?:\+\d{1,2})?'|HT|HALF.?TIME|1ST HALF|2ND HALF)$", re.I)


def _sort_key(item, previous_priced=frozenset(), previous_unpriced=frozenset()):
    league = str(item.get("league") or "").strip()
    time = str(item.get("time_text") or "").strip()
    # Finished/cancelled matches should never displace unplayed fixtures.
    ended = bool(_FINAL_STATUS.fullmatch(time))
    status_rank = 0 if _IN_PLAY.fullmatch(time) else (1 if _CLOCK.fullmatch(time) else 2)
    kickoff = time if _CLOCK.fullmatch(time) else "99:99"
    event_id = str(item.get("event_id") or "")
    # Preserve real, previously complete markets first within each priority
    # level. Give never-checked events a turn before repeating source gaps.
    # A prior gap is not permanent exclusion: all eligible fixtures remain
    # selectable when quota is available or the next snapshot rotates.
    observed_rank = (0 if event_id in previous_priced
                     else 2 if event_id in previous_unpriced else 1)
    return (int(ended), league_priority(league), observed_rank,
            league.casefold(), status_rank, kickoff)


def allocate(rows, limit, seen, date, is_virtual, *,
             previous_priced=(), previous_unpriced=()):
    """Bounded source-aware selection, without new provider requests.

    Hints are exact provider event IDs from the previous completed local
    snapshot only; we never depend on team names or infer provider markets.
    """
    selected = []
    good = set(previous_priced)
    missed = set(previous_unpriced) - good
    for item in sorted(rows, key=lambda row: _sort_key(row, good, missed)):
        event = str(item.get("event_id") or "")
        if not event or event in seen or not item.get("home") or not item.get("away"):
            continue
        if is_virtual(item.get("league"), item.get("home"), item.get("away")):
            continue
        selected.append({**item, "date": date})
        seen.add(event)
        if len(selected) >= limit:
            break
    return selected
