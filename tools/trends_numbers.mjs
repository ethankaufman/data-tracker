// Prints, as JSON, the numbers the Trends and Today pages compute from a history file.
// It runs the same functions the browser runs (assets/stats.mjs); tests/test_trends_numbers.py
// compares the output with an independent calculation in Python.
//
//   node tools/trends_numbers.mjs data/history.csv
import { readFileSync } from "node:fs";
import { parseHistory } from "../assets/data.mjs";
import * as stats from "../assets/stats.mjs";

const rows = parseHistory(readFileSync(process.argv[2], "utf8"));
const move = stats.moves(rows);
console.log(JSON.stringify({
  days: stats.days(rows),
  favourites: stats.titleFavourites(rows).list.map((r) => [r.item, r.price]),
  totals: stats.marketTotals(rows).list.map((m) => [m.id, m.total, m.excess]),
  since: stats.sinceFirstRun(rows).list.map((r) => [r.item_id, r.old, r.new, r.change]),
  daily: stats.dailyBiggestMoves(rows).map((d) => [d.date, d.item_id, d.change]),
  spreads: stats.spreadByMarket(rows).list.map((m) => [m.id, m.mean]),
  moves: move.moves.map((m) => [m.item_id, m.old, m.new, m.change]),
  appeared: move.appeared,
  gone: move.gone,
}));
