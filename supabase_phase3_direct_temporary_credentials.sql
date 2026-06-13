-- Generated temporary credentials are final for the account validity window.
-- The account identity is ready for owner approval immediately; its grant
-- remains draft and no delegated access or key envelope is released here.

create or replace function public.phase3_provision_temporary_account(
  p_user_id uuid,
  p_username text,
  p_display_name text,
  p_permissions text[],
  p_valid_from timestamptz,
  p_valid_until timestamptz,
  p_device_hint text default null
)
returns public.phase3_access_grants
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner_id constant uuid :=
    'bfcaa90e-c49c-4a94-8cfd-06a16a96a094'::uuid;
  v_grant public.phase3_access_grants;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Server authorization is required';
  end if;

  if p_user_id is null or p_user_id = v_owner_id then
    raise exception 'A different authenticated user is required';
  end if;
  if p_username !~ '^ANC-[A-Z2-9]{8}$' then
    raise exception 'Generated username is invalid';
  end if;
  if char_length(trim(p_display_name)) not between 2 and 80 then
    raise exception 'Staff label is invalid';
  end if;
  if p_permissions is null
    or cardinality(p_permissions) = 0
    or not (
      p_permissions <@ array[
        'patients.read',
        'patients.create',
        'patients.update',
        'related.read',
        'related.create',
        'related.update',
        'attachments.upload'
      ]::text[]
    ) then
    raise exception 'One or more requested permissions are not allowed';
  end if;
  if p_valid_from is null
    or p_valid_until is null
    or p_valid_until <= p_valid_from
    or p_valid_until > p_valid_from + interval '30 days' then
    raise exception 'The access validity window is invalid';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('phase3-provision:' || v_owner_id::text, 0)
  );

  if (
    select count(*)
    from public.phase3_security_audit a
    where a.clinic_owner_id = v_owner_id
      and a.event_type = 'account.provisioned'
      and a.created_at > now() - interval '1 hour'
  ) >= 5 then
    raise exception 'Temporary account creation rate limit reached';
  end if;

  perform set_config('anc.phase3_owner_command', 'authorized', true);

  insert into public.phase3_temporary_accounts (
    user_id,
    clinic_owner_id,
    username,
    display_name,
    status
  )
  values (
    p_user_id,
    v_owner_id,
    upper(p_username),
    trim(p_display_name),
    'invited'
  );

  insert into public.phase3_access_grants (
    clinic_owner_id,
    grantee_user_id,
    role,
    permissions,
    status,
    valid_from,
    valid_until,
    created_by
  )
  values (
    v_owner_id,
    p_user_id,
    'data_entry',
    array(select distinct unnest(p_permissions)),
    'draft',
    p_valid_from,
    p_valid_until,
    v_owner_id
  )
  returning * into v_grant;

  insert into public.phase3_security_audit (
    clinic_owner_id,
    actor_user_id,
    target_user_id,
    grant_id,
    event_type,
    outcome,
    assurance_level,
    device_hint,
    metadata
  )
  values (
    v_owner_id,
    v_owner_id,
    p_user_id,
    v_grant.id,
    'account.provisioned',
    'success',
    'aal1_password_verified',
    left(nullif(trim(p_device_hint), ''), 120),
    jsonb_build_object(
      'username', upper(p_username),
      'role', 'data_entry',
      'permissions', to_jsonb(v_grant.permissions),
      'valid_from', v_grant.valid_from,
      'valid_until', v_grant.valid_until,
      'generated_credentials_final', true,
      'onboarding_required', false,
      'access_enabled', false
    )
  );

  return v_grant;
end;
$$;

revoke all on function public.phase3_provision_temporary_account(
  uuid, text, text, text[], timestamptz, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.phase3_provision_temporary_account(
  uuid, text, text, text[], timestamptz, timestamptz, text
) to service_role;
