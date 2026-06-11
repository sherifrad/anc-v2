-- ANC EMR Phase 2A empty shadow-table verification
--
-- Read-only checks. No records are inserted, updated, or deleted.

select
  (
    select count(*)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'phase2_migration_batches',
        'phase2_patient_records',
        'phase2_related_records'
      )
      and c.relrowsecurity
  ) as rls_table_count,
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'phase2_migration_batches',
        'phase2_patient_records',
        'phase2_related_records'
      )
      and policyname like 'clinic owner phase2%'
  ) as owner_policy_count,
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'phase2_migration_batches',
        'phase2_patient_records',
        'phase2_related_records'
      )
      and policyname like 'mfa required phase2%'
      and permissive = 'RESTRICTIVE'
  ) as mfa_policy_count,
  (select count(*) from public.phase2_migration_batches) as batch_rows,
  (select count(*) from public.phase2_patient_records) as patient_rows,
  (select count(*) from public.phase2_related_records) as related_rows;
