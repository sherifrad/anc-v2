-- Read-only verification for the Phase 3 owner command migration.

select
  (
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'phase3_create_draft_grant',
        'phase3_change_grant_state'
      )
      and p.prosecdef is false
      and p.proconfig @> array['search_path=""']::text[]
  ) as owner_command_function_count,
  (
    select count(*)
    from information_schema.triggers
    where event_object_schema = 'public'
      and trigger_name in (
        'phase3_access_grants_command_gate',
        'phase3_security_audit_command_gate'
      )
  ) as owner_command_gate_count,
  has_function_privilege(
    'anon',
    'public.phase3_create_draft_grant(uuid,text[],timestamptz,timestamptz,text)',
    'execute'
  ) as anon_can_create_draft,
  has_function_privilege(
    'authenticated',
    'public.phase3_create_draft_grant(uuid,text[],timestamptz,timestamptz,text)',
    'execute'
  ) as authenticated_can_call_create_draft,
  has_function_privilege(
    'anon',
    'public.phase3_change_grant_state(uuid,text,text,text)',
    'execute'
  ) as anon_can_change_grant,
  has_function_privilege(
    'authenticated',
    'public.phase3_change_grant_state(uuid,text,text,text)',
    'execute'
  ) as authenticated_can_call_change_grant,
  (select count(*) from public.phase3_access_grants) as grant_rows,
  (select count(*) from public.phase3_key_envelopes) as envelope_rows,
  (select count(*) from public.phase3_security_audit) as audit_rows,
  (select count(*) from public.phase2_patient_records) as phase2_patient_rows,
  (select count(*) from public.phase2_related_records) as phase2_related_rows;
