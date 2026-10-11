"""Offline Forebet HTML reader; no network or access-control workarounds.

Uses bounded selectors from Forebet 2026 1X2 pages and reports uncertainty.
Any candidate must still pass score/date/identity validation before publication.
"""
import re
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup

_NUM = re.compile(r"^\s*(\d{1,3})\s*%?\s*$")


def _text(node):
    return node.get_text(" ", strip=True) if node else ""


def _get(node, selector):
    return _text(node.select_one(selector))


def _probabilities(node):
    # Main 1X2 surface: three direct probability spans under .fprc.
    fprc = node.select_one(".fprc")
    groups = [fprc.select("span") if fprc else [],
              [node.select_one(".forebet_p1"), node.select_one(".forebet_p2"), node.select_one(".forebet_p3")],
              node.select(".fprt")]
    for cells in groups:
        if len(cells) != 3 or any(cell is None for cell in cells):
            continue
        matches = [_NUM.fullmatch(_text(cell)) for cell in cells]
        if all(matches):
            values = [int(match.group(1)) for match in matches]
            if all(0 <= v <= 100 for v in values) and 98 <= sum(values) <= 102:
                return values
    return None


def _candidate_containers(soup):
    seen = set()
    for home in soup.select(".homeTeam"):
        current = home.parent
        for _ in range(9):
            if current is None or current.name in ("body", "html"):
                break
            if len(current.select(".homeTeam")) == 1 and len(current.select(".awayTeam")) == 1:
                if (current.select_one(".shortTag") and current.select_one(".date_bah")
                        and current.select_one(".ex_sc") and current.select_one(".avg_sc")
                        and _probabilities(current)):
                    if id(current) not in seen:
                        seen.add(id(current))
                        yield current
                    break
            current = current.parent


def parse_forebet_html(html, base_url="https://www.forebet.com"):
    soup = BeautifulSoup(html, "html.parser")
    detected = len(soup.select(".homeTeam"))
    rows, rejected, seen = [], {}, set()
    for node in _candidate_containers(soup):
        h, d, a = _probabilities(node) or (None, None, None)
        home, away = _get(node, ".homeTeam"), _get(node, ".awayTeam")
        date = _get(node, ".date_bah")
        league = _get(node, ".shortTag")
        score, avg = _get(node, ".ex_sc"), _get(node, ".avg_sc")
        if h is None or not home or not away or not date or not league or not score or not avg:
            rejected["INCOMPLETE_1X2_ROW"] = rejected.get("INCOMPLETE_1X2_ROW", 0) + 1
            continue
        key = (league.casefold(), home.casefold(), away.casefold(), date)
        if key in seen:
            continue
        seen.add(key)
        detail = None
        link = node.select_one("a.tnmscn[href]")
        if link:
            candidate = urljoin(base_url, link.get("href", ""))
            parsed = urlparse(candidate)
            if parsed.scheme == "https" and parsed.hostname in ("www.forebet.com", "forebet.com"):
                detail = candidate
        rows.append({"league": league, "home": home, "away": away,
                     "date_time": date, "prob_home": h, "prob_draw": d, "prob_away": a,
                     "predicted_score": score, "avg_goals": avg,
                     "source_detail_url": detail})
    if detected and not rows:
        rejected["DOM_ROWS_WITHOUT_COMPLETE_1X2"] = detected
    return {"detected_home_nodes": detected, "parsed_rows": rows,
            "rejected_by_reason": rejected, "parsed_count": len(rows)}
