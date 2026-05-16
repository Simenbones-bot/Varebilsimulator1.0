// Ukesoversikt (Gantt): én rad per bil, X-akse Man 00:00 – Søn 23:59.

import {
  DAYS,
  esc,
  toMinutes,
  durationMinutes,
  fmtHours,
  fmtKr,
  fmtNum
} from "./utils.js";

const TOTAL_MINS = 10080; // 7 × 1440
const TYPE_LABEL = { fast_rute: "Fast rute", annet: "Annet" };
const STAFF_LABEL = { enkelt: "Enkelt", dobbel: "Dobbel" };

function tripCarIds(t) {
  if (Array.isArray(t.carIds)) return t.carIds;
  return t.carId ? [t.carId] : [];
}

function carUtilization(car, trips) {
  let bookedMins = 0;
  trips.forEach((t) => {
    if (!tripCarIds(t).includes(car.id)) return;
    const dur = durationMinutes(t.startTime, t.endTime);
    bookedMins += dur * (t.days || []).length;
  });
  return ((bookedMins / TOTAL_MINS) * 100).toFixed(1);
}

function tripTooltip(trip) {
  const mins = durationMinutes(trip.startTime, trip.endTime);
  const hours = mins / 60;
  const revenue = hours * (Number(trip.revenuePerHour) || 0);
  const rows = [
    ["Kunde", esc(trip.customer || "(uten navn)")],
    ["Type", TYPE_LABEL[trip.type] || "Annet"],
    ["Bemanning", STAFF_LABEL[trip.staffing] || "Enkelt"],
    ["Tid", `${esc(trip.startTime)}–${esc(trip.endTime)} (${fmtHours(mins)})`],
    ["Kilometer", `${fmtNum(trip.km)} km`],
    ["Inntekt pr. time", fmtKr(trip.revenuePerHour)],
    ["Inntekt pr. kjøring", fmtKr(revenue)]
  ];
  return rows
    .map(
      ([k, v]) =>
        `<div class="tip-row"><span>${k}</span><strong>${v}</strong></div>`
    )
    .join("");
}

function renderTrack(carTrips) {
  // Dag-separatorer ved 1/7, 2/7 … 6/7
  let seps = "";
  for (let i = 1; i < 7; i++) {
    seps += `<div class="gantt-day-sep" style="left:${(
      (i / 7) *
      100
    ).toFixed(4)}%"></div>`;
  }

  // Timegitterlinjer (lette) inni hver dag – annenhver 6. time
  let gridlines = "";
  for (let d = 0; d < 7; d++) {
    for (const h of [6, 12, 18]) {
      const pos = (((d * 1440 + h * 60) / TOTAL_MINS) * 100).toFixed(4);
      gridlines += `<div class="gantt-hour-line" style="left:${pos}%"></div>`;
    }
  }

  let blocks = "";
  carTrips.forEach((trip) => {
    const s = toMinutes(trip.startTime);
    if (s === null) return;
    const dur = durationMinutes(trip.startTime, trip.endTime) || 30;
    const tipAttr = esc(tripTooltip(trip));

    (trip.days || []).forEach((dayIndex) => {
      const left = (((dayIndex * 1440 + s) / TOTAL_MINS) * 100).toFixed(4);
      const rawWidth = (dur / TOTAL_MINS) * 100;
      const width = Math.min(rawWidth, 100 - parseFloat(left)).toFixed(4);
      blocks += `<div class="trip-block type-${esc(trip.type || "annet")}"
        style="left:${left}%;width:${width}%"
        data-tip="${tipAttr}"
        data-trip="${esc(trip.id)}" title="">
        <span class="trip-name">${esc(trip.customer || "(uten navn)")}</span>
        <span class="trip-badge">${
          trip.staffing === "dobbel" ? "2x" : "1x"
        }</span>
      </div>`;
    });
  });

  const empty =
    !blocks ? `<span class="gantt-empty">Ingen kjøringer</span>` : "";
  return seps + gridlines + blocks + empty;
}

function renderWeekHeader() {
  const cells = DAYS.map((name) => {
    const hourMarks = ["00", "06", "12", "18"]
      .map(
        (h, idx) =>
          `<span class="hour-mark" style="left:${idx * 25}%">${h}</span>`
      )
      .join("");
    return `<div class="gantt-daycell">
      <span class="daycell-name">${name}</span>
      <div class="daycell-hours">${hourMarks}</div>
    </div>`;
  }).join("");

  return `<div class="gantt-row gantt-headrow">
    <div class="car-label"></div>
    <div class="gantt-weekheader">${cells}</div>
    <div class="util-cell util-head">Utnyttelse</div>
  </div>`;
}

export function renderGantt(dep) {
  const cars = (dep.cars || [])
    .slice()
    .sort((a, b) => (a.regNr || "").localeCompare(b.regNr || ""));
  const trips = dep.trips || [];

  if (cars.length === 0) {
    return `<div class="gantt">
      <div class="gantt-empty-state">
        Ingen biler registrert — legg til biler under «Biler»-fanen for å se Gantt-oversikten.
      </div>
    </div>`;
  }

  const carRows = cars
    .map((car) => {
      const carTrips = trips.filter((t) => tripCarIds(t).includes(car.id));
      const util = carUtilization(car, trips);
      return `<div class="gantt-row">
        <div class="car-label">
          <span class="car-regnr">${esc(car.regNr || "—")}</span>
          ${car.model ? `<span class="car-model">${esc(car.model)}</span>` : ""}
        </div>
        <div class="gantt-track">${renderTrack(carTrips)}</div>
        <div class="util-cell">${util} %</div>
      </div>`;
    })
    .join("");

  const unassigned = trips.filter((t) => tripCarIds(t).length === 0);
  const unassignedRow =
    unassigned.length > 0
      ? `<div class="gantt-row gantt-unassigned">
          <div class="car-label">
            <span class="car-regnr">–</span>
            <span class="car-model">Uassignert</span>
          </div>
          <div class="gantt-track">${renderTrack(unassigned)}</div>
          <div class="util-cell">–</div>
        </div>`
      : "";

  return `<div class="gantt">
    ${renderWeekHeader()}
    ${carRows}
    ${unassignedRow}
  </div>`;
}
