import asyncio
import os
import threading
import time
from datetime import datetime, timedelta, timezone

import httpx
from flask import Flask, jsonify
from playwright.async_api import async_playwright

FLASH_URL = os.getenv("FLASH_URL", "https://www.flashscore.co.uk/")
ODDS_URL = os.getenv("ODDS_URL", "https://global.ds.lsapp.eu/odds/pq_graphql")
BOOKMAKER_ID = int(os.getenv("BOOKMAKER_ID", "16"))
REFRESH_SECONDS = max(300, int(os.getenv("REFRESH_SECONDS", "900")))
DAYS_AHEAD = max(0, min(3, int(os.getenv("DAYS_AHEAD", "2"))))
MAX_FIXTURES = max(10, min(600, int(os.getenv("MAX_FIXTURES", "360"))))
ODDS_CONCURRENCY = max(1, min(16, int(os.getenv("ODDS_CONCURRENCY", "6"))))

app = Flask(__name__)
_lock = threading.Lock()
_state = {
    "refreshing": False,
    "last_started_at": None,
    "last_completed_at": None,
    "last_error": None,
    "fixtures_seen": 0,
    "complete_hda": 0,
    "snapshot": [],
    "discovered": [],
}

def utcnow():
    return datetime.now(timezone.utc).isoformat()

def is_virtual(league, home, away):
    text = " ".join([league or "", home or "", away or ""]).lower()
    banned = ("esoccer", "e-soccer", "e soccer", "virtual", "simulated", "cyber")
    return any(x in text for x in banned)

def as_price(value):
    try:
        n = float(value)
        return n if n > 1 else None
    except (TypeError, ValueError):
        return None

async def collect_fixture_rows(page, target_date):
    await page.goto(FLASH_URL, timeout=60000, wait_until="domcontentloaded")
    try:
        await page.locator("#onetrust-accept-btn-handler").click(timeout=2500)
    except Exception:
        pass

    today = datetime.now().date()
    delta = (target_date - today).days
    if delta:
        selector = '[data-day-picker-arrow="next"]' if delta > 0 else '[data-day-picker-arrow="prev"]'
        for _ in range(abs(delta)):
            await page.locator(selector).click(timeout=10000)
            await page.wait_for_timeout(600)

    try:
        await page.wait_for_selector(".event__match", timeout=20000)
    except Exception:
        return []

    rows = await page.locator(".event__match").count()
    headers = await page.locator('[data-testid="wcl-headerLeague"]').count()
    print(f"[flashscore-odds] discovery date={target_date.isoformat()} url={page.url} rows={rows} headers={headers}", flush=True)
    return await page.locator(".event__match").evaluate_all(
        """(rows) => rows.map((row) => {
          const txt = (el) => el ? (el.textContent || '').trim() : '';
          let h = row.previousElementSibling;
          while (h && !h.querySelector('[data-testid="wcl-headerLeague"]') && !h.classList.contains('headerLeague__wrapper')) {
            h = h.previousElementSibling;
          }
          const leagueNode = h ? (h.querySelector('[data-testid="wcl-headerLeague"]') || h) : null;
          const homeNode = row.querySelector('.event__homeParticipant, .event__participant--home, [data-testid="wcl-participantHome"]');
          const awayNode = row.querySelector('.event__awayParticipant, .event__participant--away, [data-testid="wcl-participantAway"]');
          const timeNode = row.querySelector('.event__time, [data-testid="wcl-eventTime"]');
          return {
            event_id: (row.id || '').split('_').pop() || null,
            league: txt(leagueNode),
            home: txt(homeNode),
            away: txt(awayNode),
            time_text: txt(timeNode),
            raw_text: txt(row)
          };
        }).filter(x => x.event_id)"""
    )

async def fetch_bet365_hda(client, sem, fixture):
    event_id = fixture["event_id"]
    url = f"{ODDS_URL}?_hash=oce&eventId={event_id}&projectId=5&geoIpCode=US&geoIpSubdivisionCode=USCA"
    async with sem:
        try:
            r = await client.get(url, timeout=25)
            r.raise_for_status()
            data = r.json()
        except Exception:
            return None

    entries = (((data or {}).get("data") or {}).get("findOddsByEventId") or {}).get("odds") or []
    candidates = [
        x for x in entries
        if x.get("bookmakerId") == BOOKMAKER_ID
        and x.get("bettingType") == "HOME_DRAW_AWAY"
        and (x.get("bettingScope") in (None, "FULL_TIME"))
    ]
    if not candidates:
        return None

    for entry in candidates:
        items = entry.get("odds") or []
        participant_order = []
        for item in items:
            pid = item.get("eventParticipantId")
            if pid is not None and pid not in participant_order:
                participant_order.append(pid)

        home = draw = away = None
        for item in items:
            if item.get("active") is False:
                continue
            price = as_price(item.get("value"))
            if price is None:
                continue
            pid = item.get("eventParticipantId")
            if pid is None:
                draw = price
            elif len(participant_order) >= 2 and pid == participant_order[0]:
                home = price
            elif len(participant_order) >= 2 and pid == participant_order[1]:
                away = price

        if home and draw and away:
            return {
                "home": home,
                "draw": draw,
                "away": away,
                "opening_home": next((as_price(i.get("opening")) for i in items if i.get("eventParticipantId") == participant_order[0]), None) if len(participant_order) >= 2 else None,
                "opening_draw": next((as_price(i.get("opening")) for i in items if i.get("eventParticipantId") is None), None),
                "opening_away": next((as_price(i.get("opening")) for i in items if i.get("eventParticipantId") == participant_order[1]), None) if len(participant_order) >= 2 else None,
            }
    return None

async def refresh_once():
    fixtures = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/137 Safari/537.36"
        )
        page = await context.new_page()
        try:
            today = datetime.now().date()
            seen = set()
            for offset in range(DAYS_AHEAD + 1):
                rows = await collect_fixture_rows(page, today + timedelta(days=offset))
                for row in rows:
                    if row["event_id"] in seen:
                        continue
                    seen.add(row["event_id"])
                    row["date"] = (today + timedelta(days=offset)).isoformat()
                    if not row.get("home") or not row.get("away"):
                        continue
                    if is_virtual(row.get("league"), row.get("home"), row.get("away")):
                        continue
                    fixtures.append(row)
                    if len(fixtures) >= MAX_FIXTURES:
                        break
                if len(fixtures) >= MAX_FIXTURES:
                    break
        finally:
            await browser.close()

    sem = asyncio.Semaphore(ODDS_CONCURRENCY)
    headers = {
        "accept": "application/json",
        "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/137 Safari/537.36",
        "referer": "https://www.flashscore.co.uk/",
    }
    async with httpx.AsyncClient(headers=headers, follow_redirects=True) as client:
        odds = await asyncio.gather(*(fetch_bet365_hda(client, sem, f) for f in fixtures))

    captured_at = utcnow()
    out = []
    for fixture, hda in zip(fixtures, odds):
        if not hda:
            continue
        out.append({
            "source": "FLASHSCORE_BET365",
            "bookmaker": "bet365",
            "provider_event_id": fixture["event_id"],
            "competition": fixture.get("league") or None,
            "home": fixture["home"],
            "away": fixture["away"],
            "fixture_date": fixture["date"],
            "time_text": fixture.get("time_text") or None,
            "captured_at": captured_at,
            "hda": hda,
        })
    return fixtures, out

def run_refresh():
    with _lock:
        if _state["refreshing"]:
            return
        _state["refreshing"] = True
        _state["last_started_at"] = utcnow()
        _state["last_error"] = None
    try:
        fixtures = snapshot = None
        last_refresh_error = None
        for attempt in range(2):
            try:
                fixtures, snapshot = asyncio.run(refresh_once())
                break
            except Exception as exc:
                last_refresh_error = exc
                if attempt == 0:
                    print(f"[flashscore-odds] refresh attempt 1 failed {type(exc).__name__}: {exc}; retrying once", flush=True)
                    time.sleep(2)
        if fixtures is None or snapshot is None:
            raise last_refresh_error or RuntimeError("refresh_failed_without_result")
        completed_at = utcnow()
        discovered = [{
            "source": "FLASHSCORE",
            "provider_event_id": fixture["event_id"],
            "competition": fixture.get("league") or None,
            "home": fixture["home"],
            "away": fixture["away"],
            "fixture_date": fixture["date"],
            "time_text": fixture.get("time_text") or None,
            "captured_at": completed_at,
        } for fixture in fixtures]
        with _lock:
            _state["fixtures_seen"] = len(fixtures)
            _state["complete_hda"] = len(snapshot)
            _state["snapshot"] = snapshot
            _state["discovered"] = discovered
            _state["last_completed_at"] = completed_at
        print(f"[flashscore-odds] refresh complete fixtures_seen={len(fixtures)} complete_hda={len(snapshot)}", flush=True)
    except Exception as e:
        message = f"{type(e).__name__}: {e}"
        with _lock:
            _state["last_error"] = message
        print(f"[flashscore-odds] refresh failed {message}", flush=True)
    finally:
        with _lock:
            _state["refreshing"] = False

def loop():
    while True:
        run_refresh()
        time.sleep(REFRESH_SECONDS)

@app.get("/health")
def health():
    with _lock:
        return jsonify({
            "ok": _state["last_error"] is None,
            "source": "FLASHSCORE_BET365",
            "refreshing": _state["refreshing"],
            "last_started_at": _state["last_started_at"],
            "last_completed_at": _state["last_completed_at"],
            "last_error": _state["last_error"],
            "fixtures_seen": _state["fixtures_seen"],
            "complete_hda": _state["complete_hda"],
            "discovered_count": len(_state["discovered"]),
        })

@app.get("/snapshot")
def snapshot():
    with _lock:
        return jsonify({
            "source": "FLASHSCORE_BET365",
            "captured_at": _state["last_completed_at"],
            "count": len(_state["snapshot"]),
            "fixtures": list(_state["snapshot"]),
            "discovered_count": len(_state["discovered"]),
            "discovered": list(_state["discovered"]),
        })

@app.post("/refresh")
def refresh():
    with _lock:
        busy = _state["refreshing"]
    if not busy:
        threading.Thread(target=run_refresh, daemon=True).start()
    return jsonify({"accepted": not busy, "refreshing": True}), 202

threading.Thread(target=loop, daemon=True).start()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "8080")))
