"""Turn one raw source file into rows with the common set of history columns."""

import json
import re

# The first four columns are fixed by the assignment; the rest are ours.
COLUMNS = [
    "date",
    "item_id",
    "item",
    "source",
    "price",
    "best_bid",
    "best_ask",
    "spread",
    "last_trade",
    "volume_total",
    "volume_24h",
    "liquidity",
    "updated_at",
]
NUMERIC_COLUMNS = ["price", "best_bid", "best_ask", "spread", "last_trade", "volume_total", "volume_24h", "liquidity"]

# Some markets spell a club differently. Map every spelling to one standard name.
TEAM_NAMES = {
    "Brighton": "Brighton & Hove Albion",
    "Tottenham": "Tottenham Hotspur",
}
# Rows that are not clubs.
NOT_TEAMS = {"Other"}


def slugify(name):
    """'Brighton & Hove Albion' -> 'brighton-and-hove-albion'."""
    return re.sub(r"[^a-z0-9]+", "-", name.lower().replace("&", "and")).strip("-")


def to_number(value):
    """Read a number the source may give as a number, a numeric string, or nothing."""
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def yes_price(market):
    """The market's 'Yes' price (0 to 1) = the market's probability of the event."""
    outcomes = market.get("outcomes")
    prices = market.get("outcomePrices")
    if isinstance(outcomes, str):
        outcomes = json.loads(outcomes)
    if isinstance(prices, str):
        prices = json.loads(prices)
    if not outcomes or not prices or "Yes" not in outcomes:
        return None
    return to_number(prices[outcomes.index("Yes")])


def convert_event(source, day, raw):
    """Convert a raw Polymarket answer (bytes, str, or parsed JSON) to history rows.

    Kept: every active, open market that belongs to a club.
    Dropped: inactive or closed markets (placeholders such as 'Team A') and 'Other'.
    """
    data = json.loads(raw) if isinstance(raw, (bytes, str)) else raw
    event = data[0] if isinstance(data, list) else data
    rows = []
    for market in event["markets"]:
        title = (market.get("groupItemTitle") or "").strip()
        if not title or title in NOT_TEAMS:
            continue
        if not market.get("active") or market.get("closed"):
            continue
        team = TEAM_NAMES.get(title, title)
        rows.append(
            {
                "date": day,
                "item_id": f"{source}:{slugify(team)}",
                "item": team,
                "source": source,
                "price": yes_price(market),
                "best_bid": to_number(market.get("bestBid")),
                "best_ask": to_number(market.get("bestAsk")),
                "spread": to_number(market.get("spread")),
                "last_trade": to_number(market.get("lastTradePrice")),
                "volume_total": to_number(market.get("volumeNum", market.get("volume"))),
                "volume_24h": to_number(market.get("volume24hr")),
                "liquidity": to_number(market.get("liquidityNum", market.get("liquidity"))),
                "updated_at": market.get("updatedAt") or "",
            }
        )
    return rows
