// Every calculation the pages show. Pure functions of the history rows (no page code),
// so the numbers can be checked against the history file outside the browser.

export const MARKETS = [
  { id: "title", label: "Title", question: "wins the title", expected: 1 },
  { id: "relegation", label: "Relegation", question: "is relegated", expected: 3 },
  { id: "top4", label: "Top 4", question: "finishes in the top 4", expected: 4 },
  { id: "top6", label: "Top 6", question: "finishes in the top 6", expected: 6 },
  { id: "top10", label: "Top 10", question: "finishes in the top 10", expected: 10 },
];
export const marketLabel = (id) => MARKETS.find((m) => m.id === id)?.label ?? id;

export const round6 = (x) => Math.round(x * 1e6) / 1e6;

export function days(rows) {
  return [...new Set(rows.map((r) => r.date))].sort();
}
export const rowsOn = (rows, day) => rows.filter((r) => r.date === day);

// The latest day and the day before it (the previous day WITH data, not always yesterday).
export function latestAndPrevious(rows) {
  const all = days(rows);
  return { latest: all.at(-1) ?? null, previous: all.length > 1 ? all.at(-2) : null, count: all.length };
}

// The move rule: change in price between the latest day and the previous day, in probability
// (0.05 = 5 percentage points). Same rule as tracker/moves.py.
export function moves(rows) {
  const { latest, previous } = latestAndPrevious(rows);
  if (!previous) return { latest, previous, moves: [], appeared: [], gone: [], changeById: new Map() };
  const now = new Map(rowsOn(rows, latest).map((r) => [r.item_id, r]));
  const before = new Map(rowsOn(rows, previous).map((r) => [r.item_id, r]));
  const list = [];
  const changeById = new Map();
  for (const [id, row] of now) {
    const old = before.get(id);
    if (!old || old.price == null || row.price == null) continue;
    const change = round6(row.price - old.price);
    changeById.set(id, change);
    if (change !== 0) list.push({ item_id: id, item: row.item, source: row.source, old: old.price, new: row.price, change });
  }
  list.sort((a, b) => Math.abs(b.change) - Math.abs(a.change) || (a.item_id < b.item_id ? -1 : 1));
  return {
    latest, previous, moves: list, changeById,
    appeared: [...now.keys()].filter((id) => !before.has(id)).sort(),
    gone: [...before.keys()].filter((id) => !now.has(id)).sort(),
  };
}

// Finding 1: who is the title favourite on the latest day.
export function titleFavourites(rows) {
  const { latest } = latestAndPrevious(rows);
  const list = rowsOn(rows, latest).filter((r) => r.source === "title" && r.price != null);
  return { day: latest, list: list.sort((a, b) => b.price - a.price || (a.item < b.item ? -1 : 1)) };
}

// Finding 2: do a market's prices add up to its fair total? (Exactly 1 team wins, 3 go down...)
export function marketTotals(rows) {
  const { latest } = latestAndPrevious(rows);
  const today = rowsOn(rows, latest);
  return {
    day: latest,
    list: MARKETS.map((m) => {
      const prices = today.filter((r) => r.source === m.id && r.price != null).map((r) => r.price);
      const total = prices.reduce((a, b) => a + b, 0);
      return { id: m.id, label: m.label, expected: m.expected, clubs: prices.length, total: round6(total), excess: round6(total / m.expected - 1) };
    }).filter((m) => m.clubs > 0),
  };
}

// Finding 3: change in price from each item's first day to the latest day.
export function sinceFirstRun(rows) {
  const { latest, count } = latestAndPrevious(rows);
  const first = new Map();
  for (const r of rows) if (r.price != null && !first.has(r.item_id)) first.set(r.item_id, r);
  const list = [];
  for (const r of rowsOn(rows, latest)) {
    const start = first.get(r.item_id);
    if (!start || r.price == null || start.date === latest) continue;
    list.push({ item_id: r.item_id, item: r.item, source: r.source, start_date: start.date, old: start.price, new: r.price, change: round6(r.price - start.price) });
  }
  list.sort((a, b) => Math.abs(b.change) - Math.abs(a.change) || (a.item_id < b.item_id ? -1 : 1));
  return { day: latest, firstDay: days(rows)[0] ?? null, days: count, list };
}

// Finding 4: for each day after the first, the single biggest move since the day before.
export function dailyBiggestMoves(rows) {
  const all = days(rows);
  const out = [];
  for (let i = 1; i < all.length; i++) {
    const before = new Map(rowsOn(rows, all[i - 1]).map((r) => [r.item_id, r]));
    let best = null;
    for (const r of rowsOn(rows, all[i])) {
      const old = before.get(r.item_id);
      if (!old || old.price == null || r.price == null) continue;
      const change = round6(r.price - old.price);
      if (!best || Math.abs(change) > Math.abs(best.change) || (Math.abs(change) === Math.abs(best.change) && r.item_id < best.item_id)) {
        best = { date: all[i], previous: all[i - 1], item_id: r.item_id, item: r.item, source: r.source, old: old.price, new: r.price, change };
      }
    }
    if (best) out.push(best);
  }
  return out;
}

// Finding 5: the average spread (best ask minus best bid) in each market on the latest day.
export function spreadByMarket(rows) {
  const { latest } = latestAndPrevious(rows);
  const today = rowsOn(rows, latest);
  return {
    day: latest,
    list: MARKETS.map((m) => {
      const spreads = today.filter((r) => r.source === m.id && r.spread != null).map((r) => r.spread);
      const mean = spreads.length ? spreads.reduce((a, b) => a + b, 0) / spreads.length : null;
      return { id: m.id, label: m.label, clubs: spreads.length, mean: mean == null ? null : round6(mean) };
    }).filter((m) => m.mean != null),
  };
}

// The chart of one value over the days: one series per item, one point per day (null = no row).
export function series(rows, itemIds, column) {
  const all = days(rows);
  return itemIds.map((id) => {
    const byDay = new Map(rows.filter((r) => r.item_id === id).map((r) => [r.date, r[column]]));
    const first = rows.find((r) => r.item_id === id);
    return { id, label: first ? `${first.item} (${marketLabel(first.source)})` : id, values: all.map((d) => byDay.get(d) ?? null) };
  });
}
