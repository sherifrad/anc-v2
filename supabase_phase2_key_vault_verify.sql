-- ANC EMR Phase 2A key-vault verification
--
-- Read-only checks. This query does not insert, update, or delete anything.
-- It returns one row so every check is visible in the Supabase result panel.

select
  coalesce((
    select c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'clinic_key_vault'
  ), false) as rls_enabled,
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = 'clinic_key_vault'
      and policyname = 'clinic owner key vault'
      and cmd = 'ALL'
  ) as owner_policy_count,
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = 'clinic_key_vault'
      and policyname = 'mfa required key vault'
      and permissive = 'RESTRICTIVE'
      and cmd = 'ALL'
  ) as mfa_policy_count,
  (
    select count(*)
    from public.clinic_key_vault
  ) as vault_rows;
