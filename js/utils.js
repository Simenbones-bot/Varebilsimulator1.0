// Sma hjelpefunksjoner: tid, tall og HTML-escaping.

export const DAYS = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];
export const DAYS_LONG = [
  "Mandag",
  "Tirsdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
  "Lørdag",
  "Søndag"
];

// Uke→maaned via norske virkedager: 253 virkedager/aar / 12 mnd / 5 ukedager.
export const MONTH_FACTOR = 253 / 12 / 5;

// Estimert maanedlig bilkostnad (aarlige poster fordeles paa 12).
export function carMonthly(c) {
  const k = (c && c.costs) || {};
  const n = (v) => Number(v) || 0;
  return (
    n(k.leasing) +
    n(k.insurance) +
    n(k.parking) +
    n(k.service) / 12 +
    n(k.tires) / 12
  );
}

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
