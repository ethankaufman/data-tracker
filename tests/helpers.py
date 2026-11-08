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


def standings_json(*clubs):
    """What the ESPN standings feed returns. Each club: (name, rank, played, won, drawn, lost, for, against, points)."""
    entries = []
    for name, rank, played, won, drawn, lost, goals_for, goals_against, points in clubs:
        stats = {
            "rank": rank, "gamesPlayed": played, "wins": won, "ties": drawn, "losses": lost,
            "pointsFor": goals_for, "pointsAgainst": goals_against,
            "pointDifferential": goals_for - goals_against, "points": points,
        }
        entries.append({"team": {"displayName": name}, "stats": [{"name": k, "value": float(v)} for k, v in stats.items()]})
    return json.dumps({"children": [{"standings": {"entries": entries}}]}).encode()


TABLE = standings_json(("Arsenal", 1, 10, 9, 0, 1, 15, 5, 27), ("Chelsea", 2, 10, 5, 1, 4, 19, 16, 16))
