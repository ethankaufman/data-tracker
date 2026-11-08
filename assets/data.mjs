// Loading and reading the two data files: data/status.json and data/history.csv.

import { marketRows, standingsRows } from "./stats.mjs";

export const NUMERIC = [
  "price", "best_bid", "best_ask", "spread", "last_trade", "volume_total", "volume_24h", "liquidity",
  "position", "played", "won", "drawn", "lost", "goals_for", "goals_against", "goal_difference", "points",
];

// Split CSV text into rows of cells. Handles quoted cells ("a, b" and "" for a quote).
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// history.csv text -> array of row objects. Numbers become numbers; empty cells become null.
export function parseHistory(text) {
  const [header, ...body] = parseCsv(text);
  return body.map((cells) => {
    const row = {};
    header.forEach((name, i) => {
      const value = cells[i] ?? "";
      row[name] = NUMERIC.includes(name) ? (value === "" ? null : Number(value)) : value;
    });
    return row;
  });
}

async function fetchText(path) {
  // "no-cache" = ask the network whether the file changed. Offline, the service worker
  // answers with the last copy it saved.
  const response = await fetch(path, { cache: "no-cache" });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.text();
}

export async function loadData() {
  const [statusText, historyText] = await Promise.all([fetchText("data/status.json"), fetchText("data/history.csv")]);
  const all = parseHistory(historyText);
  // all = every row of history.csv; rows = the market prices; standings = the league table rows
  return { status: JSON.parse(statusText), all, rows: marketRows(all), standings: standingsRows(all) };
}
