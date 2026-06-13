-- PHASE 3 AUTH ACCOUNT CONTAINMENT REVIEW DRAFT - DO NOT RUN
--
-- Requires the temporary-account draft. It blocks the grant transactionally,
-- tracks whether the corresponding Auth account was banned, and appends every
-- containment result to the immutable security audit.

do $phase3_account_containment_review_guard$
begin
  raise exception 'PHASE 3 ACCOUNT CONTAINMENT DRAFT ONLY: independent review required';
end
$phase3_account_containment_review_guard$;

begin;

alter table public.phase3_temporary_accounts
  add column if not exists auth_contained_at timestamptz,
  add column if not exists auth_containment_reason text;

create or replace function public.phase3_enforce_temporary_containment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('expired', 'suspended', 'revoked')
    and new.status is distinct from old.status
    and exists (
      select 1
      from public.phase3_temporary_accounts a
      where a.user_id = new.grantee_user_id
        and a.clinic_owner_id = new.clinic_owner_id
    )
    and current_setting('anc.phase3_auth_containment', true)
      is distinct from 'authorized' then
    raise exception 'Managed temporary accounts require the Auth containment command';
  end if;
  return new;
end;
$$;

drop trigger if exists phase3_access_grants_containment_gate
on public.phase3_access_grants;
create trigger phase3_access_grants_containment_gate
before update of status on public.phase3_access_grants
for each row execute function public.phase3_enforce_temporary_containment();

create or replace function public.phase3_prepare_account_containment(
  p_actor_user_id uuid,
  p_grant_id uuid,
  p_action text,
  p_reason text,
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
  v_grant public.phase3_access_grants;
  v_previous_status text;
  v_next_status text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Server authorization is required';
  end if;
  if p_actor_user_id is distinct from v_owner_id then
    raise exception 'The clinic owner is required';
  end if;
  if p_action not in ('suspend', 'revoke') then
    raise exception 'Only suspend and revoke are available';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'A reason is required';
  end if;

  select *
  into v_grant
  from public.phase3_access_grants g
  where g.id = p_grant_id
    and g.clinic_owner_id = v_owner_id
  for update;

  if not found then
    raise exception 'Access grant was not found';
  end if;
  if not exists (
    select 1
    from public.phase3_temporary_accounts a
    where a.user_id = v_grant.grantee_user_id
      and a.clinic_owner_id = v_owner_id
  ) then
    raise exception 'The grant is not linked to a managed temporary account';
  end if;

  v_previous_status := v_grant.status;
  if p_action = 'suspend' then
    if v_grant.status not in ('invited', 'active', 'suspended') then
      raise exception 'Only invited, active, or already suspended grants can be contained';
    end if;
    v_next_status := 'suspended';
  else
    if v_grant.status not in (
      'draft', 'invited', 'active', 'suspended', 'revoked'
    ) then
      raise exception 'This grant cannot be revoked';
    end if;
    v_next_status := 'revoked';
  end if;

  perform set_config('anc.phase3_owner_command', 'authorized', true);
  perform set_config('anc.phase3_auth_containment', 'authorized', true);

  update public.phase3_access_grants
  set
    status = v_next_status,
    revoked_at = case
      when v_next_status = 'revoked' then coalesce(revoked_at, now())
      else null
    end,
    revocation_reason = left(trim(p_reason), 500)
  where id = v_grant.id
  returning * into v_grant;

  update public.phase3_temporary_accounts
  set
    status = v_next_status,
    auth_contained_at = null,
    auth_containment_reason = null,
    updated_at = now()
  where user_id = v_grant.grantee_user_id;

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
    v_grant.grantee_user_id,
    v_grant.id,
    'grant.' || p_action || 'ed',
    'success',
    'aal2_server_verified',
    left(nullif(trim(p_device_hint), ''), 120),
    jsonb_build_object(
      'previous_status', v_previous_status,
      'new_status', v_next_status,
      'reason', left(trim(p_reason), 500),
      'auth_containment_pending', true
    )
  );

  return jsonb_build_object(
    'grant_id', v_grant.id,
    'target_user_id', v_grant.grantee_user_id,
    'status', v_grant.status,
    'auth_containment_pending', true
  );
end;
$$;

create or replace function public.phase3_record_auth_containment(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_grant_id uuid,
  p_reason text,
  p_outcome text,
  p_failure_code text default null
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner_id constant uuid :=
    'bfcaa90e-c49c-4a94-8cfd-06a16a96a094'::uuid;
  v_audit_id bigint;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Server authorization is required';
  end if;
  if p_actor_user_id is distinct from v_owner_id then
    raise exception 'The clinic owner is required';
  end if;
  if p_outcome not in ('success', 'failed') then
    raise exception 'Containment outcome is invalid';
  end if;
  if not exists (
    select 1
    from public.phase3_access_grants g
    where g.id = p_grant_id
      and g.clinic_owner_id = v_owner_id
      and g.grantee_user_id = p_target_user_id
      and g.status in ('expired', 'suspended', 'revoked')
  ) then
    raise exception 'A blocked temporary grant was not found';
  end if;

  perform set_config('anc.phase3_owner_command', 'authorized', true);

  if p_outcome = 'success' then
    update public.phase3_temporary_accounts
    set
      auth_contained_at = now(),
      auth_containment_reason = left(trim(p_reason), 120),
      updated_at = now()
    where user_id = p_target_user_id
      and clinic_owner_id = v_owner_id;
  end if;

  insert into public.phase3_security_audit (
    clinic_owner_id,
    actor_user_id,
    target_user_id,
    grant_id,
    event_type,
    outcome,
    assurance_level,
    metadata
  )
  values (
    v_owner_id,
    p_actor_user_id,
    p_target_user_id,
    p_grant_id,
    'account.auth_containment',
    p_outcome,
    'server_admin',
    jsonb_strip_nulls(jsonb_build_object(
      'reason', left(trim(p_reason), 120),
      'failure_code', left(nullif(trim(p_failure_code), ''), 120),
      'new_signins_blocked', p_outcome = 'success',
      'refresh_blocked', p_outcome = 'success',
      'existing_jwt_requires_live_grant_check', true
    ))
  )
  returning id into v_audit_id;

  return v_audit_id;
end;
$$;

create or replace function public.phase3_accounts_requiring_containment()
returns table (
  user_id uuid,
  grant_id uuid,
  grant_status text
)
language sql
security invoker
set search_path = ''
as $$
  select a.user_id, blocked.id, blocked.status
  from public.phase3_temporary_accounts a
  cross join lateral (
    select g.id, g.status, g.updated_at
    from public.phase3_access_grants g
    where g.grantee_user_id = a.user_id
      and g.clinic_owner_id = a.clinic_owner_id
      and g.status in ('expired', 'suspended', 'revoked')
    order by g.updated_at desc
    limit 1
  ) blocked
  where auth.role() = 'service_role'
    and a.clinic_owner_id =
      'bfcaa90e-c49c-4a94-8cfd-06a16a96a094'::uuid
    and a.auth_contained_at is null
  order by blocked.updated_at
  limit 25
$$;

revoke all on function public.phase3_prepare_account_containment(
  uuid, uuid, text, text, text
) from public, anon, authenticated;
revoke all on function public.phase3_record_auth_containment(
  uuid, uuid, uuid, text, text, text
) from public, anon, authenticated;
revoke all on function public.phase3_accounts_requiring_containment()
from public, anon, authenticated;
revoke execute on function public.phase3_enforce_temporary_containment()
from public, anon, authenticated;

grant execute on function public.phase3_prepare_account_containment(
  uuid, uuid, text, text, text
) to service_role;
grant execute on function public.phase3_record_auth_containment(
  uuid, uuid, uuid, text, text, text
) to service_role;
grant execute on function public.phase3_accounts_requiring_containment()
to service_role;

commit;
