from tracker.convert import COLUMNS, convert_event, slugify
from tests.helpers import event_json, market


def test_one_row_per_team_with_common_columns():
    raw = event_json(market("Arsenal", 0.75), market("Chelsea", 0.02))
    rows = convert_event("title", "2026-11-08", raw)
    assert [r["item_id"] for r in rows] == ["title:arsenal", "title:chelsea"]
    assert set(rows[0]) == set(COLUMNS)
    assert rows[0]["date"] == "2026-11-08"
    assert rows[0]["source"] == "title"
    assert rows[0]["item"] == "Arsenal"
    assert rows[0]["price"] == 0.75
    assert rows[0]["volume_total"] == 1000.0


def test_spellings_are_mapped_to_one_name():
    raw = event_json(market("Tottenham"), market("Brighton"))
    rows = convert_event("top4", "2026-11-08", raw)
    assert [r["item"] for r in rows] == ["Tottenham Hotspur", "Brighton & Hove Albion"]
    assert rows[1]["item_id"] == "top4:brighton-and-hove-albion"
    # The same club gets the same name in every market.
    other = convert_event("top6", "2026-11-08", event_json(market("Tottenham Hotspur")))
    assert other[0]["item"] == rows[0]["item"]


def test_placeholders_and_closed_markets_are_dropped():
    raw = event_json(
        market("Arsenal"),
        market("Team A", active=False),
        market("Other", active=False),
        market("Other"),  # 'Other' is never a club, even when active
        market("Everton", closed=True),
    )
    rows = convert_event("title", "2026-11-08", raw)
    assert [r["item"] for r in rows] == ["Arsenal"]


def test_missing_values_are_left_empty():
    raw = event_json(market("Arsenal", volume24hr=None, bestBid=None))
    row = convert_event("title", "2026-11-08", raw)[0]
    assert row["volume_24h"] is None
    assert row["best_bid"] is None


def test_price_is_the_yes_price_whatever_the_order():
    swapped = market("Arsenal", outcomes='["No", "Yes"]', outcomePrices='["0.3", "0.7"]')
    row = convert_event("title", "2026-11-08", event_json(swapped))[0]
    assert row["price"] == 0.7


def test_slugify():
    assert slugify("Brighton & Hove Albion") == "brighton-and-hove-albion"
    assert slugify("Man. City") == "man-city"
