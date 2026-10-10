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
from datetime import datetime, timezone
from pathlib import Path

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


SOURCE_PAGES = {
    "today": "https://www.forebet.com/en/football-tips-and-predictions-for-today",
    "tomorrow": "https://www.forebet.com/en/football-tips-and-predictions-for-tomorrow",
}


def capture(day, max_rows):
    """Read the live Today/Tomorrow 1X2 surface, never the legacy date path."""
    from forebet_lean_parser import parse_forebet_html
    try:
        from selenium import webdriver
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import WebDriverWait
    except ImportError as exc:
        raise RuntimeError("Install selenium and Chrome/Chromium driver to run an approved source pilot") from exc

    if day not in SOURCE_PAGES:
        raise ValueError("UNSUPPORTED_SOURCE_DAY")
    url = SOURCE_PAGES[day]
    options = webdriver.ChromeOptions()
    options.add_argument("--headless=new")
    options.add_argument("--window-size=1440,1000")
    driver = webdriver.Chrome(options=options)
    try:
        driver.set_page_load_timeout(30)
        driver.get(url)
        page_source = driver.page_source
        title = driver.title.lower()
        if any(term in (title + " " + page_source[:4000].lower())
               for term in ("403 forbidden", "access denied", "just a moment", "captcha")):
            raise RuntimeError("FOREBET_ACCESS_RESTRICTED: no access-control bypass permitted")
        try:
            WebDriverWait(driver, 15).until(
                lambda d: len(d.find_elements(By.CSS_SELECTOR, ".homeTeam")) > 0
            )
        except Exception as exc:
            raise RuntimeError("NO_FOREBET_ROWS: access, layout or source may be unavailable") from exc

        visible_before = len(driver.find_elements(By.CSS_SELECTOR, ".homeTeam"))
        pagination_state = "NO_MORE_CONTROL"
        controls = driver.find_elements(
            By.CSS_SELECTOR,
            "#mrows span, #btn_more, .schema-more, span[onclick*='ltodrows']"
        )
        for button in controls:
            if not button.is_displayed():
                continue
            pagination_state = "MORE_LOAD_UNCONFIRMED"
            try:
                button.click()
                WebDriverWait(driver, 8).until(
                    lambda d: len(d.find_elements(By.CSS_SELECTOR, ".homeTeam")) > visible_before
                )
                pagination_state = "ONE_MORE_BATCH_LOADED"
            except Exception:
                pass
            break

        parsed = parse_forebet_html(driver.page_source)
        if parsed["detected_home_nodes"] == 0:
            raise RuntimeError("NO_FOREBET_ROWS: zero team nodes on source page")
        rows, rejected = [], dict(parsed["rejected_by_reason"])
        for raw in parsed["parsed_rows"][:max_rows]:
            try:
                item = normalize_row(raw)
                item["source_detail_url"] = raw.get("source_detail_url")
                rows.append(item)
            except (KeyError, ValueError, TypeError) as exc:
                reason = str(exc)[:100]
                rejected[reason] = rejected.get(reason, 0) + 1

        return {"requested_surface": day, "source_url": url,
                "captured_at": datetime.now(timezone.utc).isoformat(),
                "rows": rows, "detected_home_nodes": parsed["detected_home_nodes"],
                "parsed_source_rows": parsed["parsed_count"],
                "rejected_by_reason": rejected,
                "pagination_state": pagination_state, "coverage_complete": False,
                "truncated_at_limit": parsed["parsed_count"] > max_rows}
    finally:
        driver.quit()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=2, choices=(1, 2))
    ap.add_argument("--max-rows-per-day", type=int, default=900)
    ap.add_argument("--out", default="forebet-candidates.json")
    args = ap.parse_args()
    if not 1 <= args.max_rows_per_day <= 1200:
        ap.error("--max-rows-per-day must be 1..1200")
    batches = [capture(day, args.max_rows_per_day) for day in ("today", "tomorrow")[:args.days]]
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
