import { loadData } from "./data.mjs";
import { MARKETS, leagueTable, clubMarkets, clubPoints, series, latestAndPrevious } from "./stats.mjs";
import { el, startPage, render, showError, offlineNotice, pct, pp, formatDay, formatShortDay, changeCell, columnInfo, ordinal, signed } from "./ui.mjs";
import { lineChart, tableView, SERIES_COLORS } from "./charts.mjs";

startPage();
const app = document.getElementById("app");

const dec = (v, digits = 2) => (v == null ? "–" : v.toFixed(digits));
const whole = (v) => (v == null ? "–" : String(v));
const moveCell = (m) => (m == null ? el("span", { class: "muted" }, "–") : m === 0 ? el("span", { class: "muted" }, "–")
  : el("span", {}, el("span", { class: m > 0 ? "arrow-up" : "arrow-down", "aria-hidden": "true" }, m > 0 ? "▲" : "▼"), ` ${Math.abs(m)}`, el("span", { class: "visually-hidden" }, m > 0 ? " places up" : " places down")));

// Every column of the table: how to read it, show it, and sort by it.
const COLUMNS = [
  { key: "position", label: "Pos", help: "Position in the table", show: whole },
  { key: "club", label: "Club", help: "Club", text: true },
  { key: "move", label: "Move", help: "Places moved since the previous day with a table", show: moveCell, node: true },
  { key: "played", label: "P", help: "Played", show: whole },
  { key: "won", label: "W", help: "Won", show: whole },
  { key: "drawn", label: "D", help: "Drawn", show: whole },
  { key: "lost", label: "L", help: "Lost", show: whole },
  { key: "goals_for", label: "GF", help: "Goals for (scored)", show: whole },
  { key: "goals_against", label: "GA", help: "Goals against (conceded)", show: whole },
  { key: "goal_difference", label: "GD", help: "Goal difference (GF minus GA)", show: (v) => (v == null ? "–" : signed(v)) },
  { key: "points", label: "Pts", help: "Points (3 for a win, 1 for a draw)", show: whole, strong: true },
  { key: "ppg", label: "PPG", help: "Points per game", show: (v) => dec(v) },
  { key: "title", label: "Title", help: "Market chance of winning the title", show: pct },
  { key: "relegation", label: "Relegation", help: "Market chance of being relegated", show: pct },
];

function build(rows, all) {
  const table = leagueTable(all);
  if (!table.list.length) {
    return [el("div", { class: "empty" }, "There is no league table in the data yet. It appears after the next daily run.")];
  }
  const { latest } = latestAndPrevious(rows);
  const { day } = table;
  const marketOf = (club, id) => clubMarkets(rows, club).find((m) => m.market.id === id)?.row.price ?? null;
  const data = table.list.map((r) => ({ ...r, title: marketOf(r.club, "title"), relegation: marketOf(r.club, "relegation") }));

  const state = { sort: { key: "position", dir: "asc" }, search: "", club: null };
  const head = el("tr");
  const body = el("tbody");
  const panel = el("div");
  const summary = el("p", { class: "muted", role: "status" });

  const search = el("input", { type: "search", placeholder: "e.g. Arsenal", autocomplete: "off", oninput: (e) => { state.search = e.target.value; drawTable(); } });
  const controls = el("div", { class: "card" },
    el("div", { class: "controls" }, el("label", { class: "control" }, "Search clubs", search)),
    summary);

  function sortBy(key) {
    const text = COLUMNS.find((c) => c.key === key).text;
    state.sort = state.sort.key === key ? { key, dir: state.sort.dir === "asc" ? "desc" : "asc" } : { key, dir: text || key === "position" || key === "relegation" ? "asc" : "desc" };
    drawTable();
  }
  for (const c of COLUMNS) {
    const th = el("th", { class: c.text ? null : "num", scope: "col", title: c.help, "data-key": c.key });
    th.append(el("button", { type: "button", onclick: () => sortBy(c.key) }, c.label, el("span", { "aria-hidden": "true", "data-arrow": "" })));
    head.append(th);
  }

  function drawTable() {
    const { key, dir } = state.sort;
    const q = state.search.trim().toLowerCase();
    const list = data.filter((r) => !q || r.club.toLowerCase().includes(q)).sort((a, b) => {
      const x = a[key], y = b[key];
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      const result = typeof x === "string" ? x.localeCompare(y) : x - y;
      return (dir === "asc" ? result : -result) || a.position - b.position;
    });
    for (const th of head.children) {
      const active = th.dataset.key === key;
      th.setAttribute("aria-sort", active ? (dir === "asc" ? "ascending" : "descending") : "none");
      th.querySelector("[data-arrow]").textContent = active ? (dir === "asc" ? " ▲" : " ▼") : "";
    }
    summary.textContent = `Table after ${data[0].played ?? "?"} games each · ${formatDay(day)}${table.previous ? ` · "Move" is since ${formatDay(table.previous)}` : ""}`;
    body.replaceChildren(...list.map((r) => el("tr", { "aria-selected": state.club === r.club ? "true" : null, class: state.club === r.club ? "selected" : null },
      COLUMNS.map((c) => {
        if (c.key === "club") return el("td", {}, el("button", { class: "club-link", type: "button", "aria-label": `${r.club}: show all stats`, "aria-expanded": String(state.club === r.club), onclick: () => select(r.club, true) }, r.club));
        const value = r[c.key];
        return el("td", { class: `num${c.strong ? " strong" : ""}` }, c.node ? c.show(value) : c.show(value));
      }))));
    if (!list.length) body.append(el("tr", {}, el("td", { colspan: COLUMNS.length, class: "muted" }, "No club matches that search.")));
  }

  function select(club, scroll) {
    state.club = state.club === club && scroll ? null : club;
    const url = new URL(location.href);
    state.club ? url.searchParams.set("club", state.club) : url.searchParams.delete("club");
    history.replaceState(null, "", url);
    drawTable();
    drawPanel();
    if (state.club && scroll) panel.querySelector("h2")?.scrollIntoView({ block: "start" });
  }

  function drawPanel() {
    const r = data.find((x) => x.club === state.club);
    if (!r) { panel.replaceChildren(el("div", { class: "empty" }, "Click a club's name in the table to see all of its numbers here.")); return; }
    const tile = (label, value, note) => el("div", { class: "stat" }, el("div", { class: "label" }, label), el("div", { class: "value" }, value), note ? el("div", { class: "note" }, note) : null);
    const markets = clubMarkets(rows, r.club);
    const history_ = clubPoints(all, r.club);
    const marketChart = el("div");
    const pointsChart = el("div");
    const ids = markets.map((m) => m.row.item_id);
    const marketSeries = series(rows, ids, "price").map((s, i) => ({ ...s, label: markets[i].market.label, color: SERIES_COLORS[MARKETS.findIndex((m) => m.id === markets[i].market.id)] }));
    const dayList = [...new Set(rows.map((x) => x.date))].sort();

    const detail = el("section", { class: "card", "aria-labelledby": "club-name" },
      el("h2", { id: "club-name", tabindex: "-1" }, `${r.club}: ${r.position == null ? "not in the table" : `${ordinal(r.position)} with ${r.points} points`}`),
      el("p", { class: "muted" }, `After ${r.played} games: ${r.won} won, ${r.drawn} drawn, ${r.lost} lost. Goals ${r.goals_for} for, ${r.goals_against} against (${signed(r.goal_difference)}).`),
      el("div", { class: "stats" },
        tile("Points", r.points, `${dec(r.ppg)} per game`),
        tile("Record", `${r.won}-${r.drawn}-${r.lost}`, `${r.win_rate == null ? "–" : `${(r.win_rate * 100).toFixed(0)}%`} of games won`),
        tile("Goals scored", r.goals_for, `${dec(r.goals_per_game)} per game`),
        tile("Goals conceded", r.goals_against, `${dec(r.conceded_per_game)} per game`),
        tile("Goal difference", signed(r.goal_difference), "scored minus conceded")),

      el("h3", { class: "sub" }, "What the market thinks"),
      markets.length
        ? el("div", { class: "table-wrap" }, el("table", {},
            el("thead", {}, el("tr", {}, el("th", {}, "Market"), ["Chance", "Change", "Best bid", "Best ask", "Spread"].map((h) => el("th", { class: "num" }, h)))),
            el("tbody", {}, markets.map((m) => el("tr", {},
              el("td", {}, m.market.label),
              el("td", { class: "num strong" }, pct(m.row.price)),
              el("td", { class: "num" }, changeCell(m.change)),
              el("td", { class: "num" }, columnInfo("best_bid").format(m.row.best_bid)),
              el("td", { class: "num" }, columnInfo("best_ask").format(m.row.best_ask)),
              el("td", { class: "num" }, columnInfo("spread").format(m.row.spread)))))))
        : el("p", { class: "muted" }, "No market prices for this club yet."),
      el("p", { class: "muted small" }, `Market prices from ${latest ? formatDay(latest) : "–"}. Chance = what the market gives the event (see the `, el("a", { href: "guide.html#prices" }, "guide"), ")."),
      markets.length ? [el("h3", { class: "sub" }, "Market prices over the days"), marketChart, tableView(["Day", ...marketSeries.map((s) => s.label)], dayList.map((d, i) => [formatShortDay(d), ...marketSeries.map((s) => (s.values[i] == null ? "–" : pct(s.values[i])))]))] : null,

      history_.days.length > 0 ? [el("h3", { class: "sub" }, "Points over the days"), pointsChart,
        tableView(["Day", "Points", "Position"], history_.days.map((d, i) => [formatShortDay(d), whole(history_.points[i]), whole(history_.positions[i])]))] : null,
      el("p", {}, el("a", { href: `browse.html?q=${encodeURIComponent(r.club)}` }, `See all of ${r.club}'s numbers in Browse →`)));
    panel.replaceChildren(detail);
    if (markets.length) lineChart(marketChart, { days: dayList, series: marketSeries, format: pct, dayLabel: formatShortDay, height: 260, name: `${r.club} market prices over the days` });
    if (history_.days.length) lineChart(pointsChart, { days: history_.days, series: [{ id: "points", label: "Points", color: SERIES_COLORS[0], values: history_.points }], format: (v) => String(Math.round(v * 10) / 10), dayLabel: formatShortDay, height: 220, name: `${r.club} points over the days` });
  }

  drawTable();
  const wanted = new URLSearchParams(location.search).get("club");
  state.club = data.some((r) => r.club === wanted) ? wanted : null;
  drawTable();
  drawPanel();
  return [controls,
    el("div", { class: "card" }, el("div", { class: "table-wrap" }, el("table", { class: "league" }, el("thead", {}, head), body)),
      el("p", { class: "muted small" }, "Pos position · P played · W won · D drawn · L lost · GF goals for · GA goals against · GD goal difference · Pts points · PPG points per game · Title and Relegation are the market's chances.")),
    panel];
}

try {
  const { rows, all } = await loadData();
  render(app, offlineNotice(), build(rows, all));
} catch (error) {
  showError(app, error);
}
