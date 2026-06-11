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

// Effektiv sjåførtimesats: grunnsats × sosiale kostnader × sykefraværspåslag.
// Sykefravær modelleres som påslag på sjåførkostnaden (syk sjåfør + vikar).
export function effectiveDriverRate(p) {
  const n = (v) => Number(v) || 0;
  return (
    n(p?.driverRate) *
    (1 + n(p?.socialRate) / 100) *
    (1 + n(p?.sickRate) / 100)
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

// Som fmtNum, men beholder inntil to desimaler (priser som 18,5 kr/l).
export function fmtDec(n) {
  return (Number(n) || 0).toLocaleString("no-NO", {
    maximumFractionDigits: 2
  });
}

export function fmtHours(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} t ${m} min` : `${h} t`;
}

// Liten "i"-sirkel som viser en forklaring i den eksisterende tooltip-en.
export function infoIcon(html) {
  return `<span class="info-i" data-tip="${esc(html)}" aria-label="Forklaring">ⓘ</span>`;
}

// Bygger .tip-row-rader fra [["Ledetekst","Verdi"], ...]
export function tipRows(rows) {
  return rows
    .map(([k, v]) => `<div class="tip-row"><span>${k}</span><strong>${v}</strong></div>`)
    .join("");
}

export const MONTHS_LONG = [
  "Januar", "Februar", "Mars", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Desember"
];

// Påskesøndag (Gauss/anonym gregoriansk algoritme).
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

// Norske helligdager (kun de som kan falle på en virkedag tas med i tellingen).
export function norwegianHolidays(year) {
  const e = easterSunday(year);
  const off = (n) => {
    const x = new Date(e);
    x.setDate(x.getDate() + n);
    return x;
  };
  return [
    new Date(year, 0, 1),    // Nyttårsdag
    off(-3),                 // Skjærtorsdag
    off(-2),                 // Langfredag
    off(1),                  // 2. påskedag
    new Date(year, 4, 1),    // 1. mai
    new Date(year, 4, 17),   // Grunnlovsdag
    off(39),                 // Kristi himmelfartsdag
    off(50),                 // 2. pinsedag
    new Date(year, 11, 25),  // 1. juledag
    new Date(year, 11, 26)   // 2. juledag
  ];
}

// Antall virkedager (man–fre minus helligdager) i en gitt måned (0–11).
export function workingDaysInMonth(year, month, holidays) {
  const holiDays = new Set(
    holidays
      .filter((h) => h.getFullYear() === year && h.getMonth() === month)
      .map((h) => h.getDate())
  );
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let count = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const dow = new Date(year, month, day).getDay();
    if (dow === 0 || dow === 6) continue;
    if (holiDays.has(day)) continue;
    count++;
  }
  return count;
}
