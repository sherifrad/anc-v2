-- PHASE 3 INVITATION AUDIT REVIEW DRAFT - DO NOT RUN
--
-- Adds service-role-only invitation request and completion audit commands.
-- It does not create users, grants, key envelopes, or delegated data access.

do $phase3_invitation_review_guard$
begin
  raise exception 'PHASE 3 INVITATION DRAFT ONLY: independent review required';
end
$phase3_invitation_review_guard$;

begin;

create or replace function public.phase3_begin_user_invitation(
  p_email_fingerprint text,
  p_device_hint text default null
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
  v_recent_requests integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Server authorization is required';
  end if;

  if p_email_fingerprint is null
    or p_email_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'A valid email fingerprint is required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('phase3-invite:' || v_owner_id::text, 0)
  );

  select count(*)
  into v_recent_requests
  from public.phase3_security_audit a
  where a.clinic_owner_id = v_owner_id
    and a.event_type = 'user.invite_requested'
    and a.created_at > now() - interval '1 hour';

  if v_recent_requests >= 5 then
    raise exception 'Invitation rate limit reached';
  end if;

  perform set_config('anc.phase3_owner_command', 'authorized', true);

  insert into public.phase3_security_audit (
    clinic_owner_id,
    actor_user_id,
    event_type,
    outcome,
    assurance_level,
    device_hint,
    metadata
  )
  values (
    v_owner_id,
    v_owner_id,
    'user.invite_requested',
    'success',
    'aal2_server_verified',
    left(nullif(trim(p_device_hint), ''), 120),
    jsonb_build_object('email_fingerprint', p_email_fingerprint)
  )
  returning id into v_audit_id;

  return v_audit_id;
end;
$$;

create or replace function public.phase3_finish_user_invitation(
  p_request_audit_id bigint,
  p_target_user_id uuid,
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
  v_email_fingerprint text;
  v_audit_id bigint;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Server authorization is required';
  end if;

  if p_outcome not in ('success', 'failed') then
    raise exception 'Invitation outcome is invalid';
  end if;

  if (p_outcome = 'success' and p_target_user_id is null)
    or (p_outcome = 'failed' and p_target_user_id is not null) then
    raise exception 'Invitation result is inconsistent';
  end if;

  select a.metadata->>'email_fingerprint'
  into v_email_fingerprint
  from public.phase3_security_audit a
  where a.id = p_request_audit_id
    and a.clinic_owner_id = v_owner_id
    and a.event_type = 'user.invite_requested';

  if not found then
    raise exception 'Invitation request audit was not found';
  end if;

  if exists (
    select 1
    from public.phase3_security_audit a
    where a.clinic_owner_id = v_owner_id
      and a.event_type in ('user.invited', 'user.invite_failed')
      and (a.metadata->>'request_audit_id')::bigint = p_request_audit_id
  ) then
    raise exception 'Invitation request was already completed';
  end if;

  perform set_config('anc.phase3_owner_command', 'authorized', true);

  insert into public.phase3_security_audit (
    clinic_owner_id,
    actor_user_id,
    target_user_id,
    event_type,
    outcome,
    assurance_level,
    metadata
  )
  values (
    v_owner_id,
    v_owner_id,
    p_target_user_id,
    case when p_outcome = 'success'
      then 'user.invited'
      else 'user.invite_failed'
    end,
    p_outcome,
    'aal2_server_verified',
    jsonb_strip_nulls(jsonb_build_object(
      'request_audit_id', p_request_audit_id,
      'email_fingerprint', v_email_fingerprint,
      'failure_code', left(nullif(trim(p_failure_code), ''), 80)
    ))
  )
  returning id into v_audit_id;

  return v_audit_id;
end;
$$;

revoke all on function public.phase3_begin_user_invitation(text, text)
from public, anon, authenticated;
revoke all on function public.phase3_finish_user_invitation(
  bigint, uuid, text, text
) from public, anon, authenticated;

grant execute on function public.phase3_begin_user_invitation(text, text)
to service_role;
grant execute on function public.phase3_finish_user_invitation(
  bigint, uuid, text, text
) to service_role;

commit;
