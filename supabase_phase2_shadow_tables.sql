-- ANC EMR Phase 2A empty shadow-table setup
--
-- This creates protected containers only. It does not read, copy, encrypt,
-- update, or delete any Phase 1 patient record.

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
  patient_code text not null check (length(patient_code) between 1 and 100),
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
  patient_code text not null check (length(patient_code) between 1 and 100),
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

create index if not exists phase2_patient_records_batch_idx
on public.phase2_patient_records (migration_batch_id);

create index if not exists phase2_related_records_batch_idx
on public.phase2_related_records (migration_batch_id);

alter table public.phase2_migration_batches enable row level security;
alter table public.phase2_patient_records enable row level security;
alter table public.phase2_related_records enable row level security;

revoke all on table public.phase2_migration_batches from anon;
revoke all on table public.phase2_patient_records from anon;
revoke all on table public.phase2_related_records from anon;

grant select, insert, update, delete on table public.phase2_migration_batches
to authenticated;
grant select, insert, delete on table public.phase2_patient_records
to authenticated;
grant select, insert, delete on table public.phase2_related_records
to authenticated;

drop policy if exists "clinic owner phase2 batches"
on public.phase2_migration_batches;
drop policy if exists "mfa required phase2 batches"
on public.phase2_migration_batches;
drop policy if exists "clinic owner phase2 patients"
on public.phase2_patient_records;
drop policy if exists "mfa required phase2 patients"
on public.phase2_patient_records;
drop policy if exists "clinic owner phase2 related"
on public.phase2_related_records;
drop policy if exists "mfa required phase2 related"
on public.phase2_related_records;

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

create or replace function public.protect_phase2_batch_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id <> old.id
    or new.owner_id <> old.owner_id
    or new.key_version <> old.key_version
    or new.expected_counts <> old.expected_counts
    or new.created_at <> old.created_at then
    raise exception 'Migration batch identity and expected counts are immutable';
  end if;
  return new;
end;
$$;

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

create or replace function public.guard_phase2_shadow_row()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  batch_status text;
begin
  if tg_op = 'INSERT' then
    select status
    into batch_status
    from public.phase2_migration_batches
    where id = new.migration_batch_id
      and owner_id = new.owner_id
      and key_version = new.key_version;
  else
    select status
    into batch_status
    from public.phase2_migration_batches
    where id = old.migration_batch_id
      and owner_id = old.owner_id
      and key_version = old.key_version;
  end if;

  if batch_status is null then
    raise exception 'The migration batch does not exist';
  end if;

  if tg_op = 'INSERT' and batch_status <> 'draft' then
    raise exception 'Shadow rows may be inserted only into a draft batch';
  end if;

  if tg_op = 'DELETE'
    and batch_status not in ('draft', 'staged', 'failed', 'rolled_back') then
    raise exception 'Verified shadow rows require rollback before deletion';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.guard_phase2_batch_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status not in ('draft', 'failed', 'rolled_back') then
    raise exception 'This migration batch must be rolled back before deletion';
  end if;
  return old;
end;
$$;

drop trigger if exists protect_phase2_batch_identity
on public.phase2_migration_batches;
create trigger protect_phase2_batch_identity
before update on public.phase2_migration_batches
for each row execute function public.protect_phase2_batch_identity();

drop trigger if exists validate_phase2_batch_transition
on public.phase2_migration_batches;
create trigger validate_phase2_batch_transition
before update of status on public.phase2_migration_batches
for each row execute function public.validate_phase2_batch_transition();

drop trigger if exists guard_phase2_patient_row
on public.phase2_patient_records;
create trigger guard_phase2_patient_row
before insert or delete on public.phase2_patient_records
for each row execute function public.guard_phase2_shadow_row();

drop trigger if exists guard_phase2_related_row
on public.phase2_related_records;
create trigger guard_phase2_related_row
before insert or delete on public.phase2_related_records
for each row execute function public.guard_phase2_shadow_row();

drop trigger if exists guard_phase2_batch_delete
on public.phase2_migration_batches;
create trigger guard_phase2_batch_delete
before delete on public.phase2_migration_batches
for each row execute function public.guard_phase2_batch_delete();

commit;
