import { loadData } from "./data.mjs";
import { MARKETS, marketLabel, latestAndPrevious, rowsOn } from "./stats.mjs";
import { el, startPage, render, showError, offlineNotice, formatDay, COLUMNS, getShortlist, toggleShortlist } from "./ui.mjs";

startPage();
const app = document.getElementById("app");

const state = { market: "all", search: "", minPrice: "", maxPrice: "", maxSpread: "", tradedOnly: false, shortlistOnly: false, sort: { key: "price", dir: "desc" } };

function compare(a, b, { key, dir }) {
  const x = a[key], y = b[key];
  if (x == null && y == null) return 0;
  if (x == null) return 1; // empty values always go last, whichever way we sort
  if (y == null) return -1;
  const result = typeof x === "string" ? x.localeCompare(y) : x - y;
  return dir === "asc" ? result : -result;
}

function visibleRows(today, shortlist) {
  const search = state.search.trim().toLowerCase();
  const min = state.minPrice === "" ? null : Number(state.minPrice) / 100;
  const max = state.maxPrice === "" ? null : Number(state.maxPrice) / 100;
  const spread = state.maxSpread === "" ? null : Number(state.maxSpread) / 100;
  return today
    .filter((r) => state.market === "all" || r.source === state.market)
    .filter((r) => !search || r.item.toLowerCase().includes(search))
    .filter((r) => min == null || (r.price != null && r.price >= min))
    .filter((r) => max == null || (r.price != null && r.price <= max))
    .filter((r) => spread == null || (r.spread != null && r.spread <= spread))
    .filter((r) => !state.tradedOnly || (r.volume_24h ?? 0) > 0)
    .filter((r) => !state.shortlistOnly || shortlist.has(r.item_id))
    .sort((a, b) => compare(a, b, state.sort) || (a.item_id < b.item_id ? -1 : 1));
}

function build(rows, status) {
  const { latest } = latestAndPrevious(rows);
  const today = rowsOn(rows, latest).map((r) => ({ ...r, marketName: marketLabel(r.source) }));
  let shortlist = getShortlist();

  const summary = el("p", { class: "muted", role: "status" });
  const head = el("tr");
  const body = el("tbody");

  // ----- controls (one row above the table) -----
  const field = (label, input) => el("label", { class: "control" }, label, input);
  const marketSelect = el("select", { onchange: (e) => { state.market = e.target.value; draw(); } },
    el("option", { value: "all" }, "All markets"), MARKETS.map((m) => el("option", { value: m.id }, m.label)));
  const search = el("input", { type: "search", placeholder: "e.g. Arsenal", autocomplete: "off", oninput: (e) => { state.search = e.target.value; draw(); } });
  const fromLink = new URLSearchParams(location.search).get("q"); // e.g. browse.html?q=Arsenal
  if (fromLink) { state.search = fromLink; search.value = fromLink; }
  const num = (key, placeholder) => el("input", { type: "number", min: "0", max: "100", step: "any", placeholder, oninput: (e) => { state[key] = e.target.value; draw(); } });
  const minPrice = num("minPrice", "0"), maxPrice = num("maxPrice", "100"), maxSpread = num("maxSpread", "100");
  const traded = el("input", { type: "checkbox", onchange: (e) => { state.tradedOnly = e.target.checked; draw(); } });
  const starred = el("input", { type: "checkbox", onchange: (e) => { state.shortlistOnly = e.target.checked; draw(); } });
  const reset = el("button", { class: "plain", type: "button", onclick: () => {
    Object.assign(state, { market: "all", search: "", minPrice: "", maxPrice: "", maxSpread: "", tradedOnly: false, shortlistOnly: false });
    marketSelect.value = "all"; search.value = ""; for (const i of [minPrice, maxPrice, maxSpread]) i.value = ""; traded.checked = starred.checked = false;
    draw();
  } }, "Clear filters");

  const controls = el("div", { class: "card" },
    el("div", { class: "controls" },
      field("Search clubs", search), field("Market", marketSelect),
      field("Price at least (%)", minPrice), field("Price at most (%)", maxPrice), field("Spread at most (pp)", maxSpread)),
    el("div", { class: "controls" },
      el("label", { class: "check" }, traded, "Traded in the last 24 hours"),
      el("label", { class: "check" }, starred, "★ Shortlist only"),
      reset),
    summary);

  // ----- table head: every numeric column sorts up and down -----
  function sortHeader(key, label, numeric, help) {
    const th = el("th", { class: numeric ? "num" : null, scope: "col", title: help });
    th.append(el("button", { type: "button", onclick: () => {
      state.sort = state.sort.key === key ? { key, dir: state.sort.dir === "asc" ? "desc" : "asc" } : { key, dir: numeric ? "desc" : "asc" };
      draw();
    } }, label, el("span", { "aria-hidden": "true", "data-arrow": "" })));
    th.dataset.key = key;
    return th;
  }
  head.append(el("th", { scope: "col" }, el("span", { class: "visually-hidden" }, "Shortlist")),
    sortHeader("item", "Club", false, "Club name"), sortHeader("marketName", "Market", false, "Which market"),
    ...COLUMNS.map((c) => sortHeader(c.key, c.label, true, c.help)));

  function draw() {
    shortlist = getShortlist();
    const list = visibleRows(today, shortlist);
    for (const th of head.querySelectorAll("th[data-key]")) {
      const active = th.dataset.key === state.sort.key;
      th.setAttribute("aria-sort", active ? (state.sort.dir === "asc" ? "ascending" : "descending") : "none");
      th.querySelector("[data-arrow]").textContent = active ? (state.sort.dir === "asc" ? " ▲" : " ▼") : "";
    }
    summary.textContent = `Showing ${list.length} of ${today.length} items · prices from ${formatDay(latest)} · ${shortlist.size} starred`;
    body.replaceChildren(...list.map((r) => {
      const on = shortlist.has(r.item_id);
      const label = `${r.item} (${r.marketName})`;
      return el("tr", {},
        el("td", {}, el("button", { class: "star", type: "button", "aria-pressed": String(on), "aria-label": `${on ? "Remove" : "Add"} ${label} ${on ? "from" : "to"} shortlist`, title: on ? "Remove from shortlist" : "Add to shortlist",
          onclick: () => { toggleShortlist(r.item_id); draw(); } }, on ? "★" : "☆")),
        el("td", {}, r.item), el("td", { class: "muted" }, r.marketName),
        COLUMNS.map((c) => el("td", { class: "num" }, c.format(r[c.key]))));
    }));
    if (!list.length) body.append(el("tr", {}, el("td", { colspan: 11, class: "muted" }, "No items match these filters.")));
  }

  draw();
  return [controls, el("div", { class: "card" }, el("div", { class: "table-wrap" }, el("table", {}, el("thead", {}, head), body)),
    el("p", { class: "muted small" }, "Price = the chance the market gives the event. Spread = best ask minus best bid (a wide spread means few orders). Empty values (–) were not reported."))];
}

try {
  const { status, rows } = await loadData();
  render(app, offlineNotice(), build(rows, status));
} catch (error) {
  showError(app, error);
}
