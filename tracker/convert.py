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
    # league table columns: only filled on the rows of the "standings" source
    "position",
    "played",
    "won",
    "drawn",
    "lost",
    "goals_for",
    "goals_against",
    "goal_difference",
    "points",
]
STANDINGS_COLUMNS = ["position", "played", "won", "drawn", "lost", "goals_for", "goals_against", "goal_difference", "points"]
NUMERIC_COLUMNS = [
    "price", "best_bid", "best_ask", "spread", "last_trade", "volume_total", "volume_24h", "liquidity",
] + STANDINGS_COLUMNS
STANDINGS_SOURCE = "standings"
# Which statistic in the ESPN standings answer fills each league table column.
STANDINGS_STATS = {
    "position": "rank",
    "played": "gamesPlayed",
    "won": "wins",
    "drawn": "ties",
    "lost": "losses",
    "goals_for": "pointsFor",
    "goals_against": "pointsAgainst",
    "goal_difference": "pointDifferential",
    "points": "points",
}

# Some markets spell a club differently. Map every spelling to one standard name.
TEAM_NAMES = {
    "Brighton": "Brighton & Hove Albion",
    "Tottenham": "Tottenham Hotspur",
    "AFC Bournemouth": "Bournemouth",
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


def blank_row(day, item_id, item, source):
    """A row with every column present: numbers empty (None) until filled in."""
    row = {column: None for column in COLUMNS}
    row.update(date=day, item_id=item_id, item=item, source=source, updated_at="")
    return row


def convert(source, day, raw):
    """Convert one raw file to history rows, whichever source it came from."""
    return convert_standings(source, day, raw) if source == STANDINGS_SOURCE else convert_event(source, day, raw)


def convert_standings(source, day, raw):
    """Convert the raw ESPN league table to history rows: one row per club."""
    data = json.loads(raw) if isinstance(raw, (bytes, str)) else raw
    rows = []
    for entry in data["children"][0]["standings"]["entries"]:
        name = (entry["team"].get("displayName") or "").strip()
        if not name:
            continue
        team = TEAM_NAMES.get(name, name)
        stats = {stat["name"]: stat.get("value") for stat in entry.get("stats", [])}
        row = blank_row(day, f"{source}:{slugify(team)}", team, source)
        for column, key in STANDINGS_STATS.items():
            row[column] = to_number(stats.get(key))
        rows.append(row)
    return rows


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
        row = blank_row(day, f"{source}:{slugify(team)}", team, source)
        row.update(
            price=yes_price(market),
            best_bid=to_number(market.get("bestBid")),
            best_ask=to_number(market.get("bestAsk")),
            spread=to_number(market.get("spread")),
            last_trade=to_number(market.get("lastTradePrice")),
            volume_total=to_number(market.get("volumeNum", market.get("volume"))),
            volume_24h=to_number(market.get("volume24hr")),
            liquidity=to_number(market.get("liquidityNum", market.get("liquidity"))),
            updated_at=market.get("updatedAt") or "",
        )
        rows.append(row)
    return rows
