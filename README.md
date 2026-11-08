# Premier League Odds Tracker

[![Tests](https://github.com/ethankaufman/data-tracker/actions/workflows/tests.yml/badge.svg)](https://github.com/ethankaufman/data-tracker/actions/workflows/tests.yml)

Once a day, a GitHub Action downloads the prices of Premier League prediction markets
(who wins the title, who is relegated, who finishes in the top 4, 6 and 10), adds them to a
history with one row per item per day, opens a GitHub Issue listing what moved the most,
and publishes the result to a website.

Project for Financial Data Analytics (Data Tracker Project).

## What is tracked

The data comes from [Polymarket](https://polymarket.com), a prediction market where people trade
"Yes" shares that pay out if an event happens. The price of a Yes share, between 0 and 1, is the
market's **implied probability** of the event (a price of 0.25 means the market gives it a 25%
chance). Each market has one sub-market per club, so an item is *a club in one market*, for
example "Arsenal wins the title".

This is a trading market, not a bookmaker, and some markets are thinly traded. Prices of rarely
traded clubs can sit at the lowest allowed price or jump on a single trade. The tool records
what the market says and makes no claim that it is right.

## Sources

Each source is one Polymarket event, read from the public Gamma API
(`https://gamma-api.polymarket.com/events?slug=<slug>`). No login or key is needed. The format is
JSON.

| Source name | Polymarket event (slug) | Question for each club | Items |
|---|---|---|---|
| `title` | `epl-2027-champion-20260701200428749` | Wins the Premier League title | 20 |
| `relegation` | `premier-league-teams-relegated-2026-27` | Is relegated | 20 |
| `top4` | `premier-league-top-4-finishers-2026-27` | Finishes in the top 4 | 20 |
| `top6` | `premier-league-top-6-finishers-2026-27` | Finishes in the top 6 | 20 |
| `top10` | `premier-league-top-10-finishers-2026-27` | Finishes in the top 10 | 20 |

That is 100 items. The sources are in `tracker/sources.py`.

**What is kept.** An answer holds far more than we use (descriptions, images, rules). The raw
file keeps the whole answer, exactly as received. The history keeps, for each club's market, only
the columns listed below. Markets that are inactive or closed (such as the placeholder rows
"Team A", "Team B", "Team C") and the row "Other" are dropped. Two spellings that differ between
markets are mapped to one name: "Brighton" → "Brighton & Hove Albion" and
"Tottenham" → "Tottenham Hotspur".

## The history file: `data/history.csv`

One row per item per day, sorted by `date` then `item_id`. Dates are UTC dates (`YYYY-MM-DD`). A
value the source does not report is left empty.

| Column | Meaning | Unit |
|---|---|---|
| `date` | UTC date of the run | `YYYY-MM-DD` |
| `item_id` | Key that identifies the item from day to day: `<source>:<club-slug>`, e.g. `title:arsenal` | text |
| `item` | The club's name | text |
| `source` | Which market the row comes from: `title`, `relegation`, `top4`, `top6` or `top10` | text |
| `price` | Price of a "Yes" share = the market's implied probability of the event | 0 to 1 |
| `best_bid` | Highest price a buyer is offering for a Yes share | 0 to 1 |
| `best_ask` | Lowest price a seller is asking for a Yes share | 0 to 1 |
| `spread` | `best_ask` − `best_bid`; a wide spread means a thin market | 0 to 1 |
| `last_trade` | Price of the most recent trade | 0 to 1 |
| `volume_total` | Total value traded in this club's market since it opened | US dollars |
| `volume_24h` | Value traded in the last 24 hours (often empty when nothing traded) | US dollars |
| `liquidity` | Value of the orders waiting in the market | US dollars |
| `updated_at` | When Polymarket last updated this market | UTC timestamp |

## The status file: `data/status.json`

Describes the latest run. Keys: `run_time` (UTC), `first_run_date` (the date of the earliest raw
file), `days_with_success` (the number of different dates with a raw file), `items` (the number
of items in the latest run), `new_today` and `gone_today` (the `item_id`s that appeared or
disappeared since the previous day with data), and `sources`: one entry per source with `name`,
`ok`, `count` (the number of items it gave) and, when it failed, `error`.

## The move rule

A **move** is the change in an item's `price` between the latest day in the history and the
previous day with data, in **percentage points** (a price going from 0.30 to 0.35 is +5.0 pp).
Items are ranked by the size of the change, up or down, and **the 10 biggest moves** are listed in
the daily issue with the old and new values. Items with no price on one of the two days cannot be
compared and are left out; items whose price did not change are not moves. An item in the latest
day but not the previous one has **appeared**; one in the previous day but not the latest has
**gone**. The issue lists both. The rule is in `tracker/moves.py`.

## How a run works

The daily workflow (`.github/workflows/daily.yml`) runs `python -m tracker.run` once a day at
06:17 UTC, and can also be started by hand from the Actions tab.

1. **Download.** Every source is downloaded and saved, compressed and in the format it came in, as
   `data/raw/<date>/<source>.json.gz`. A source that fails writes no raw file and does not stop
   the others. The result of every source (ok or failed, and why) goes in `status.json`.
2. **Build.** `data/history.csv` is rebuilt from all the raw files.
3. **Status.** `data/status.json` is written.
4. **Issue.** A GitHub Issue titled with the date lists the biggest moves and the items that
   appeared or disappeared. The previous day's issue is closed. The issue is opened every day,
   even when nothing changed.
5. **Commit.** The workflow commits the raw files, the history and the status.

A run counts as successful when it finishes and commits, even if some sources failed. A second run
on the same UTC day replaces that day's raw files, rebuilds the history and updates that day's
issue, so each day counts once. (If a source fails on the second run, the file from the first run
is kept.)

### Rebuild the history from the raw files

```
python -m tracker.history
```

The history depends on the raw files alone, so this always gives the same `data/history.csv`.
If a conversion rule changes, running it applies the change to every day.

## Tests

```
pip install -r requirements-dev.txt
pytest
```

GitHub Actions runs the tests on every push. They cover the conversion of each source to the
common columns, the move rule, the history logic, the issue handling, and a second run on the
same day.

## Files

| File | What it does |
|---|---|
| `tracker/sources.py` | The five sources, and the code that downloads one and saves the raw file |
| `tracker/convert.py` | Turns one raw file into rows with the common columns |
| `tracker/history.py` | Builds `data/history.csv` from the raw files (`python -m tracker.history`) |
| `tracker/moves.py` | The move rule: biggest moves, appeared and gone items |
| `tracker/status.py` | Builds `data/status.json` |
| `tracker/report.py` | Writes the text of the daily issue |
| `tracker/issues.py` | Opens today's issue, updates it on a second run, closes the previous day's |
| `tracker/run.py` | The daily run that ties the steps together (`python -m tracker.run`) |
| `tests/` | The pytest suite |
| `.github/workflows/daily.yml` | The daily run: download, build, issue, commit |
| `.github/workflows/tests.yml` | Runs the tests on every push |
| `data/raw/<date>/<source>.json.gz` | The raw answers, compressed, one folder per day |
| `data/history.csv` | The history, one row per item per day |
| `data/status.json` | Describes the latest run |
| `requirements-dev.txt` | Test dependency (the pipeline itself uses only the Python standard library) |
