-- Varebilsimulator - Supabase skjema
-- Kjor denne i Supabase-prosjektets SQL-editor for a aktivere skylagring.
--
-- Merk: appen bruker egen brukernavn/passord-innlogging (ikke Supabase Auth),
-- sa tilgangen styres pa app-niva. anon-nokkelen kan derfor lese/skrive disse
-- tabellene. Det er greit for et internt planleggingsverktoy, men passordene
-- lagres som SHA-256-hash og bor ikke regnes som sterkt beskyttet.

-- Brukere -------------------------------------------------------------------
create table if not exists public.app_users (
  username      text primary key,
  password_hash text not null,
  is_admin      boolean not null default false,
  created_at    timestamptz not null default now()
);

-- Data per bruker (avdelinger, biler, kjoringer) som JSONB --------------------
create table if not exists public.user_data (
  username   text primary key references public.app_users(username) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Tilgang -------------------------------------------------------------------
alter table public.app_users enable row level security;
alter table public.user_data enable row level security;

-- App-niva-auth: tillat anon-klienten a jobbe mot tabellene.
drop policy if exists "app_users access" on public.app_users;
create policy "app_users access" on public.app_users
  for all using (true) with check (true);

drop policy if exists "user_data access" on public.user_data;
create policy "user_data access" on public.user_data
  for all using (true) with check (true);
