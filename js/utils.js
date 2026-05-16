// Sma hjelpefunksjoner: tid, tall og HTML-escaping.

export const DAYS = ["Man", "Tir", "Ons", "Tor", "Fre", "Lor", "Son"];
export const DAYS_LONG = [
  "Mandag",
  "Tirsdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
  "Lordag",
  "Sondag"
];

export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function toMinutes(hhmm) {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// Varighet i minutter. Slutt for/lik start tolkes som over midnatt.
export function durationMinutes(start, end) {
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s === null || e === null) return 0;
  return e > s ? e - s : 1440 - s + e;
}

export function fmtKr(n) {
  const num = Number(n) || 0;
  return num.toLocaleString("no-NO", { maximumFractionDigits: 0 }) + " kr";
}

export function fmtNum(n) {
  return (Number(n) || 0).toLocaleString("no-NO", {
    maximumFractionDigits: 0
  });
}

export function fmtHours(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} t ${m} min` : `${h} t`;
}
