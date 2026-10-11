"""Fixed-size day allocation for the existing Flashscore bookmaker collector.

Today often has >500 fixtures, so a naive first-360 prefix makes tomorrow
unreachable. Reserve tomorrow's capacity without a second scraper, extra
bookmaker queries or unbounded pagination. Pure stdlib for cheap testing.
"""
def day_plan(days_ahead, capacity):
    if capacity < 10:
        raise ValueError("BOOKMAKER_CAPACITY_TOO_SMALL")
    count=2 if days_ahead>=1 else 1
    if count==1:
        return [(0,capacity)]
    today=max(1,capacity//3)
    return [(0,today),(1,capacity-today)]

def allocate(rows, limit, seen, date, is_virtual):
    selected=[]
    for item in rows:
        event=str(item.get("event_id") or "")
        if not event or event in seen or not item.get("home") or not item.get("away"):
            continue
        if is_virtual(item.get("league"),item.get("home"),item.get("away")):
            continue
        selected.append({**item,"date":date})
        seen.add(event)
        if len(selected)>=limit:
            break
    return selected
