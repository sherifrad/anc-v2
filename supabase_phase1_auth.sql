-- ANC EMR Phase 1 security migration
-- Only this Supabase user may access EMR data, and only with MFA (aal2).
--
-- IMPORTANT:
-- Do not run this until the app login + MFA screens have been deployed.
-- Once applied, anonymous cloud sync will stop working by design.

begin;

-- Remove the prototype policies that allowed the public browser role.
drop policy if exists "anon sync patients" on public.patients;
drop policy if exists "anon sync visits" on public.visits;
drop policy if exists "anon sync scans" on public.scans;
drop policy if exists "anon sync procedures" on public.procedures;
drop policy if exists "anon sync labs" on public.labs;
drop policy if exists "anon write audit log" on public.audit_log;

-- Remove any previous Phase 1 policies so this migration is repeatable.
drop policy if exists "clinic owner patients" on public.patients;
drop policy if exists "clinic owner visits" on public.visits;
drop policy if exists "clinic owner scans" on public.scans;
drop policy if exists "clinic owner procedures" on public.procedures;
drop policy if exists "clinic owner labs" on public.labs;
drop policy if exists "clinic owner audit log" on public.audit_log;

drop policy if exists "mfa required patients" on public.patients;
drop policy if exists "mfa required visits" on public.visits;
drop policy if exists "mfa required scans" on public.scans;
drop policy if exists "mfa required procedures" on public.procedures;
drop policy if exists "mfa required labs" on public.labs;
drop policy if exists "mfa required audit log" on public.audit_log;

-- The anonymous role must have no direct table access.
revoke all on table public.patients from anon;
revoke all on table public.visits from anon;
revoke all on table public.scans from anon;
revoke all on table public.procedures from anon;
revoke all on table public.labs from anon;
revoke all on table public.audit_log from anon;

-- Authenticated sessions may call the REST API; RLS decides whether a
-- particular user and session can see or modify rows.
grant select, insert, update, delete on table public.patients to authenticated;
grant select, insert, update, delete on table public.visits to authenticated;
grant select, insert, update, delete on table public.scans to authenticated;
grant select, insert, update, delete on table public.procedures to authenticated;
grant select, insert, update, delete on table public.labs to authenticated;
grant insert on table public.audit_log to authenticated;

-- Identity columns may require sequence access for inserts.
grant usage, select on all sequences in schema public to authenticated;
revoke all on all sequences in schema public from anon;

alter table public.patients enable row level security;
alter table public.visits enable row level security;
alter table public.scans enable row level security;
alter table public.procedures enable row level security;
alter table public.labs enable row level security;
alter table public.audit_log enable row level security;

-- Permissive policies identify the one clinic owner account.
create policy "clinic owner patients"
on public.patients for all
to authenticated
using ((select auth.uid()) = 'bfcaa90e-c49c-4a94-8cfd-06a16a96a094'::uuid)
with check ((select auth.uid()) = 'bfcaa90e-c49c-4a94-8cfd-06a16a96a094'::uuid);

create policy "clinic owner visits"
on public.visits for all
to authenticated
using ((select auth.uid()) = 'bfcaa90e-c49c-4a94-8cfd-06a16a96a094'::uuid)
with check ((select auth.uid()) = 'bfcaa90e-c49c-4a94-8cfd-06a16a96a094'::uuid);

create policy "clinic owner scans"
on public.scans for all
to authenticated
using ((select auth.uid()) = 'bfcaa90e-c49c-4a94-8cfd-06a16a96a094'::uuid)
with check ((select auth.uid()) = 'bfcaa90e-c49c-4a94-8cfd-06a16a96a094'::uuid);

create policy "clinic owner procedures"
on public.procedures for all
to authenticated
using ((select auth.uid()) = 'bfcaa90e-c49c-4a94-8cfd-06a16a96a094'::uuid)
with check ((select auth.uid()) = 'bfcaa90e-c49c-4a94-8cfd-06a16a96a094'::uuid);

create policy "clinic owner labs"
on public.labs for all
to authenticated
using ((select auth.uid()) = 'bfcaa90e-c49c-4a94-8cfd-06a16a96a094'::uuid)
with check ((select auth.uid()) = 'bfcaa90e-c49c-4a94-8cfd-06a16a96a094'::uuid);

create policy "clinic owner audit log"
on public.audit_log for insert
to authenticated
with check ((select auth.uid()) = 'bfcaa90e-c49c-4a94-8cfd-06a16a96a094'::uuid);

-- Restrictive policies require the session JWT to show completed MFA.
-- These apply in addition to the owner policies above.
create policy "mfa required patients"
on public.patients as restrictive for all
to authenticated
using ((select auth.jwt()->>'aal') = 'aal2')
with check ((select auth.jwt()->>'aal') = 'aal2');

create policy "mfa required visits"
on public.visits as restrictive for all
to authenticated
using ((select auth.jwt()->>'aal') = 'aal2')
with check ((select auth.jwt()->>'aal') = 'aal2');

create policy "mfa required scans"
on public.scans as restrictive for all
to authenticated
using ((select auth.jwt()->>'aal') = 'aal2')
with check ((select auth.jwt()->>'aal') = 'aal2');

create policy "mfa required procedures"
on public.procedures as restrictive for all
to authenticated
using ((select auth.jwt()->>'aal') = 'aal2')
with check ((select auth.jwt()->>'aal') = 'aal2');

create policy "mfa required labs"
on public.labs as restrictive for all
to authenticated
using ((select auth.jwt()->>'aal') = 'aal2')
with check ((select auth.jwt()->>'aal') = 'aal2');

create policy "mfa required audit log"
on public.audit_log as restrictive for insert
to authenticated
with check ((select auth.jwt()->>'aal') = 'aal2');

commit;
