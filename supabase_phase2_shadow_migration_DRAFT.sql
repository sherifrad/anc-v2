-- PHASE 2A SHADOW MIGRATION REVIEW DRAFT - DO NOT RUN
--
-- Creates separate Phase 2 ciphertext tables. Phase 1 records remain untouched.

do $phase2_shadow_guard$
begin
  raise exception 'PHASE 2A DRAFT ONLY: review and remove this guard before execution';
end
$phase2_shadow_guard$;

begin;

create table if not exists public.phase2_migration_batches (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  key_version integer not null check (key_version > 0),
  status text not null default 'draft'
    check (status in (
      'draft',
      'staged',
      'verified',
      'device_verified',
      'activation_approved',
      'activated',
      'failed',
      'rolled_back'
    )),
  expected_counts jsonb not null,
  uploaded_counts jsonb,
  verification_evidence jsonb not null default '{}'::jsonb,
  verified_at timestamptz,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, owner_id, key_version)
);

create table if not exists public.phase2_patient_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  patient_code text not null,
  key_version integer not null check (key_version > 0),
  encrypted_data jsonb not null,
  source_updated_at timestamptz,
  plaintext_sha256 text not null check (plaintext_sha256 ~ '^[a-f0-9]{64}$'),
  migration_batch_id uuid not null,
  created_at timestamptz not null default now(),
  unique (owner_id, patient_code, key_version),
  foreign key (migration_batch_id, owner_id, key_version)
    references public.phase2_migration_batches(id, owner_id, key_version)
    on delete cascade
);

create table if not exists public.phase2_related_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  patient_code text not null,
  record_type text not null
    check (record_type in ('visits', 'scans', 'procedures', 'labs')),
  key_version integer not null check (key_version > 0),
  encrypted_data jsonb not null,
  plaintext_sha256 text not null check (plaintext_sha256 ~ '^[a-f0-9]{64}$'),
  migration_batch_id uuid not null,
  created_at timestamptz not null default now(),
  unique (owner_id, patient_code, record_type, key_version),
  foreign key (migration_batch_id, owner_id, key_version)
    references public.phase2_migration_batches(id, owner_id, key_version)
    on delete cascade
);

alter table public.phase2_patient_records enable row level security;
alter table public.phase2_related_records enable row level security;
alter table public.phase2_migration_batches enable row level security;

revoke all on table public.phase2_patient_records from anon;
revoke all on table public.phase2_related_records from anon;
revoke all on table public.phase2_migration_batches from anon;

grant select, insert, update, delete on table public.phase2_patient_records to authenticated;
grant select, insert, update, delete on table public.phase2_related_records to authenticated;
grant select, insert, update on table public.phase2_migration_batches to authenticated;

drop policy if exists "clinic owner phase2 patients" on public.phase2_patient_records;
drop policy if exists "mfa required phase2 patients" on public.phase2_patient_records;
drop policy if exists "clinic owner phase2 related" on public.phase2_related_records;
drop policy if exists "mfa required phase2 related" on public.phase2_related_records;
drop policy if exists "clinic owner phase2 batches" on public.phase2_migration_batches;
drop policy if exists "mfa required phase2 batches" on public.phase2_migration_batches;

create policy "clinic owner phase2 patients"
on public.phase2_patient_records for all
to authenticated
using (
  owner_id = (select auth.uid())
  and owner_id = 'bfcaa90e-c49c-4a94-8cfd-06a16a96a094'::uuid
)
with check (
  owner_id = (select auth.uid())
  and owner_id = 'bfcaa90e-c49c-4a94-8cfd-06a16a96a094'::uuid
);

create policy "mfa required phase2 patients"
on public.phase2_patient_records as restrictive for all
to authenticated
using ((select auth.jwt()->>'aal') = 'aal2')
with check ((select auth.jwt()->>'aal') = 'aal2');

create policy "clinic owner phase2 related"
on public.phase2_related_records for all
to authenticated
using (
  owner_id = (select auth.uid())
  and owner_id = 'bfcaa90e-c49c-4a94-8cfd-06a16a96a094'::uuid
)
with check (
  owner_id = (select auth.uid())
  and owner_id = 'bfcaa90e-c49c-4a94-8cfd-06a16a96a094'::uuid
);

create policy "mfa required phase2 related"
on public.phase2_related_records as restrictive for all
to authenticated
using ((select auth.jwt()->>'aal') = 'aal2')
with check ((select auth.jwt()->>'aal') = 'aal2');

create policy "clinic owner phase2 batches"
on public.phase2_migration_batches for all
to authenticated
using (
  owner_id = (select auth.uid())
  and owner_id = 'bfcaa90e-c49c-4a94-8cfd-06a16a96a094'::uuid
)
with check (
  owner_id = (select auth.uid())
  and owner_id = 'bfcaa90e-c49c-4a94-8cfd-06a16a96a094'::uuid
);

create policy "mfa required phase2 batches"
on public.phase2_migration_batches as restrictive for all
to authenticated
using ((select auth.jwt()->>'aal') = 'aal2')
with check ((select auth.jwt()->>'aal') = 'aal2');

create or replace function public.validate_phase2_batch_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  allowed boolean := false;
begin
  if new.status = old.status then
    return new;
  end if;

  allowed := case old.status
    when 'draft' then new.status in ('staged', 'failed')
    when 'staged' then new.status in ('verified', 'failed', 'rolled_back')
    when 'verified' then new.status in ('device_verified', 'failed', 'rolled_back')
    when 'device_verified' then new.status in ('activation_approved', 'failed', 'rolled_back')
    when 'activation_approved' then new.status in ('activated', 'rolled_back')
    when 'activated' then new.status = 'rolled_back'
    when 'failed' then new.status = 'rolled_back'
    else false
  end;

  if not allowed then
    raise exception 'Invalid Phase 2 migration transition: % -> %',
      old.status, new.status;
  end if;

  if new.status = 'verified' and not (
    coalesce((new.verification_evidence->>'deep_verified')::boolean, false)
    and coalesce((new.verification_evidence->>'failed_rows')::integer, -1) = 0
  ) then
    raise exception 'Deep verification evidence is required';
  end if;

  if new.status = 'device_verified' and not (
    coalesce((new.verification_evidence->>'desktop_passed')::boolean, false)
    and coalesce((new.verification_evidence->>'mobile_passed')::boolean, false)
  ) then
    raise exception 'Desktop and mobile evidence are required';
  end if;

  if new.status = 'activation_approved' and not (
    coalesce((new.verification_evidence->>'rollback_backup_verified')::boolean, false)
    and coalesce((new.verification_evidence->>'recovery_code_confirmed')::boolean, false)
  ) then
    raise exception 'Rollback and recovery evidence are required';
  end if;

  if new.status = 'activated' and not (
    coalesce((new.verification_evidence->>'explicit_approval')::boolean, false)
    and new.verification_evidence->>'approved_by' = 'clinic-owner'
  ) then
    raise exception 'Explicit clinic-owner approval is required';
  end if;

  return new;
exception
  when invalid_text_representation then
    raise exception 'Migration verification evidence has an invalid value';
end;
$$;

drop trigger if exists validate_phase2_batch_transition
on public.phase2_migration_batches;
create trigger validate_phase2_batch_transition
before update of status on public.phase2_migration_batches
for each row execute function public.validate_phase2_batch_transition();

commit;
