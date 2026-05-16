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
  State.data = data;
  return data;
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
  const dep = { id: uid(), name: name.trim(), cars: [], trips: [] };
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
