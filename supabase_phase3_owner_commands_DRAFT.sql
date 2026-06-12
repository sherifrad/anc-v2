-- PHASE 3 OWNER COMMANDS REVIEW DRAFT - DO NOT RUN
--
-- Adds owner/TOTP-protected SECURITY INVOKER RPCs for draft grant creation,
-- suspension, and irreversible revocation. Activation, invitations, key
-- envelopes, and delegated clinical access remain disabled.

do $phase3_owner_commands_guard$
begin
  raise exception 'PHASE 3 OWNER COMMANDS DRAFT ONLY: explicit approval required';
end
$phase3_owner_commands_guard$;

begin;

create or replace function public.phase3_enforce_grant_command()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('anc.phase3_owner_command', true) <> 'authorized' then
    raise exception 'Phase 3 grants may only be changed through owner commands';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.phase3_enforce_audit_command()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('anc.phase3_owner_command', true) <> 'authorized' then
    raise exception 'Phase 3 audit events may only be appended by reviewed commands';
  end if;
  return new;
end;
$$;

drop trigger if exists phase3_access_grants_command_gate
on public.phase3_access_grants;
create trigger phase3_access_grants_command_gate
before insert or update or delete on public.phase3_access_grants
for each row execute function public.phase3_enforce_grant_command();

drop trigger if exists phase3_security_audit_command_gate
on public.phase3_security_audit;
create trigger phase3_security_audit_command_gate
before insert on public.phase3_security_audit
for each row execute function public.phase3_enforce_audit_command();

create or replace function public.phase3_create_draft_grant(
  p_grantee_user_id uuid,
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
  v_actor_id uuid := auth.uid();
  v_grant public.phase3_access_grants;
begin
  if v_actor_id is null
    or v_actor_id <> v_owner_id
    or (auth.jwt()->>'aal') <> 'aal2' then
    raise exception 'Owner authentication and TOTP verification are required';
  end if;

  if p_grantee_user_id is null or p_grantee_user_id = v_owner_id then
    raise exception 'A different authenticated user is required';
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
    or p_valid_until <= p_valid_from then
    raise exception 'The access validity window is invalid';
  end if;

  if p_valid_until > p_valid_from + interval '30 days' then
    raise exception 'Temporary access cannot exceed 30 days';
  end if;

  if exists (
    select 1
    from public.phase3_access_grants g
    where g.clinic_owner_id = v_owner_id
      and g.grantee_user_id = p_grantee_user_id
      and g.status in ('draft', 'invited', 'active', 'suspended')
      and tstzrange(g.valid_from, g.valid_until, '[)')
        && tstzrange(p_valid_from, p_valid_until, '[)')
  ) then
    raise exception 'This user already has an overlapping access grant';
  end if;

  perform set_config('anc.phase3_owner_command', 'authorized', true);

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
    p_grantee_user_id,
    'data_entry',
    array(select distinct unnest(p_permissions)),
    'draft',
    p_valid_from,
    p_valid_until,
    v_actor_id
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
    v_actor_id,
    p_grantee_user_id,
    v_grant.id,
    'grant.draft_created',
    'success',
    'aal2',
    left(nullif(trim(p_device_hint), ''), 120),
    jsonb_build_object(
      'role', 'data_entry',
      'permissions', to_jsonb(v_grant.permissions),
      'valid_from', v_grant.valid_from,
      'valid_until', v_grant.valid_until
    )
  );

  return v_grant;
end;
$$;

create or replace function public.phase3_change_grant_state(
  p_grant_id uuid,
  p_action text,
  p_reason text,
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
  v_actor_id uuid := auth.uid();
  v_grant public.phase3_access_grants;
  v_next_status text;
  v_previous_status text;
begin
  if v_actor_id is null
    or v_actor_id <> v_owner_id
    or (auth.jwt()->>'aal') <> 'aal2' then
    raise exception 'Owner authentication and TOTP verification are required';
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

  v_previous_status := v_grant.status;

  if p_action = 'suspend' then
    if v_grant.status not in ('invited', 'active') then
      raise exception 'Only invited or active grants can be suspended';
    end if;
    v_next_status := 'suspended';
  else
    if v_grant.status = 'revoked' then
      raise exception 'Access grant is already revoked';
    end if;
    v_next_status := 'revoked';
  end if;

  perform set_config('anc.phase3_owner_command', 'authorized', true);

  update public.phase3_access_grants
  set
    status = v_next_status,
    revoked_at = case when v_next_status = 'revoked' then now() else null end,
    revocation_reason = left(trim(p_reason), 500)
  where id = v_grant.id
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
    v_actor_id,
    v_grant.grantee_user_id,
    v_grant.id,
    'grant.' || p_action || 'ed',
    'success',
    'aal2',
    left(nullif(trim(p_device_hint), ''), 120),
    jsonb_build_object(
      'previous_status', v_previous_status,
      'new_status', v_next_status,
      'reason', left(trim(p_reason), 500)
    )
  );

  return v_grant;
end;
$$;

revoke execute on function public.phase3_enforce_grant_command()
from public, anon, authenticated;
revoke execute on function public.phase3_enforce_audit_command()
from public, anon, authenticated;

revoke execute on function public.phase3_create_draft_grant(
  uuid, text[], timestamptz, timestamptz, text
) from public, anon;
revoke execute on function public.phase3_change_grant_state(
  uuid, text, text, text
) from public, anon;

grant execute on function public.phase3_create_draft_grant(
  uuid, text[], timestamptz, timestamptz, text
) to authenticated;
grant execute on function public.phase3_change_grant_state(
  uuid, text, text, text
) to authenticated;

commit;
