-- PHASE 3: TEMPORARY STAFF PASSWORD ONBOARDING WITHOUT STAFF TOTP
-- Owner TOTP, owner approval, grant checks, auditing, and key-release controls
-- remain unchanged.

create or replace function public.phase3_complete_temporary_onboarding(
  p_user_id uuid,
  p_device_hint text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner_id constant uuid :=
    'bfcaa90e-c49c-4a94-8cfd-06a16a96a094'::uuid;
  v_account public.phase3_temporary_accounts;
  v_grant public.phase3_access_grants;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Server authorization is required';
  end if;

  select *
  into v_account
  from public.phase3_temporary_accounts a
  where a.user_id = p_user_id
    and a.clinic_owner_id = v_owner_id
  for update;

  if not found then
    raise exception 'Temporary account was not found';
  end if;

  select *
  into v_grant
  from public.phase3_access_grants g
  where g.grantee_user_id = p_user_id
    and g.clinic_owner_id = v_owner_id
    and g.status in ('draft', 'invited')
  order by g.created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'A draft access grant was not found';
  end if;

  if v_account.status = 'invited'
    and exists (
      select 1
      from public.phase3_security_audit a
      where a.clinic_owner_id = v_owner_id
        and a.target_user_id = p_user_id
        and a.grant_id = v_grant.id
        and a.event_type = 'account.onboarding_completed'
        and a.outcome = 'success'
    ) then
    return jsonb_build_object(
      'status', 'waiting_for_owner',
      'grant_status', v_grant.status,
      'access_enabled', false
    );
  end if;

  if v_account.status <> 'draft' or v_grant.status <> 'draft' then
    raise exception 'Temporary account is not awaiting onboarding';
  end if;

  perform set_config('anc.phase3_owner_command', 'authorized', true);

  update public.phase3_temporary_accounts
  set status = 'invited', updated_at = now()
  where user_id = p_user_id;

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
    p_user_id,
    p_user_id,
    v_grant.id,
    'account.onboarding_completed',
    'success',
    'aal1_password_verified',
    left(nullif(trim(p_device_hint), ''), 120),
    jsonb_build_object(
      'password_changed', true,
      'mfa_verified', false,
      'grant_status', 'draft',
      'access_enabled', false,
      'key_released', false
    )
  );

  return jsonb_build_object(
    'status', 'waiting_for_owner',
    'grant_status', 'draft',
    'access_enabled', false
  );
end;
$$;

revoke all on function public.phase3_complete_temporary_onboarding(
  uuid, text
) from public, anon, authenticated;
grant execute on function public.phase3_complete_temporary_onboarding(
  uuid, text
) to service_role;
