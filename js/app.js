// Hovedlogikk: innlogging, navigasjon og UI for avdelinger, biler og kjøringer.

import { Store } from "./store.js";
import {
  seedAdmin,
  login,
  logout,
  getSession,
  createUser,
  deleteUser,
  listUsers
} from "./auth.js";
import {
  State,
  loadData,
  flushSave,
  selectedDepartment,
  addDepartment,
  deleteDepartment,
  selectDepartment,
  addCar,
  updateCar,
  deleteCar,
  addTrip,
  updateTrip,
  deleteTrip,
  addFixedCost,
  updateFixedCost,
  deleteFixedCost,
  setFuel,
  setPersonnel,
  setMarkups,
  addPersonnelRole,
  updatePersonnelRole,
  deletePersonnelRole
} from "./state.js";
import { renderGantt } from "./gantt.js";
import {
  DAYS_LONG,
  esc,
  durationMinutes,
  fmtKr,
  fmtNum,
  fmtDec,
  carMonthly,
  MONTH_FACTOR,
  infoIcon,
  tipRows,
  MONTHS_LONG,
  norwegianHolidays,
  workingDaysInMonth,
  effectiveDriverRate
} from "./utils.js";

const app = document.getElementById("app");
const tooltip = document.getElementById("tooltip");

const TRIP_COLORS = [
  "#4f46e5", "#7c3aed", "#db2777", "#dc2626", "#ea580c", "#d97706",
  "#0891b2", "#0d9488", "#16a34a", "#9333ea", "#be123c", "#2563eb"
];

const VEHICLE_TYPES = [
  { value: "",               label: "– Velg kategori –" },
  { value: "skapbil_19",    label: "Skapbil 19m³" },
  { value: "stor_15",       label: "Stor varebil 15m³" },
  { value: "mellomstor_11", label: "Mellomstor varebil 11m³" },
  { value: "liten_6",       label: "Liten varebil 6m³" }
];

let view = "kjøringer";
let ganttExpanded = false;
let tripsCollapsed = false;
let summaryExpanded = false;
let selectedCarId = "__dep__";
let chartCollapsed = false;

// ---- Oppstart --------------------------------------------------------------
(async function init() {
  app.innerHTML = `<div class="splash">Laster …</div>`;
  try {
    await seedAdmin();
  } catch (err) {
    console.error("Kunne ikke seede admin:", err);
  }
  const session = getSession();
  if (session) {
    State.session = session;
    await loadData(session.username);
    renderApp();
  } else {
    renderLogin();
  }
})();

// ---- Innlogging ------------------------------------------------------------
function renderLogin(error = "", username = "") {
  app.innerHTML = `
    <div class="login-wrap">
      <form class="card login-card" id="login-form">
        <h1>Varebilsimulator</h1>
        <p class="muted">Logg inn for å planlegge avdelinger og kjøringer.</p>
        ${error ? `<div class="alert">${esc(error)}</div>` : ""}
        <label>Brukernavn
          <input name="username" autocomplete="username" required
                 value="${esc(username)}" ${username ? "" : "autofocus"} />
        </label>
        <label>Passord
          <input name="password" type="password"
                 autocomplete="current-password" required />
        </label>
        <button class="btn primary" type="submit">Logg inn</button>
        <p class="hint">Standard admin: <code>admin</code> / <code>Admin123</code></p>
      </form>
    </div>`;

  document
    .getElementById("login-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      const uname = f.username.value;
      const btn = f.querySelector("button");
      btn.disabled = true;
      btn.textContent = "Logger inn …";
      try {
        const session = await login(uname, f.password.value);
        State.session = session;
        await loadData(session.username);
        view = "kjøringer";
        renderApp();
      } catch (err) {
        renderLogin(err.message || "Innlogging feilet", uname);
        document.querySelector('#login-form [name="password"]')?.focus();
      }
    });
}

// ---- Hovedskall ------------------------------------------------------------
function renderApp() {
  const isAdmin = State.session.isAdmin;
  const modeBadge =
    Store.mode === "supabase"
      ? `<span class="badge ok">Skylagring</span>`
      : `<span class="badge warn">Lokal lagring</span>`;

  const tabs = [
    ["kjøringer", "Ruter"],
    ["biler", "Biler"],
    ["faste", "Faste kostnader"],
    ["drivstoff", "Drivstoff"],
    ["personal", "Personal"]
  ];
  if (isAdmin) tabs.push(["brukere", "Brukere"]);

  app.innerHTML = `
    <header class="topbar">
      <div class="brand">Varebilsimulator</div>
      <div class="topbar-right">
        ${modeBadge}
        <span class="user">${esc(State.session.username)}</span>
        <button class="btn ghost" data-action="logout">Logg ut</button>
      </div>
    </header>

    <div class="depbar">
      ${renderDepSelect()}
      <button class="btn" data-action="new-dep">+ Ny avdeling</button>
      <button class="btn ghost danger" data-action="del-dep"
        ${selectedDepartment() ? "" : "disabled"}>Slett avdeling</button>
    </div>

    <nav class="tabs">
      ${tabs
        .map(
          ([k, label]) =>
            `<button class="tab ${
              view === k ? "active" : ""
            }" data-action="tab" data-tab="${k}">${label}</button>`
        )
        .join("")}
    </nav>

    <main class="content" id="content"></main>`;

  renderContent();
}

function renderDepSelect() {
  const deps = State.data.departments;
  if (!deps.length) {
    return `<span class="muted">Ingen avdelinger enna</span>`;
  }
  return `<label class="dep-label">Avdeling
    <select data-action="select-dep">
      ${deps
        .map(
          (d) =>
            `<option value="${esc(d.id)}" ${
              d.id === State.data.selectedDepartmentId ? "selected" : ""
            }>${esc(d.name)}</option>`
        )
        .join("")}
    </select>
  </label>`;
}

function renderContent() {
  // Skjul tooltipen: elementet den hang på kan være fjernet, og da kommer
  // aldri mouseout-hendelsen som ellers ville gjemt den.
  tooltip.hidden = true;
  const content = document.getElementById("content");
  if (view === "brukere" && State.session.isAdmin) {
    renderUsers(content);
    return;
  }
  const dep = selectedDepartment();
  if (!dep) {
    content.innerHTML = `<div class="card empty welcome">
      <div class="welcome-icon">🚐</div>
      <h2>Velkommen til Varebilsimulator</h2>
      <p>Opprett en avdeling, registrer biler og kjøringer — så regner appen
        fortløpende ut inntekter, kostnader og resultat for deg.</p>
      <button class="btn primary" data-action="new-dep">+ Opprett din første avdeling</button>
    </div>`;
    return;
  }
  if (view === "biler") renderCars(content, dep);
  else if (view === "faste") renderFixedCosts(content, dep);
  else if (view === "drivstoff") renderFuel(content, dep);
  else if (view === "personal") renderPersonnel(content, dep);
  else renderKjoringer(content, dep);
}

// ---- Biler -----------------------------------------------------------------
function renderCars(el, dep) {
  const cars = dep.cars || [];
  el.innerHTML = `
    <div class="section-head">
      <h2>Biler – ${esc(dep.name)}</h2>
      <div class="btn-group">
        <button class="btn small ghost" data-action="car-template">Mal ↓</button>
        <button class="btn small ghost" data-action="import-cars">Importer CSV</button>
        <button class="btn small ghost" data-action="export-cars">Eksporter CSV</button>
        <button class="btn primary" data-action="add-car">+ Registrer bil</button>
      </div>
    </div>
    ${
      cars.length
        ? `<div class="grid">${cars.map(carCard).join("")}</div>`
        : `<div class="card empty"><p>Ingen biler registrert.</p></div>`
    }`;
}

function carCard(c) {
  const k = c.costs || {};
  const fuelLabel = c.fuelType === "el" ? "Elektrisk" : "Diesel";
  const fuelUnit = c.fuelType === "el" ? "kWh/100km" : "l/100km";
  const vehicleLabel = VEHICLE_TYPES.find((v) => v.value === c.vehicleType && v.value)?.label;
  const rows = [
    ...(vehicleLabel ? [["Kategori", esc(vehicleLabel)]] : []),
    ["Leasing", `${fmtKr(k.leasing)} /mnd`],
    ["Forsikring", `${fmtKr(k.insurance)} /mnd`],
    ["Parkering", `${fmtKr(k.parking)} /mnd`],
    ["Service", `${fmtKr(k.service)} /ar`],
    ["Dekk / dekkhotell", `${fmtKr(k.tires)} /ar`],
    ["Skade / erstatninger", fmtKr(k.damage)],
    ["Drivstoff", fuelLabel],
    ["Forbruk", `${fmtNum(c.consumption)} ${fuelUnit}`],
    ["Leasing startdato", esc(k.leasingStart || "–")],
    ["EU-kontroll", esc(k.euControl || "–")],
    ["Budsjettert km/ar", `${fmtNum(k.budgetKm)} km`]
  ];
  return `<div class="card car-card">
    <div class="card-top">
      <div>
        <div class="reg">${esc(c.regNr || "—")}</div>
        <div class="model">${esc(c.model || "")}</div>
      </div>
      <div class="card-actions">
        <button class="btn small" data-action="edit-car" data-id="${esc(
          c.id
        )}">Rediger</button>
        <button class="btn small ghost danger" data-action="del-car" data-id="${esc(
          c.id
        )}">Slett</button>
      </div>
    </div>
    ${c.description ? `<p class="desc">${esc(c.description)}</p>` : ""}
    <dl class="kv">
      ${rows
        .map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`)
        .join("")}
    </dl>
    <div class="card-foot">Estimert kostnad: <strong>${fmtKr(
      carMonthly(c)
    )} /mnd</strong></div>
  </div>`;
}

// ---- Kjøringer (Gantt) -----------------------------------------------------

// Kom-i-gang-veiviser til avdelingen har både biler og kjøringer.
function renderOnboarding(dep) {
  const cars = dep.cars || [];
  const trips = dep.trips || [];
  const fuel = dep.fuel || {};
  if (cars.length && trips.length) return "";
  const fuelSet = num(fuel.dieselPrice) > 0 || num(fuel.electricityPrice) > 0;
  const steps = [
    { done: cars.length > 0, label: "Registrer bilene i avdelingen", btn: "+ Registrer bil", action: "add-car" },
    { done: fuelSet, label: "Sett drivstoffpriser", btn: "Sett priser", action: "edit-fuel" },
    { done: trips.length > 0, label: "Legg til kjøringene (ruter)", btn: "+ Ny kjøring", action: "add-trip" }
  ];
  return `<div class="card onboarding">
    <h3>Kom i gang med simuleringen</h3>
    <p class="muted">Tre steg, så regner appen ut inntekter, kostnader og resultat for avdelingen.</p>
    <ol class="onboarding-steps">
      ${steps
        .map(
          (s, i) => `<li class="${s.done ? "done" : ""}">
        <span class="step-mark">${s.done ? "✓" : i + 1}</span>
        <span class="step-label">${s.label}</span>
        ${s.done ? "" : `<button class="btn small primary" data-action="${s.action}">${s.btn}</button>`}
      </li>`
        )
        .join("")}
    </ol>
  </div>`;
}

// Kompakt, klikkbar rad med forutsetningene bak tallene — redigerbare herfra,
// slik at man slipper å bytte fane for å justere simuleringen.
function renderAssumptions(dep) {
  const fuel = dep.fuel || {};
  const p = dep.personnel || { driverRate: 250, socialRate: 36 };
  const mkp = dep.markups || { konsernfelles: 6, margin: 5 };
  const cars = dep.cars || [];
  const hasDieselCar = cars.some((c) => c.fuelType !== "el");
  const hasElCar = cars.some((c) => c.fuelType === "el");
  const chip = (label, value, action, warn = false) =>
    `<button class="chip${warn ? " chip-warn" : ""}" data-action="${action}"
       title="Klikk for å endre"><span>${label}</span><strong>${value}</strong></button>`;
  return `<div class="assumptions">
    <span class="assumptions-title">Forutsetninger</span>
    ${chip("Diesel", num(fuel.dieselPrice) ? `${fmtDec(fuel.dieselPrice)} kr/l` : "ikke satt", "edit-fuel", hasDieselCar && !num(fuel.dieselPrice))}
    ${chip("Strøm", num(fuel.electricityPrice) ? `${fmtDec(fuel.electricityPrice)} kr/kWh` : "ikke satt", "edit-fuel", hasElCar && !num(fuel.electricityPrice))}
    ${chip("Sjåførsats", `${fmtDec(p.driverRate)} kr/t`, "edit-personnel", !num(p.driverRate))}
    ${chip("Sosiale", `${fmtDec(p.socialRate)} %`, "edit-personnel")}
    ${chip("Sykefravær", `${fmtDec(p.sickRate)} %`, "edit-personnel")}
    ${chip("Konsernfelles", `${fmtDec(mkp.konsernfelles)} %`, "edit-markups")}
    ${chip("Margin", `${fmtDec(mkp.margin)} %`, "edit-markups")}
  </div>`;
}

function renderKjoringer(el, dep) {
  const trips = dep.trips || [];
  el.innerHTML = `
    <div class="section-head">
      <h2>Ruter – ${esc(dep.name)}</h2>
      <div class="btn-group">
        <button class="btn small" data-action="simulate-year">📅 Simuler år</button>
        <button class="btn small ghost" data-action="trip-template">Mal ↓</button>
        <button class="btn small ghost" data-action="import-trips">Importer CSV</button>
        <button class="btn small ghost" data-action="export-trips">Eksporter CSV</button>
        <button class="btn primary" data-action="add-trip">+ Ny kjøring</button>
      </div>
    </div>
    ${renderOnboarding(dep)}
    ${renderAssumptions(dep)}
    ${renderSummary(dep)}
    <div class="section-head sub" style="margin-top:.75rem;margin-bottom:.25rem">
      <h3>Bil gantt</h3>
      <button class="btn small ghost" data-action="toggle-gantt">
        ${ganttExpanded ? "⊖ Enkel visning" : "⊕ Detaljer"}
      </button>
    </div>
    ${renderGantt(dep, ganttExpanded)}
    <div class="section-head sub">
      <h3>
        <button class="btn-collapse" data-action="toggle-trips" aria-label="Vis/skjul kjøringer">
          ${tripsCollapsed ? "▶" : "▼"}
        </button>
        Rutemaster (${trips.length})
      </h3>
    </div>
    ${tripsCollapsed ? "" : trips.length
        ? `<table class="list trip-table">
            <thead><tr>
              <th>Kunde</th><th>Type</th><th>Bemanning</th><th>Bil</th>
              <th>Tid</th><th>Dager</th><th>Km</th><th>Kr/t</th><th>Kategori</th><th>Ruter</th><th></th>
            </tr></thead>
            <tbody>${trips.map((t) => tripRow(t, dep)).join("")}</tbody>
            <tfoot><tr class="add-row">
              <td colspan="11"><button class="gantt-add" data-action="quick-add-trip"
                title="Legger til en ny rute med standardverdier — fyll inn direkte i tabellen">+ Ny rute</button></td>
            </tr></tfoot>
          </table>`
        : `<div class="card empty"><p>Ingen kjøringer planlagt.</p>
            <button class="btn small primary" data-action="quick-add-trip">+ Ny rute</button></div>`
    }`;
}

function tripRow(t, dep) {
  const cars = (dep?.cars || [])
    .slice()
    .sort((a, b) =>
      (a.regNr || "").localeCompare(b.regNr || "", "no", { numeric: true })
    );
  const ids = tripCarIds(t).filter((id) => cars.find((c) => c.id === id));
  const needed = num(t.antallRuter);
  const assigned = ids.length;
  const tid = esc(t.id);

  // Bil: enkel nedtrekksliste ved 0–1 tildelte biler; flere biler styres i skjemaet.
  let carCell;
  if (assigned > 1) {
    const regs = ids
      .map((id) => cars.find((c) => c.id === id)?.regNr)
      .filter(Boolean);
    carCell = `<button class="btn small ghost" data-action="edit-trip" data-id="${tid}"
      title="${esc(regs.join(", "))} — klikk for å endre">${assigned} biler</button>`;
  } else {
    carCell = `<select class="cell-input" data-trip="${tid}" data-trip-field="carId">
      <option value="">–</option>
      ${cars
        .map(
          (c) =>
            `<option value="${esc(c.id)}" ${ids[0] === c.id ? "selected" : ""}>${esc(
              c.regNr || "—"
            )}</option>`
        )
        .join("")}
    </select>`;
  }

  const daySet = new Set(t.days || []);
  const dayChips = DAYS_LONG.map(
    (d, i) =>
      `<button type="button" class="day-chip${daySet.has(i) ? " on" : ""}"
        data-action="toggle-trip-day" data-id="${tid}" data-day="${i}"
        title="${d}">${d.slice(0, 1)}</button>`
  ).join("");

  let ruterBadge = "";
  if (needed) {
    const cls = assigned < needed ? "ruter-low" : assigned > needed ? "ruter-high" : "ruter-ok";
    const title = assigned < needed
      ? `Mangler ${needed - assigned} bil${needed - assigned > 1 ? "er" : ""}`
      : assigned > needed
        ? `${assigned - needed} bil${assigned - needed > 1 ? "er" : ""} for mange`
        : "Riktig antall biler";
    ruterBadge = `<span class="ruter-badge ${cls}" title="${esc(title)}">${assigned}/${needed}</span>`;
  }

  const sel = (field, value, options) =>
    `<select class="cell-input" data-trip="${tid}" data-trip-field="${field}">
      ${options
        .map(
          (o) =>
            `<option value="${esc(o.value)}" ${o.value === value ? "selected" : ""}>${esc(o.label)}</option>`
        )
        .join("")}
    </select>`;

  return `<tr>
    <td><input class="cell-input" data-trip="${tid}" data-trip-field="customer"
      value="${esc(t.customer || "")}" placeholder="Kundenavn"/></td>
    <td>${sel("type", t.type || "fast_rute", [
      { value: "fast_rute", label: "Fast rute" },
      { value: "annet", label: "Annet" }
    ])}</td>
    <td>${sel("staffing", t.staffing || "enkelt", [
      { value: "enkelt", label: "Enkelt" },
      { value: "dobbel", label: "Dobbel" }
    ])}</td>
    <td>${carCell}</td>
    <td><span class="time-pair">
      <input class="cell-input cell-time" data-trip="${tid}" data-trip-field="startTime"
        value="${esc(t.startTime)}" placeholder="HH:MM" maxlength="5" inputmode="numeric"/>–<input
        class="cell-input cell-time" data-trip="${tid}" data-trip-field="endTime"
        value="${esc(t.endTime)}" placeholder="HH:MM" maxlength="5" inputmode="numeric"/>
    </span></td>
    <td><span class="day-chips">${dayChips}</span></td>
    <td><input type="number" min="0" step="any" class="cell-input cell-num"
      data-trip="${tid}" data-trip-field="km" value="${num(t.km) || ""}" placeholder="0"/></td>
    <td><input type="number" min="0" step="any" class="cell-input cell-num"
      data-trip="${tid}" data-trip-field="revenuePerHour" value="${num(t.revenuePerHour) || ""}" placeholder="0"/></td>
    <td>${sel("vehicleType", t.vehicleType || "", VEHICLE_TYPES)}</td>
    <td class="ruter-cell"><span class="time-pair">
      <input type="number" min="0" step="1" class="cell-input cell-num cell-ruter"
        data-trip="${tid}" data-trip-field="antallRuter" value="${needed || ""}" placeholder="–"/>${ruterBadge}
    </span></td>
    <td class="row-actions">
      <button class="btn small" data-action="edit-trip" data-id="${tid}">Rediger</button>
      <button class="btn small ghost danger" data-action="del-trip" data-id="${tid}">Slett</button>
    </td>
  </tr>`;
}

function renderSummary(dep) {
  const cars = dep.cars || [];
  const fuel = dep.fuel || { dieselPrice: 0, electricityPrice: 0 };
  const p = dep.personnel || { driverRate: 250, socialRate: 36 };
  const effectiveRate = effectiveDriverRate(p);
  const carCost = cars.reduce((s, c) => s + carMonthly(c), 0);
  const fixedCost = (dep.fixedCosts || []).reduce(
    (s, f) => s + num(f.amount),
    0
  );
  let weekKm = 0;
  let weekRevenue = 0;
  let fuelWeek = 0;
  let weekDriverHours = 0;
  (dep.trips || []).forEach((t) => {
    const occ = (t.days || []).length;
    const hours = durationMinutes(t.startTime, t.endTime) / 60;
    const assigned = tripCarIds(t)
      .map((id) => cars.find((c) => c.id === id))
      .filter(Boolean);
    const m = Math.max(assigned.length, 1);
    const staffMult = t.staffing === "dobbel" ? 2 : 1;
    weekKm += num(t.km) * occ * m;
    weekRevenue += hours * num(t.revenuePerHour) * occ * m;
    weekDriverHours += hours * occ * m * staffMult;
    assigned.forEach((c) => {
      const price =
        c.fuelType === "el"
          ? num(fuel.electricityPrice)
          : num(fuel.dieselPrice);
      fuelWeek += num(t.km) * occ * (num(c.consumption) / 100) * price;
    });
  });
  const fuelMonth = fuelWeek * MONTH_FACTOR;
  const personnelMonth = weekDriverHours * effectiveRate * (52 / 12);
  const monthRevenue = weekRevenue * MONTH_FACTOR;
  const socialFactor = 1 + num(p.socialRate) / 100;
  const lederMonth = (dep.personnel.ledere || []).reduce(
    (s, l) => s + (num(l.aarslonn) * num(l.aarsrverk)) / 12 * socialFactor, 0);
  const koordinatorMonth = (dep.personnel.koordinatorer || []).reduce(
    (s, k) => s + (num(k.aarslonn) * num(k.aarsrverk)) / 12 * socialFactor, 0);
  const driftsbase = carCost + fuelMonth + personnelMonth + lederMonth + koordinatorMonth;
  const mkp = dep.markups || { konsernfelles: 6, margin: 5 };
  const konsernfellesMonth = driftsbase * (num(mkp.konsernfelles) / 100);
  const marginMonth = driftsbase * (num(mkp.margin) / 100);
  const result =
    monthRevenue - carCost - fixedCost - fuelMonth - personnelMonth -
    lederMonth - koordinatorMonth - konsernfellesMonth - marginMonth;
  const totalCostMonth = carCost + fixedCost + fuelMonth + personnelMonth
    + lederMonth + koordinatorMonth + konsernfellesMonth + marginMonth;
  const driverFte = weekDriverHours / 37.5;
  const lederFte = (dep.personnel.ledere || []).reduce((s, l) => s + num(l.aarsrverk), 0);
  const koordinatorFte = (dep.personnel.koordinatorer || []).reduce((s, k) => s + num(k.aarsrverk), 0);
  const totalFte = driverFte + lederFte + koordinatorFte;
  const socialPct = num(p.socialRate);
  const konsPct = num(mkp.konsernfelles);
  const marginPct = num(mkp.margin);
  const mf = MONTH_FACTOR.toFixed(2);
  const driftsbaseTekst = "bilkostnad + drivstoff + personal + ledelse + koordinator";

  const inntektTip = tipRows([["Formel", `Inntekt pr. uke × ${mf}`]]);
  const kostnadTip = tipRows([
    ["Inkluderer", "bilkostnad + faste + drivstoff + personal + ledelse + koordinator + konsernfelles + margin"]
  ]);
  const resultTip = tipRows([
    ["Formel", "inntekt/mnd − bilkostnad − faste − drivstoff − personal − ledelse − koordinator − konsernfelles − margin"]
  ]);

  const detailCards = [
    ["Biler", `${cars.length}`,
      tipRows([["Teller", "Antall registrerte biler i avdelingen"]])],
    ["Bilkostnad", `${fmtKr(carCost)} /mnd`,
      tipRows([
        ["Per bil", "leasing + forsikring + parkering + service/12 + dekk/12"],
        ["Totalt", "Sum over alle biler, pr. mnd"]
      ])],
    ["Faste kostnader", `${fmtKr(fixedCost)} /mnd`,
      tipRows([["Inkluderer", "Sum av alle registrerte faste kostnader (kr/mnd)"]])],
    ["Drivstoff", `${fmtKr(fuelMonth)} /mnd`,
      tipRows([
        ["Per kjøring", "km × dager × (forbruk/100) × pris (diesel/strøm)"],
        ["Til mnd", `Sum × ${mf} (≈ uker pr. mnd)`]
      ])],
    ["Personal (sjåfør)", `${fmtKr(personnelMonth)} /mnd`,
      tipRows([
        ["Formel", "sjåførtimer/uke × effektiv sats × 52/12"],
        ["Grunnlag", "1 950 t/år (37,5 t/uke × 52 uker) → 163 t/mnd pr. FTE"],
        ["Effektiv sats", `sjåførsats × (1 + ${socialPct} % sosiale)${num(p.sickRate) ? ` × (1 + ${num(p.sickRate)} % sykefravær)` : ""}`],
        ["Dobbel", "Dobbel bemanning teller 2×"]
      ])],
    ...(lederMonth > 0 ? [["Ledelse", `${fmtKr(lederMonth)} /mnd`,
      tipRows([["Formel", `Σ (årslønn × årsverk / 12 × (1 + ${socialPct} % sosiale))`]])]] : []),
    ...(koordinatorMonth > 0 ? [["Koordinator", `${fmtKr(koordinatorMonth)} /mnd`,
      tipRows([["Formel", `Σ (årslønn × årsverk / 12 × (1 + ${socialPct} % sosiale))`]])]] : []),
    ["Konsernfelles", `${fmtKr(konsernfellesMonth)} /mnd`,
      tipRows([
        ["Formel", `driftsbase × ${konsPct} %`],
        ["Driftsbase", driftsbaseTekst]
      ])],
    ["Margin", `${fmtKr(marginMonth)} /mnd`,
      tipRows([
        ["Formel", `driftsbase × ${marginPct} %`],
        ["Driftsbase", driftsbaseTekst]
      ])],
    ["Totalt årsverk", `${totalFte.toFixed(2)} å.v.`,
      tipRows([["Formel", "sjåførtimer/uke / 37,5 + Σ ledelse-årsverk + Σ koordinator-årsverk"]])],
    ["Km pr. uke", `${fmtNum(weekKm)} km`,
      tipRows([["Formel", "Σ (km × dager × antall biler) pr. kjøring"]])],
    ["Inntekt pr. uke", fmtKr(weekRevenue),
      tipRows([["Formel", "Σ (timer × kr/t × dager × antall biler)"]])],
    ["Inntekt pr. virkedag", fmtKr(weekRevenue / 5),
      tipRows([["Formel", "Inntekt pr. uke / 5"]])]
  ];

  const statCard = ([a, b, tip]) =>
    `<div class="stat"><span>${a}${tip ? infoIcon(tip) : ""}</span><strong>${b}</strong></div>`;

  // Funnel — hele avdelingen, alle biler samlet, eller én valgt bil
  let fRevMonth, fLonnCut, fLonnLabel, fFasteCut, fFasteLabel, fKonsCut, fMarginCut, fResult;
  const selCar =
    selectedCarId && selectedCarId !== "__dep__" && selectedCarId !== "__all__"
      ? cars.find((c) => c.id === selectedCarId)
      : null;

  if (selCar) {
    const carTrips = (dep.trips || []).filter((t) => tripCarIds(t).includes(selCar.id));
    let carRevWeek = 0, carDriverHoursWeek = 0, carFuelWeek = 0;
    carTrips.forEach((t) => {
      const occ = (t.days || []).length;
      const hours = durationMinutes(t.startTime, t.endTime) / 60;
      const staffMult = t.staffing === "dobbel" ? 2 : 1;
      const price = selCar.fuelType === "el" ? num(fuel.electricityPrice) : num(fuel.dieselPrice);
      carRevWeek        += hours * num(t.revenuePerHour) * occ;
      carDriverHoursWeek += hours * occ * staffMult;
      carFuelWeek        += num(t.km) * occ * (num(selCar.consumption) / 100) * price;
    });
    fRevMonth   = carRevWeek * MONTH_FACTOR;
    fLonnCut    = carDriverHoursWeek * effectiveRate * (52 / 12);
    fLonnLabel  = "Lønn (sjåfør)";
    fFasteCut   = carMonthly(selCar) + carFuelWeek * MONTH_FACTOR;
    fFasteLabel = "Bil + drivstoff";
    const carDriftsbase = fLonnCut + fFasteCut;
    fKonsCut    = carDriftsbase * (num(mkp.konsernfelles) / 100);
    fMarginCut  = carDriftsbase * (num(mkp.margin) / 100);
    fResult     = fRevMonth - fLonnCut - fFasteCut - fKonsCut - fMarginCut;
  } else if (selectedCarId === "__all__") {
    // Alle biler samlet – kun driftskostnader, uten avdelingsoverhead
    const allDriftsbase = personnelMonth + carCost + fuelMonth;
    fRevMonth   = monthRevenue;
    fLonnCut    = personnelMonth;
    fLonnLabel  = "Lønn (sjåfør)";
    fFasteCut   = carCost + fuelMonth;
    fFasteLabel = "Bil + drivstoff";
    fKonsCut    = allDriftsbase * (num(mkp.konsernfelles) / 100);
    fMarginCut  = allDriftsbase * (num(mkp.margin) / 100);
    fResult     = fRevMonth - fLonnCut - fFasteCut - fKonsCut - fMarginCut;
  } else {
    // Hele avdelingen – inkl. ledelse, koordinator og faste kostnader
    fRevMonth   = monthRevenue;
    fLonnCut    = personnelMonth + lederMonth + koordinatorMonth;
    fLonnLabel  = "Lønn";
    fFasteCut   = carCost + fixedCost + fuelMonth;
    fFasteLabel = "Bil + faste + drivstoff";
    fKonsCut    = konsernfellesMonth;
    fMarginCut  = marginMonth;
    fResult     = result;
  }

  const afterLonn  = fRevMonth - fLonnCut;
  const afterFaste = afterLonn - fFasteCut;
  const afterKons  = afterFaste - fKonsCut;
  // Waterfall: Inntekt (total) → fratrekk-trinn → Overskudd (total)
  const wfSteps = [
    { label: "Inntekt",       kind: "start",  value: fRevMonth, lo: 0,                    hi: fRevMonth },
    { label: fLonnLabel,      kind: "dec",    value: fLonnCut,  lo: afterLonn,            hi: fRevMonth },
    { label: fFasteLabel,     kind: "dec",    value: fFasteCut, lo: afterFaste,           hi: afterLonn },
    { label: "Konsernfelles", kind: "dec",    value: fKonsCut,  lo: afterKons,            hi: afterFaste },
    { label: "Påslag",        kind: "dec",    value: fMarginCut, lo: fResult,             hi: afterKons },
    { label: "Overskudd",     kind: "result", value: fResult,   lo: Math.min(0, fResult), hi: Math.max(0, fResult) }
  ];
  const chartMax = Math.max(fRevMonth, 0);
  const chartMin = Math.min(0, fResult, afterKons, afterFaste, afterLonn);
  const range = chartMax - chartMin || 1;
  const yPct = (v) => ((v - chartMin) / range) * 100;
  const zeroBar = chartMin < 0
    ? `<div class="wf-zero" style="bottom:${yPct(0).toFixed(2)}%"></div>`
    : "";
  const wfHtml = wfSteps.map((s) => {
    const bottom = yPct(Math.min(s.lo, s.hi));
    const rawH = Math.abs(yPct(s.hi) - yPct(s.lo));
    const height = Math.max(rawH, 1.5);
    const barCls =
      s.kind === "dec" ? "wf-bar wf-dec"
      : s.kind === "result" ? (s.value >= 0 ? "wf-bar wf-pos" : "wf-bar wf-neg")
      : "wf-bar wf-start";
    const valTxt = s.kind === "dec" ? `−${fmtKr(s.value)}` : fmtKr(s.value);
    const valCls =
      s.kind === "dec" ? "wf-val neg"
      : s.kind === "result" ? (s.value >= 0 ? "wf-val pos" : "wf-val neg")
      : "wf-val";
    return `<div class="wf-col">
        <div class="${valCls}">${valTxt}</div>
        <div class="wf-track">
          ${zeroBar}
          <div class="${barCls}" style="bottom:${bottom.toFixed(2)}%;height:${height.toFixed(2)}%"></div>
        </div>
        <div class="wf-label">${esc(s.label)}</div>
      </div>`;
  }).join("");

  const carTabs = `<div class="funnel-car-tabs">
      <button class="funnel-car-tab${selectedCarId === "__dep__" ? " active" : ""}" data-action="select-funnel-car" data-car-id="__dep__">Hele avdelingen</button>
      <button class="funnel-car-tab${selectedCarId === "__all__" ? " active" : ""}" data-action="select-funnel-car" data-car-id="__all__">Alle biler</button>
      ${cars.map((c) => `<button class="funnel-car-tab${selectedCarId === c.id ? " active" : ""}" data-action="select-funnel-car" data-car-id="${esc(c.id)}">${esc(c.regNr || "—")}</button>`).join("")}
    </div>`;

  const funnelSection = monthRevenue > 0
    ? `<div class="card funnel-card">
        <div class="wf-head">
          <button class="btn-collapse" data-action="toggle-chart" aria-label="Vis/skjul diagram">
            ${chartCollapsed ? "▶" : "▼"}
          </button>
          <h3>Kostnadsflyt</h3>
        </div>
        ${chartCollapsed ? "" : `${carTabs}<div class="wf">${wfHtml}</div>`}
      </div>`
    : "";

  return `
    <div class="summary-hero">
      <div class="stat stat-hero">
        <span>Inntekt pr. mnd${infoIcon(inntektTip)}</span>
        <strong>${fmtKr(monthRevenue)}</strong>
      </div>
      <div class="stat stat-hero">
        <span>Kostnader pr. mnd${infoIcon(kostnadTip)}</span>
        <strong>${fmtKr(totalCostMonth)}</strong>
      </div>
      <div class="stat stat-hero stat-result ${result >= 0 ? "pos-bg" : "neg-bg"}">
        <span>Resultat pr. mnd${infoIcon(resultTip)}</span>
        <strong class="${result >= 0 ? "pos" : "neg"}">${fmtKr(result)}</strong>
      </div>
    </div>
    ${funnelSection}
    <div class="section-head sub" style="margin-top:.75rem;margin-bottom:.5rem">
      <h3>Detaljer</h3>
      <button class="btn small ghost" data-action="toggle-summary">
        ${summaryExpanded ? "▲ Skjul" : "▼ Vis detaljer"}
      </button>
    </div>
    ${summaryExpanded
      ? `<div class="summary">${detailCards.map(statCard).join("")}</div>`
      : ""}`;
}

// ---- Årssimulering ---------------------------------------------------------
function depWeeklyFinancials(dep) {
  const cars = dep.cars || [];
  const fuel = dep.fuel || { dieselPrice: 0, electricityPrice: 0 };
  const p = dep.personnel || { driverRate: 250, socialRate: 36 };
  // Grunnsats uten sykefravær — scenarioet i årssimuleringen styrer fraværet.
  const effectiveRateBase = num(p.driverRate) * (1 + num(p.socialRate) / 100);
  const socialFactor = 1 + num(p.socialRate) / 100;
  const carCostMonth = cars.reduce((s, c) => s + carMonthly(c), 0);
  const fixedCostMonth = (dep.fixedCosts || []).reduce((s, f) => s + num(f.amount), 0);
  let weekRevenue = 0, fuelWeek = 0, weekDriverHours = 0;
  (dep.trips || []).forEach((t) => {
    const occ = (t.days || []).length;
    const hours = durationMinutes(t.startTime, t.endTime) / 60;
    const assigned = tripCarIds(t)
      .map((id) => cars.find((c) => c.id === id))
      .filter(Boolean);
    const m = Math.max(assigned.length, 1);
    const staffMult = t.staffing === "dobbel" ? 2 : 1;
    weekRevenue += hours * num(t.revenuePerHour) * occ * m;
    weekDriverHours += hours * occ * m * staffMult;
    assigned.forEach((c) => {
      const price =
        c.fuelType === "el" ? num(fuel.electricityPrice) : num(fuel.dieselPrice);
      fuelWeek += num(t.km) * occ * (num(c.consumption) / 100) * price;
    });
  });
  const lederMonth = (dep.personnel?.ledere || []).reduce(
    (s, l) => s + (num(l.aarslonn) * num(l.aarsrverk)) / 12 * socialFactor, 0);
  const koordinatorMonth = (dep.personnel?.koordinatorer || []).reduce(
    (s, k) => s + (num(k.aarslonn) * num(k.aarsrverk)) / 12 * socialFactor, 0);
  const mkp = dep.markups || { konsernfelles: 6, margin: 5 };
  return {
    weekRevenue, fuelWeek, weekDriverHours, effectiveRateBase,
    sickPct: num(p.sickRate),
    carCostMonth, fixedCostMonth, lederMonth, koordinatorMonth,
    konsPct: num(mkp.konsernfelles), marginPct: num(mkp.margin)
  };
}

// scen: prosent-justeringer for hva-hvis-analyse.
//   sick = sykefravær, wage = lønnsendring (alle), fuel/rev = drivstoff/inntekt.
function yearReportData(fin, year, scen = {}) {
  const sick = scen.sick === undefined ? fin.sickPct : Number(scen.sick) || 0;
  const wageF = 1 + (Number(scen.wage) || 0) / 100;
  const fuelF = 1 + (Number(scen.fuel) || 0) / 100;
  const revF = 1 + (Number(scen.rev) || 0) / 100;
  const effectiveRate = fin.effectiveRateBase * (1 + sick / 100) * wageF;
  const lederMonth = fin.lederMonth * wageF;
  const koordinatorMonth = fin.koordinatorMonth * wageF;
  const holidays = norwegianHolidays(year);
  const rows = [];
  const sum = { wd: 0, k3: 0, k4: 0, k5: 0, k6: 0, k7: 0, paslag: 0, res: 0 };
  for (let mo = 0; mo < 12; mo++) {
    const wd = workingDaysInMonth(year, mo, holidays);
    const factor = wd / 5;
    const inntekt = fin.weekRevenue * revF * factor;
    const drivstoff = fin.fuelWeek * fuelF * factor;
    const lonnSjafor = fin.weekDriverHours * effectiveRate * (52 / 12);
    const k3 = inntekt;
    const k4 = fin.carCostMonth + drivstoff;
    const k5 = lonnSjafor + lederMonth + koordinatorMonth;
    const k6 = fin.fixedCostMonth;
    const driftsbase =
      fin.carCostMonth + drivstoff + lonnSjafor + lederMonth + koordinatorMonth;
    const k7 = driftsbase * (fin.konsPct / 100);
    const paslag = driftsbase * (fin.marginPct / 100);
    const res = k3 - k4 - k5 - k6 - k7 - paslag;
    rows.push({ mo, wd, k3, k4, k5, k6, k7, paslag, res });
    sum.wd += wd; sum.k3 += k3; sum.k4 += k4; sum.k5 += k5;
    sum.k6 += k6; sum.k7 += k7; sum.paslag += paslag; sum.res += res;
  }
  return { rows, sum };
}

function renderYearReport(dep, year, scen = {}) {
  const fin = depWeeklyFinancials(dep);
  const { rows, sum } = yearReportData(fin, year, scen);
  const c = (v) => `<td class="num">${fmtKr(v)}</td>`;
  const body = rows
    .map(
      (r) => `<tr>
        <td>${MONTHS_LONG[r.mo]}</td>
        <td class="num">${r.wd}</td>
        ${c(r.k3)}${c(r.k4)}${c(r.k5)}${c(r.k6)}${c(r.k7)}${c(r.paslag)}
        <td class="num ${r.res >= 0 ? "pos" : "neg"}">${fmtKr(r.res)}</td>
      </tr>`
    )
    .join("");
  const s = (v) => `<td class="num"><strong>${fmtKr(v)}</strong></td>`;
  return `<table class="list report-table">
    <thead><tr>
      <th>Måned</th><th class="num">Virkedager</th>
      <th class="num">K3 Inntekter</th>
      <th class="num">K4 Bil &amp; materiell</th>
      <th class="num">K5 Lønn</th>
      <th class="num">K6 Annet</th>
      <th class="num">K7 Konsernfelles</th>
      <th class="num">Påslag</th>
      <th class="num">Resultat</th>
    </tr></thead>
    <tbody>${body}</tbody>
    <tfoot><tr>
      <td><strong>Sum ${year}</strong></td>
      <td class="num"><strong>${sum.wd}</strong></td>
      ${s(sum.k3)}${s(sum.k4)}${s(sum.k5)}${s(sum.k6)}${s(sum.k7)}${s(sum.paslag)}
      <td class="num ${sum.res >= 0 ? "pos" : "neg"}"><strong>${fmtKr(sum.res)}</strong></td>
    </tr></tfoot>
  </table>`;
}

// Finansrapport som CSV (semikolon-separert, åpnes rett i Excel).
function yearReportCsv(dep, year, scen) {
  const fin = depWeeklyFinancials(dep);
  const { rows, sum } = yearReportData(fin, year, scen);
  const r0 = (v) => Math.round(v);
  const lines = [
    "maaned;virkedager;k3_inntekter;k4_bil_materiell;k5_lonn;k6_annet;k7_konsernfelles;paslag;resultat"
  ];
  rows.forEach((r) => {
    lines.push(
      [MONTHS_LONG[r.mo], r.wd, r0(r.k3), r0(r.k4), r0(r.k5), r0(r.k6), r0(r.k7), r0(r.paslag), r0(r.res)]
        .map(csvField)
        .join(";")
    );
  });
  lines.push(
    [`Sum ${year}`, sum.wd, r0(sum.k3), r0(sum.k4), r0(sum.k5), r0(sum.k6), r0(sum.k7), r0(sum.paslag), r0(sum.res)]
      .map(csvField)
      .join(";")
  );
  return lines.join("\n");
}

function openYearSimulation(dep) {
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  const thisYear = new Date().getFullYear();
  const years = [];
  for (let y = thisYear; y <= thisYear + 3; y++) years.push(y);
  const p = dep.personnel || {};
  overlay.innerHTML = `
    <div class="card modal report-modal">
      <div class="report-head">
        <h2>Årssimulering – ${esc(dep.name)}</h2>
        <label class="report-year">År
          <select data-x="year">
            ${years.map((y) => `<option value="${y}">${y}</option>`).join("")}
          </select>
        </label>
      </div>
      <p class="muted report-note">
        Basert på antall virkedager (man–fre minus norske helligdager) pr. måned.
        Faste poster (bil, faste kostnader, ledelse, koordinator) er like hver
        måned inkl. sjåfør-lønn (52 uker/år); inntekt og drivstoff skaleres med virkedager.
      </p>
      <div class="scenario">
        <span class="scenario-title">Scenario</span>
        <label>Sykefravær
          <input data-x="sick" type="number" min="0" step="0.5" value="${num(p.sickRate)}"/> %
        </label>
        <label>Lønnsendring
          <input data-x="wage" type="number" step="0.5" value="0"/> %
        </label>
        <label>Drivstoffendring
          <input data-x="fuel" type="number" step="1" value="0"/> %
        </label>
        <label>Inntektsendring
          <input data-x="rev" type="number" step="1" value="0"/> %
        </label>
        <button type="button" class="btn small ghost" data-x="reset">Nullstill</button>
      </div>
      <div class="modal-body" data-x="body">${renderYearReport(dep, years[0])}</div>
      <div class="modal-foot">
        <button type="button" class="btn" data-x="export">Eksporter CSV</button>
        <button type="button" class="btn ghost" data-x="close">Lukk</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const sel = overlay.querySelector('[data-x="year"]');
  const bodyEl = overlay.querySelector('[data-x="body"]');
  const scenInput = (k) => overlay.querySelector(`[data-x="${k}"]`);
  const scen = () => ({
    sick: scenInput("sick").value,
    wage: scenInput("wage").value,
    fuel: scenInput("fuel").value,
    rev: scenInput("rev").value
  });
  const refresh = () => {
    bodyEl.innerHTML = renderYearReport(dep, Number(sel.value), scen());
  };
  sel.addEventListener("change", refresh);
  ["sick", "wage", "fuel", "rev"].forEach((k) =>
    scenInput(k).addEventListener("input", refresh)
  );
  overlay.querySelector('[data-x="reset"]').addEventListener("click", () => {
    scenInput("sick").value = num(p.sickRate);
    scenInput("wage").value = 0;
    scenInput("fuel").value = 0;
    scenInput("rev").value = 0;
    refresh();
  });
  overlay.querySelector('[data-x="export"]').addEventListener("click", () => {
    const year = Number(sel.value);
    const safeName = (dep.name || "avdeling").replace(/[^\wæøåÆØÅ-]+/g, "_");
    downloadCsv(`finansrapport_${safeName}_${year}.csv`, yearReportCsv(dep, year, scen()));
  });
  function close() {
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  }
  function onKey(e) {
    if (e.key === "Escape") close();
  }
  document.addEventListener("keydown", onKey);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || e.target.dataset.x === "close") close();
  });
}

// ---- Faste kostnader -------------------------------------------------------
function renderFixedCosts(el, dep) {
  const items = dep.fixedCosts || [];
  const sum = items.reduce((s, f) => s + num(f.amount), 0);
  el.innerHTML = `
    <div class="section-head">
      <h2>Faste kostnader – ${esc(dep.name)}</h2>
      <button class="btn primary" data-action="add-fixed">+ Ny kostnad</button>
    </div>
    ${
      items.length
        ? `<table class="list">
            <thead><tr><th>Navn</th><th>Belop /mnd</th><th></th></tr></thead>
            <tbody>
              ${items
                .map(
                  (f) => `<tr>
                <td>${esc(f.name || "(uten navn)")}</td>
                <td>${fmtKr(f.amount)}</td>
                <td class="row-actions">
                  <button class="btn small" data-action="edit-fixed" data-id="${esc(
                    f.id
                  )}">Rediger</button>
                  <button class="btn small ghost danger" data-action="del-fixed" data-id="${esc(
                    f.id
                  )}">Slett</button>
                </td>
              </tr>`
                )
                .join("")}
            </tbody>
            <tfoot><tr>
              <td><strong>Sum</strong></td>
              <td><strong>${fmtKr(sum)} /mnd</strong></td>
              <td></td>
            </tr></tfoot>
          </table>`
        : `<div class="card empty"><p>Ingen faste kostnader registrert.</p></div>`
    }`;
}

// ---- Drivstoff -------------------------------------------------------------
function renderFuel(el, dep) {
  const fuel = dep.fuel || { dieselPrice: 0, electricityPrice: 0 };
  const cars = dep.cars || [];
  el.innerHTML = `
    <div class="section-head">
      <h2>Drivstoff – ${esc(dep.name)}</h2>
      <button class="btn primary" data-action="edit-fuel">Rediger priser</button>
    </div>
    <div class="summary">
      <div class="stat"><span>Dieselpris</span><strong>${fmtKr(
        fuel.dieselPrice
      )} /liter</strong></div>
      <div class="stat"><span>Strompris</span><strong>${fmtKr(
        fuel.electricityPrice
      )} /kWh</strong></div>
    </div>
    <div class="section-head sub"><h3>Forbruk pr. bil</h3></div>
    ${
      cars.length
        ? `<table class="list">
            <thead><tr>
              <th>Reg.nr</th><th>Modell</th><th>Drivstoff</th><th>Forbruk</th>
            </tr></thead>
            <tbody>
              ${cars
                .map(
                  (c) => `<tr>
                <td>${esc(c.regNr || "—")}</td>
                <td>${esc(c.model || "")}</td>
                <td>${c.fuelType === "el" ? "Elektrisk" : "Diesel"}</td>
                <td>${fmtNum(c.consumption)} ${
                    c.fuelType === "el" ? "kWh/100km" : "l/100km"
                  }</td>
              </tr>`
                )
                .join("")}
            </tbody>
          </table>`
        : `<div class="card empty"><p>Ingen biler registrert. Forbruk og drivstofftype settes pa hver bil under «Biler».</p></div>`
    }`;
}

// ---- Personal --------------------------------------------------------------
function renderPersonnel(el, dep) {
  const p = dep.personnel || { driverRate: 250, socialRate: 36 };
  const effectiveRate = effectiveDriverRate(p);
  const socialFactor = 1 + num(p.socialRate) / 100;
  const mkp = dep.markups || { konsernfelles: 6, margin: 5 };
  const ledere = dep.personnel.ledere || [];
  const koordinatorer = dep.personnel.koordinatorer || [];
  const lederMonth = ledere.reduce(
    (s, l) => s + (num(l.aarslonn) * num(l.aarsrverk)) / 12 * socialFactor, 0);
  const koordinatorMonth = koordinatorer.reduce(
    (s, k) => s + (num(k.aarslonn) * num(k.aarsrverk)) / 12 * socialFactor, 0);

  // Driver FTE from trips
  let weekDriverHours = 0;
  (dep.trips || []).forEach((t) => {
    const occ = (t.days || []).length;
    const hours = durationMinutes(t.startTime, t.endTime) / 60;
    const staffMult = t.staffing === "dobbel" ? 2 : 1;
    const m = Math.max(tripCarIds(t).filter((id) => (dep.cars || []).find((c) => c.id === id)).length, 1);
    weekDriverHours += hours * occ * m * staffMult;
  });
  const driverFte = weekDriverHours / 37.5;
  const lederFte = ledere.reduce((s, l) => s + num(l.aarsrverk), 0);
  const koordinatorFte = koordinatorer.reduce((s, k) => s + num(k.aarsrverk), 0);
  const totalFte = driverFte + lederFte + koordinatorFte;

  const roleTable = (items, role) => {
    const monthCosts = items.map(
      (x) => (num(x.aarslonn) * num(x.aarsrverk)) / 12 * socialFactor
    );
    const sum = monthCosts.reduce((s, v) => s + v, 0);
    if (!items.length) return `<div class="card empty"><p>Ingen registrert.</p></div>`;
    return `<table class="list">
      <thead><tr><th>Navn</th><th>Årslønn</th><th>Årsverk</th><th>/mnd (m/soc.)</th><th></th></tr></thead>
      <tbody>
        ${items.map((x, i) => `<tr>
          <td>${esc(x.label || (role === "leder" ? "Leder" : "Koordinator"))}</td>
          <td>${fmtKr(x.aarslonn)}</td>
          <td>${num(x.aarsrverk)}</td>
          <td>${fmtKr(monthCosts[i])}</td>
          <td class="row-actions">
            <button class="btn small" data-action="edit-personnel-role" data-role="${role}" data-id="${esc(x.id)}">Rediger</button>
            <button class="btn small ghost danger" data-action="del-personnel-role" data-role="${role}" data-id="${esc(x.id)}">Slett</button>
          </td>
        </tr>`).join("")}
      </tbody>
      <tfoot><tr>
        <td><strong>Sum</strong></td><td></td><td></td>
        <td><strong>${fmtKr(sum)} /mnd</strong></td><td></td>
      </tr></tfoot>
    </table>`;
  };

  el.innerHTML = `
    <div class="section-head">
      <h2>Personal – ${esc(dep.name)}</h2>
      <button class="btn primary" data-action="edit-personnel">Rediger</button>
    </div>
    <div class="summary">
      <div class="stat"><span>Sjåfør pr. time</span><strong>${fmtKr(p.driverRate)}</strong></div>
      <div class="stat"><span>Sosiale kostnader</span><strong>${num(p.socialRate)} %</strong></div>
      <div class="stat"><span>Sykefravær</span><strong>${fmtDec(p.sickRate)} %</strong></div>
      <div class="stat"><span>Effektiv timesats</span><strong>${fmtKr(effectiveRate)}</strong></div>
    </div>
    <div class="card" style="margin-top:1rem;font-size:.9rem;color:var(--muted)">
      Effektiv timesats = sjåfør × (1 + sosiale kostnader %) × (1 + sykefravær %).
      Sykefravær er et påslag på sjåførkostnaden (syk sjåfør + vikar).<br>
      Personalkostnad pr. måned beregnes automatisk fra alle kjøringer og vises i oppsummeringen.
    </div>

    <div class="section-head sub" style="margin-top:1.5rem">
      <h3>Ledelse</h3>
      <button class="btn small primary" data-action="add-personnel-role" data-role="leder">+ Legg til leder</button>
    </div>
    ${roleTable(ledere, "leder")}

    <div class="section-head sub" style="margin-top:1.5rem">
      <h3>Koordinatorer</h3>
      <button class="btn small primary" data-action="add-personnel-role" data-role="koordinator">+ Legg til koordinator</button>
    </div>
    ${roleTable(koordinatorer, "koordinator")}

    <div class="section-head sub" style="margin-top:1.5rem">
      <h3>Totalt årsverk</h3>
    </div>
    <div class="summary">
      <div class="stat"><span>Sjåfører</span><strong>${driverFte.toFixed(2)} å.v.</strong></div>
      <div class="stat"><span>Ledelse</span><strong>${lederFte.toFixed(2)} å.v.</strong></div>
      <div class="stat"><span>Koordinatorer</span><strong>${koordinatorFte.toFixed(2)} å.v.</strong></div>
      <div class="stat"><span>Totalt</span><strong>${totalFte.toFixed(2)} å.v.</strong></div>
    </div>

    <div class="section-head sub" style="margin-top:1.5rem">
      <h3>Påslag på drift</h3>
      <button class="btn small ghost" data-action="edit-markups">Rediger</button>
    </div>
    <div class="summary">
      <div class="stat"><span>Konsernfelles</span><strong>${num(mkp.konsernfelles)} %</strong></div>
      <div class="stat"><span>Margin</span><strong>${num(mkp.margin)} %</strong></div>
      <div class="stat"><span>Totalt påslag</span>
        <strong>${num(mkp.konsernfelles) + num(mkp.margin)} %</strong></div>
    </div>
    <div class="card" style="margin-top:1rem;font-size:.9rem;color:var(--muted)">
      Påslaget legges på drift/time-satsen og driftskostnader pr. måned.
    </div>`;
}

// ---- Brukere (admin) -------------------------------------------------------
async function renderUsers(el) {
  el.innerHTML = `<div class="card empty">Laster brukere …</div>`;
  let users = [];
  try {
    users = await listUsers();
  } catch (err) {
    el.innerHTML = `<div class="alert">Kunne ikke hente brukere: ${esc(
      err.message
    )}</div>`;
    return;
  }
  el.innerHTML = `
    <div class="section-head">
      <h2>Brukere</h2>
      <button class="btn primary" data-action="add-user">+ Ny bruker</button>
    </div>
    <table class="list">
      <thead><tr><th>Brukernavn</th><th>Rolle</th><th></th></tr></thead>
      <tbody>
        ${users
          .map(
            (u) => `<tr>
          <td>${esc(u.username)}</td>
          <td>${u.isAdmin ? "Administrator" : "Bruker"}</td>
          <td class="row-actions">
            ${
              u.username === State.session.username
                ? `<span class="muted">deg</span>`
                : `<button class="btn small ghost danger" data-action="del-user" data-user="${esc(
                    u.username
                  )}">Slett</button>`
            }
          </td>
        </tr>`
          )
          .join("")}
      </tbody>
    </table>`;
}

// ---- Hendelser -------------------------------------------------------------
app.addEventListener("change", (e) => {
  const sel = e.target.closest("[data-action='select-dep']");
  if (sel) {
    selectDepartment(sel.value);
    selectedCarId = "__dep__";
    renderApp();
    return;
  }
  // Inline-redigering i Rutemaster-tabellen
  const inp = e.target.closest("[data-trip-field]");
  if (inp) {
    const dep = selectedDepartment();
    const trip = dep?.trips.find((x) => x.id === inp.dataset.trip);
    if (!trip) return;
    const field = inp.dataset.tripField;
    const val = inp.value.trim();
    if (field === "carId") {
      updateTrip(dep, trip.id, { carIds: val ? [val] : [] });
    } else if (field === "startTime" || field === "endTime") {
      if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(val)) {
        renderContent(); // ugyldig tid — rull tilbake til lagret verdi
        return;
      }
      updateTrip(dep, trip.id, { [field]: val.padStart(5, "0") });
    } else if (field === "km" || field === "revenuePerHour" || field === "antallRuter") {
      updateTrip(dep, trip.id, { [field]: num(val) });
    } else {
      updateTrip(dep, trip.id, { [field]: val });
    }
    renderContent();
  }
});

app.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-action]");
  if (!t) return;
  const action = t.dataset.action;
  const dep = selectedDepartment();

  if (action === "logout") {
    flushSave();
    logout();
    State.session = null;
    State.data = null;
    renderLogin();
  } else if (action === "tab") {
    view = t.dataset.tab;
    renderApp();
  } else if (action === "new-dep") {
    const res = await modal("Ny avdeling", [
      { name: "name", label: "Navn", type: "text", required: true }
    ]);
    if (res) {
      addDepartment(res.name);
      view = "kjøringer";
      renderApp();
    }
  } else if (action === "del-dep" && dep) {
    if (confirm(`Slette avdelingen "${dep.name}" med alle biler og kjøringer?`)) {
      deleteDepartment(dep.id);
      selectedCarId = "__dep__";
      renderApp();
    }
  } else if (action === "add-car" && dep) {
    const res = await carModal();
    if (res) {
      addCar(dep, res);
      renderContent();
    }
  } else if (action === "quick-add-car" && dep) {
    addCar(dep, {
      regNr: `Bil ${nextCarNumber(dep.cars)}`,
      model: "",
      vehicleType: "",
      description: "",
      fuelType: "diesel",
      consumption: 0,
      costs: {}
    });
    renderContent();
  } else if (action === "edit-car" && dep) {
    const car = dep.cars.find((c) => c.id === t.dataset.id);
    if (!car) return;
    const res = await carModal(car);
    if (res) {
      updateCar(dep, car.id, res);
      renderContent();
    }
  } else if (action === "del-car" && dep) {
    if (confirm("Slette denne bilen?")) {
      deleteCar(dep, t.dataset.id);
      renderContent();
    }
  } else if (action === "add-trip" && dep) {
    const res = await tripModal(null, dep);
    if (res) {
      addTrip(dep, res);
      renderContent();
    }
  } else if (action === "quick-add-trip" && dep) {
    addTrip(dep, {
      customer: `Rute ${nextTripNumber(dep.trips)}`,
      type: "fast_rute",
      staffing: "enkelt",
      vehicleType: "",
      carIds: [],
      antallRuter: 1,
      startTime: "08:00",
      endTime: "16:00",
      days: [0, 1, 2, 3, 4],
      km: 0,
      revenuePerHour: 0,
      color: TRIP_COLORS[(dep.trips.length || 0) % TRIP_COLORS.length]
    });
    renderContent();
  } else if (action === "toggle-trip-day" && dep) {
    const trip = dep.trips.find((x) => x.id === t.dataset.id);
    if (!trip) return;
    const day = Number(t.dataset.day);
    const days = new Set(trip.days || []);
    if (days.has(day)) days.delete(day);
    else days.add(day);
    updateTrip(dep, trip.id, { days: [...days].sort((a, b) => a - b) });
    renderContent();
  } else if (action === "edit-trip" && dep) {
    const trip = dep.trips.find((x) => x.id === t.dataset.id);
    if (!trip) return;
    const res = await tripModal(trip, dep);
    if (res) {
      updateTrip(dep, trip.id, res);
      renderContent();
    }
  } else if (action === "del-trip" && dep) {
    if (confirm("Slette denne kjøringen?")) {
      deleteTrip(dep, t.dataset.id);
      renderContent();
    }
  } else if (action === "simulate-year" && dep) {
    openYearSimulation(dep);
  } else if (action === "select-funnel-car") {
    selectedCarId = t.dataset.carId || "__dep__";
    renderContent();
  } else if (action === "toggle-chart") {
    chartCollapsed = !chartCollapsed;
    renderContent();
  } else if (action === "toggle-summary") {
    summaryExpanded = !summaryExpanded;
    renderContent();
  } else if (action === "toggle-trips") {
    tripsCollapsed = !tripsCollapsed;
    renderContent();
  } else if (action === "toggle-gantt") {
    ganttExpanded = !ganttExpanded;
    renderContent();
  } else if (action === "car-template") {
    downloadCsv("biler_mal.csv", CAR_CSV_HEADERS + "\n" + CAR_CSV_EXAMPLE);
  } else if (action === "export-cars" && dep) {
    exportCarsCsv(dep);
  } else if (action === "import-cars" && dep) {
    pickCsvFile((text) => importCarsCsv(text, dep));
  } else if (action === "trip-template") {
    downloadCsv("kjoringer_mal.csv", TRIP_CSV_HEADERS + "\n" + TRIP_CSV_EXAMPLE);
  } else if (action === "export-trips" && dep) {
    exportTripsCsv(dep);
  } else if (action === "import-trips" && dep) {
    pickCsvFile((text) => importTripsCsv(text, dep));
  } else if (action === "add-fixed" && dep) {
    const res = await fixedCostModal();
    if (res) {
      addFixedCost(dep, res);
      renderContent();
    }
  } else if (action === "edit-fixed" && dep) {
    const item = (dep.fixedCosts || []).find((f) => f.id === t.dataset.id);
    if (!item) return;
    const res = await fixedCostModal(item);
    if (res) {
      updateFixedCost(dep, item.id, res);
      renderContent();
    }
  } else if (action === "del-fixed" && dep) {
    if (confirm("Slette denne kostnaden?")) {
      deleteFixedCost(dep, t.dataset.id);
      renderContent();
    }
  } else if (action === "edit-fuel" && dep) {
    const res = await fuelModal(dep.fuel);
    if (res) {
      setFuel(dep, res);
      renderContent();
    }
  } else if (action === "edit-personnel" && dep) {
    const res = await personnelModal(dep.personnel);
    if (res) {
      setPersonnel(dep, res);
      renderContent();
    }
  } else if (action === "edit-markups" && dep) {
    const res = await markupsModal(dep.markups);
    if (res) {
      setMarkups(dep, res);
      renderContent();
    }
  } else if (action === "add-personnel-role" && dep) {
    const role = t.dataset.role;
    const res = await personnelRoleModal(role);
    if (res) {
      addPersonnelRole(dep, role, res);
      renderContent();
    }
  } else if (action === "edit-personnel-role" && dep) {
    const role = t.dataset.role;
    const key = role === "leder" ? "ledere" : "koordinatorer";
    const entry = (dep.personnel[key] || []).find((x) => x.id === t.dataset.id);
    if (!entry) return;
    const res = await personnelRoleModal(role, entry);
    if (res) {
      updatePersonnelRole(dep, role, t.dataset.id, res);
      renderContent();
    }
  } else if (action === "del-personnel-role" && dep) {
    const role = t.dataset.role;
    if (confirm(`Slette denne ${role === "leder" ? "lederen" : "koordinatoren"}?`)) {
      deletePersonnelRole(dep, role, t.dataset.id);
      renderContent();
    }
  } else if (action === "add-user") {
    const res = await modal("Ny bruker", [
      { name: "username", label: "Brukernavn", type: "text", required: true },
      { name: "password", label: "Passord", type: "text", required: true },
      { name: "isAdmin", label: "Administrator", type: "checkbox" }
    ]);
    if (res) {
      try {
        await createUser(res.username, res.password, res.isAdmin);
        renderContent();
      } catch (err) {
        alert(err.message);
      }
    }
  } else if (action === "del-user") {
    if (confirm(`Slette brukeren "${t.dataset.user}"?`)) {
      try {
        await deleteUser(t.dataset.user);
        renderContent();
      } catch (err) {
        alert(err.message);
      }
    }
  }
});

// Rediger kjøring ved klikk i Gantt
app.addEventListener("click", async (e) => {
  const block = e.target.closest(".trip-block");
  if (!block) return;
  const dep = selectedDepartment();
  const trip = dep?.trips.find((x) => x.id === block.dataset.trip);
  if (!trip) return;
  const res = await tripModal(trip, dep);
  if (res) {
    updateTrip(dep, trip.id, res);
    renderContent();
  }
});

// ---- Tooltip ---------------------------------------------------------------
app.addEventListener("mouseover", (e) => {
  const el = e.target.closest("[data-tip]");
  if (!el) return;
  tooltip.innerHTML = el.dataset.tip;
  tooltip.hidden = false;
});
app.addEventListener("mousemove", (e) => {
  if (tooltip.hidden) return;
  const pad = 14;
  let x = e.clientX + pad;
  let y = e.clientY + pad;
  const r = tooltip.getBoundingClientRect();
  if (x + r.width > window.innerWidth) x = e.clientX - r.width - pad;
  if (y + r.height > window.innerHeight) y = e.clientY - r.height - pad;
  tooltip.style.left = x + "px";
  tooltip.style.top = y + "px";
});
app.addEventListener("mouseout", (e) => {
  if (e.target.closest("[data-tip]")) tooltip.hidden = true;
});

// ---- Modal-hjelper ---------------------------------------------------------
function modal(title, fields) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.innerHTML = `
      <form class="card modal">
        <h2>${esc(title)}</h2>
        <div class="modal-body">${fields.map(fieldHtml).join("")}</div>
        <div class="modal-foot">
          <button type="button" class="btn ghost" data-x="cancel">Avbryt</button>
          <button type="submit" class="btn primary">Lagre</button>
        </div>
      </form>`;
    document.body.appendChild(overlay);
    const form = overlay.querySelector("form");
    form.querySelector("input,select,textarea")?.focus();

    function close(result) {
      document.removeEventListener("keydown", onKey);
      overlay.remove();
      resolve(result);
    }
    function onKey(e) {
      if (e.key === "Escape") close(null);
    }
    document.addEventListener("keydown", onKey);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay || e.target.dataset.x === "cancel") close(null);
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const out = {};
      for (const f of fields) {
        if (f.type === "checkbox") {
          out[f.name] = form.querySelector(`[name="${f.name}"]`).checked;
        } else if (f.type === "days") {
          out[f.name] = [
            ...form.querySelectorAll(`[name="${f.name}"]:checked`)
          ].map((c) => Number(c.value));
        } else if (f.type === "multi") {
          out[f.name] = [
            ...form.querySelectorAll(`[name="${f.name}"]:checked`)
          ].map((c) => c.value);
        } else {
          let v = form.querySelector(`[name="${f.name}"]`).value;
          if (f.type === "number") v = v === "" ? 0 : Number(v);
          out[f.name] = v;
        }
      }
      close(out);
    });
  });
}

function fieldHtml(f) {
  const v = f.value ?? "";
  if (f.type === "checkbox") {
    return `<label class="check"><input type="checkbox" name="${f.name}" ${
      f.value ? "checked" : ""
    }/> ${esc(f.label)}</label>`;
  }
  if (f.type === "select") {
    return `<label>${esc(f.label)}
      <select name="${f.name}">
        ${f.options
          .map(
            (o) =>
              `<option value="${esc(o.value)}" ${
                o.value === v ? "selected" : ""
              }>${esc(o.label)}</option>`
          )
          .join("")}
      </select></label>`;
  }
  if (f.type === "days") {
    const set = new Set(f.value || []);
    return `<div class="days-field"><span>${esc(f.label)}</span>
      <div class="days">${DAYS_LONG.map(
        (d, i) =>
          `<label class="day"><input type="checkbox" name="${f.name}" value="${i}" ${
            set.has(i) ? "checked" : ""
          }/> ${d.slice(0, 3)}</label>`
      ).join("")}</div></div>`;
  }
  if (f.type === "multi") {
    const set = new Set(f.value || []);
    const opts = f.options || [];
    if (!opts.length) {
      return `<div class="days-field"><span>${esc(f.label)}</span>
        <p class="muted" style="margin:.4rem 0 0">Ingen biler – legg til under «Biler».</p></div>`;
    }
    return `<div class="days-field"><span>${esc(f.label)}</span>
      <div class="days">${opts
        .map(
          (o) =>
            `<label class="day"><input type="checkbox" name="${f.name}" value="${esc(
              o.value
            )}" ${set.has(o.value) ? "checked" : ""}/> ${esc(o.label)}</label>`
        )
        .join("")}</div></div>`;
  }
  if (f.type === "color") {
    return `<label>${esc(f.label)}
      <input type="color" name="${f.name}" value="${esc(v || "#4f46e5")}"
        style="height:38px;padding:2px;width:100%"/></label>`;
  }
  if (f.type === "time") {
    return `<label>${esc(f.label)}
      <span class="input-wrap"><input type="text" name="${f.name}"
        value="${esc(v)}" ${f.required ? "required" : ""}
        placeholder="HH:MM" maxlength="5" inputmode="numeric"
        pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
        title="Militærtid, f.eks. 08:30 eller 23:45"/></span>
    </label>`;
  }
  const suffix = f.suffix ? `<span class="suffix">${esc(f.suffix)}</span>` : "";
  return `<label${f.type === "text" ? ' class="field-full"' : ""}>${esc(f.label)}
    <span class="input-wrap"><input type="${f.type}" name="${f.name}"
      value="${esc(v)}" ${f.required ? "required" : ""}
      ${f.type === "number" ? 'min="0" step="any"' : ""}/>${suffix}</span>
  </label>`;
}

function carModal(car) {
  const k = (car && car.costs) || {};
  return modal(car ? "Rediger bil" : "Registrer bil", [
    { name: "regNr", label: "Reg.nr", type: "text", required: true, value: car?.regNr },
    { name: "model", label: "Merke / modell", type: "text", value: car?.model },
    { name: "vehicleType", label: "Kjøretøykategori", type: "select", value: car?.vehicleType || "", options: VEHICLE_TYPES },
    { name: "description", label: "Beskrivelse", type: "text", value: car?.description },
    {
      name: "fuelType",
      label: "Drivstoff",
      type: "select",
      value: car?.fuelType || "diesel",
      options: [
        { value: "diesel", label: "Diesel" },
        { value: "el", label: "Elektrisk" }
      ]
    },
    { name: "consumption", label: "Forbruk (per 100 km)", type: "number", value: car?.consumption },
    { name: "leasing", label: "Leasing (kr/mnd)", type: "number", value: k.leasing },
    { name: "insurance", label: "Forsikring (kr/mnd)", type: "number", value: k.insurance },
    { name: "service", label: "Service (kr/ar)", type: "number", value: k.service },
    { name: "tires", label: "Dekk / dekkhotell (kr/ar)", type: "number", value: k.tires },
    { name: "damage", label: "Skade / erstatninger (kr)", type: "number", value: k.damage },
    { name: "parking", label: "Parkering (kr/mnd)", type: "number", value: k.parking },
    { name: "leasingStart", label: "Leasing startdato", type: "date", value: k.leasingStart },
    { name: "euControl", label: "EU-kontroll dato", type: "date", value: k.euControl },
    { name: "budgetKm", label: "Budsjettert km/ar", type: "number", value: k.budgetKm }
  ]).then((r) => {
    if (!r) return null;
    return {
      regNr: r.regNr,
      model: r.model,
      vehicleType: r.vehicleType,
      description: r.description,
      fuelType: r.fuelType,
      consumption: r.consumption,
      costs: {
        leasing: r.leasing,
        insurance: r.insurance,
        service: r.service,
        tires: r.tires,
        damage: r.damage,
        parking: r.parking,
        leasingStart: r.leasingStart,
        euControl: r.euControl,
        budgetKm: r.budgetKm
      }
    };
  });
}

function tripModal(trip, dep) {
  const carOptions = (dep?.cars || [])
    .slice()
    .sort((a, b) =>
      (a.regNr || "").localeCompare(b.regNr || "", "no", { numeric: true })
    )
    .map((c) => ({
      value: c.id,
      label: c.regNr + (c.model ? " – " + c.model : "")
    }));
  return modal(trip ? "Rediger kjøring" : "Ny kjøring", [
    { name: "customer", label: "Kundenavn", type: "text", required: true, value: trip?.customer },
    {
      name: "type",
      label: "Type",
      type: "select",
      value: trip?.type || "fast_rute",
      options: [
        { value: "fast_rute", label: "Fast rute" },
        { value: "annet", label: "Annet" }
      ]
    },
    {
      name: "staffing",
      label: "Bemanning",
      type: "select",
      value: trip?.staffing || "enkelt",
      options: [
        { value: "enkelt", label: "Enkelt" },
        { value: "dobbel", label: "Dobbel" }
      ]
    },
    { name: "vehicleType", label: "Kjøretøykategori", type: "select", value: trip?.vehicleType || "", options: VEHICLE_TYPES },
    {
      name: "color",
      label: "Farge",
      type: "color",
      value:
        trip?.color ||
        TRIP_COLORS[(dep?.trips?.length || 0) % TRIP_COLORS.length]
    },
    { name: "antallRuter", label: "Antall ruter (biler som trengs)", type: "number", value: trip?.antallRuter },
    { name: "carIds", label: "Biler (tildelt)", type: "multi", value: tripCarIds(trip || {}), options: carOptions },
    { name: "startTime", label: "Starttidspunkt", type: "time", required: true, value: trip?.startTime || "08:00" },
    { name: "endTime", label: "Sluttidspunkt", type: "time", required: true, value: trip?.endTime || "16:00" },
    { name: "days", label: "Faste dager", type: "days", value: trip?.days || [] },
    { name: "km", label: "Kilometer", type: "number", value: trip?.km },
    { name: "revenuePerHour", label: "Inntekter pr. time (kr/t)", type: "number", value: trip?.revenuePerHour }
  ]);
}

function fixedCostModal(item) {
  return modal(item ? "Rediger kostnad" : "Ny fast kostnad", [
    { name: "name", label: "Navn (f.eks. husleie)", type: "text", required: true, value: item?.name },
    { name: "amount", label: "Belop (kr/mnd)", type: "number", value: item?.amount }
  ]);
}

function personnelModal(personnel) {
  const p = personnel || { driverRate: 250, socialRate: 36 };
  return modal("Personalkostnader", [
    { name: "driverRate", label: "Sjåfør pr. time (kr/t)", type: "number", value: p.driverRate },
    { name: "socialRate", label: "Sosiale kostnader (%)", type: "number", value: p.socialRate },
    { name: "sickRate", label: "Sykefravær (%)", type: "number", value: p.sickRate ?? 0 }
  ]);
}

function personnelRoleModal(role, entry = null) {
  const title = entry
    ? `Rediger ${role === "leder" ? "leder" : "koordinator"}`
    : `Legg til ${role === "leder" ? "leder" : "koordinator"}`;
  return modal(title, [
    { name: "label", label: "Navn/tittel (valgfritt)", type: "text", value: entry?.label || "" },
    { name: "aarslonn", label: "Årslønn (kr)", type: "number", required: true, value: entry?.aarslonn ?? "" },
    { name: "aarsrverk", label: "Årsverk (f.eks. 0.5 = 50 %)", type: "number", required: true, value: entry?.aarsrverk ?? 1 }
  ]);
}

function fuelModal(fuel) {
  const f = fuel || {};
  return modal("Drivstoffpriser", [
    { name: "dieselPrice", label: "Dieselpris (kr/liter)", type: "number", value: f.dieselPrice },
    { name: "electricityPrice", label: "Strompris (kr/kWh)", type: "number", value: f.electricityPrice }
  ]);
}

function markupsModal(markups) {
  const m = markups || { konsernfelles: 6, margin: 5 };
  return modal("Påslag på faste kostnader", [
    { name: "konsernfelles", label: "Konsernfelles (%)", type: "number", value: m.konsernfelles },
    { name: "margin", label: "Margin (%)", type: "number", value: m.margin }
  ]);
}

function num(v) {
  return Number(v) || 0;
}

function tripCarIds(t) {
  if (Array.isArray(t.carIds)) return t.carIds;
  return t.carId ? [t.carId] : [];
}

// Neste ledige nummer for hurtiglagte biler («Bil 1», «Bil 2», …).
function nextCarNumber(cars) {
  let max = 0;
  (cars || []).forEach((c) => {
    const m = /^bil\s+(\d+)$/i.exec((c.regNr || "").trim());
    if (m) max = Math.max(max, Number(m[1]));
  });
  return max + 1;
}

// Neste ledige nummer for hurtiglagte ruter («Rute 1», «Rute 2», …).
function nextTripNumber(trips) {
  let max = 0;
  (trips || []).forEach((t) => {
    const m = /^rute\s+(\d+)$/i.exec((t.customer || "").trim());
    if (m) max = Math.max(max, Number(m[1]));
  });
  return max + 1;
}

// ---- CSV-eksport / -import -------------------------------------------------
function downloadCsv(filename, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" })
  );
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// Felter med ; " eller linjeskift pakkes i anførselstegn ved eksport.
function csvField(v) {
  const s = String(v ?? "");
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Deler en CSV-linje på ; med støtte for anførselstegn ("" = ett ").
function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"' && cur === "") {
      inQuotes = true;
    } else if (ch === ";") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseCsv(text) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .split("\n");
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const vals = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = (vals[i] ?? "").trim();
    });
    return row;
  });
}

function pickCsvFile(onLoad) {
  const inp = document.createElement("input");
  inp.type = "file";
  inp.accept = ".csv,text/csv";
  inp.onchange = () => {
    const file = inp.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => onLoad(e.target.result);
    reader.readAsText(file, "UTF-8");
  };
  inp.click();
}

const DAY_NAMES = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];
const DAY_MAP = { Man: 0, Tir: 1, Ons: 2, Tor: 3, Fre: 4, "Lør": 5, "Søn": 6 };

const CAR_CSV_HEADERS =
  "regnr;modell;kategori;drivstoff;forbruk;leasing_kr_mnd;forsikring_kr_mnd;service_kr_ar;dekk_kr_ar;skade_kr;parkering_kr_mnd;leasing_startdato;eu_kontroll;budsjett_km_ar;beskrivelse";
const CAR_CSV_EXAMPLE =
  "AB12345;Ford Transit;Skapbil 19m3;diesel;8.5;5000;1200;8000;4000;0;500;;2026-06-01;50000;Varebil Oslo";

const TRIP_CSV_HEADERS =
  "kunde;type;bemanning;kategori;biler;starttid;sluttid;dager;km;kr_per_time;farge";
const TRIP_CSV_EXAMPLE =
  "Rema 1000;Fast rute;Enkelt;Skapbil 19m3;AB12345;08:00;16:00;Man|Tir|Ons|Tor|Fre;120;450;#4f46e5";

function vehicleLabelOf(val) {
  return VEHICLE_TYPES.find((v) => v.value === val && v.value)?.label || "";
}
function vehicleValueOf(lbl) {
  const s = (lbl || "").trim().toLowerCase();
  return VEHICLE_TYPES.find((v) => v.label.toLowerCase() === s)?.value || "";
}

function exportCarsCsv(dep) {
  const rows = (dep.cars || []).map((c) => {
    const k = c.costs || {};
    return [
      c.regNr,
      c.model,
      vehicleLabelOf(c.vehicleType),
      c.fuelType,
      c.consumption,
      k.leasing,
      k.insurance,
      k.service,
      k.tires,
      k.damage,
      k.parking,
      k.leasingStart,
      k.euControl,
      k.budgetKm,
      c.description
    ]
      .map(csvField)
      .join(";");
  });
  downloadCsv("biler.csv", CAR_CSV_HEADERS + "\n" + rows.join("\n"));
}

function importCarsCsv(text, dep) {
  const rows = parseCsv(text);
  let ok = 0;
  rows.forEach((r) => {
    if (!r.regnr) return;
    addCar(dep, {
      regNr: r.regnr,
      model: r.modell || "",
      vehicleType: vehicleValueOf(r.kategori),
      description: r.beskrivelse || "",
      fuelType: r.drivstoff === "el" ? "el" : "diesel",
      consumption: num(r.forbruk),
      costs: {
        leasing: num(r.leasing_kr_mnd),
        insurance: num(r.forsikring_kr_mnd),
        service: num(r.service_kr_ar),
        tires: num(r.dekk_kr_ar),
        damage: num(r.skade_kr),
        parking: num(r.parkering_kr_mnd),
        leasingStart: r.leasing_startdato || "",
        euControl: r.eu_kontroll || "",
        budgetKm: num(r.budsjett_km_ar)
      }
    });
    ok++;
  });
  renderContent();
  alert(`Importerte ${ok} biler.`);
}

function exportTripsCsv(dep) {
  const cars = dep.cars || [];
  const rows = (dep.trips || []).map((t) => {
    const regs = tripCarIds(t)
      .map((id) => cars.find((c) => c.id === id)?.regNr)
      .filter(Boolean)
      .join("|");
    const dager = (t.days || [])
      .slice()
      .sort((a, b) => a - b)
      .map((d) => DAY_NAMES[d])
      .join("|");
    return [
      t.customer,
      t.type === "fast_rute" ? "Fast rute" : "Annet",
      t.staffing === "dobbel" ? "Dobbel" : "Enkelt",
      vehicleLabelOf(t.vehicleType),
      regs,
      t.startTime,
      t.endTime,
      dager,
      t.km,
      t.revenuePerHour,
      t.color || ""
    ]
      .map(csvField)
      .join(";");
  });
  downloadCsv("kjoringer.csv", TRIP_CSV_HEADERS + "\n" + rows.join("\n"));
}

function importTripsCsv(text, dep) {
  const cars = dep.cars || [];
  const rows = parseCsv(text);
  let ok = 0;
  rows.forEach((r) => {
    if (!r.kunde) return;
    const carIds = (r.biler || "")
      .split("|")
      .map(
        (reg) =>
          cars.find(
            (c) =>
              (c.regNr || "").toLowerCase() === reg.trim().toLowerCase()
          )?.id
      )
      .filter(Boolean);
    const days = (r.dager || "")
      .split("|")
      .map((d) => DAY_MAP[d.trim()])
      .filter((d) => d !== undefined);
    addTrip(dep, {
      customer: r.kunde,
      type: r.type === "Fast rute" ? "fast_rute" : "annet",
      staffing: r.bemanning === "Dobbel" ? "dobbel" : "enkelt",
      vehicleType: vehicleValueOf(r.kategori),
      carIds,
      startTime: r.starttid || "08:00",
      endTime: r.sluttid || "16:00",
      days,
      km: num(r.km),
      revenuePerHour: num(r.kr_per_time),
      color:
        r.farge ||
        TRIP_COLORS[(dep.trips.length || 0) % TRIP_COLORS.length]
    });
    ok++;
  });
  renderContent();
  alert(`Importerte ${ok} kjøringer.`);
}
