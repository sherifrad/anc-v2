-- ANC EMR Phase 2 production write diagnostic
-- Read-only. No records are modified.

select
  has_table_privilege(
    'authenticated',
    'public.phase2_patient_records',
    'select'
  ) as patient_select,
  has_table_privilege(
    'authenticated',
    'public.phase2_patient_records',
    'insert'
  ) as patient_insert,
  has_table_privilege(
    'authenticated',
    'public.phase2_patient_records',
    'update'
  ) as patient_update,
  has_table_privilege(
    'authenticated',
    'public.phase2_patient_records',
    'delete'
  ) as patient_delete,
  has_table_privilege(
    'authenticated',
    'public.phase2_related_records',
    'select'
  ) as related_select,
  has_table_privilege(
    'authenticated',
    'public.phase2_related_records',
    'insert'
  ) as related_insert,
  has_table_privilege(
    'authenticated',
    'public.phase2_related_records',
    'update'
  ) as related_update,
  has_table_privilege(
    'authenticated',
    'public.phase2_related_records',
    'delete'
  ) as related_delete,
  (
    select count(*)
    from pg_trigger
    where tgrelid = 'public.phase2_patient_records'::regclass
      and tgname = 'guard_phase2_patient_row'
      and not tgisinternal
      and tgenabled <> 'D'
  ) as patient_write_guards,
  (
    select count(*)
    from pg_trigger
    where tgrelid = 'public.phase2_related_records'::regclass
      and tgname = 'guard_phase2_related_row'
      and not tgisinternal
      and tgenabled <> 'D'
  ) as related_write_guards,
  (
    select count(*)
    from public.phase2_migration_batches
    where owner_id = 'bfcaa90e-c49c-4a94-8cfd-06a16a96a094'::uuid
      and key_version = 1
      and status = 'activated'
  ) as activated_batches,
  (
    select count(*)
    from public.phase2_patient_records
    where owner_id = 'bfcaa90e-c49c-4a94-8cfd-06a16a96a094'::uuid
      and key_version = 1
  ) as patient_rows,
  (
    select count(*)
    from public.phase2_related_records
    where owner_id = 'bfcaa90e-c49c-4a94-8cfd-06a16a96a094'::uuid
      and key_version = 1
  ) as related_rows;
