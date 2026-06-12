-- PHASE 3 ACCESS CONTROL REVIEW DRAFT - DO NOT RUN
--
-- Creates isolated access-grant, per-grant key-envelope, and append-only audit
-- containers. It does not change Phase 2 tables, policies, ciphertext, or keys.

do $phase3_review_guard$
begin
  raise exception 'PHASE 3 DRAFT ONLY: review and rollback checkpoint required';
end
$phase3_review_guard$;

begin;

create table if not exists public.phase3_access_grants (
  id uuid primary key default gen_random_uuid(),
  clinic_owner_id uuid not null references auth.users(id) on delete cascade,
  grantee_user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('data_entry')),
  permissions text[] not null default '{}',
  status text not null default 'draft'
    check (status in (
      'draft', 'invited', 'active', 'expired', 'suspended', 'revoked'
    )),
  valid_from timestamptz not null,
  valid_until timestamptz not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  revocation_reason text,
  check (valid_until > valid_from),
  check (clinic_owner_id <> grantee_user_id),
  unique (clinic_owner_id, grantee_user_id, id)
);

create table if not exists public.phase3_key_envelopes (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null unique
    references public.phase3_access_grants(id) on delete cascade,
  clinic_owner_id uuid not null references auth.users(id) on delete cascade,
  grantee_user_id uuid not null references auth.users(id) on delete cascade,
  key_version integer not null check (key_version > 0),
  format_version integer not null default 1 check (format_version = 1),
  algorithm text not null check (algorithm = 'AES-256-GCM'),
  wrapping_method text not null,
  wrapped_key jsonb not null,
  created_at timestamptz not null default now(),
  retired_at timestamptz
);

create table if not exists public.phase3_security_audit (
  id bigint generated always as identity primary key,
  clinic_owner_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  grant_id uuid references public.phase3_access_grants(id) on delete set null,
  event_type text not null,
  outcome text not null check (outcome in ('success', 'denied', 'failed')),
  assurance_level text,
  device_hint text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.phase3_access_grants enable row level security;
alter table public.phase3_key_envelopes enable row level security;
alter table public.phase3_security_audit enable row level security;

revoke all on table public.phase3_access_grants from anon, authenticated;
revoke all on table public.phase3_key_envelopes from anon, authenticated;
revoke all on table public.phase3_security_audit from anon, authenticated;

grant select, insert, update on table public.phase3_access_grants
to authenticated;
grant select, insert, update on table public.phase3_key_envelopes
to authenticated;
grant select, insert on table public.phase3_security_audit
to authenticated;
grant usage, select on sequence public.phase3_security_audit_id_seq
to authenticated;

create policy "phase3 owner manages grants"
on public.phase3_access_grants for all
to authenticated
using (
  (select auth.uid()) = clinic_owner_id
  and clinic_owner_id =
    'bfcaa90e-c49c-4a94-8cfd-06a16a96a094'::uuid
)
with check (
  (select auth.uid()) = clinic_owner_id
  and created_by = (select auth.uid())
  and clinic_owner_id =
    'bfcaa90e-c49c-4a94-8cfd-06a16a96a094'::uuid
);

create policy "phase3 owner reads key envelopes"
on public.phase3_key_envelopes for select
to authenticated
using (
  (select auth.uid()) = clinic_owner_id
  and clinic_owner_id =
    'bfcaa90e-c49c-4a94-8cfd-06a16a96a094'::uuid
);

create policy "phase3 owner creates key envelopes"
on public.phase3_key_envelopes for insert
to authenticated
with check (
  (select auth.uid()) = clinic_owner_id
  and clinic_owner_id =
    'bfcaa90e-c49c-4a94-8cfd-06a16a96a094'::uuid
);

create policy "phase3 grantee reads own active envelope"
on public.phase3_key_envelopes for select
to authenticated
using (
  (select auth.uid()) = grantee_user_id
  and exists (
    select 1
    from public.phase3_access_grants g
    where g.id = grant_id
      and g.clinic_owner_id = clinic_owner_id
      and g.grantee_user_id = (select auth.uid())
      and g.status = 'active'
      and now() >= g.valid_from
      and now() < g.valid_until
  )
);

create policy "phase3 owner reads security audit"
on public.phase3_security_audit for select
to authenticated
using (
  (select auth.uid()) = clinic_owner_id
  and clinic_owner_id =
    'bfcaa90e-c49c-4a94-8cfd-06a16a96a094'::uuid
);

create policy "phase3 authenticated appends security audit"
on public.phase3_security_audit for insert
to authenticated
with check (
  actor_user_id = (select auth.uid())
  and clinic_owner_id =
    'bfcaa90e-c49c-4a94-8cfd-06a16a96a094'::uuid
  and (select auth.jwt()->>'aal') = 'aal2'
);

create or replace function public.phase3_prevent_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Phase 3 security audit events are append-only';
end;
$$;

create trigger phase3_security_audit_append_only
before update or delete on public.phase3_security_audit
for each row execute function public.phase3_prevent_audit_mutation();

commit;
