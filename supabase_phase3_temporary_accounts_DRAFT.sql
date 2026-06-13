-- PHASE 3 TEMPORARY ACCOUNTS REVIEW DRAFT - DO NOT RUN
--
-- Adds owner-visible temporary account identities and a service-role-only
-- provisioning command. It does not release keys or enable delegated access.

do $phase3_temporary_accounts_review_guard$
begin
  raise exception 'PHASE 3 TEMPORARY ACCOUNTS DRAFT ONLY: independent review required';
end
$phase3_temporary_accounts_review_guard$;

begin;

create table if not exists public.phase3_temporary_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  clinic_owner_id uuid not null references auth.users(id) on delete cascade,
  username text not null unique
    check (username ~ '^ANC-[A-Z2-9]{8}$'),
  display_name text not null
    check (char_length(display_name) between 2 and 80),
  status text not null default 'draft'
    check (status in (
      'draft', 'invited', 'active', 'expired', 'suspended', 'revoked'
    )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (clinic_owner_id <> user_id)
);

alter table public.phase3_temporary_accounts enable row level security;
revoke all on table public.phase3_temporary_accounts from public, anon, authenticated;
grant select on table public.phase3_temporary_accounts to authenticated;

create policy "phase3 owner reads temporary accounts"
on public.phase3_temporary_accounts for select
to authenticated
using (
  (select auth.uid()) = clinic_owner_id
  and clinic_owner_id =
    'bfcaa90e-c49c-4a94-8cfd-06a16a96a094'::uuid
  and (select auth.jwt()->>'aal') = 'aal2'
);

drop trigger if exists phase3_temporary_accounts_command_gate
on public.phase3_temporary_accounts;
create trigger phase3_temporary_accounts_command_gate
before insert or update or delete on public.phase3_temporary_accounts
for each row execute function public.phase3_enforce_grant_command();

create or replace function public.phase3_sync_temporary_account_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.phase3_temporary_accounts
  set status = new.status, updated_at = now()
  where user_id = new.grantee_user_id
    and clinic_owner_id = new.clinic_owner_id;
  return new;
end;
$$;

drop trigger if exists phase3_access_grants_sync_temporary_account
on public.phase3_access_grants;
create trigger phase3_access_grants_sync_temporary_account
after update of status on public.phase3_access_grants
for each row
when (new.status is distinct from old.status)
execute function public.phase3_sync_temporary_account_status();

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
    'aal2_server_verified',
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

create or replace function public.phase3_authorize_and_audit_action(
  p_actor_user_id uuid,
  p_action text,
  p_resource_type text,
  p_resource_fingerprint text default null,
  p_request_id uuid default null,
  p_assurance_level text default null,
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
  v_required_permission text;
  v_effective_status text;
  v_outcome text := 'denied';
  v_reason text;
  v_allowed boolean := false;
  v_clinical_action boolean := true;
  v_input_valid boolean := true;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Server authorization is required';
  end if;

  v_required_permission := case p_action
    when 'session.login' then null
    when 'session.logout' then null
    when 'mfa.enrolled' then null
    when 'credential.password_changed' then null
    when 'patient.read' then 'patients.read'
    when 'patient.create' then 'patients.create'
    when 'patient.update' then 'patients.update'
    when 'related.read' then 'related.read'
    when 'related.create' then 'related.create'
    when 'related.update' then 'related.update'
    when 'attachment.upload' then 'attachments.upload'
    else null
  end;
  v_clinical_action := p_action not in (
    'session.login',
    'session.logout',
    'mfa.enrolled',
    'credential.password_changed'
  );
  if v_required_permission is null and v_clinical_action then
    v_input_valid := false;
    v_reason := 'invalid_action';
  end if;
  if p_resource_type not in (
    'account', 'session', 'patient', 'visit', 'scan',
    'procedure', 'lab', 'attachment'
  ) then
    v_input_valid := false;
    v_reason := coalesce(v_reason, 'invalid_resource_type');
  end if;
  if p_resource_fingerprint is not null
    and p_resource_fingerprint !~ '^[0-9a-f]{64}$' then
    v_input_valid := false;
    v_reason := coalesce(v_reason, 'invalid_resource_fingerprint');
  end if;

  select *
  into v_grant
  from public.phase3_access_grants g
  where g.clinic_owner_id = v_owner_id
    and g.grantee_user_id = p_actor_user_id
  order by g.created_at desc
  limit 1
  for update;

  if not v_input_valid then
    v_effective_status := coalesce(v_grant.status, 'unknown');
  elsif not found then
    v_effective_status := 'no_grant';
    v_reason := 'no_grant';
  elsif v_grant.status in ('revoked', 'suspended', 'draft') then
    v_effective_status := v_grant.status;
    v_reason := 'grant_' || v_grant.status;
  elsif now() < v_grant.valid_from then
    v_effective_status := 'not_started';
    v_reason := 'grant_not_started';
  elsif now() >= v_grant.valid_until then
    v_effective_status := 'expired';
    v_reason := 'grant_expired';

    if v_grant.status <> 'expired' then
      perform set_config('anc.phase3_owner_command', 'authorized', true);
      update public.phase3_access_grants
      set status = 'expired'
      where id = v_grant.id;
      update public.phase3_temporary_accounts
      set status = 'expired', updated_at = now()
      where user_id = p_actor_user_id;
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
        v_owner_id,
        p_actor_user_id,
        v_grant.id,
        'grant.expired',
        'success',
        'server',
        jsonb_build_object('valid_until', v_grant.valid_until)
      );
    end if;
  elsif p_assurance_level is distinct from 'aal2' then
    v_effective_status := v_grant.status;
    v_reason := 'mfa_required';
  elsif v_clinical_action
    and not (v_required_permission = any(v_grant.permissions)) then
    v_effective_status := v_grant.status;
    v_reason := 'permission_denied';
  elsif v_clinical_action and not exists (
    select 1
    from public.phase3_key_envelopes e
    where e.grant_id = v_grant.id
      and e.grantee_user_id = p_actor_user_id
      and e.retired_at is null
  ) then
    v_effective_status := v_grant.status;
    v_reason := 'key_envelope_unavailable';
  elsif v_grant.status <> 'active' then
    v_effective_status := v_grant.status;
    v_reason := 'grant_not_active';
  else
    v_effective_status := 'active';
    v_outcome := 'success';
    v_reason := 'authorized';
    v_allowed := true;
  end if;

  perform set_config('anc.phase3_owner_command', 'authorized', true);
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
    p_actor_user_id,
    p_actor_user_id,
    v_grant.id,
    case when v_input_valid
      then 'delegated.' || p_action
      else 'delegated.invalid_request'
    end,
    v_outcome,
    coalesce(p_assurance_level, 'unknown'),
    left(nullif(trim(p_device_hint), ''), 120),
    jsonb_strip_nulls(jsonb_build_object(
      'reason', v_reason,
      'effective_status', v_effective_status,
      'required_permission', v_required_permission,
      'resource_type', p_resource_type,
      'resource_fingerprint', p_resource_fingerprint,
      'request_id', p_request_id
    ))
  );

  return jsonb_build_object(
    'allowed', v_allowed,
    'reason', v_reason,
    'grant_id', v_grant.id,
    'permission', v_required_permission,
    'request_id', p_request_id
  );
end;
$$;

create or replace function public.phase3_record_action_result(
  p_actor_user_id uuid,
  p_grant_id uuid,
  p_request_id uuid,
  p_action text,
  p_outcome text,
  p_failure_code text default null,
  p_rows_affected integer default null
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
  if p_request_id is null then
    raise exception 'A request ID is required';
  end if;
  if p_outcome not in ('success', 'failed') then
    raise exception 'Action outcome is invalid';
  end if;
  if p_rows_affected is not null and p_rows_affected < 0 then
    raise exception 'Affected-row count is invalid';
  end if;
  if not exists (
    select 1
    from public.phase3_security_audit a
    where a.clinic_owner_id = v_owner_id
      and a.actor_user_id = p_actor_user_id
      and a.grant_id is not distinct from p_grant_id
      and a.metadata->>'request_id' = p_request_id::text
      and a.event_type = 'delegated.' || p_action
      and a.outcome = 'success'
  ) then
    raise exception 'A matching authorized action was not found';
  end if;
  if exists (
    select 1
    from public.phase3_security_audit a
    where a.clinic_owner_id = v_owner_id
      and a.actor_user_id = p_actor_user_id
      and a.metadata->>'request_id' = p_request_id::text
      and a.event_type = 'delegated.' || p_action || '.result'
  ) then
    raise exception 'The action result was already recorded';
  end if;

  perform set_config('anc.phase3_owner_command', 'authorized', true);
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
    p_actor_user_id,
    p_grant_id,
    'delegated.' || p_action || '.result',
    p_outcome,
    'server',
    jsonb_strip_nulls(jsonb_build_object(
      'request_id', p_request_id,
      'failure_code', left(nullif(trim(p_failure_code), ''), 80),
      'rows_affected', p_rows_affected
    ))
  )
  returning id into v_audit_id;

  return v_audit_id;
end;
$$;

create or replace function public.phase3_expire_due_accounts()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner_id constant uuid :=
    'bfcaa90e-c49c-4a94-8cfd-06a16a96a094'::uuid;
  v_grant record;
  v_count integer := 0;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Server authorization is required';
  end if;

  for v_grant in
    select g.id, g.grantee_user_id, g.valid_until
    from public.phase3_access_grants g
    where g.clinic_owner_id = v_owner_id
      and g.status in ('draft', 'invited', 'active', 'suspended')
      and g.valid_until <= now()
    for update skip locked
  loop
    perform set_config('anc.phase3_owner_command', 'authorized', true);
    perform set_config('anc.phase3_auth_containment', 'authorized', true);
    update public.phase3_access_grants
    set status = 'expired'
    where id = v_grant.id;
    update public.phase3_temporary_accounts
    set status = 'expired', updated_at = now()
    where user_id = v_grant.grantee_user_id;
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
      v_owner_id,
      v_grant.grantee_user_id,
      v_grant.id,
      'grant.expired',
      'success',
      'scheduled_server',
      jsonb_build_object('valid_until', v_grant.valid_until)
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.phase3_authorize_and_audit_action(
  uuid, text, text, text, uuid, text, text
) from public, anon, authenticated;
revoke all on function public.phase3_expire_due_accounts()
from public, anon, authenticated;
revoke all on function public.phase3_record_action_result(
  uuid, uuid, uuid, text, text, text, integer
) from public, anon, authenticated;
grant execute on function public.phase3_authorize_and_audit_action(
  uuid, text, text, text, uuid, text, text
) to service_role;
grant execute on function public.phase3_expire_due_accounts()
to service_role;
grant execute on function public.phase3_record_action_result(
  uuid, uuid, uuid, text, text, text, integer
) to service_role;

commit;
