-- PHASE 2 PRODUCTION ACTIVATION DRAFT - DO NOT RUN
--
-- This transaction enables active shadow-table writes, marks the wrapped
-- Clinic Data Key active, and activates the single approved migration batch.
-- The stop block below must remain until the clinic owner explicitly approves.

do $phase2_activation_guard$
begin
  raise exception 'PHASE 2 DRAFT ONLY: explicit clinic-owner activation is required';
end
$phase2_activation_guard$;

begin;

grant update on table public.phase2_patient_records to authenticated;
grant update on table public.phase2_related_records to authenticated;

create or replace function public.guard_phase2_shadow_row()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  batch_status text;
begin
  if tg_op = 'INSERT' then
    select status into batch_status
    from public.phase2_migration_batches
    where id = new.migration_batch_id
      and owner_id = new.owner_id
      and key_version = new.key_version;
  else
    select status into batch_status
    from public.phase2_migration_batches
    where id = old.migration_batch_id
      and owner_id = old.owner_id
      and key_version = old.key_version;
  end if;

  if batch_status is null then
    raise exception 'The migration batch does not exist';
  end if;

  if tg_op = 'INSERT' and batch_status not in ('draft', 'activated') then
    raise exception 'Rows may be inserted only into draft or activated batches';
  end if;

  if tg_op = 'UPDATE' then
    if batch_status <> 'activated' then
      raise exception 'Rows may be updated only after activation';
    end if;
    if new.owner_id <> old.owner_id
      or new.patient_code <> old.patient_code
      or new.key_version <> old.key_version
      or new.migration_batch_id <> old.migration_batch_id then
      raise exception 'Shadow row identity is immutable';
    end if;
    if tg_table_name = 'phase2_related_records'
      and new.record_type <> old.record_type then
      raise exception 'Related record type is immutable';
    end if;
  end if;

  if tg_op = 'DELETE'
    and batch_status not in ('draft', 'staged', 'failed', 'rolled_back', 'activated') then
    raise exception 'Verified rows require rollback before deletion';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists guard_phase2_patient_row
on public.phase2_patient_records;
create trigger guard_phase2_patient_row
before insert or update or delete on public.phase2_patient_records
for each row execute function public.guard_phase2_shadow_row();

drop trigger if exists guard_phase2_related_row
on public.phase2_related_records;
create trigger guard_phase2_related_row
before insert or update or delete on public.phase2_related_records
for each row execute function public.guard_phase2_shadow_row();

do $phase2_activate$
declare
  clinic_owner constant uuid :=
    'bfcaa90e-c49c-4a94-8cfd-06a16a96a094'::uuid;
  approved_batch_id uuid;
  approved_batch_created_at timestamptz;
  affected integer;
begin
  if (
    select count(*)
    from public.clinic_key_vault
    where owner_id = clinic_owner
      and key_version = 1
      and status = 'draft'
  ) <> 1 then
    raise exception 'Expected exactly one draft key-vault row';
  end if;

  if (
    select count(*)
    from public.phase2_migration_batches
    where owner_id = clinic_owner
      and key_version = 1
      and status = 'activation_approved'
  ) <> 1 then
    raise exception 'Expected exactly one activation-approved batch';
  end if;

  select id, created_at
  into approved_batch_id, approved_batch_created_at
  from public.phase2_migration_batches
  where owner_id = clinic_owner
    and key_version = 1
    and status = 'activation_approved';

  if (
    select count(*)
    from public.phase2_patient_records
    where migration_batch_id = approved_batch_id
  ) <> 10 then
    raise exception 'Activation requires exactly 10 encrypted patient rows';
  end if;

  if (
    select count(*)
    from public.phase2_related_records
    where migration_batch_id = approved_batch_id
  ) <> 40 then
    raise exception 'Activation requires exactly 40 encrypted related rows';
  end if;

  if (select count(*) from public.patients) <> 10
    or (
      (select count(*) from public.visits)
      + (select count(*) from public.scans)
      + (select count(*) from public.procedures)
      + (select count(*) from public.labs)
    ) <> 40 then
    raise exception 'Phase 1 cloud row counts changed after migration review';
  end if;

  if exists (
    select 1 from public.patients
    where updated_at > approved_batch_created_at
    union all
    select 1 from public.visits
    where updated_at > approved_batch_created_at
    union all
    select 1 from public.scans
    where updated_at > approved_batch_created_at
    union all
    select 1 from public.procedures
    where updated_at > approved_batch_created_at
    union all
    select 1 from public.labs
    where updated_at > approved_batch_created_at
  ) then
    raise exception 'Phase 1 cloud data changed after the migration batch was created';
  end if;

  update public.clinic_key_vault
  set status = 'active'
  where owner_id = clinic_owner
    and key_version = 1
    and status = 'draft';
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Clinic key activation did not update exactly one row';
  end if;

  update public.phase2_migration_batches
  set
    verification_evidence = coalesce(verification_evidence, '{}'::jsonb)
      || jsonb_build_object(
      'explicit_approval', true,
      'approved_by', 'clinic-owner',
      'approved_at', now()
    ),
    status = 'activated',
    activated_at = now()
  where id = approved_batch_id
    and owner_id = clinic_owner
    and key_version = 1
    and status = 'activation_approved';
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Migration activation did not update exactly one row';
  end if;
end
$phase2_activate$;

commit;
