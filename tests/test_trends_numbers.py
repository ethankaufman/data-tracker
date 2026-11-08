"""The Trends page must show numbers that agree with data/history.csv.

The page's calculations (assets/stats.mjs) are run with Node on a history file, and the results
are compared with a separate calculation done here in Python straight from the CSV.
"""

import csv
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from tracker.moves import compare

ROOT = Path(__file__).resolve().parent.parent
PLACES = {"title": 1, "relegation": 3, "top4": 4, "top6": 6, "top10": 10}

pytestmark = pytest.mark.skipif(shutil.which("node") is None, reason="Node.js is not installed")


def page_numbers(csv_path):
    out = subprocess.run(["node", str(ROOT / "tools" / "trends_numbers.mjs"), str(csv_path)], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def read_rows(csv_path):
    rows = []
    for raw in csv.DictReader(open(csv_path, newline="")):
        row = dict(raw)
        for column in ["price", "spread"]:
            row[column] = float(raw[column]) if raw[column] != "" else None
        rows.append(row)
    return rows


def write_history(path, days):
    """days: {date: {item_id: (price, spread)}}. Writes a history file like the pipeline's."""
    columns = ["date", "item_id", "item", "source", "price", "best_bid", "best_ask", "spread", "last_trade", "volume_total", "volume_24h", "liquidity", "updated_at"]
    with open(path, "w", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(columns)
        for day in sorted(days):
            for item_id, (price, spread) in sorted(days[day].items()):
                source, team = item_id.split(":")
                writer.writerow([day, item_id, team.title(), source, "" if price is None else price, "", "", "" if spread is None else spread, "", "", "", "", ""])


def sample_history(tmp_path):
    clubs = ["arsenal", "chelsea", "everton", "fulham", "leeds"]
    days = {}
    for d, day in enumerate(["2026-11-08", "2026-11-09", "2026-11-12", "2026-11-13"]):  # a gap of two days
        days[day] = {}
        for s, source in enumerate(PLACES):
            for c, club in enumerate(clubs):
                price = round(0.05 + 0.04 * c + 0.013 * d * (1 if (c + s) % 2 else -1) + 0.002 * s, 4)
                days[day][f"{source}:{club}"] = (price, round(0.01 * (s + 1) + 0.001 * c, 4))
    for day in days:  # league table rows sit in the same file and must not change any market number
        days[day]["standings:arsenal"] = (None, None)
        days[day]["standings:chelsea"] = (None, None)
    del days["2026-11-12"]["relegation:fulham"]  # an item that disappears for one day
    days["2026-11-13"]["top4:fulham"] = (None, None)  # a price that is not reported
    days["2026-11-13"]["title:newclub"] = (0.01, 0.02)  # an item that appears
    path = tmp_path / "history.csv"
    write_history(path, days)
    return path


def test_page_numbers_agree_with_the_history_file(tmp_path):
    path = sample_history(tmp_path)
    rows = read_rows(path)
    page = page_numbers(path)
    dates = sorted({r["date"] for r in rows})
    latest, first = dates[-1], dates[0]
    today = [r for r in rows if r["date"] == latest]
    close = lambda a, b: a == pytest.approx(b, abs=1e-6)  # the page rounds to 6 decimals

    assert page["days"] == dates

    # Finding 1: title favourites, highest price first
    title = sorted((r for r in today if r["source"] == "title" and r["price"] is not None), key=lambda r: (-r["price"], r["item"]))
    assert [name for name, _ in page["favourites"]] == [r["item"] for r in title]
    assert all(close(p, r["price"]) for (_, p), r in zip(page["favourites"], title))

    # Finding 2: sum of prices against the fair total
    totals = {m: (sum(r["price"] for r in today if r["source"] == m and r["price"] is not None)) for m in PLACES}
    assert [m for m, _, _ in page["totals"]] == list(PLACES)
    for market, total, excess in page["totals"]:
        assert close(total, totals[market])
        assert close(excess, totals[market] / PLACES[market] - 1)

    # Finding 3: change from each item's first price to the latest price
    first_price = {}
    for r in rows:
        if r["price"] is not None and r["item_id"] not in first_price:
            first_price[r["item_id"]] = (r["date"], r["price"])
    expected = {}
    for r in today:
        start = first_price.get(r["item_id"])
        if start and r["price"] is not None and start[0] != latest:
            expected[r["item_id"]] = (start[1], r["price"], r["price"] - start[1])
    assert {item for item, *_ in page["since"]} == set(expected)
    for item, old, new, change in page["since"]:
        assert (close(old, expected[item][0]), close(new, expected[item][1]), close(change, expected[item][2])) == (True, True, True)
    assert [abs(c) for *_, c in page["since"]] == sorted((abs(c) for *_, c in page["since"]), reverse=True)

    # Finding 4: the biggest move between each pair of consecutive days
    by_day = {d: {r["item_id"]: r for r in rows if r["date"] == d} for d in dates}
    assert len(page["daily"]) == len(dates) - 1
    for (date, item, change), (before, now) in zip(page["daily"], zip(dates, dates[1:])):
        changes = {i: by_day[now][i]["price"] - by_day[before][i]["price"] for i in by_day[now] if i in by_day[before] and by_day[now][i]["price"] is not None and by_day[before][i]["price"] is not None}
        assert date == now
        assert close(abs(change), max(abs(c) for c in changes.values()))
        assert close(change, changes[item])

    # Finding 5: average spread per market
    for market, mean in page["spreads"]:
        values = [r["spread"] for r in today if r["source"] == market and r["spread"] is not None]
        assert close(mean, sum(values) / len(values))

    # Today page: the move rule must be the same as the one that builds the daily issue
    python_moves = compare(rows)
    assert [m[0] for m in page["moves"]] == [m["item_id"] for m in python_moves["moves"]]
    assert all(close(m[3], p["change"]) for m, p in zip(page["moves"], python_moves["moves"]))
    # Fulham's relegation item was missing on the previous day and is back, so it has "appeared" again.
    assert page["appeared"] == python_moves["appeared"] == ["relegation:fulham", "title:newclub"]
    assert page["gone"] == python_moves["gone"]


def test_the_real_history_file_loads_in_the_page_code():
    path = ROOT / "data" / "history.csv"
    page = page_numbers(path)
    rows = read_rows(path)
    assert page["days"] == sorted({r["date"] for r in rows})
    assert len(page["favourites"]) == len([r for r in rows if r["date"] == page["days"][-1] and r["source"] == "title"])
