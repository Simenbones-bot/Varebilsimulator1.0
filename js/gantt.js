// Ukesoversikt (Gantt) for kjoringer: Man-Son med 24-timers tidslinje.

import {
  DAYS_LONG,
  esc,
  toMinutes,
  durationMinutes,
  fmtHours,
  fmtKr,
  fmtNum
} from "./utils.js";

const TYPE_LABEL = { fast_rute: "Fast rute", annet: "Annet" };
const STAFF_LABEL = { enkelt: "Enkelt", dobbel: "Dobbel" };

function tripTooltip(trip) {
  const mins = durationMinutes(trip.startTime, trip.endTime);
  const hours = mins / 60;
  const revenue = hours * (Number(trip.revenuePerHour) || 0);
  const rows = [
    ["Kunde", esc(trip.customer || "(uten navn)")],
    ["Type", TYPE_LABEL[trip.type] || "Annet"],
    ["Bemanning", STAFF_LABEL[trip.staffing] || "Enkelt"],
    ["Tid", `${esc(trip.startTime)}–${esc(trip.endTime)} (${fmtHours(mins)})`],
    [
      "Faste dager",
      (trip.days || [])
        .slice()
        .sort((a, b) => a - b)
        .map((d) => DAYS_LONG[d])
        .join(", ") || "–"
    ],
    ["Kilometer", `${fmtNum(trip.km)} km`],
    ["Inntekt pr. time", fmtKr(trip.revenuePerHour)],
    ["Inntekt pr. kjoring", fmtKr(revenue)]
  ];
  return rows
    .map(
      ([k, v]) =>
        `<div class="tip-row"><span>${k}</span><strong>${v}</strong></div>`
    )
    .join("");
}

function hourAxis() {
  let cells = "";
  for (let h = 0; h < 24; h++) {
    cells += `<div class="gantt-hour">${String(h).padStart(2, "0")}</div>`;
  }
  return `<div class="gantt-hours">${cells}</div>`;
}

export function renderGantt(dep) {
  const trips = dep.trips || [];
  let rows = "";

  for (let day = 0; day < 7; day++) {
    const dayTrips = trips.filter((t) => (t.days || []).includes(day));
    let blocks = "";
    dayTrips.forEach((trip) => {
      const s = toMinutes(trip.startTime);
      if (s === null) return;
      const dur = durationMinutes(trip.startTime, trip.endTime) || 30;
      const left = (s / 1440) * 100;
      const width = Math.min((dur / 1440) * 100, 100 - left);
      blocks += `<div class="trip-block type-${esc(trip.type || "annet")}"
        style="left:${left}%;width:${width}%"
        data-tip="${esc(tripTooltip(trip))}"
        data-trip="${esc(trip.id)}" title="">
        <span class="trip-name">${esc(trip.customer || "(uten navn)")}</span>
        <span class="trip-badge">${
          STAFF_LABEL[trip.staffing] === "Dobbel" ? "2x" : "1x"
        }</span>
      </div>`;
    });

    let gridlines = "";
    for (let h = 1; h < 24; h++) {
      gridlines += `<div class="grid-line" style="left:${
        (h / 24) * 100
      }%"></div>`;
    }

    rows += `<div class="gantt-row">
      <div class="gantt-daycol">${DAYS_LONG[day]}</div>
      <div class="gantt-track">${gridlines}${
      blocks || '<span class="gantt-empty">Ingen kjoringer</span>'
    }</div>
    </div>`;
  }

  return `<div class="gantt">
    <div class="gantt-row gantt-headrow">
      <div class="gantt-daycol"></div>
      ${hourAxis()}
    </div>
    ${rows}
  </div>`;
}
