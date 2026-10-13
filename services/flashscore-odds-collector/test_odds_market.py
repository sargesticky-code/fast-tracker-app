"""Offline bookmaker source gap tests: no network, credentials or provider calls."""
import math
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from odds_market import (
    quote_result, COMPLETE, EMPTY_SOURCE, BOOKMAKER_MISSING,
    INCOMPLETE, INVALID_RESPONSE,
)


def wrap(entries):
    return {"data": {"findOddsByEventId": {"odds": entries}}}


def market(prices=None, *, bookmaker=16, scope="FULL_TIME", category="HOME_DRAW_AWAY"):
    prices = prices or [
        {"eventParticipantId": "home-id", "value": "2.15", "opening": "2.40", "active": True},
        {"eventParticipantId": None, "value": "3.40", "opening": "3.20", "active": True},
        {"eventParticipantId": "away-id", "value": "4.10", "opening": "3.75", "active": True},
    ]
    return {"bookmakerId": bookmaker, "bettingType": category,
            "bettingScope": scope, "odds": prices}


class MarketTests(unittest.TestCase):
    def test_complete_three_way_market_and_opening(self):
        result = quote_result(wrap([market()]), 16)
        self.assertEqual(result["reason"], COMPLETE)
        self.assertEqual(result["hda"], {
            "home": 2.15, "draw": 3.40, "away": 4.10,
            "opening_home": 2.40, "opening_draw": 3.20, "opening_away": 3.75,
        })

    def test_other_bookmaker_does_not_count_as_requested(self):
        self.assertEqual(quote_result(wrap([market(bookmaker=17)]), 16)["reason"], BOOKMAKER_MISSING)

    def test_invalid_scopes_and_two_way_bets_do_not_fill_hda(self):
        result = quote_result(wrap([market(scope="FIRST_HALF"),
                                   market(category="OVER_UNDER")]), 16)
        self.assertEqual(result["reason"], BOOKMAKER_MISSING)

    def test_no_event_odds_is_not_a_network_error(self):
        for data in [wrap([]), {"data":{"findOddsByEventId": None}},
                     {"data":{"findOddsByEventId":{"odds": None}}}]:
            self.assertEqual(quote_result(data, 16)["reason"], EMPTY_SOURCE)

    def test_source_gave_incomplete_or_inactive_market(self):
        prices = market()["odds"]
        cases = [prices[:2],
                 [dict(prices[0], active=False), prices[1], prices[2]],
                 [dict(prices[0], value=None), prices[1], prices[2]]]
        for items in cases:
            self.assertEqual(quote_result(wrap([market(items)]), 16)["reason"], INCOMPLETE)

    def test_non_finite_prices_are_never_accepted(self):
        for invalid in ["nan", "inf", float("-inf"), "0.9", "bogus"]:
            items = [dict(market()["odds"][0], value=invalid), *market()["odds"][1:]]
            self.assertEqual(quote_result(wrap([market(items)]), 16)["reason"], INCOMPLETE)

    def test_malformed_source_is_not_a_missing_market(self):
        for data in [[], {"data":{"findOddsByEventId":{"odds":"invalid"}}},
                     wrap([{"bookmakerId":16, "bettingType":"HOME_DRAW_AWAY",
                            "odds":"invalid"}]), wrap([23])]:
            self.assertEqual(quote_result(data,16)["reason"], INVALID_RESPONSE)

if __name__ == "__main__":
    unittest.main()
