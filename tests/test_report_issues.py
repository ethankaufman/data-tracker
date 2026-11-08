import json

from tracker.issues import publish_issue
from tracker.moves import compare
from tracker.report import issue_body


def row(day, item_id, price, source="title"):
    return {"date": day, "item_id": item_id, "item": "Arsenal", "source": source, "price": price}


def test_issue_body_lists_old_and_new_values_and_the_rule():
    rows = [row("2026-11-08", "title:arsenal", 0.5), row("2026-11-09", "title:arsenal", 0.55)]
    body = issue_body("2026-11-09", compare(rows), [], {"title": "Wins the Premier League title"})
    assert "| Arsenal | Wins the Premier League title | 50.0% | 55.0% | +5.0 pp |" in body
    assert "percentage points" in body


def test_issue_body_on_the_first_day():
    body = issue_body("2026-11-08", compare([row("2026-11-08", "title:arsenal", 0.5)]), [], {})
    assert "First day of data" in body


class FakeGh:
    """Records gh commands; `issues` is what `gh issue list` returns."""

    def __init__(self, issues):
        self.issues = issues
        self.calls = []

    def __call__(self, *args):
        self.calls.append(args)
        if args[:2] == ("issue", "list"):
            return json.dumps(self.issues)
        if args[:2] == ("issue", "create"):
            return "https://github.com/me/repo/issues/42\n"
        return ""


def test_new_day_creates_an_issue_and_closes_the_previous_one():
    fake = FakeGh([{"number": 7, "title": "2026-11-08"}])
    number = publish_issue("2026-11-09", "body", run=fake)
    assert number == 42
    kinds = [c[:2] for c in fake.calls]
    assert ("issue", "create") in kinds
    assert ("issue", "close") in kinds and fake.calls[-1][2] == "7"


def test_second_run_the_same_day_edits_the_issue_and_keeps_it_open():
    fake = FakeGh([{"number": 9, "title": "2026-11-09"}, {"number": 7, "title": "2026-11-08"}])
    number = publish_issue("2026-11-09", "new body", run=fake)
    assert number == 9
    kinds = [c[:2] for c in fake.calls]
    assert ("issue", "create") not in kinds
    assert ("issue", "edit") in kinds
    closed = [c[2] for c in fake.calls if c[:2] == ("issue", "close")]
    assert closed == ["7"]
