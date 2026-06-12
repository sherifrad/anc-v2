-- Read-only verification for the legacy RLS hardening.

select
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'attachments',
        'audit_log',
        'labs',
        'patients',
        'procedures',
        'scans',
        'visits'
      )
      and policyname = 'allow_all'
  ) as legacy_allow_all_policy_count,
  has_table_privilege(
    'anon',
    'public.attachments',
    'select'
  ) as anon_can_read_attachments,
  has_table_privilege(
    'anon',
    'public.attachments',
    'insert'
  ) as anon_can_insert_attachments,
  (
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'update_updated_at'
      and p.proconfig @> array['search_path=""']::text[]
  ) as fixed_search_path_function_count,
  (select count(*) from public.phase2_patient_records) as phase2_patient_rows,
  (select count(*) from public.phase2_related_records) as phase2_related_rows;
