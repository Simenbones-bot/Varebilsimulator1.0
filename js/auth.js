// Autentisering: seeding av admin, innlogging, sesjon og brukeradmin.

import { Store } from "./store.js";
import { hashCredentials } from "./crypto.js";

const SESSION_KEY = "varebil-session";

export async function seedAdmin() {
  await Store.ready;
  const existing = await Store.findUser("admin");
  if (existing) return;
  const passwordHash = await hashCredentials("admin", "Admin123");
  await Store.createUser({
    username: "admin",
    passwordHash,
    isAdmin: true
  });
}

export async function login(username, password) {
  await Store.ready;
  const uname = String(username || "").toLowerCase().trim();
  const user = await Store.findUser(uname);
  if (!user) throw new Error("Feil brukernavn eller passord");
  const hash = await hashCredentials(uname, password);
  if (hash !== user.passwordHash) {
    throw new Error("Feil brukernavn eller passord");
  }
  const session = { username: user.username, isAdmin: !!user.isAdmin };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY)) || null;
  } catch (_) {
    return null;
  }
}

export function logout() {
  localStorage.removeItem(SESSION_KEY);
}

export async function createUser(username, password, isAdmin) {
  const uname = String(username || "").toLowerCase().trim();
  if (!uname) throw new Error("Brukernavn er pakrevd");
  if (!password) throw new Error("Passord er pakrevd");
  const existing = await Store.findUser(uname);
  if (existing) throw new Error("Brukernavnet finnes allerede");
  const passwordHash = await hashCredentials(uname, password);
  await Store.createUser({ username: uname, passwordHash, isAdmin: !!isAdmin });
}

export async function deleteUser(username) {
  await Store.deleteUser(String(username).toLowerCase());
}

export async function listUsers() {
  return Store.listUsers();
}
