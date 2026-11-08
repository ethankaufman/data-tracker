import gzip

from tracker.sources import SOURCES, fetch_all, fetch_source, raw_path
from tests.helpers import event_json, market

GOOD = event_json(market("Arsenal", 0.7), market("Chelsea", 0.1))


def getter(answers):
    """A fake download: answers maps a source slug to bytes or an Exception."""

    def get(url):
        for slug, answer in answers.items():
            if slug in url:
                if isinstance(answer, Exception):
                    raise answer
                return answer
        raise AssertionError(f"unexpected url {url}")

    return get


def test_a_good_source_is_saved_compressed_in_its_own_format(tmp_path):
    source = SOURCES[0]
    result = fetch_source(source, "2026-11-08", tmp_path, getter({source.slug: GOOD}))
    assert result == {"name": "title", "ok": True, "count": 2, "error": None}
    path = raw_path(tmp_path, "2026-11-08", "title")
    assert path.name == "title.json.gz"
    assert gzip.decompress(path.read_bytes()) == GOOD


def test_a_failed_source_writes_no_file_and_does_not_stop_the_run(tmp_path):
    answers = {s.slug: GOOD for s in SOURCES}
    answers[SOURCES[1].slug] = OSError("network down")
    results = fetch_all("2026-11-08", tmp_path, getter(answers))
    by_name = {r["name"]: r for r in results}
    assert by_name["relegation"]["ok"] is False
    assert "network down" in by_name["relegation"]["error"]
    assert not raw_path(tmp_path, "2026-11-08", "relegation").exists()
    assert all(by_name[n]["ok"] for n in ["title", "top4", "top6", "top10"])
    assert raw_path(tmp_path, "2026-11-08", "title").exists()


def test_an_answer_with_no_teams_counts_as_a_failure(tmp_path):
    empty = event_json(market("Team A", active=False))
    result = fetch_source(SOURCES[0], "2026-11-08", tmp_path, getter({SOURCES[0].slug: empty}))
    assert result["ok"] is False
    assert not raw_path(tmp_path, "2026-11-08", "title").exists()


def test_garbage_counts_as_a_failure(tmp_path):
    result = fetch_source(SOURCES[0], "2026-11-08", tmp_path, getter({SOURCES[0].slug: b"<html>oops"}))
    assert result["ok"] is False


def test_second_run_the_same_day_replaces_the_raw_file(tmp_path):
    source = SOURCES[0]
    fetch_source(source, "2026-11-08", tmp_path, getter({source.slug: GOOD}))
    newer = event_json(market("Arsenal", 0.8))
    fetch_source(source, "2026-11-08", tmp_path, getter({source.slug: newer}))
    path = raw_path(tmp_path, "2026-11-08", "title")
    assert gzip.decompress(path.read_bytes()) == newer
    assert len(list(path.parent.iterdir())) == 1


def test_a_failed_second_run_keeps_the_earlier_file(tmp_path):
    source = SOURCES[0]
    fetch_source(source, "2026-11-08", tmp_path, getter({source.slug: GOOD}))
    fetch_source(source, "2026-11-08", tmp_path, getter({source.slug: OSError("down")}))
    assert gzip.decompress(raw_path(tmp_path, "2026-11-08", "title").read_bytes()) == GOOD
