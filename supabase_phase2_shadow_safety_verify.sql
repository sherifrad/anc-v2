-- ANC EMR Phase 2A shadow rollback safety verification
--
-- Read-only check.

select
  has_table_privilege(
    'authenticated',
    'public.phase2_migration_batches',
    'DELETE'
  ) as authenticated_can_delete_draft_batch,
  (
    select count(*)
    from pg_trigger
    where tgrelid = 'public.phase2_migration_batches'::regclass
      and tgname = 'guard_phase2_batch_delete'
      and not tgisinternal
  ) as guarded_delete_trigger_count,
  (select count(*) from public.phase2_migration_batches) as batch_rows,
  (select count(*) from public.phase2_patient_records) as patient_rows,
  (select count(*) from public.phase2_related_records) as related_rows;
