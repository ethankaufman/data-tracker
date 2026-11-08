# Premier League Odds Tracker

[![Tests](https://github.com/ethankaufman/data-tracker/actions/workflows/tests.yml/badge.svg)](https://github.com/ethankaufman/data-tracker/actions/workflows/tests.yml)

Once a day, a GitHub Action downloads the prices of Premier League prediction markets
(who wins the title, who is relegated, who finishes in the top 4, 6 and 10), adds them to a
history with one row per item per day, opens a GitHub Issue listing what moved the most,
and publishes the result to a website.

**Live site:** https://ethankaufman.github.io/data-tracker/ (installable as an app, works offline)

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

## The site

Plain HTML, CSS and JavaScript (no build step), published with GitHub Pages from the `main` branch.
The three pages load `data/status.json` and `data/history.csv` in the browser and do every
calculation there. All pages share one navigation bar (`assets/ui.mjs`) and one stylesheet
(`assets/style.css`: system fonts, an indigo header, and a colour-blind-checked chart palette; it
follows the device's light or dark setting).

| Page | What it shows |
|---|---|
| `index.html` (Today) | Time of the last run, the status of every source, the counts from `status.json` (items, days with data, new and gone), the biggest moves since the previous run, and the latest values of every item with their change since the previous run |
| `browse.html` (Browse) | The latest values for every item. Filters for market, price range, spread and "traded in the last 24 hours", a search box for club names, sorting up and down on every numeric column, and a star on every item that saves it to a shortlist in the browser (it is still there after a reload) |
| `trends.html` (Trends) | A chart of any numeric value over the days with a picker for the clubs, and five findings, each with a heading that states the result, a paragraph with the numbers and how they are computed, a chart, and the table behind the chart |

The five findings on Trends: who is the title favourite; how far each market's prices are from a
fair total; which price moved the most since the first run; the biggest one-day move; and which
market is the hardest to trade (average spread). They are recomputed from `history.csv` every time
the page loads, so they change as the history grows. The calculations live in `assets/stats.mjs`.
A test (`tests/test_trends_numbers.py`) runs them with Node on a history file and compares every
number with a separate calculation in Python, so the page cannot drift away from the history file.

**Installable and offline.** `manifest.webmanifest` and `sw.js` (a service worker) make the site
installable from the browser. When the computer is online, every page and data file is loaded from
the network (and a copy is saved). When it is offline, the saved copies are used, so the site still
opens and shows the last data it loaded.

### Run the site on your own computer

```
python3 -m http.server 8000
```

then open http://localhost:8000. (Opening the files directly does not work: browsers only allow
the data files to be loaded through a web server.)

## Tests

```
pip install -r requirements-dev.txt
pytest
```

GitHub Actions runs the tests on every push. They cover the conversion of each source to the
common columns, the move rule, the history logic (including a second run on the same day), the
issue handling, and that the Trends numbers agree with the history file (this one needs Node.js).

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
| `index.html`, `browse.html`, `trends.html` | The three pages of the site |
| `assets/style.css` | The look shared by all pages |
| `assets/ui.mjs` | Shared page code: navigation bar, number formats, the shortlist, "Install app" button |
| `assets/data.mjs` | Loads and parses `status.json` and `history.csv` |
| `assets/stats.mjs` | Every calculation the pages show (moves, findings), as plain functions |
| `assets/charts.mjs` | The line, bar and column charts, tooltips and "show the numbers" tables |
| `assets/today.mjs`, `assets/browse.mjs`, `assets/trends.mjs` | The code of each page |
| `manifest.webmanifest` | Web app manifest (name, colours, icons) so the site can be installed |
| `sw.js` | Service worker: saves copies of the pages and data so the site opens offline |
| `icons/` | The app icons (`icon.svg`, and PNGs made by `tools/make_icons.py`) |
| `tools/make_icons.py` | Draws the PNG app icons with only the Python standard library |
| `tools/trends_numbers.mjs` | Prints the numbers the pages compute from a history file (used by a test) |
| `tests/` | The pytest suite |
| `.github/workflows/daily.yml` | The daily run: download, build, issue, commit |
| `.github/workflows/tests.yml` | Runs the tests on every push |
| `data/raw/<date>/<source>.json.gz` | The raw answers, compressed, one folder per day |
| `data/history.csv` | The history, one row per item per day |
| `data/status.json` | Describes the latest run |
| `requirements-dev.txt` | Test dependency (the pipeline itself uses only the Python standard library) |
