-- PHASE 2 ACTIVE WRITE REVIEW DRAFT - DO NOT RUN
--
-- This patch permits structured upsert/delete only after the migration batch
-- reaches "activated". Pre-activation verified rows remain immutable.

do $phase2_active_write_guard$
begin
  raise exception 'PHASE 2 DRAFT ONLY: explicit activation approval is required';
end
$phase2_active_write_guard$;

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
    raise exception 'Shadow rows may be inserted only into draft or activated batches';
  end if;

  if tg_op = 'UPDATE' then
    if batch_status <> 'activated' then
      raise exception 'Shadow rows may be updated only after activation';
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
    raise exception 'Verified shadow rows require rollback before deletion';
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

commit;
