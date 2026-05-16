// Lagringslag: Supabase nar konfigurert, ellers localStorage-fallback.
// All resten av appen snakker bare med dette laget, slik at det er enkelt
// a bytte/endre lagring uten a rore UI-en.

const LS_USERS = "varebil-users";
const LS_DATA_PREFIX = "varebil-data-";

let supabase = null;
let mode = "local"; // "supabase" | "local"

async function initSupabase() {
  const cfg = window.APP_CONFIG || {};
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return;
  try {
    const { createClient } = await import(
      "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm"
    );
    supabase = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    // Liten helsesjekk slik at vi faller pent tilbake hvis noe er feil.
    const { error } = await supabase
      .from("app_users")
      .select("username")
      .limit(1);
    if (error) throw error;
    mode = "supabase";
  } catch (err) {
    console.warn("Supabase utilgjengelig, bruker localStorage:", err.message);
    supabase = null;
    mode = "local";
  }
}

export const Store = {
  ready: initSupabase(),

  get mode() {
    return mode;
  },

  // ---- Brukere -------------------------------------------------------------
  async listUsers() {
    if (mode === "supabase") {
      const { data, error } = await supabase
        .from("app_users")
        .select("username, is_admin, created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data.map((u) => ({
        username: u.username,
        isAdmin: u.is_admin,
        createdAt: u.created_at
      }));
    }
    return readLocalUsers().map(({ username, isAdmin, createdAt }) => ({
      username,
      isAdmin,
      createdAt
    }));
  },

  async findUser(username) {
    const uname = String(username).toLowerCase();
    if (mode === "supabase") {
      const { data, error } = await supabase
        .from("app_users")
        .select("*")
        .eq("username", uname)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        username: data.username,
        passwordHash: data.password_hash,
        isAdmin: data.is_admin,
        createdAt: data.created_at
      };
    }
    return readLocalUsers().find((u) => u.username === uname) || null;
  },

  async createUser({ username, passwordHash, isAdmin = false }) {
    const uname = String(username).toLowerCase().trim();
    if (mode === "supabase") {
      const { error } = await supabase.from("app_users").insert({
        username: uname,
        password_hash: passwordHash,
        is_admin: isAdmin
      });
      if (error) throw error;
      return;
    }
    const users = readLocalUsers();
    if (users.some((u) => u.username === uname)) {
      throw new Error("Brukernavnet finnes allerede");
    }
    users.push({
      username: uname,
      passwordHash,
      isAdmin,
      createdAt: new Date().toISOString()
    });
    writeLocalUsers(users);
  },

  async deleteUser(username) {
    const uname = String(username).toLowerCase();
    if (mode === "supabase") {
      const { error } = await supabase
        .from("app_users")
        .delete()
        .eq("username", uname);
      if (error) throw error;
      return;
    }
    writeLocalUsers(readLocalUsers().filter((u) => u.username !== uname));
    localStorage.removeItem(LS_DATA_PREFIX + uname);
  },

  // ---- Data per bruker -----------------------------------------------------
  async getUserData(username) {
    const uname = String(username).toLowerCase();
    if (mode === "supabase") {
      const { data, error } = await supabase
        .from("user_data")
        .select("data")
        .eq("username", uname)
        .maybeSingle();
      if (error) throw error;
      return data?.data || null;
    }
    const raw = localStorage.getItem(LS_DATA_PREFIX + uname);
    return raw ? JSON.parse(raw) : null;
  },

  async saveUserData(username, data) {
    const uname = String(username).toLowerCase();
    if (mode === "supabase") {
      const { error } = await supabase
        .from("user_data")
        .upsert(
          { username: uname, data, updated_at: new Date().toISOString() },
          { onConflict: "username" }
        );
      if (error) throw error;
      return;
    }
    localStorage.setItem(LS_DATA_PREFIX + uname, JSON.stringify(data));
  }
};

function readLocalUsers() {
  try {
    return JSON.parse(localStorage.getItem(LS_USERS)) || [];
  } catch (_) {
    return [];
  }
}

function writeLocalUsers(users) {
  localStorage.setItem(LS_USERS, JSON.stringify(users));
}
