import { loadData } from "./data.mjs";
import { MARKETS, marketLabel, moves, latestAndPrevious, rowsOn, leagueTable } from "./stats.mjs";
import { el, startPage, render, showError, offlineNotice, pct, pp, formatDay, formatRunTime, changeCell, columnInfo, signed } from "./ui.mjs";

startPage();
const app = document.getElementById("app");

// status.json holds counts (an older saved copy may hold a list, so both are read).
const number = (value) => (Array.isArray(value) ? value.length : value);

function statCard(label, value, note) {
  return el("div", { class: "stat" }, el("div", { class: "label" }, label), el("div", { class: "value" }, value), note ? el("div", { class: "note" }, note) : null);
}

function sourcesTable(status) {
  const titles = Object.fromEntries(MARKETS.map((m) => [m.id, `${m.label} market`]));
  titles.standings = "League table";
  return el("div", { class: "card" },
    el("h2", {}, "Sources"),
    el("p", { class: "muted small" }, "Each market is downloaded separately. If one fails, the others still update."),
    el("div", { class: "table-wrap" }, el("table", {},
      el("thead", {}, el("tr", {}, ["Source", "Status", "Items", "Details"].map((h, i) => el("th", { class: i === 2 ? "num" : null }, h)))),
      el("tbody", {}, status.sources.map((s) => el("tr", {},
        el("td", {}, titles[s.name] ?? s.name),
        el("td", {}, s.ok ? el("span", { class: "badge ok" }, "✓ OK") : el("span", { class: "badge fail" }, "✕ Failed")),
        el("td", { class: "num" }, s.count),
        el("td", { class: "muted" }, s.error ?? ""))))))
  );
}

function movesCard(change) {
  const card = el("div", { class: "card" }, el("h2", {}, "Biggest moves since the previous run"));
  if (!change.previous) {
    card.append(el("p", { class: "muted" }, "This is the first day of data, so there is nothing to compare with yet. Moves appear from the second day."));
    return card;
  }
  card.append(el("p", { class: "muted small" }, `Change in price (percentage points) from ${formatDay(change.previous)} to ${formatDay(change.latest)}. Top 10 of ${change.moves.length} items that moved.`));
  if (!change.moves.length) { card.append(el("p", {}, "No item's price changed.")); return card; }
  card.append(el("ol", { class: "moves" }, change.moves.slice(0, 10).map((m) => el("li", {},
    el("span", { class: "who" }, m.item),
    el("span", { class: "what" }, `${marketLabel(m.source)} market`),
    el("span", { class: "values" }, `${pct(m.old)} → ${pct(m.new)}`),
    changeCell(m.change)))));
  return card;
}

function leagueTab(all) {
  const table = leagueTable(all);
  if (!table.list.length) return el("p", { class: "muted" }, "No league table in the data yet.");
  const move = (m) => (m == null || m === 0 ? el("span", { class: "muted" }, "–") : el("span", {}, el("span", { class: m > 0 ? "arrow-up" : "arrow-down", "aria-hidden": "true" }, m > 0 ? "▲" : "▼"), ` ${Math.abs(m)}`));
  return el("div", {}, el("p", { class: "muted small" }, `League table on ${formatDay(table.day)}. The change is the points gained${table.previous ? ` since ${formatDay(table.previous)}` : " (none yet)"}, and the places moved.`),
    el("table", {},
      el("thead", {}, el("tr", {}, el("th", {}, "Club"), ["Pos", "Played", "Won", "Drawn", "Lost", "GF", "GA", "GD", "Pts", "Points change", "Places moved"].map((h) => el("th", { class: "num" }, h)))),
      el("tbody", {}, table.list.map((r) => el("tr", {},
        el("td", {}, r.club), ...[r.position, r.played, r.won, r.drawn, r.lost, r.goals_for, r.goals_against].map((v) => el("td", { class: "num" }, v ?? "–")),
        el("td", { class: "num" }, r.goal_difference == null ? "–" : signed(r.goal_difference)), el("td", { class: "num strong" }, r.points ?? "–"),
        el("td", { class: "num" }, r.pointsChange == null ? "–" : r.pointsChange === 0 ? "0" : `+${r.pointsChange}`), el("td", { class: "num" }, move(r.move)))))));
}

function latestTable(rows, change, all) {
  const { latest } = latestAndPrevious(rows);
  const today = rowsOn(rows, latest);
  const card = el("div", { class: "card" }, el("h2", {}, "Latest values"), el("p", { class: "muted small" }, `Prices on ${formatDay(latest)}. The change is since ${change.previous ? formatDay(change.previous) : "the previous run (none yet)"}.`));
  const tabs = el("div", { class: "tabs", role: "tablist", "aria-label": "Market" });
  const holder = el("div", { class: "table-wrap", role: "tabpanel" });
  const choices = [{ id: "all", label: "All markets" }, ...MARKETS, { id: "standings", label: "League table" }];
  function draw(id) {
    for (const t of tabs.children) t.setAttribute("aria-selected", String(t.dataset.id === id));
    if (id === "standings") { holder.replaceChildren(leagueTab(all)); return; }
    const order = (r) => MARKETS.findIndex((m) => m.id === r.source);
    const list = today.filter((r) => id === "all" || r.source === id).sort((a, b) => (id === "all" ? order(a) - order(b) : 0) || (b.price ?? -1) - (a.price ?? -1) || (a.item < b.item ? -1 : 1));
    const showMarket = id === "all";
    holder.replaceChildren(el("table", {},
      el("thead", {}, el("tr", {},
        el("th", {}, "Club"), showMarket ? el("th", {}, "Market") : null,
        el("th", { class: "num" }, "Price"), el("th", { class: "num" }, "Change"),
        el("th", { class: "num" }, "Best bid"), el("th", { class: "num" }, "Best ask"))),
      el("tbody", {}, list.map((r) => el("tr", {},
        el("td", {}, r.item), showMarket ? el("td", { class: "muted" }, marketLabel(r.source)) : null,
        el("td", { class: "num" }, pct(r.price)), el("td", { class: "num" }, changeCell(change.changeById?.get(r.item_id) ?? null)),
        el("td", { class: "num" }, columnInfo("best_bid").format(r.best_bid)), el("td", { class: "num" }, columnInfo("best_ask").format(r.best_ask)))))));
  }
  for (const c of choices) tabs.append(el("button", { class: "tab", type: "button", role: "tab", "data-id": c.id, onclick: () => draw(c.id) }, c.label));
  card.append(tabs, holder);
  draw("title");
  return card;
}

try {
  const { status, rows, all } = await loadData();
  const change = moves(rows);
  render(app,
    offlineNotice(),
    el("div", { class: "notice", role: "status" }, el("strong", {}, "Last run: "), formatRunTime(status.run_time), ` · data from ${formatDay(change.latest)}`),
    el("div", { class: "stats" },
      statCard("Items tracked", status.items, `${rowsOn(rows, change.latest).length} market prices + ${leagueTable(all).list.length} league table rows`),
      statCard("Days with data", status.days_with_success, `since ${formatDay(status.first_run_date)}`),
      statCard("New today", number(status.new_today), "items that appeared"),
      statCard("Gone today", number(status.gone_today), "items that disappeared")),
    sourcesTable(status),
    movesCard(change),
    latestTable(rows, change, all));
} catch (error) {
  showError(app, error);
}
