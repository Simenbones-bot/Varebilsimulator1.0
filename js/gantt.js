// Ukesoversikt (Gantt): én rad per bil, X-akse Man 00:00 – Søn 23:59.

import {
  DAYS,
  esc,
  toMinutes,
  durationMinutes,
  fmtHours,
  fmtKr,
  fmtNum,
  carMonthly,
  MONTH_FACTOR,
  infoIcon,
  tipRows,
  effectiveDriverRate,
  paidHours
} from "./utils.js";

const TOTAL_MINS = 10080; // 7 × 1440
const TYPE_LABEL = { fast_rute: "Fast rute", annet: "Annet" };
const STAFF_LABEL = { enkelt: "Enkelt", dobbel: "Dobbel" };

function tripCarIds(t) {
  if (Array.isArray(t.carIds)) return t.carIds;
  return t.carId ? [t.carId] : [];
}

function carCostPerHour(car, trips, dep) {
  const eff = effectiveDriverRate(dep.personnel || { driverRate: 250 });
  const fuel = dep.fuel || {};
  let hoursWeek = 0;
  let driverWeek = 0;
  let fuelWeek = 0;
  let revenueWeek = 0;
  trips.forEach((t) => {
    if (!tripCarIds(t).includes(car.id)) return;
    const occ = (t.days || []).length;
    const h = durationMinutes(t.startTime, t.endTime) / 60;
    const staffMult = t.staffing === "dobbel" ? 2 : 1;
    hoursWeek += h * occ;
    driverWeek += paidHours(t.startTime, t.endTime) * occ * staffMult * eff;
    revenueWeek += h * occ * (Number(t.revenuePerHour) || 0);
    const price =
      car.fuelType === "el"
        ? Number(fuel.electricityPrice) || 0
        : Number(fuel.dieselPrice) || 0;
    fuelWeek +=
      (Number(t.km) || 0) * occ * ((Number(car.consumption) || 0) / 100) * price;
  });
  if (hoursWeek === 0) return null;
  const monthHours = hoursWeek * MONTH_FACTOR;
  const opCostMonth =
    driverWeek * MONTH_FACTOR + carMonthly(car) + fuelWeek * MONTH_FACTOR;
  const baseCostPerHour = opCostMonth / monthHours;
  const mkp = dep.markups || { konsernfelles: 6, margin: 5 };
  const markupFactor =
    1 + (Number(mkp.konsernfelles) || 0) / 100 + (Number(mkp.margin) || 0) / 100;
  const costPerHour = baseCostPerHour * markupFactor;
  const incomePerHour = revenueWeek / hoursWeek;
  const monthlyIncome = revenueWeek * MONTH_FACTOR;
  const monthlyCost = opCostMonth * markupFactor;
  const result = (monthlyIncome - monthlyCost) / MONTH_FACTOR / 5;
  return { costPerHour, incomePerHour, loss: costPerHour > incomePerHour, result };
}

function tripSpecificCostPerHour(trip, car, dep, totalMonthHours) {
  const hours = durationMinutes(trip.startTime, trip.endTime) / 60;
  if (hours === 0 || totalMonthHours === 0) return null;

  const eff = effectiveDriverRate(dep.personnel || { driverRate: 250 });
  const staffMult = trip.staffing === "dobbel" ? 2 : 1;

  const fuel = dep.fuel || {};
  const price =
    car.fuelType === "el"
      ? Number(fuel.electricityPrice) || 0
      : Number(fuel.dieselPrice) || 0;

  const driverPerHour = staffMult * eff * (paidHours(trip.startTime, trip.endTime) / hours);
  const fuelPerHour =
    ((Number(trip.km) || 0) * ((Number(car.consumption) || 0) / 100) * price) /
    hours;
  const carFixedPerHour = carMonthly(car) / totalMonthHours;

  const mkp = dep.markups || { konsernfelles: 6, margin: 5 };
  const markupFactor =
    1 + (Number(mkp.konsernfelles) || 0) / 100 + (Number(mkp.margin) || 0) / 100;

  return (driverPerHour + fuelPerHour + carFixedPerHour) * markupFactor;
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

function tripTooltip(trip, costPerHour) {
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
    ["Inntekt pr. kjøring", fmtKr(revenue)],
    ...(costPerHour != null
      ? [
          ["Driftskostnad pr. time", fmtKr(costPerHour)],
          ["Driftskostnad pr. kjøring", fmtKr(costPerHour * hours)],
          ["Resultat pr. kjøring", fmtKr(revenue - costPerHour * hours)]
        ]
      : [])
  ];
  return rows
    .map(
      ([k, v]) =>
        `<div class="tip-row"><span>${k}</span><strong>${v}</strong></div>`
    )
    .join("");
}

function renderTrack(carTrips, tripCosts = {}) {
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
    const tipAttr = esc(tripTooltip(trip, tripCosts[trip.id] ?? null));

    (trip.days || []).forEach((dayIndex) => {
      const left = (((dayIndex * 1440 + s) / TOTAL_MINS) * 100).toFixed(4);
      const rawWidth = (dur / TOTAL_MINS) * 100;
      const width = Math.min(rawWidth, 100 - parseFloat(left)).toFixed(4);
      const bg = trip.color ? `background:${esc(trip.color)};` : "";
      blocks += `<div class="trip-block type-${esc(trip.type || "annet")}"
        style="left:${left}%;width:${width}%;${bg}"
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

  const utilTip = tipRows([["Formel", "bookede minutter / (7 × 1440) × 100 %"]]);
  const fteTip = tipRows([
    ["Formel", "bilens betalte timer/uke (inkl. dobbel-faktor) / 37,5"],
    ["Lunsj", "30 min ubetalt trekkes pr. vakt over 5,5 t (8 t vakt = 7,5 t)"]
  ]);
  const costTip = tipRows([
    ["Formel", "(sjåfør + bil + drivstoff /mnd) / bookede timer /mnd"],
    ["Påslag", "× (1 + konsernfelles % + margin %)"]
  ]);
  const incomeTip = tipRows([["Formel", "bilens inntekt/uke / bilens bookede timer/uke"]]);
  const resultTip = tipRows([
    ["Formel", `(inntekt/mnd − driftskost/mnd inkl. påslag) / ${MONTH_FACTOR.toFixed(2)} / 5`]
  ]);

  return `<div class="gantt-row gantt-headrow">
    <div class="car-label"></div>
    <div class="gantt-weekheader">${cells}</div>
    <div class="util-cell util-head"><span>Utnyttelse</span>${infoIcon(utilTip)}</div>
    <div class="fte-cell fte-head"><span>Å.verk</span>${infoIcon(fteTip)}</div>
    <div class="cost-cell cost-head"><span>Drift/time</span>${infoIcon(costTip)}</div>
    <div class="income-cell income-head"><span>Inntekt/time</span>${infoIcon(incomeTip)}</div>
    <div class="result-cell result-head"><span>Resultat /dag</span>${infoIcon(resultTip)}</div>
  </div>`;
}

export function renderGantt(dep, expanded = false) {
  const cars = (dep.cars || [])
    .slice()
    .sort((a, b) =>
      (a.regNr || "").localeCompare(b.regNr || "", "no", { numeric: true })
    );
  const trips = dep.trips || [];

  if (cars.length === 0) {
    return `<div class="gantt">
      <div class="gantt-empty-state">
        <p>Ingen biler registrert ennå.</p>
        <button class="btn small primary" data-action="quick-add-car">+ Legg til bil</button>
      </div>
    </div>`;
  }

  let totalUtil = 0;
  let totalFte = 0, fteCount = 0;
  let totalCost = 0, totalIncome = 0, totalResult = 0, ocCount = 0;
  const carRows = cars
    .map((car) => {
      const carTrips = trips.filter((t) => tripCarIds(t).includes(car.id));
      const util = carUtilization(car, trips);
      totalUtil += parseFloat(util);
      const oc = carCostPerHour(car, trips, dep);
      if (oc) {
        totalCost   += oc.costPerHour;
        totalIncome += oc.incomePerHour;
        totalResult += oc.result;
        ocCount++;
      }
      const carFteWeekly = carTrips.reduce((s, t) => {
        const h = durationMinutes(t.startTime, t.endTime) / 60;
        const staffMult = t.staffing === "dobbel" ? 2 : 1;
        return s + paidHours(t.startTime, t.endTime) * (t.days || []).length * staffMult;
      }, 0);
      const carFte = carFteWeekly / 37.5;
      if (carFte > 0) { totalFte += carFte; fteCount++; }
      const totalMonthHours =
        carTrips.reduce(
          (s, t) =>
            s +
            (durationMinutes(t.startTime, t.endTime) / 60) *
              (t.days || []).length,
          0
        ) * MONTH_FACTOR;
      const tripCosts = {};
      carTrips.forEach((t) => {
        tripCosts[t.id] = tripSpecificCostPerHour(t, car, dep, totalMonthHours);
      });
      return `<div class="gantt-row">
        <div class="car-label car-label-btn" data-action="edit-car"
             data-id="${esc(car.id)}" title="Klikk for å redigere bilen">
          <span class="car-regnr">${esc(car.regNr || "—")}</span>
          ${car.model ? `<span class="car-model">${esc(car.model)}</span>` : ""}
        </div>
        <div class="gantt-track">${renderTrack(carTrips, tripCosts)}</div>
        <div class="util-cell">${util} %</div>
        <div class="fte-cell">${carFte > 0 ? carFte.toFixed(2) : "–"}</div>
        <div class="cost-cell ${oc && oc.loss ? "neg" : ""}">${
        oc ? fmtKr(oc.costPerHour) : "–"
      }</div>
        <div class="income-cell">${oc ? fmtKr(oc.incomePerHour) : "–"}</div>
        <div class="result-cell ${oc ? (oc.result >= 0 ? "pos" : "neg") : ""}">${
        oc ? fmtKr(oc.result) : "–"
      }</div>
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
          <div class="fte-cell">–</div>
          <div class="cost-cell">–</div>
          <div class="income-cell">–</div>
          <div class="result-cell">–</div>
        </div>`
      : "";

  const avgUtil   = cars.length > 0 ? (totalUtil / cars.length).toFixed(1) : "0.0";
  const avgFte    = fteCount > 0  ? (totalFte   / fteCount).toFixed(2)   : null;
  const avgCost   = ocCount > 0   ? totalCost   / ocCount                : null;
  const avgIncome = ocCount > 0   ? totalIncome / ocCount                : null;
  const avgResult = ocCount > 0   ? totalResult / ocCount                : null;

  const summaryRow = expanded && cars.length > 0
    ? `<div class="gantt-row gantt-summary">
        <div class="car-label"><span class="car-regnr">Snitt</span></div>
        <div class="gantt-track"></div>
        <div class="util-cell"><strong>${avgUtil} %</strong></div>
        <div class="fte-cell">${avgFte !== null ? `<strong>${avgFte}</strong>` : "–"}</div>
        <div class="cost-cell">${avgCost !== null ? `<strong>${fmtKr(avgCost)}</strong>` : "–"}</div>
        <div class="income-cell">${avgIncome !== null ? `<strong>${fmtKr(avgIncome)}</strong>` : "–"}</div>
        <div class="result-cell ${avgResult !== null ? (avgResult >= 0 ? "pos" : "neg") : ""}">
          ${avgResult !== null ? `<strong>${fmtKr(avgResult)}</strong>` : "–"}
        </div>
      </div>`
    : "";

  const addRow = `<div class="gantt-row gantt-addrow">
    <button class="gantt-add" data-action="quick-add-car"
      title="Legger til en ny bil med automatisk navn — klikk på bilen etterpå for å fylle inn detaljer">
      + Legg til bil
    </button>
  </div>`;

  return `<div class="gantt${expanded ? " gantt--expanded" : ""}">
    ${renderWeekHeader()}
    ${carRows}
    ${unassignedRow}
    ${summaryRow}
    ${addRow}
  </div>`;
}
