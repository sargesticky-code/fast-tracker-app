"""Classify bookmaker quote gaps without making extra HTTP requests.

Complete three-way market only. Returned reason describes the *observed*
response, never presumes a bookmaker does not offer a match elsewhere.
"""
import math

COMPLETE = "COMPLETE"
EMPTY_SOURCE = "NO_EVENT_ODDS_IN_RESPONSE"
BOOKMAKER_MISSING = "NO_REQUESTED_BOOKMAKER_HDA"
INCOMPLETE = "INCOMPLETE_OR_INACTIVE_HDA"
INVALID_RESPONSE = "INVALID_SOURCE_RESPONSE"
HTTP_FAILED = "HTTP_REQUEST_FAILED"
UNEXPECTED_FAILURE = "UNEXPECTED_WORKER_RESULT"
REASONS = frozenset((COMPLETE, EMPTY_SOURCE, BOOKMAKER_MISSING,
                     INCOMPLETE, INVALID_RESPONSE, HTTP_FAILED,
                     UNEXPECTED_FAILURE))


def as_price(value):
    try:
        number = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return number if math.isfinite(number) and number > 1 else None


def quote_result(data, bookmaker_id):
    """Read exactly the same full-time bookmaker market as before.

    The source's participant sequence is preserved, not guessed by team name.
    A separate fixture participant-ID verification would be needed to assert
    this sequence corresponds to home/away; do not invent that relationship.
    """
    if not isinstance(data, dict):
        return {"reason": INVALID_RESPONSE, "hda": None}
    root = data.get("data")
    event = root.get("findOddsByEventId") if isinstance(root, dict) else None
    if event is None:
        return {"reason": EMPTY_SOURCE, "hda": None}
    if not isinstance(event, dict):
        return {"reason": INVALID_RESPONSE, "hda": None}
    entries = event.get("odds")
    if entries is None or entries == []:
        return {"reason": EMPTY_SOURCE, "hda": None}
    if not isinstance(entries, list):
        return {"reason": INVALID_RESPONSE, "hda": None}
    if any(not isinstance(x, dict) for x in entries):
        return {"reason": INVALID_RESPONSE, "hda": None}
    candidates = [
        x for x in entries
        if x.get("bookmakerId") == bookmaker_id
        and x.get("bettingType") == "HOME_DRAW_AWAY"
        and x.get("bettingScope") in (None, "FULL_TIME")
    ]
    if not candidates:
        return {"reason": BOOKMAKER_MISSING, "hda": None}
    for entry in candidates:
        items = entry.get("odds") or []
        if not isinstance(items, list) or any(not isinstance(i, dict) for i in items):
            return {"reason": INVALID_RESPONSE, "hda": None}
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
            return {"reason": COMPLETE, "hda": {
                "home": home, "draw": draw, "away": away,
                "opening_home": next((as_price(i.get("opening")) for i in items
                                      if i.get("eventParticipantId") == participant_order[0]), None),
                "opening_draw": next((as_price(i.get("opening")) for i in items
                                      if i.get("eventParticipantId") is None), None),
                "opening_away": next((as_price(i.get("opening")) for i in items
                                      if i.get("eventParticipantId") == participant_order[1]), None),
            }}
    return {"reason": INCOMPLETE, "hda": None}
