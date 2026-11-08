import { loadData } from "./data.mjs";
import { MARKETS, marketLabel, days, latestAndPrevious, rowsOn, titleFavourites, marketTotals, sinceFirstRun, dailyBiggestMoves, spreadByMarket, series } from "./stats.mjs";
import { el, startPage, render, showError, offlineNotice, pct, pp, formatDay, formatShortDay, COLUMNS, columnInfo } from "./ui.mjs";
import { lineChart, barChart, columnChart, tableView, SERIES_COLORS } from "./charts.mjs";

startPage();
const app = document.getElementById("app");

const UP = "var(--up)", DOWN = "var(--down)";
const DIRECTION_LEGEND = [{ label: "Price rose", color: UP }, { label: "Price fell", color: DOWN }];
const list = (items) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

// A finding: a heading that states the result, a paragraph with the numbers and how they are
// computed, a chart, and the table behind the chart.
function finding(id, heading, paragraphs, how, chart, table) {
  return el("section", { class: "card finding", "aria-labelledby": id },
    el("h2", { id }, heading), paragraphs.map((p) => el("p", {}, p)), el("p", { class: "how small" }, el("strong", {}, "How it is computed: "), how), chart, table);
}
const waiting = (text) => el("div", { class: "empty" }, text);

// ---------- the chart of each value over the days, with a picker for the items ----------
function overTime(rows) {
  const all = days(rows);
  const { latest } = latestAndPrevious(rows);
  const today = rowsOn(rows, latest);
  const byId = new Map(today.map((r) => [r.item_id, r]));
  const state = {
    column: "price",
    market: "title",
    selected: today.filter((r) => r.source === "title").sort((a, b) => (b.price ?? 0) - (a.price ?? 0)).slice(0, 4).map((r) => r.item_id),
  };
  // A club keeps its colour while it is selected, whatever else is added or removed.
  const slotOf = new Map();
  const assign = () => { for (const id of state.selected) if (!slotOf.has(id)) slotOf.set(id, [...Array(8).keys()].find((k) => ![...slotOf.values()].includes(k))); };

  const chart = el("div");
  const chips = el("div", { class: "chips", role: "group", "aria-label": "Clubs" });
  const picked = el("div", { class: "chips", "aria-label": "Selected" });
  const table = el("div");
  const note = el("p", { class: "muted small", role: "status" });

  function draw() {
    for (const id of [...slotOf.keys()]) if (!state.selected.includes(id)) slotOf.delete(id);
    assign();
    const info = columnInfo(state.column);
    const data = series(rows, state.selected, state.column).map((s) => ({ ...s, color: SERIES_COLORS[slotOf.get(s.id)] }));
    chips.replaceChildren(...today.filter((r) => r.source === state.market).sort((a, b) => a.item.localeCompare(b.item)).map((r) => {
      const on = state.selected.includes(r.item_id);
      return el("button", { class: "chip", type: "button", "aria-pressed": String(on), onclick: () => toggle(r.item_id) },
        el("span", { class: "key", style: on ? `background:${SERIES_COLORS[slotOf.get(r.item_id)]}` : null }), r.item);
    }));
    picked.replaceChildren(el("span", { class: "muted small" }, `Selected (${state.selected.length} of 8): `),
      ...state.selected.map((id) => el("button", { class: "chip", type: "button", "aria-label": `Remove ${byId.get(id)?.item ?? id}`, onclick: () => toggle(id) },
        el("span", { class: "key", style: `background:${SERIES_COLORS[slotOf.get(id)]}` }), `${byId.get(id)?.item ?? id} · ${marketLabel(byId.get(id)?.source)}`, " ×")),
      state.selected.length ? el("button", { class: "plain", type: "button", onclick: () => { state.selected = []; draw(); } }, "Clear") : null);
    lineChart(chart, { days: all, series: data, format: info.format, dayLabel: formatShortDay, name: `${info.label} over the days` });
    note.textContent = all.length === 1 ? "Only one day of history so far: each club shows as a single dot. Lines appear from the second day." : `${all.length} days of history, ${formatDay(all[0])} to ${formatDay(all.at(-1))}.`;
    table.replaceChildren(state.selected.length
      ? tableView(["Day", ...data.map((s) => s.label)], all.map((d, i) => [formatShortDay(d), ...data.map((s) => (s.values[i] == null ? "–" : info.format(s.values[i])))]))
      : "");
  }
  function toggle(id) {
    if (state.selected.includes(id)) state.selected = state.selected.filter((x) => x !== id);
    else if (state.selected.length < 8) state.selected = [...state.selected, id];
    draw();
  }

  const valueSelect = el("select", { onchange: (e) => { state.column = e.target.value; draw(); } }, COLUMNS.map((c) => el("option", { value: c.key }, c.label)));
  const marketSelect = el("select", { onchange: (e) => { state.market = e.target.value; draw(); } }, MARKETS.map((m) => el("option", { value: m.id }, m.label)));
  draw();
  return el("section", { class: "card", "aria-labelledby": "over-time" },
    el("h2", { id: "over-time" }, "Every value over the days"),
    el("p", { class: "muted" }, "Pick a value and the clubs to compare (up to 8). The line follows each club day by day; hover or use the arrow keys to read a day."),
    el("div", { class: "controls" },
      el("label", { class: "control" }, "Value", valueSelect), el("label", { class: "control" }, "Add clubs from the market", marketSelect)),
    chips, picked, chart, note, table);
}

// ---------- the five findings ----------
function findings(rows) {
  const out = [];

  // 1. The title favourite
  const fav = titleFavourites(rows);
  if (fav.list.length) {
    const top = fav.list.slice(0, 3), topSum = top.reduce((a, r) => a + r.price, 0);
    out.push(finding("f-favourite", `${top[0].item} is the title favourite, at ${pct(top[0].price)}`,
      [`On ${formatDay(fav.day)} the title market gives ${list(top.map((r) => `${r.item} ${pct(r.price)}`))}. Together the top ${top.length} hold ${pct(topSum)} of the 100% of title chances on offer, which leaves ${pct(Math.max(0, 1 - topSum))} for the other ${fav.list.length - top.length} clubs.`],
      `Take the rows of history.csv with source = title on the latest date (${fav.day}), keep their price (the market's probability), and sort from highest to lowest. The chart shows the top 8.`,
      (() => { const host = el("div"); barChart(host, { rows: fav.list.slice(0, 8).map((r) => ({ label: r.item, value: r.price, color: SERIES_COLORS[0] })), format: pct, name: "Title chances, top 8 clubs" }); return host; })(),
      tableView(["Club", "Title price"], fav.list.slice(0, 8).map((r) => [r.item, pct(r.price)]))));
  }

  // 2. Do the markets add up?
  const totals = marketTotals(rows);
  if (totals.list.length) {
    const worst = [...totals.list].sort((a, b) => Math.abs(b.excess) - Math.abs(a.excess))[0];
    const best = [...totals.list].sort((a, b) => Math.abs(a.excess) - Math.abs(b.excess))[0];
    const gap = (m) => `${pct(Math.abs(m.excess))} too ${m.excess >= 0 ? "much" : "little"}`;
    out.push(finding("f-overround", `The ${worst.label} market adds up to ${pct(1 + worst.excess)} of a fair total, the furthest from fair of the five`,
      [`If prices were exact probabilities, the title prices would add up to exactly 1 (one team wins), the relegation prices to 3, and the top 4, 6 and 10 prices to 4, 6 and 10. On ${formatDay(totals.day)} the ${worst.label} prices add up to ${worst.total.toFixed(2)} instead of ${worst.expected}, which is ${gap(worst)}. The ${best.label} market is the closest to fair, at ${best.total.toFixed(2)} instead of ${best.expected} (${gap(best)}).`,
       "A total above the fair one is the \"overround\": the cushion that thin markets and cautious sellers build into prices."],
      "For each market, add up the price of all its clubs on the latest date, divide by the number of places the market is about (1, 3, 4, 6 or 10), and subtract 1. The chart shows that gap: above zero means the prices add up to too much.",
      (() => { const host = el("div"); barChart(host, { rows: totals.list.map((m) => ({ label: m.label, value: m.excess, color: SERIES_COLORS[1] })), format: (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${pct(Math.abs(v))}`, signed: true, name: "How far each market is above a fair total" }); return host; })(),
      tableView(["Market", "Clubs", "Sum of prices", "Fair total", "Excess"], totals.list.map((m) => [m.label, m.clubs, m.total.toFixed(2), m.expected, `${m.excess >= 0 ? "+" : "−"}${pct(Math.abs(m.excess))}`]))));
  }

  // 3. Biggest change since the first run
  const since = sinceFirstRun(rows);
  if (!since.list.length) {
    out.push(finding("f-since", "No price has had time to move yet: the history holds a single day",
      [`The first run was on ${since.firstDay ? formatDay(since.firstDay) : "-"}. This section ranks every item by how far its price has moved since then, and fills in from the second day.`],
      "Compare each item's price on its first day in history.csv with its price on the latest date, and rank by the size of the change (percentage points).",
      waiting("Waiting for a second day of data."), null));
  } else {
    const top = since.list[0];
    const ups = since.list.filter((r) => r.change > 0).length, downs = since.list.filter((r) => r.change < 0).length;
    out.push(finding("f-since", `${top.item} ${top.change > 0 ? "rose" : "fell"} the most since the first run: ${pp(top.change)} in the ${marketLabel(top.source)} market`,
      [`Between ${formatDay(top.start_date)} and ${formatDay(since.day)}, ${top.item}'s ${marketLabel(top.source)} price went from ${pct(top.old)} to ${pct(top.new)}. Across all ${since.list.length} items, ${ups} rose, ${downs} fell and ${since.list.length - ups - downs} did not change.`],
      "Compare each item's price on its first day in history.csv with its price on the latest date, and rank by the size of the change, up or down, in percentage points (pp). The chart shows the 10 biggest.",
      (() => { const host = el("div"); barChart(host, { rows: since.list.slice(0, 10).map((r) => ({ label: `${r.item} · ${marketLabel(r.source)}`, value: r.change, color: r.change > 0 ? UP : DOWN })), format: (v) => pp(v), signed: true, legendItems: DIRECTION_LEGEND, name: "Biggest changes since the first run" }); return host; })(),
      tableView(["Item", "First price", "Latest price", "Change"], since.list.slice(0, 10).map((r) => [`${r.item} · ${marketLabel(r.source)}`, pct(r.old), pct(r.new), pp(r.change)]))));
  }

  // 4. The biggest single-day move
  const daily = dailyBiggestMoves(rows);
  if (!daily.length) {
    out.push(finding("f-day", "There is no day-to-day move to report yet",
      ["This section finds the single biggest one-day move in the whole history and shows the biggest move of each day. It fills in from the second day."],
      "For every pair of consecutive days with data, take each item's change in price and keep the largest change, up or down.",
      waiting("Waiting for a second day of data."), null));
  } else {
    const best = daily.reduce((a, b) => (Math.abs(b.change) > Math.abs(a.change) ? b : a));
    out.push(finding("f-day", `The biggest one-day move was ${best.item} in the ${marketLabel(best.source)} market: ${pp(best.change)} on ${formatDay(best.date)}`,
      [`From ${formatDay(best.previous)} to ${formatDay(best.date)}, ${best.item}'s ${marketLabel(best.source)} price went from ${pct(best.old)} to ${pct(best.new)}. Looking at all ${daily.length} day-to-day step${daily.length === 1 ? "" : "s"}, the typical day's biggest move is ${pp(daily.reduce((a, d) => a + Math.abs(d.change), 0) / daily.length, false)}.`],
      "For every pair of consecutive days with data, take each item's change in price and keep the largest change, up or down, as that day's biggest move. The tallest column is the biggest move in the history. The typical figure is the mean of those daily maxima.",
      (() => { const host = el("div"); columnChart(host, { rows: daily.map((d) => ({ label: `${formatDay(d.date)}: ${d.item}, ${marketLabel(d.source)}`, axis: formatShortDay(d.date), value: Math.abs(d.change), color: d.change > 0 ? UP : DOWN, detail: `${d.change > 0 ? "rose" : "fell"} from ${pct(d.old)} to ${pct(d.new)}` })), format: (v) => pp(v, false), legendItems: DIRECTION_LEGEND, name: "Biggest move each day" }); return host; })(),
      tableView(["Day", "Item", "Old", "New", "Change"], daily.map((d) => [formatShortDay(d.date), `${d.item} · ${marketLabel(d.source)}`, pct(d.old), pct(d.new), pp(d.change)]))));
  }

  // 5. How easy is each market to trade?
  const spreads = spreadByMarket(rows);
  if (spreads.list.length > 1) {
    const widest = [...spreads.list].sort((a, b) => b.mean - a.mean)[0], narrowest = [...spreads.list].sort((a, b) => a.mean - b.mean)[0];
    out.push(finding("f-spread", `The ${widest.label} market is the hardest to trade: its average spread is ${pp(widest.mean, false)}, against ${pp(narrowest.mean, false)} for ${narrowest.label}`,
      [`The spread is the gap between the best price a buyer offers and the best price a seller asks. A wide gap means few orders are waiting, so the price is more of a guess. On ${formatDay(spreads.day)}, the average spread over the ${widest.clubs} clubs is ${pp(widest.mean, false)} in the ${widest.label} market and ${pp(narrowest.mean, false)} in the ${narrowest.label} market.`],
      "For each market, take the spread column (best ask minus best bid) for every club on the latest date and average it, in percentage points.",
      (() => { const host = el("div"); barChart(host, { rows: spreads.list.map((m) => ({ label: m.label, value: m.mean, color: SERIES_COLORS[2] })), format: (v) => pp(v, false), name: "Average spread by market" }); return host; })(),
      tableView(["Market", "Clubs", "Average spread"], spreads.list.map((m) => [m.label, m.clubs, pp(m.mean, false)]))));
  }
  return out;
}

try {
  const { rows, all: everyRow } = await loadData();
  const all = days(rows);
  render(app, offlineNotice(),
    el("div", { class: "notice", role: "status" }, `Built from ${everyRow.length} rows: ${all.length} day${all.length === 1 ? "" : "s"} of history (${formatDay(all[0])} to ${formatDay(all.at(-1))}).`),
    overTime(rows), findings(rows));
} catch (error) {
  showError(app, error);
}
