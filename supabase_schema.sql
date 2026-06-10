-- ANC EMR Supabase setup
-- Run this in Supabase SQL Editor for the project used in js/supabase.js.

create extension if not exists pgcrypto;

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  patient_code text not null unique,
  encrypted_data jsonb not null,
  schema_version text not null default '2.0',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  encrypted_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scans (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  encrypted_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.procedures (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  encrypted_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.labs (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  encrypted_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  event_type text not null,
  patient_code text,
  device_hint text,
  created_at timestamptz not null default now()
);

create index if not exists idx_patients_patient_code on public.patients(patient_code);
create index if not exists idx_visits_patient_id on public.visits(patient_id);
create index if not exists idx_scans_patient_id on public.scans(patient_id);
create index if not exists idx_procedures_patient_id on public.procedures(patient_id);
create index if not exists idx_labs_patient_id on public.labs(patient_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_patients_updated_at on public.patients;
create trigger set_patients_updated_at
before update on public.patients
for each row execute function public.set_updated_at();

drop trigger if exists set_visits_updated_at on public.visits;
create trigger set_visits_updated_at
before update on public.visits
for each row execute function public.set_updated_at();

drop trigger if exists set_scans_updated_at on public.scans;
create trigger set_scans_updated_at
before update on public.scans
for each row execute function public.set_updated_at();

drop trigger if exists set_procedures_updated_at on public.procedures;
create trigger set_procedures_updated_at
before update on public.procedures
for each row execute function public.set_updated_at();

drop trigger if exists set_labs_updated_at on public.labs;
create trigger set_labs_updated_at
before update on public.labs
for each row execute function public.set_updated_at();

alter table public.patients enable row level security;
alter table public.visits enable row level security;
alter table public.scans enable row level security;
alter table public.procedures enable row level security;
alter table public.labs enable row level security;
alter table public.audit_log enable row level security;

-- This simple local app uses encrypted records and a public browser key.
-- These policies let the browser sync encrypted blobs. For stronger protection,
-- add Supabase Auth and replace anon policies with authenticated-user policies.
drop policy if exists "anon sync patients" on public.patients;
create policy "anon sync patients"
on public.patients for all
to anon
using (true)
with check (true);

drop policy if exists "anon sync visits" on public.visits;
create policy "anon sync visits"
on public.visits for all
to anon
using (true)
with check (true);

drop policy if exists "anon sync scans" on public.scans;
create policy "anon sync scans"
on public.scans for all
to anon
using (true)
with check (true);

drop policy if exists "anon sync procedures" on public.procedures;
create policy "anon sync procedures"
on public.procedures for all
to anon
using (true)
with check (true);

drop policy if exists "anon sync labs" on public.labs;
create policy "anon sync labs"
on public.labs for all
to anon
using (true)
with check (true);

drop policy if exists "anon write audit log" on public.audit_log;
create policy "anon write audit log"
on public.audit_log for insert
to anon
with check (true);
