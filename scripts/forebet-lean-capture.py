#!/usr/bin/env python3
"""Bounded Forebet capture pilot. Read-only, no database writes or access-control bypass.

Uses current-day selectors observed in Alm77ar/Forebet-Scraper (Sep 2026).\nNo access-control clearance tools or per-match requests.
Only captures Forebet 1X2 predictions; odds are deliberately not opened.
Do not schedule until access, source terms, and real coverage are confirmed.
"""
import argparse
import json
import re
import sys
from datetime import date, timedelta, datetime, timezone
from pathlib import Path

BASE = "https://www.forebet.com/en/football-predictions/predictions-1x2/"
SCORE = re.compile(r"^(\d{1,2})\s*-\s*(\d{1,2})$")
DATE = re.compile(r"^\d{1,2}/\d{1,2}/\d{4}\s+\d{1,2}:\d{2}(?:\s*[AaPp][Mm])?$")


def _calendar_valid(value, fmt):
    try:
        datetime.strptime(value, fmt)
        return True
    except ValueError:
        return False


def normalize_row(raw):
    """Require all essential fields; do not guess provider kickoff timezone or fixture ID."""
    match_date = str(raw["date_time"]).strip()
    if not DATE.fullmatch(match_date):
        raise ValueError("INVALID_SOURCE_KICKOFF")
    # Validate real calendar values while preserving uncertain date ordering.
    # A date like 10/11 can mean Oct 11 or Nov 10; never silently swap it.
    valid_formats = [fmt for fmt in ("%m/%d/%Y %I:%M %p", "%d/%m/%Y %H:%M", "%m/%d/%Y %H:%M")
                     if _calendar_valid(match_date, fmt)]
    if not valid_formats:
        raise ValueError("INVALID_CALENDAR_DATE")
    home, away = str(raw["home"]).strip(), str(raw["away"]).strip()
    league = str(raw["league"]).strip()
    if not home or not away or not league or home.casefold() == away.casefold():
        raise ValueError("MISSING_IDENTITY")
    p = [int(str(raw[k]).replace("%", "").strip()) for k in ("prob_home", "prob_draw", "prob_away")]
    if any(v < 0 or v > 100 for v in p) or not 98 <= sum(p) <= 102:
        raise ValueError("INVALID_HDA")
    score = SCORE.fullmatch(str(raw["predicted_score"]).strip())
    if score is None:
        raise ValueError("INVALID_PREDICTED_SCORE")
    avg = float(raw["avg_goals"])
    if not 0 < avg <= 12:
        raise ValueError("INVALID_AVERAGE_GOALS")
    return {
        "source": "FOREBET", "source_competition": league,
        "source_home_team": home, "source_away_team": away,
        "source_kickoff_local_text": match_date,
        "source_kickoff_timezone": None, "source_date_formats_possible": valid_formats,
        "canonical_match_id": None, "identity_status": "UNVERIFIED",
        "prob_home": p[0], "prob_draw": p[1], "prob_away": p[2],
        "predicted_score": f"{int(score.group(1))} - {int(score.group(2))}",
        "avg_goals": avg,
    }


def capture(day, max_rows):
    try:
        from selenium import webdriver
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import WebDriverWait
    except ImportError as exc:
        raise RuntimeError("Install selenium and a compatible Chrome/Chromium driver") from exc

    options = webdriver.ChromeOptions()
    options.add_argument("--headless=new")
    options.add_argument("--window-size=1440,1000")
    driver = webdriver.Chrome(options=options)
    try:
        url = BASE + day.isoformat()
        driver.set_page_load_timeout(30)
        driver.get(url)
        if "403" in driver.title.lower() or "access denied" in driver.page_source.lower():
            raise RuntimeError("FOREBET_ACCESS_DENIED: stop; do not bypass source restrictions")
        try:
            WebDriverWait(driver, 15).until(
                lambda d: len(d.find_elements(By.CSS_SELECTOR, "div.schema div.rcnt")) > 0
            )
        except Exception as exc:
            raise RuntimeError("NO_FOREBET_ROWS: source layout/access unavailable") from exc
        # One optional MORE interaction only; bounded rows and no per-match detail/odds requests.
        more = driver.find_elements(By.CSS_SELECTOR, "#mrows span")
        before_more = len(driver.find_elements(By.CSS_SELECTOR, "div.schema div.rcnt"))
        pagination_state = "NO_MORE_CONTROL"
        if more:
            pagination_state = "MORE_NOT_CONFIRMED"
            try:
                more[0].click()
                WebDriverWait(driver, 8).until(
                    lambda d: len(d.find_elements(By.CSS_SELECTOR, "div.schema div.rcnt")) > before_more
                )
                pagination_state = "ONE_MORE_BATCH_LOADED"
            except Exception:
                # Never describe a timed-out MORE click as complete coverage.
                pagination_state = "MORE_LOAD_UNCONFIRMED"
        visible_rows = driver.find_elements(By.CSS_SELECTOR, "div.schema div.rcnt")
        entries, rejected = [], {}
        for row in visible_rows[:max_rows]:
            try:
                def value(css):
                    return row.find_element(By.CSS_SELECTOR, css).text.strip()
                probs = row.find_elements(By.CSS_SELECTOR, ".fprc span")
                if len(probs) < 3:
                    probs = row.find_elements(By.CSS_SELECTOR, ".fprt")
                if len(probs) < 3:
                    raise ValueError("MISSING_HDA")
                raw = {
                    "league": value(".shortTag"), "home": value(".homeTeam span"),
                    "away": value(".awayTeam span"), "date_time": value(".date_bah"),
                    "prob_home": probs[0].text, "prob_draw": probs[1].text,
                    "prob_away": probs[2].text, "predicted_score": value(".ex_sc"),
                    "avg_goals": value(".avg_sc"),
                }
                entries.append(normalize_row(raw))
            except Exception as exc:
                key = str(exc)[:100]
                rejected[key] = rejected.get(key, 0) + 1
        return {"requested_date": day.isoformat(), "source_url": url,
                "captured_at": datetime.now(timezone.utc).isoformat(),
                "rows": entries, "rejected_by_reason": rejected,
                "visible_rows": len(visible_rows), "pagination_state": pagination_state,
                "coverage_complete": False,
                "truncated_at_limit": len(visible_rows) > max_rows}
    finally:
        driver.quit()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", help="Source date YYYY-MM-DD; defaults to UTC today")
    ap.add_argument("--days", type=int, default=2, choices=(1, 2))
    ap.add_argument("--max-rows-per-day", type=int, default=350)
    ap.add_argument("--out", default="forebet-candidates.json")
    args = ap.parse_args()
    if not 1 <= args.max_rows_per_day <= 500:
        ap.error("--max-rows-per-day must be 1..500")
    start = date.fromisoformat(args.date) if args.date else datetime.now(timezone.utc).date()
    batches = [capture(start + timedelta(days=i), args.max_rows_per_day) for i in range(args.days)]
    rows, seen = [], set()
    for batch in batches:
        for row in batch["rows"]:
            key = (row["source_competition"], row["source_home_team"],
                   row["source_away_team"], row["source_kickoff_local_text"])
            if key not in seen:
                seen.add(key)
                rows.append(row)
    result = {"schema_version": 1, "production_writes": False,
              "identity_verified": False, "coverage_complete": False,
              "batches": batches, "candidates": rows}
    Path(args.out).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"candidates": len(rows), "output": args.out,
                      "rejected": [b["rejected_by_reason"] for b in batches]}))
    if not rows:
        raise RuntimeError("Zero source candidates; no publication permitted")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Forebet pilot failed closed: {exc}", file=sys.stderr)
        sys.exit(2)
