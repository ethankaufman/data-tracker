"""The move rule: compare the latest day in the history with the day before it.

A move is the change in an item's price between the two days, in percentage points
(price is a probability between 0 and 1, so 0.05 is 5 percentage points). Items are
ranked by the size of the change, up or down. Items with no price on one of the two
days cannot be compared and are left out of the ranking. An item that is in the latest
day but not in the previous one has appeared; one that is only in the previous day has
gone.
"""

MOVES_LISTED = 10  # how many moves the daily issue lists


def compare(rows):
    """Compare the latest day with the one before it.

    Returns {"latest", "previous", "moves", "appeared", "gone"}. "previous" is the
    most recent earlier day in the history (not always yesterday: days can be missing).
    With only one day of history there is nothing to compare, so the lists are empty.
    """
    days = sorted({row["date"] for row in rows})
    result = {"latest": None, "previous": None, "moves": [], "appeared": [], "gone": []}
    if not days:
        return result
    result["latest"] = days[-1]
    if len(days) < 2:
        return result
    result["previous"] = days[-2]

    latest = {r["item_id"]: r for r in rows if r["date"] == days[-1]}
    previous = {r["item_id"]: r for r in rows if r["date"] == days[-2]}

    moves = []
    for item_id, new_row in latest.items():
        old_row = previous.get(item_id)
        if old_row is None or old_row["price"] is None or new_row["price"] is None:
            continue
        change = round(new_row["price"] - old_row["price"], 6)
        if change != 0:
            moves.append(
                {
                    "item_id": item_id,
                    "item": new_row["item"],
                    "source": new_row["source"],
                    "old": old_row["price"],
                    "new": new_row["price"],
                    "change": change,
                }
            )
    moves.sort(key=lambda m: (-abs(m["change"]), m["item_id"]))
    result["moves"] = moves
    result["appeared"] = sorted(set(latest) - set(previous))
    result["gone"] = sorted(set(previous) - set(latest))
    return result
