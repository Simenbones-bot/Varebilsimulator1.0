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
  setPersonnel
} from "./state.js";
import { renderGantt } from "./gantt.js";
import {
  DAYS_LONG,
  esc,
  durationMinutes,
  fmtKr,
  fmtNum
} from "./utils.js";

const app = document.getElementById("app");
const tooltip = document.getElementById("tooltip");

let view = "kjøringer";

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
function renderLogin(error = "") {
  app.innerHTML = `
    <div class="login-wrap">
      <form class="card login-card" id="login-form">
        <h1>Varebilsimulator</h1>
        <p class="muted">Logg inn for å planlegge avdelinger og kjøringer.</p>
        ${error ? `<div class="alert">${esc(error)}</div>` : ""}
        <label>Brukernavn
          <input name="username" autocomplete="username" required autofocus />
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
      const btn = f.querySelector("button");
      btn.disabled = true;
      btn.textContent = "Logger inn …";
      try {
        const session = await login(
          f.username.value,
          f.password.value
        );
        State.session = session;
        await loadData(session.username);
        view = "kjøringer";
        renderApp();
      } catch (err) {
        renderLogin(err.message || "Innlogging feilet");
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
    ["kjøringer", "Kjøringer"],
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
  const content = document.getElementById("content");
  if (view === "brukere" && State.session.isAdmin) {
    renderUsers(content);
    return;
  }
  const dep = selectedDepartment();
  if (!dep) {
    content.innerHTML = `<div class="card empty">
      <p>Du har ingen avdelinger enna.</p>
      <button class="btn primary" data-action="new-dep">Opprett din forste avdeling</button>
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
function carMonthly(c) {
  const k = c.costs || {};
  return (
    num(k.leasing) +
    num(k.insurance) +
    num(k.parking) +
    num(k.service) / 12 +
    num(k.tires) / 12
  );
}

function renderCars(el, dep) {
  const cars = dep.cars || [];
  el.innerHTML = `
    <div class="section-head">
      <h2>Biler – ${esc(dep.name)}</h2>
      <button class="btn primary" data-action="add-car">+ Registrer bil</button>
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
  const rows = [
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
function renderKjoringer(el, dep) {
  const trips = dep.trips || [];
  el.innerHTML = `
    <div class="section-head">
      <h2>Ukesplan – ${esc(dep.name)}</h2>
      <button class="btn primary" data-action="add-trip">+ Ny kjøring</button>
    </div>
    ${renderSummary(dep)}
    ${renderGantt(dep)}
    <div class="section-head sub">
      <h3>Kjøringer (${trips.length})</h3>
    </div>
    ${
      trips.length
        ? `<table class="list">
            <thead><tr>
              <th>Kunde</th><th>Type</th><th>Bemanning</th><th>Bil</th>
              <th>Tid</th><th>Dager</th><th>Km</th><th>Kr/t</th><th></th>
            </tr></thead>
            <tbody>${trips.map((t) => tripRow(t, dep)).join("")}</tbody>
          </table>`
        : `<div class="card empty"><p>Ingen kjøringer planlagt.</p></div>`
    }`;
}

function tripRow(t, dep) {
  const cars = dep?.cars || [];
  const regs = tripCarIds(t)
    .map((id) => cars.find((c) => c.id === id))
    .filter(Boolean)
    .map((c) => esc(c.regNr));
  const carLabel = regs.length ? regs.join(", ") : "–";
  return `<tr>
    <td>${esc(t.customer || "(uten navn)")}</td>
    <td><span class="pill type-${esc(t.type || "annet")}">${
    t.type === "fast_rute" ? "Fast rute" : "Annet"
  }</span></td>
    <td>${t.staffing === "dobbel" ? "Dobbel" : "Enkelt"}</td>
    <td>${carLabel}</td>
    <td>${esc(t.startTime)}–${esc(t.endTime)}</td>
    <td>${(t.days || [])
      .slice()
      .sort((a, b) => a - b)
      .map((d) => DAYS_LONG[d].slice(0, 3))
      .join(", ")}</td>
    <td>${fmtNum(t.km)}</td>
    <td>${fmtNum(t.revenuePerHour)}</td>
    <td class="row-actions">
      <button class="btn small" data-action="edit-trip" data-id="${esc(
        t.id
      )}">Rediger</button>
      <button class="btn small ghost danger" data-action="del-trip" data-id="${esc(
        t.id
      )}">Slett</button>
    </td>
  </tr>`;
}

function renderSummary(dep) {
  const cars = dep.cars || [];
  const fuel = dep.fuel || { dieselPrice: 0, electricityPrice: 0 };
  const p = dep.personnel || { driverRate: 250, socialRate: 36 };
  const effectiveRate = num(p.driverRate) * (1 + num(p.socialRate) / 100);
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
  const fuelMonth = fuelWeek * 4.33;
  const personnelMonth = weekDriverHours * effectiveRate * 4.33;
  const monthRevenue = weekRevenue * 4.33;
  const result = monthRevenue - carCost - fixedCost - fuelMonth - personnelMonth;
  const resultClass = result >= 0 ? "stat-pos" : "stat-neg";
  const cards = [
    ["Biler", `${cars.length}`],
    ["Bilkostnad", `${fmtKr(carCost)} /mnd`],
    ["Faste kostnader", `${fmtKr(fixedCost)} /mnd`],
    ["Drivstoff", `${fmtKr(fuelMonth)} /mnd`],
    ["Personal", `${fmtKr(personnelMonth)} /mnd`],
    ["Km pr. uke", `${fmtNum(weekKm)} km`],
    ["Inntekt pr. uke", fmtKr(weekRevenue)],
    ["Inntekt pr. virkedag", fmtKr(weekRevenue / 5)],
    ["Inntekt pr. mnd", fmtKr(monthRevenue)]
  ];
  return `<div class="summary">
    ${cards
      .map(
        ([a, b]) => `<div class="stat"><span>${a}</span><strong>${b}</strong></div>`
      )
      .join("")}
    <div class="stat ${resultClass}">
      <span>Resultat pr. mnd</span>
      <strong>${fmtKr(result)}</strong>
    </div>
  </div>`;
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
  const effectiveRate = num(p.driverRate) * (1 + num(p.socialRate) / 100);
  el.innerHTML = `
    <div class="section-head">
      <h2>Personal – ${esc(dep.name)}</h2>
      <button class="btn primary" data-action="edit-personnel">Rediger</button>
    </div>
    <div class="summary">
      <div class="stat"><span>Sjåfør pr. time</span><strong>${fmtKr(p.driverRate)}</strong></div>
      <div class="stat"><span>Sosiale kostnader</span><strong>${num(p.socialRate)} %</strong></div>
      <div class="stat"><span>Effektiv timesats</span><strong>${fmtKr(effectiveRate)}</strong></div>
    </div>
    <div class="card" style="margin-top:1rem;font-size:.9rem;color:var(--muted)">
      Effektiv timesats = sjåfør × (1 + sosiale kostnader %).<br>
      Personalkostnad pr. måned beregnes automatisk fra alle kjøringer og vises i oppsummeringen.
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
    renderApp();
  }
});

app.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-action]");
  if (!t) return;
  const action = t.dataset.action;
  const dep = selectedDepartment();

  if (action === "logout") {
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
      renderApp();
    }
  } else if (action === "add-car" && dep) {
    const res = await carModal();
    if (res) {
      addCar(dep, res);
      renderContent();
    }
  } else if (action === "edit-car" && dep) {
    const car = dep.cars.find((c) => c.id === t.dataset.id);
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
  } else if (action === "edit-trip" && dep) {
    const trip = dep.trips.find((x) => x.id === t.dataset.id);
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
  } else if (action === "add-fixed" && dep) {
    const res = await fixedCostModal();
    if (res) {
      addFixedCost(dep, res);
      renderContent();
    }
  } else if (action === "edit-fixed" && dep) {
    const item = (dep.fixedCosts || []).find((f) => f.id === t.dataset.id);
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
      overlay.remove();
      resolve(result);
    }
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
  return `<label>${esc(f.label)}
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
    .sort((a, b) => (a.regNr || "").localeCompare(b.regNr || ""))
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
    { name: "carIds", label: "Biler", type: "multi", value: tripCarIds(trip || {}), options: carOptions },
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
    { name: "socialRate", label: "Sosiale kostnader (%)", type: "number", value: p.socialRate }
  ]);
}

function fuelModal(fuel) {
  const f = fuel || {};
  return modal("Drivstoffpriser", [
    { name: "dieselPrice", label: "Dieselpris (kr/liter)", type: "number", value: f.dieselPrice },
    { name: "electricityPrice", label: "Strompris (kr/kWh)", type: "number", value: f.electricityPrice }
  ]);
}

function num(v) {
  return Number(v) || 0;
}

function tripCarIds(t) {
  if (Array.isArray(t.carIds)) return t.carIds;
  return t.carId ? [t.carId] : [];
}
