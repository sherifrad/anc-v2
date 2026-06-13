-- Read-only verification after applying the temporary-account foundation and
-- Auth containment migrations.

select
  to_regclass('public.phase3_temporary_accounts') is not null
    as temporary_accounts_table_exists,
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.phase3_temporary_accounts'::regclass
  ) as temporary_accounts_rls_enabled,
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = 'phase3_temporary_accounts'
      and policyname = 'phase3 owner reads temporary accounts'
  ) as temporary_account_owner_policy_count,
  (
    select count(*)
    from information_schema.triggers
    where event_object_schema = 'public'
      and trigger_name in (
        'phase3_temporary_accounts_command_gate',
        'phase3_access_grants_sync_temporary_account',
        'phase3_access_grants_containment_gate'
      )
  ) as temporary_security_trigger_count,
  (
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'phase3_provision_temporary_account',
        'phase3_complete_temporary_onboarding',
        'phase3_authorize_and_audit_action',
        'phase3_record_action_result',
        'phase3_expire_due_accounts',
        'phase3_prepare_account_containment',
        'phase3_record_auth_containment',
        'phase3_accounts_requiring_containment'
      )
      and p.prosecdef is false
      and p.proconfig @> array['search_path=""']::text[]
  ) as reviewed_security_function_count,
  has_function_privilege(
    'anon',
    'public.phase3_provision_temporary_account(uuid,text,text,text[],timestamptz,timestamptz,text)',
    'execute'
  ) as anon_can_provision,
  has_function_privilege(
    'authenticated',
    'public.phase3_provision_temporary_account(uuid,text,text,text[],timestamptz,timestamptz,text)',
    'execute'
  ) as authenticated_can_provision,
  has_function_privilege(
    'service_role',
    'public.phase3_provision_temporary_account(uuid,text,text,text[],timestamptz,timestamptz,text)',
    'execute'
  ) as service_role_can_provision,
  has_function_privilege(
    'anon',
    'public.phase3_prepare_account_containment(uuid,uuid,text,text,text)',
    'execute'
  ) as anon_can_contain,
  has_function_privilege(
    'authenticated',
    'public.phase3_prepare_account_containment(uuid,uuid,text,text,text)',
    'execute'
  ) as authenticated_can_contain,
  has_function_privilege(
    'service_role',
    'public.phase3_prepare_account_containment(uuid,uuid,text,text,text)',
    'execute'
  ) as service_role_can_contain,
  (select count(*) from public.phase3_temporary_accounts)
    as temporary_account_rows,
  (select count(*) from public.phase3_access_grants) as grant_rows,
  (select count(*) from public.phase3_key_envelopes) as envelope_rows,
  (select count(*) from public.phase3_security_audit) as audit_rows,
  (select count(*) from public.phase2_patient_records) as phase2_patient_rows,
  (select count(*) from public.phase2_related_records) as phase2_related_rows;
