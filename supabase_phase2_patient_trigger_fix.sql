-- ANC EMR Phase 2 patient-trigger fix
-- Fixes PostgreSQL error 42703 without modifying patient data.

begin;

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

    if tg_table_name = 'phase2_related_records' then
      if new.record_type <> old.record_type then
        raise exception 'Related record type is immutable';
      end if;
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

commit;

select
  pg_get_functiondef(
    'public.guard_phase2_shadow_row()'::regprocedure
  ) like '%if tg_table_name = ''phase2_related_records'' then%'
    as patient_safe_record_type_check,
  (
    select count(*)
    from pg_trigger
    where tgrelid in (
      'public.phase2_patient_records'::regclass,
      'public.phase2_related_records'::regclass
    )
      and tgname in (
        'guard_phase2_patient_row',
        'guard_phase2_related_row'
      )
      and not tgisinternal
      and tgenabled <> 'D'
  ) as active_write_guard_count,
  (select count(*) from public.phase2_patient_records) as patient_rows,
  (select count(*) from public.phase2_related_records) as related_rows;
