"""Build data/status.json, which describes the latest run."""

import json
from pathlib import Path

from tracker.history import raw_days


def days_with_raw_files(raw_dir):
    """Dates that have at least one raw file (a day with only failed sources doesn't count)."""
    return [day for day in raw_days(raw_dir) if any((Path(raw_dir) / day).glob("*.json.gz"))]


def build_status(run_time, raw_dir, rows, comparison, results):
    """The status dictionary. run_time is a UTC datetime."""
    days = days_with_raw_files(raw_dir)
    latest = comparison["latest"]
    sources = []
    for result in results:
        entry = {"name": result["name"], "ok": result["ok"], "count": result["count"]}
        if result.get("error"):
            entry["error"] = result["error"]
        sources.append(entry)
    return {
        "run_time": run_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "first_run_date": days[0] if days else None,
        "days_with_success": len(days),
        "items": sum(1 for row in rows if row["date"] == latest),
        "new_today": comparison["appeared"],
        "gone_today": comparison["gone"],
        "sources": sources,
    }


def write_status(status, path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(status, indent=2) + "\n", encoding="utf-8")
