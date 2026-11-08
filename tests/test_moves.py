from tracker.moves import compare


def row(day, item_id, price, source="title"):
    return {"date": day, "item_id": item_id, "item": item_id.split(":")[1].title(), "source": source, "price": price}


def test_biggest_moves_first_up_or_down():
    rows = [
        row("2026-11-08", "title:a", 0.50),
        row("2026-11-08", "title:b", 0.30),
        row("2026-11-08", "title:c", 0.10),
        row("2026-11-09", "title:a", 0.52),  # +0.02
        row("2026-11-09", "title:b", 0.20),  # -0.10
        row("2026-11-09", "title:c", 0.10),  # unchanged: not a move
    ]
    result = compare(rows)
    assert result["latest"] == "2026-11-09"
    assert result["previous"] == "2026-11-08"
    assert [m["item_id"] for m in result["moves"]] == ["title:b", "title:a"]
    assert result["moves"][0]["old"] == 0.30
    assert result["moves"][0]["new"] == 0.20
    assert result["moves"][0]["change"] == -0.10


def test_items_that_appear_or_disappear():
    rows = [
        row("2026-11-08", "title:a", 0.5),
        row("2026-11-08", "title:gone", 0.5),
        row("2026-11-09", "title:a", 0.5),
        row("2026-11-09", "title:new", 0.5),
    ]
    result = compare(rows)
    assert result["appeared"] == ["title:new"]
    assert result["gone"] == ["title:gone"]
    assert result["moves"] == []


def test_previous_is_the_last_earlier_day_even_if_days_are_missing():
    rows = [row("2026-11-01", "title:a", 0.4), row("2026-11-05", "title:a", 0.5)]
    result = compare(rows)
    assert result["previous"] == "2026-11-01"
    assert result["moves"][0]["change"] == 0.1


def test_first_day_has_nothing_to_compare():
    result = compare([row("2026-11-08", "title:a", 0.5)])
    assert result["latest"] == "2026-11-08"
    assert result["previous"] is None
    assert result["moves"] == result["appeared"] == result["gone"] == []


def test_items_without_a_price_cannot_be_ranked():
    rows = [row("2026-11-08", "title:a", None), row("2026-11-09", "title:a", 0.5)]
    assert compare(rows)["moves"] == []


def test_empty_history():
    assert compare([])["latest"] is None


def test_ties_are_ordered_by_item_id():
    rows = [
        row("2026-11-08", "title:b", 0.1),
        row("2026-11-08", "title:a", 0.1),
        row("2026-11-09", "title:b", 0.2),
        row("2026-11-09", "title:a", 0.2),
    ]
    assert [m["item_id"] for m in compare(rows)["moves"]] == ["title:a", "title:b"]
