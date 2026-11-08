import { loadData } from "./data.mjs";
import { MARKETS, marketLabel, latestAndPrevious, rowsOn, standingsRows } from "./stats.mjs";
import { el, startPage, render, showError, offlineNotice, formatDay, COLUMNS, LEAGUE_COLUMNS, getShortlist, toggleShortlist } from "./ui.mjs";

startPage();
const app = document.getElementById("app");

// "source" picks which rows (and so which columns) the table shows.
const SOURCES = [
  { id: "markets", label: "All market prices" },
  ...MARKETS.map((m) => ({ id: m.id, label: `${m.label} market` })),
  { id: "standings", label: "League table" },
  { id: "everything", label: "Everything (prices and league table)" },
];
const columnsFor = (source) => (source === "standings" ? LEAGUE_COLUMNS : source === "everything" ? [...COLUMNS, ...LEAGUE_COLUMNS] : COLUMNS);
const defaultSort = (source) => (source === "standings" ? { key: "position", dir: "asc" } : { key: "price", dir: "desc" });

const state = { source: "markets", search: "", minPrice: "", maxPrice: "", maxSpread: "", tradedOnly: false, shortlistOnly: false, sort: defaultSort("markets") };

function compare(a, b, { key, dir }) {
  const x = a[key], y = b[key];
  if (x == null && y == null) return 0;
  if (x == null) return 1; // empty values always go last, whichever way we sort
  if (y == null) return -1;
  const result = typeof x === "string" ? x.localeCompare(y) : x - y;
  return dir === "asc" ? result : -result;
}

function build(rows, all) {
  const { latest } = latestAndPrevious(rows);
  const market = rowsOn(rows, latest);
  const tableRows = standingsRows(all);
  const tableDay = tableRows.reduce((d, r) => (r.date > d ? r.date : d), "");
  const pool = [...market, ...tableRows.filter((r) => r.date === tableDay)].map((r) => ({ ...r, marketName: r.source === "standings" ? "League table" : marketLabel(r.source) }));
  let shortlist = getShortlist();

  const summary = el("p", { class: "muted", role: "status" });
  const head = el("tr");
  const body = el("tbody");

  function visibleRows() {
    const search = state.search.trim().toLowerCase();
    const min = state.minPrice === "" ? null : Number(state.minPrice) / 100;
    const max = state.maxPrice === "" ? null : Number(state.maxPrice) / 100;
    const spread = state.maxSpread === "" ? null : Number(state.maxSpread) / 100;
    return pool
      .filter((r) => state.source === "everything" || (state.source === "markets" ? r.source !== "standings" : r.source === state.source))
      .filter((r) => !search || r.item.toLowerCase().includes(search))
      .filter((r) => min == null || (r.price != null && r.price >= min))
      .filter((r) => max == null || (r.price != null && r.price <= max))
      .filter((r) => spread == null || (r.spread != null && r.spread <= spread))
      .filter((r) => !state.tradedOnly || (r.volume_24h ?? 0) > 0)
      .filter((r) => !state.shortlistOnly || shortlist.has(r.item_id))
      .sort((a, b) => compare(a, b, state.sort) || (a.item_id < b.item_id ? -1 : 1));
  }

  // ----- controls (one row above the table) -----
  const field = (label, input) => el("label", { class: "control" }, label, input);
  const sourceSelect = el("select", { onchange: (e) => {
    state.source = e.target.value;
    const keys = [...columnsFor(state.source).map((c) => c.key), "item", "marketName"];
    if (!keys.includes(state.sort.key)) state.sort = defaultSort(state.source); // the old sort column is not in this view
    draw();
  } }, SOURCES.map((s) => el("option", { value: s.id }, s.label)));
  const fromLink = new URLSearchParams(location.search).get("q"); // e.g. browse.html?q=Arsenal
  const search = el("input", { type: "search", placeholder: "e.g. Arsenal", autocomplete: "off", oninput: (e) => { state.search = e.target.value; draw(); } });
  if (fromLink) { state.search = fromLink; search.value = fromLink; }
  const num = (key, placeholder) => el("input", { type: "number", min: "0", max: "100", step: "any", placeholder, oninput: (e) => { state[key] = e.target.value; draw(); } });
  const minPrice = num("minPrice", "0"), maxPrice = num("maxPrice", "100"), maxSpread = num("maxSpread", "100");
  const traded = el("input", { type: "checkbox", onchange: (e) => { state.tradedOnly = e.target.checked; draw(); } });
  const starred = el("input", { type: "checkbox", onchange: (e) => { state.shortlistOnly = e.target.checked; draw(); } });
  const reset = el("button", { class: "plain", type: "button", onclick: () => {
    Object.assign(state, { source: "markets", search: "", minPrice: "", maxPrice: "", maxSpread: "", tradedOnly: false, shortlistOnly: false, sort: defaultSort("markets") });
    sourceSelect.value = "markets"; search.value = ""; for (const i of [minPrice, maxPrice, maxSpread]) i.value = ""; traded.checked = starred.checked = false;
    draw();
  } }, "Clear filters");

  const controls = el("div", { class: "card" },
    el("div", { class: "controls" },
      field("Search clubs", search), field("Show", sourceSelect),
      field("Price at least (%)", minPrice), field("Price at most (%)", maxPrice), field("Spread at most (pp)", maxSpread)),
    el("div", { class: "controls" },
      el("label", { class: "check" }, traded, "Traded in the last 24 hours"),
      el("label", { class: "check" }, starred, "★ Shortlist only"),
      reset),
    summary);

  // ----- table head: every column sorts up and down (rebuilt when the view changes) -----
  function drawHead() {
    const columns = [{ key: "item", label: "Club", text: true, help: "Club name" }, { key: "marketName", label: "Market", text: true, help: "Which market or table" },
      ...columnsFor(state.source).map((c) => ({ ...c, text: false }))];
    head.replaceChildren(el("th", { scope: "col" }, el("span", { class: "visually-hidden" }, "Shortlist")),
      ...columns.map((c) => {
        const th = el("th", { class: c.text ? null : "num", scope: "col", title: c.help, "data-key": c.key });
        const active = state.sort.key === c.key;
        th.setAttribute("aria-sort", active ? (state.sort.dir === "asc" ? "ascending" : "descending") : "none");
        th.append(el("button", { type: "button", onclick: () => {
          state.sort = state.sort.key === c.key ? { key: c.key, dir: state.sort.dir === "asc" ? "desc" : "asc" } : { key: c.key, dir: c.text || c.key === "position" ? "asc" : "desc" };
          draw();
        } }, c.label, el("span", { "aria-hidden": "true" }, active ? (state.sort.dir === "asc" ? " ▲" : " ▼") : "")));
        return th;
      }));
    return columns;
  }

  function draw() {
    shortlist = getShortlist();
    sourceSelect.value = state.source;
    const columns = drawHead().slice(2);
    const list = visibleRows();
    const where = SOURCES.find((s) => s.id === state.source).label.toLowerCase();
    summary.textContent = `Showing ${list.length} of ${pool.length} items (${where}) · prices from ${latest ? formatDay(latest) : "–"}${tableDay ? ` · table from ${formatDay(tableDay)}` : ""} · ${shortlist.size} starred`;
    body.replaceChildren(...list.map((r) => {
      const on = shortlist.has(r.item_id);
      const label = `${r.item} (${r.marketName})`;
      return el("tr", {},
        el("td", {}, el("button", { class: "star", type: "button", "aria-pressed": String(on), "aria-label": `${on ? "Remove" : "Add"} ${label} ${on ? "from" : "to"} shortlist`, title: on ? "Remove from shortlist" : "Add to shortlist",
          onclick: () => { toggleShortlist(r.item_id); draw(); } }, on ? "★" : "☆")),
        el("td", {}, r.item), el("td", { class: "muted" }, r.marketName),
        columns.map((c) => el("td", { class: "num" }, c.format(r[c.key]))));
    }));
    if (!list.length) body.append(el("tr", {}, el("td", { colspan: columns.length + 3, class: "muted" }, "No items match these filters.")));
  }

  draw();
  return [controls, el("div", { class: "card" }, el("div", { class: "table-wrap" }, el("table", {}, el("thead", {}, head), body)),
    el("p", { class: "muted small" }, "Price = the chance the market gives the event. Spread = best ask minus best bid (a wide spread means few orders). League table columns: Pos position, GF/GA goals for/against, GD goal difference, Pts points. The price filters apply to market prices. Empty values (–) were not reported."))];
}

try {
  const { rows, all } = await loadData();
  render(app, offlineNotice(), build(rows, all));
} catch (error) {
  showError(app, error);
}
