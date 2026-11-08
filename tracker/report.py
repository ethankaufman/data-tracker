"""Write the text of the daily GitHub Issue."""

from tracker.moves import MOVES_LISTED


def percent(price):
    return f"{price * 100:.1f}%"


def points(change):
    return f"{change * 100:+.1f} pp"


def issue_body(day, comparison, results, source_titles):
    """Markdown for the issue titled with the date. Always has a body, even with no changes."""
    lines = [f"Run of **{day}** (UTC)."]

    failed = [r for r in results if not r["ok"]]
    if failed:
        lines += ["", "## Sources that failed today"]
        lines += [f"- `{r['name']}`: {r.get('error')}" for r in failed]

    previous = comparison["previous"]
    if previous is None:
        lines += ["", "First day of data: there is no earlier day to compare with."]
        return "\n".join(lines) + "\n"

    note = ""
    if comparison["latest"] != day:
        note = f" No data was saved today, so this compares the two most recent days with data."
    lines += ["", f"Compared with **{previous}**; latest data is from **{comparison['latest']}**.{note}"]

    moves = comparison["moves"]
    lines += ["", f"## Biggest moves (top {MOVES_LISTED} of {len(moves)})"]
    if moves:
        lines += ["", "| Item | Market | Old | New | Change |", "|---|---|---|---|---|"]
        for move in moves[:MOVES_LISTED]:
            market = source_titles.get(move["source"], move["source"])
            lines.append(
                f"| {move['item']} | {market} | {percent(move['old'])} | {percent(move['new'])} | {points(move['change'])} |"
            )
    else:
        lines += ["", "No item's price changed."]

    lines += ["", "## Appeared"]
    lines += [f"- `{item_id}`" for item_id in comparison["appeared"]] or ["None."]
    lines += ["", "## Disappeared"]
    lines += [f"- `{item_id}`" for item_id in comparison["gone"]] or ["None."]
    lines += [
        "",
        "*A move is the change in an item's price (its implied probability) since the previous day with data, "
        "in percentage points (pp). Ranked by size, up or down.*",
    ]
    return "\n".join(lines) + "\n"
