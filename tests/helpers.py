"""Small builders for fake source answers, so tests need no network."""

import json


def market(team, yes=0.5, active=True, closed=False, **extra):
    data = {
        "groupItemTitle": team,
        "active": active,
        "closed": closed,
        "outcomes": json.dumps(["Yes", "No"]),
        "outcomePrices": json.dumps([str(yes), str(round(1 - yes, 6))]),
        "bestBid": yes - 0.005,
        "bestAsk": yes + 0.005,
        "spread": 0.01,
        "lastTradePrice": yes,
        "volumeNum": 1000.0,
        "volume24hr": 50.0,
        "liquidityNum": 2000.0,
        "updatedAt": "2026-11-08T12:00:00.000000Z",
    }
    data.update(extra)
    return data


def event_json(*markets):
    """What the API returns: a list holding one event."""
    return json.dumps([{"slug": "x", "markets": list(markets)}]).encode()
