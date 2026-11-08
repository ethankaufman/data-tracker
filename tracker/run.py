"""The daily run:  python -m tracker.run

1. download every source into data/raw/<date>/   2. rebuild data/history.csv
3. write data/status.json                        4. open today's GitHub Issue
(The workflow then commits the data files.)
"""

import sys
from datetime import datetime, timezone

from tracker.history import HISTORY_PATH, RAW_DIR, ROOT, build_history, write_history
from tracker.issues import publish_issue
from tracker.moves import compare
from tracker.report import issue_body
from tracker.sources import SOURCES, download, fetch_all
from tracker.status import build_status, write_status

STATUS_PATH = ROOT / "data" / "status.json"


def run(now, raw_dir=RAW_DIR, history_path=HISTORY_PATH, status_path=STATUS_PATH, get=download, publish=None):
    """One run at the moment `now` (a UTC datetime). Returns the status dictionary.

    A second run on the same UTC day replaces that day's raw files and rebuilds everything,
    so each day counts once.
    """
    day = now.strftime("%Y-%m-%d")
    results = fetch_all(day, raw_dir, get)

    rows = build_history(raw_dir)
    write_history(rows, history_path)

    comparison = compare(rows)
    status = build_status(now, raw_dir, rows, comparison, results)
    write_status(status, status_path)

    if publish:
        titles = {s.name: s.title for s in SOURCES}
        try:
            publish(day, issue_body(day, comparison, results, titles))
        except Exception as error:  # a failed issue must not stop the data being committed
            print(f"Could not publish the issue: {error}", file=sys.stderr)
    return status


def main():
    now = datetime.now(timezone.utc)
    publish = None if "--no-issue" in sys.argv else publish_issue
    status = run(now, publish=publish)
    for source in status["sources"]:
        print(f"{source['name']}: {'ok' if source['ok'] else 'FAILED'} ({source['count']} items)")
    print(f"{status['items']} items, {status['days_with_success']} day(s) with data")


if __name__ == "__main__":
    main()
