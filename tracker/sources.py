"""The list of data sources, and the code that downloads one of them."""

import gzip
import time
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from tracker.convert import convert

MARKET_URL = "https://gamma-api.polymarket.com/events?slug={slug}"
STANDINGS_URL = "https://site.api.espn.com/apis/v2/sports/soccer/eng.1/standings"


@dataclass(frozen=True)
class Source:
    name: str  # used in the raw file name and in the history "source" column
    title: str  # plain-English description, used in the site and the README
    url: str  # where the raw file is downloaded from


def market(name, slug, title):
    """A Polymarket event that holds one market per club."""
    return Source(name, title, MARKET_URL.format(slug=slug))


SOURCES = [
    market("title", "epl-2027-champion-20260701200428749", "Wins the Premier League title"),
    market("relegation", "premier-league-teams-relegated-2026-27", "Is relegated"),
    market("top4", "premier-league-top-4-finishers-2026-27", "Finishes in the top 4"),
    market("top6", "premier-league-top-6-finishers-2026-27", "Finishes in the top 6"),
    market("top10", "premier-league-top-10-finishers-2026-27", "Finishes in the top 10"),
    Source("standings", "Premier League table", STANDINGS_URL),
]
SOURCE_NAMES = [s.name for s in SOURCES]


def download(url, attempts=3, timeout=30):
    """Return the bytes at url. Try a few times before giving up (then raises)."""
    last_error = None
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(
                url,
                headers={"User-Agent": "data-tracker (student project)", "Accept": "application/json"},
            )
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.read()
        except Exception as error:  # network errors, HTTP errors, timeouts
            last_error = error
            time.sleep(2 * (attempt + 1))
    raise last_error


def raw_path(raw_dir, day, source_name):
    return Path(raw_dir) / day / f"{source_name}.json.gz"


def fetch_source(source, day, raw_dir, get=download):
    """Download one source and save it as data/raw/<day>/<name>.json.gz.

    Returns {"name", "ok", "count", "error"}. Never raises: a source that fails
    writes no raw file (an older file for the same day is left alone).
    """
    try:
        body = get(source.url)
        # Check the answer is usable before keeping it.
        count = len(convert(source.name, day, body))
        if count == 0:
            raise ValueError("the answer holds no clubs")
    except Exception as error:
        return {"name": source.name, "ok": False, "count": 0, "error": f"{type(error).__name__}: {error}"}

    path = raw_path(raw_dir, day, source.name)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(".tmp")
    temp.write_bytes(gzip.compress(body, mtime=0))  # mtime=0: same input, same bytes
    temp.replace(path)  # replaces any file from an earlier run the same day
    return {"name": source.name, "ok": True, "count": count, "error": None}


def fetch_all(day, raw_dir, get=download, sources=SOURCES):
    """Fetch every source. One failing source does not stop the others."""
    return [fetch_source(source, day, raw_dir, get) for source in sources]
