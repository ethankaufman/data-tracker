"""Build data/history.csv from the raw files alone.

Run it with:  python -m tracker.history
The result depends only on the files in data/raw/, so running it again gives the
same file, and a change to a conversion rule applies to every day of the history.
"""

import csv
import gzip
import re
from pathlib import Path

from tracker.convert import COLUMNS, NUMERIC_COLUMNS, convert
from tracker.sources import SOURCE_NAMES

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
HISTORY_PATH = ROOT / "data" / "history.csv"

DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def raw_days(raw_dir):
    """The dates that have a raw folder, oldest first."""
    raw_dir = Path(raw_dir)
    if not raw_dir.is_dir():
        return []
    return sorted(p.name for p in raw_dir.iterdir() if p.is_dir() and DATE_PATTERN.match(p.name))


def build_history(raw_dir=RAW_DIR):
    """Read every raw file and return the history rows, sorted by date then item_id."""
    rows = []
    for day in raw_days(raw_dir):
        for source in SOURCE_NAMES:
            path = Path(raw_dir) / day / f"{source}.json.gz"
            if path.exists():  # a day with no raw file for a source has no rows from it
                rows.extend(convert(source, day, gzip.decompress(path.read_bytes())))
    rows.sort(key=lambda row: (row["date"], row["item_id"]))
    return rows


def format_value(column, value):
    """Text for one CSV cell. Missing values are left empty."""
    if value is None:
        return ""
    if column in NUMERIC_COLUMNS:
        return f"{value:.6f}".rstrip("0").rstrip(".")
    return str(value)


def write_history(rows, path=HISTORY_PATH):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(COLUMNS)
        for row in rows:
            writer.writerow([format_value(column, row[column]) for column in COLUMNS])


def main():
    rows = build_history()
    write_history(rows)
    print(f"Wrote {len(rows)} rows to {HISTORY_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
