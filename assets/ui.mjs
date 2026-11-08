// Things every page uses: the navigation bar, number formats, the shortlist, installing.

// Build an element. Text always goes in as text (never as HTML), so data can't inject markup.
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

// ---------- number formats ----------
const DASH = "–";
export function pct(p) {
  if (p == null) return DASH;
  const v = p * 100;
  return `${Math.abs(v) < 1 && v !== 0 ? v.toFixed(2) : v.toFixed(1)}%`;
}
// A change in percentage points, with a sign. The input is a change in probability (0.05 = 5 pp).
export function pp(change, signed = true) {
  if (change == null) return DASH;
  const v = change * 100;
  const text = Math.abs(v) < 0.1 && v !== 0 ? Math.abs(v).toFixed(2) : Math.abs(v).toFixed(1);
  const sign = !signed ? "" : v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${text} pp`;
}
export function money(x) {
  if (x == null) return DASH;
  if (x >= 1e6) return `$${(x / 1e6).toFixed(2)}M`;
  if (x >= 1e4) return `$${(x / 1e3).toFixed(1)}K`;
  return `$${Math.round(x).toLocaleString("en-US")}`;
}
export const COLUMNS = [
  { key: "price", label: "Price", help: "Chance the market gives the event", format: pct },
  { key: "best_bid", label: "Best bid", help: "Highest price a buyer offers", format: pct },
  { key: "best_ask", label: "Best ask", help: "Lowest price a seller asks", format: pct },
  { key: "spread", label: "Spread", help: "Best ask minus best bid", format: (v) => pp(v, false) },
  { key: "last_trade", label: "Last trade", help: "Price of the latest trade", format: pct },
  { key: "volume_total", label: "Volume", help: "Total traded since the market opened", format: money },
  { key: "volume_24h", label: "24h volume", help: "Traded in the last 24 hours", format: money },
  { key: "liquidity", label: "Liquidity", help: "Value of the waiting orders", format: money },
];
export const columnInfo = (key) => COLUMNS.find((c) => c.key === key);

export function formatDay(day) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
export function formatShortDay(day) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}
export function formatRunTime(iso) {
  const when = new Date(iso);
  const utc = when.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  const local = when.toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
  return `${utc} UTC (${local} for you)`;
}
// Arrow + signed change, e.g. "▲ +1.5 pp". Colour is extra: the arrow and the sign carry the meaning.
export function changeCell(change) {
  if (change == null) return el("span", { class: "muted" }, DASH);
  if (change === 0) return el("span", { class: "muted" }, "0.0 pp");
  return el("span", {}, el("span", { class: change > 0 ? "arrow-up" : "arrow-down", "aria-hidden": "true" }, change > 0 ? "▲ " : "▼ "), pp(change));
}

// ---------- the shortlist (stars), kept in this browser ----------
const SHORTLIST_KEY = "pl-tracker-shortlist";
export function getShortlist() {
  try {
    return new Set(JSON.parse(localStorage.getItem(SHORTLIST_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}
export function toggleShortlist(itemId) {
  const list = getShortlist();
  list.has(itemId) ? list.delete(itemId) : list.add(itemId);
  try {
    localStorage.setItem(SHORTLIST_KEY, JSON.stringify([...list]));
  } catch {
    /* storage blocked: the star just won't stick */
  }
  return list;
}

// ---------- the page frame ----------
const PAGES = [
  ["index.html", "Today", "today"],
  ["browse.html", "Browse", "browse"],
  ["trends.html", "Trends", "trends"],
];
export function startPage() {
  const current = document.body.dataset.page;
  const links = PAGES.map(([href, label, id]) => el("a", { href, "aria-current": id === current ? "page" : null }, label));
  const install = el("button", { class: "install", type: "button" }, "Install app");
  document.body.prepend(
    el("a", { class: "visually-hidden", href: "#main" }, "Skip to content"),
    el("header", { class: "nav" }, el("div", { class: "nav-inner" },
      el("a", { class: "brand", href: "index.html" }, "PL Market Tracker"),
      el("nav", { class: "nav-links", "aria-label": "Pages" }, links),
      install)),
  );

  // "Install app": the browser tells us when the site can be installed.
  let prompt = null;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    prompt = event;
    install.style.display = "inline-block";
  });
  install.addEventListener("click", async () => {
    if (!prompt) return;
    prompt.prompt();
    await prompt.userChoice;
    prompt = null;
    install.style.display = "none";
  });
  window.addEventListener("appinstalled", () => (install.style.display = "none"));

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}

// Put nodes in a page area, skipping empty ones (replaceChildren would print "null").
export function render(host, ...nodes) {
  host.replaceChildren(...nodes.flat().filter(Boolean));
}

export function showError(host, error) {
  host.replaceChildren(el("div", { class: "notice error", role: "alert" }, `Could not load the data (${error.message}). Check your connection and reload.`));
}
// Tell the visitor when the page is showing saved data.
export function offlineNotice() {
  return navigator.onLine === false
    ? el("div", { class: "notice", role: "status" }, "You are offline. Showing the last data this device loaded.")
    : null;
}
