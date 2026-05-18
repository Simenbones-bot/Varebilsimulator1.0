// Appdata per bruker: avdelinger med biler og kjoringer.

import { Store } from "./store.js";

export const State = {
  session: null,
  data: null // { departments: [], selectedDepartmentId }
};

export function emptyData() {
  return { departments: [], selectedDepartmentId: null };
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function loadData(username) {
  const data = (await Store.getUserData(username)) || emptyData();
  if (!Array.isArray(data.departments)) data.departments = [];
  if (data.selectedDepartmentId === undefined) {
    data.selectedDepartmentId = data.departments[0]?.id || null;
  }
  data.departments.forEach(normalizeDepartment);
  State.data = data;
  return data;
}

// Sikrer at eldre data far nye felter (carIds, fixedCosts, fuel, personnel).
function normalizeDepartment(dep) {
  if (!Array.isArray(dep.cars)) dep.cars = [];
  if (!Array.isArray(dep.trips)) dep.trips = [];
  if (!Array.isArray(dep.fixedCosts)) dep.fixedCosts = [];
  if (!dep.fuel || typeof dep.fuel !== "object") {
    dep.fuel = { dieselPrice: 0, electricityPrice: 0 };
  }
  if (!dep.personnel || typeof dep.personnel !== "object") {
    dep.personnel = { driverRate: 250, socialRate: 36 };
  }
  if (!dep.markups || typeof dep.markups !== "object") {
    dep.markups = { konsernfelles: 6, margin: 5 };
  }
  dep.trips.forEach((t) => {
    if (!Array.isArray(t.carIds)) {
      t.carIds = t.carId ? [t.carId] : [];
    }
    if (t.vehicleType === undefined) t.vehicleType = "";
  });
  dep.cars.forEach((c) => {
    if (c.vehicleType === undefined) c.vehicleType = "";
  });
}

let saveTimer = null;
export function save() {
  if (!State.session || !State.data) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    Store.saveUserData(State.session.username, State.data).catch((err) =>
      console.error("Lagring feilet:", err)
    );
  }, 250);
}

export function selectedDepartment() {
  if (!State.data) return null;
  return (
    State.data.departments.find(
      (d) => d.id === State.data.selectedDepartmentId
    ) || null
  );
}

export function addDepartment(name) {
  const dep = {
    id: uid(),
    name: name.trim(),
    cars: [],
    trips: [],
    fixedCosts: [],
    fuel: { dieselPrice: 0, electricityPrice: 0 },
    personnel: { driverRate: 250, socialRate: 36 }
  };
  State.data.departments.push(dep);
  State.data.selectedDepartmentId = dep.id;
  save();
  return dep;
}

export function deleteDepartment(id) {
  State.data.departments = State.data.departments.filter((d) => d.id !== id);
  if (State.data.selectedDepartmentId === id) {
    State.data.selectedDepartmentId = State.data.departments[0]?.id || null;
  }
  save();
}

export function selectDepartment(id) {
  State.data.selectedDepartmentId = id;
  save();
}

export function addCar(dep, car) {
  dep.cars.push({ id: uid(), ...car });
  save();
}

export function updateCar(dep, id, car) {
  const idx = dep.cars.findIndex((c) => c.id === id);
  if (idx !== -1) dep.cars[idx] = { ...dep.cars[idx], ...car };
  save();
}

export function deleteCar(dep, id) {
  dep.cars = dep.cars.filter((c) => c.id !== id);
  save();
}

export function addTrip(dep, trip) {
  dep.trips.push({ id: uid(), ...trip });
  save();
}

export function updateTrip(dep, id, trip) {
  const idx = dep.trips.findIndex((t) => t.id === id);
  if (idx !== -1) dep.trips[idx] = { ...dep.trips[idx], ...trip };
  save();
}

export function deleteTrip(dep, id) {
  dep.trips = dep.trips.filter((t) => t.id !== id);
  save();
}

export function addFixedCost(dep, item) {
  if (!Array.isArray(dep.fixedCosts)) dep.fixedCosts = [];
  dep.fixedCosts.push({ id: uid(), ...item });
  save();
}

export function updateFixedCost(dep, id, item) {
  const idx = dep.fixedCosts.findIndex((c) => c.id === id);
  if (idx !== -1) dep.fixedCosts[idx] = { ...dep.fixedCosts[idx], ...item };
  save();
}

export function deleteFixedCost(dep, id) {
  dep.fixedCosts = (dep.fixedCosts || []).filter((c) => c.id !== id);
  save();
}

export function setFuel(dep, fuel) {
  dep.fuel = { ...(dep.fuel || {}), ...fuel };
  save();
}

export function setPersonnel(dep, personnel) {
  dep.personnel = { ...(dep.personnel || {}), ...personnel };
  save();
}

export function setMarkups(dep, markups) {
  dep.markups = { ...(dep.markups || {}), ...markups };
  save();
}
