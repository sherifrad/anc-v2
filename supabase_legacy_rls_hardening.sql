-- APPLIED 2026-06-12: LEGACY RLS HARDENING
--
-- Removes obsolete allow-all policies before temporary authenticated users are
-- introduced. Phase 2 tables, ciphertext, and keys are not changed.

begin;

drop policy if exists "allow_all" on public.attachments;
drop policy if exists "allow_all" on public.audit_log;
drop policy if exists "allow_all" on public.labs;
drop policy if exists "allow_all" on public.patients;
drop policy if exists "allow_all" on public.procedures;
drop policy if exists "allow_all" on public.scans;
drop policy if exists "allow_all" on public.visits;

revoke all on table public.attachments from anon;

alter function public.update_updated_at() set search_path = '';

commit;
