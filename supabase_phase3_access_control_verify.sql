-- Phase 3 empty-container verification
-- Read-only. No records are modified.

select
  (
    select count(*)
    from pg_tables
    where schemaname = 'public'
      and tablename in (
        'phase3_access_grants',
        'phase3_key_envelopes',
        'phase3_security_audit'
      )
  ) as phase3_table_count,
  (
    select count(*)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'phase3_access_grants',
        'phase3_key_envelopes',
        'phase3_security_audit'
      )
      and c.relrowsecurity
  ) as rls_table_count,
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename like 'phase3_%'
  ) as policy_count,
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = 'phase3_key_envelopes'
      and policyname like '%grantee%'
  ) as delegated_envelope_policy_count,
  (
    select count(*)
    from pg_trigger
    where tgrelid = 'public.phase3_security_audit'::regclass
      and tgname = 'phase3_security_audit_append_only'
      and not tgisinternal
      and tgenabled <> 'D'
  ) as append_only_trigger_count,
  (select count(*) from public.phase3_access_grants) as grant_rows,
  (select count(*) from public.phase3_key_envelopes) as envelope_rows,
  (select count(*) from public.phase3_security_audit) as audit_rows,
  has_table_privilege(
    'anon', 'public.phase3_access_grants', 'select'
  ) as anon_can_read_grants,
  has_table_privilege(
    'anon', 'public.phase3_key_envelopes', 'select'
  ) as anon_can_read_envelopes,
  has_table_privilege(
    'anon', 'public.phase3_security_audit', 'select'
  ) as anon_can_read_audit;
