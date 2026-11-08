import csv
import io
import json
from datetime import datetime, timezone

from tracker.run import run
from tracker.sources import SOURCES
from tests.helpers import event_json, market, standings_json


def fake_get(prices, fail=(), points=(27, 16)):
    """Every market answers with the same two teams at the given prices; the league table has them too."""

    def get(url):
        for source in SOURCES:
            if source.url == url:
                if source.name in fail:
                    raise OSError("down")
                if source.name == "standings":
                    return standings_json(("Arsenal", 1, 10, 9, 0, 1, 15, 5, points[0]), ("Chelsea", 2, 10, 5, 1, 4, 19, 16, points[1]))
                return event_json(market("Arsenal", prices[0]), market("Chelsea", prices[1]))
        raise AssertionError(url)

    return get


def at(day, hour=9):
    return datetime(*map(int, day.split("-")), hour, 5, 0, tzinfo=timezone.utc)


def do_run(tmp_path, day, prices, hour=9, fail=(), published=None):
    publish = (lambda title, body: published.append((title, body))) if published is not None else None
    return run(
        at(day, hour),
        raw_dir=tmp_path / "raw",
        history_path=tmp_path / "history.csv",
        status_path=tmp_path / "status.json",
        get=fake_get(prices, fail),
        publish=publish,
    )


def test_a_second_run_on_the_same_day_counts_the_day_once(tmp_path):
    do_run(tmp_path, "2026-11-08", (0.5, 0.1), hour=9)
    first_csv = (tmp_path / "history.csv").read_text()
    status = do_run(tmp_path, "2026-11-08", (0.6, 0.1), hour=18)
    csv_text = (tmp_path / "history.csv").read_text()

    rows = list(csv.DictReader(io.StringIO(csv_text)))
    keys = [(r["date"], r["item_id"]) for r in rows]
    assert status["days_with_success"] == 1
    assert status["first_run_date"] == "2026-11-08"
    assert len(keys) == len(set(keys)) == 12  # one row per item (5 markets + the league table), no duplicates
    assert len(csv_text.splitlines()) == len(first_csv.splitlines())
    arsenal = next(r for r in rows if r["item_id"] == "title:arsenal")
    assert arsenal["price"] == "0.6"  # the newer prices replaced the first run's 0.5
    assert status["run_time"] == "2026-11-08T18:05:00Z"


def test_second_run_updates_the_same_issue_title(tmp_path):
    published = []
    do_run(tmp_path, "2026-11-08", (0.5, 0.1), hour=9, published=published)
    do_run(tmp_path, "2026-11-08", (0.6, 0.1), hour=18, published=published)
    assert [title for title, _ in published] == ["2026-11-08", "2026-11-08"]


def test_status_file_keys_and_a_second_day(tmp_path):
    do_run(tmp_path, "2026-11-08", (0.5, 0.1))
    status = do_run(tmp_path, "2026-11-09", (0.55, 0.1))
    on_disk = json.loads((tmp_path / "status.json").read_text())
    assert on_disk == status
    assert set(status) == {"run_time", "first_run_date", "days_with_success", "items", "new_today", "gone_today", "sources"}
    assert status["days_with_success"] == 2
    assert status["items"] == 12  # 5 markets x 2 clubs + 2 league table rows
    assert [s["name"] for s in status["sources"]] == ["title", "relegation", "top4", "top6", "top10", "standings"]
    assert all(s["ok"] and s["count"] == 2 for s in status["sources"])


def test_a_failed_source_is_recorded_and_the_run_still_finishes(tmp_path):
    published = []
    status = do_run(tmp_path, "2026-11-08", (0.5, 0.1), fail=("top6",), published=published)
    by_name = {s["name"]: s for s in status["sources"]}
    assert by_name["top6"]["ok"] is False and by_name["top6"]["count"] == 0
    assert by_name["title"]["ok"] is True
    assert status["items"] == 10
    assert "top6" in published[0][1]  # the issue names the failed source
    assert "top6:" not in (tmp_path / "history.csv").read_text()


def test_the_issue_is_published_even_with_no_changes(tmp_path):
    published = []
    do_run(tmp_path, "2026-11-08", (0.5, 0.1), published=published)
    do_run(tmp_path, "2026-11-09", (0.5, 0.1), published=published)
    title, body = published[1]
    assert title == "2026-11-09"
    assert "No item's price changed." in body


def test_items_that_appear_and_disappear_are_listed(tmp_path):
    published = []
    do_run(tmp_path, "2026-11-08", (0.5, 0.1), published=published)
    do_run(tmp_path, "2026-11-09", (0.5, 0.1), fail=("title",), published=published)
    status = json.loads((tmp_path / "status.json").read_text())
    assert status["gone_today"] == ["title:arsenal", "title:chelsea"]
    assert "title:arsenal" in published[1][1]


def test_a_failing_issue_does_not_stop_the_run(tmp_path):
    def broken(title, body):
        raise RuntimeError("no network")

    status = run(
        at("2026-11-08"),
        raw_dir=tmp_path / "raw",
        history_path=tmp_path / "history.csv",
        status_path=tmp_path / "status.json",
        get=fake_get((0.5, 0.1)),
        publish=broken,
    )
    assert status["days_with_success"] == 1
    assert (tmp_path / "history.csv").exists()
