import gzip

from tracker.history import build_history, raw_days, write_history
from tests.helpers import event_json, market


def save(raw_dir, day, source, body):
    path = raw_dir / day / f"{source}.json.gz"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(gzip.compress(body))


def test_rows_are_sorted_by_date_then_item_id(tmp_path):
    save(tmp_path, "2026-11-09", "title", event_json(market("Chelsea"), market("Arsenal")))
    save(tmp_path, "2026-11-08", "top4", event_json(market("Everton")))
    save(tmp_path, "2026-11-08", "title", event_json(market("Everton")))
    rows = build_history(tmp_path)
    assert [(r["date"], r["item_id"]) for r in rows] == [
        ("2026-11-08", "title:everton"),
        ("2026-11-08", "top4:everton"),
        ("2026-11-09", "title:arsenal"),
        ("2026-11-09", "title:chelsea"),
    ]


def test_a_missing_raw_file_means_no_rows_for_that_source_and_day(tmp_path):
    save(tmp_path, "2026-11-08", "title", event_json(market("Arsenal")))
    save(tmp_path, "2026-11-08", "top4", event_json(market("Arsenal")))
    save(tmp_path, "2026-11-09", "title", event_json(market("Arsenal")))  # top4 failed on the 9th
    rows = build_history(tmp_path)
    assert [(r["date"], r["source"]) for r in rows] == [
        ("2026-11-08", "title"),
        ("2026-11-08", "top4"),
        ("2026-11-09", "title"),
    ]


def test_building_twice_gives_the_same_file(tmp_path):
    save(tmp_path, "2026-11-08", "title", event_json(market("Arsenal", 0.7), market("Chelsea", 0.1)))
    save(tmp_path, "2026-11-09", "title", event_json(market("Arsenal", 0.72)))
    write_history(build_history(tmp_path), tmp_path / "a.csv")
    write_history(build_history(tmp_path), tmp_path / "b.csv")
    assert (tmp_path / "a.csv").read_bytes() == (tmp_path / "b.csv").read_bytes()


def test_csv_layout_and_empty_values(tmp_path):
    save(tmp_path, "2026-11-08", "title", event_json(market("Arsenal", 0.7, volume24hr=None)))
    out = tmp_path / "history.csv"
    write_history(build_history(tmp_path), out)
    lines = out.read_text().splitlines()
    header = lines[0].split(",")
    assert header[:4] == ["date", "item_id", "item", "source"]
    cells = dict(zip(header, lines[1].split(",")))
    assert cells["price"] == "0.7"
    assert cells["volume_24h"] == ""  # not reported: left empty
    assert cells["date"] == "2026-11-08"


def test_other_folders_and_files_are_ignored(tmp_path):
    save(tmp_path, "2026-11-08", "title", event_json(market("Arsenal")))
    (tmp_path / "notes").mkdir()
    (tmp_path / "2026-11-08" / "readme.txt").write_text("hi")
    assert raw_days(tmp_path) == ["2026-11-08"]
    assert len(build_history(tmp_path)) == 1
