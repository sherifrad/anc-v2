-- Phase 3 temporary-user activation and audited encrypted-data gateway.
-- Patient plaintext and the Clinic Data Key never reach the server.

create or replace function public.phase3_activate_temporary_account(
  p_actor_user_id uuid,
  p_grant_id uuid,
  p_key_version integer,
  p_format_version integer,
  p_algorithm text,
  p_wrapping_method text,
  p_wrapped_key jsonb,
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
begin
  if auth.role() is distinct from 'service_role'
    or p_actor_user_id is distinct from v_owner_id then
    raise exception 'Owner server authorization is required';
  end if;

  select *
  into v_grant
  from public.phase3_access_grants g
  where g.id = p_grant_id
    and g.clinic_owner_id = v_owner_id
  for update;

  if not found or v_grant.status <> 'draft' then
    raise exception 'A draft temporary grant was not found';
  end if;
  if now() >= v_grant.valid_until then
    raise exception 'The temporary access window has already ended';
  end if;
  if not exists (
    select 1
    from public.phase3_temporary_accounts a
    where a.user_id = v_grant.grantee_user_id
      and a.clinic_owner_id = v_owner_id
      and a.status = 'invited'
  ) then
    raise exception 'The temporary account is not ready for activation';
  end if;
  if p_key_version <> 1
    or p_format_version <> 1
    or p_algorithm <> 'AES-256-GCM'
    or p_wrapping_method <> 'password-pbkdf2-sha256'
    or jsonb_typeof(p_wrapped_key) <> 'object'
    or length(coalesce(p_wrapped_key->>'iv', '')) not between 16 and 32
    or length(coalesce(p_wrapped_key->>'ciphertext', '')) not between 48 and 256
    or p_wrapped_key->'kdf'->>'name' <> 'PBKDF2-SHA256'
    or (p_wrapped_key->'kdf'->>'iterations')::integer <> 600000
    or length(coalesce(p_wrapped_key->'kdf'->>'salt', '')) not between 40 and 64 then
    raise exception 'The encrypted key envelope is invalid';
  end if;
  if not exists (
    select 1
    from public.clinic_key_vault v
    where v.owner_id = v_owner_id
      and v.key_version = p_key_version
      and v.status = 'active'
  ) or not exists (
    select 1
    from public.phase2_migration_batches b
    where b.owner_id = v_owner_id
      and b.key_version = p_key_version
      and b.status = 'activated'
  ) then
    raise exception 'The active clinic encryption version was not found';
  end if;

  perform set_config('anc.phase3_owner_command', 'authorized', true);

  insert into public.phase3_key_envelopes (
    grant_id,
    clinic_owner_id,
    grantee_user_id,
    key_version,
    format_version,
    algorithm,
    wrapping_method,
    wrapped_key
  )
  values (
    v_grant.id,
    v_owner_id,
    v_grant.grantee_user_id,
    p_key_version,
    p_format_version,
    p_algorithm,
    p_wrapping_method,
    p_wrapped_key
  );

  update public.phase3_access_grants
  set status = 'active'
  where id = v_grant.id
  returning * into v_grant;

  update public.phase3_temporary_accounts
  set status = 'active', updated_at = now()
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
    'grant.activated',
    'success',
    'aal2_server_verified',
    left(nullif(trim(p_device_hint), ''), 120),
    jsonb_build_object(
      'valid_from', v_grant.valid_from,
      'valid_until', v_grant.valid_until,
      'permissions', to_jsonb(v_grant.permissions),
      'key_version', p_key_version,
      'wrapping_method', p_wrapping_method
    )
  );

  return jsonb_build_object(
    'status', 'active',
    'grant_id', v_grant.id,
    'user_id', v_grant.grantee_user_id,
    'valid_from', v_grant.valid_from,
    'valid_until', v_grant.valid_until,
    'permissions', to_jsonb(v_grant.permissions)
  );
end;
$$;

create or replace function public.phase3_bootstrap_temporary_account(
  p_actor_user_id uuid,
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
  v_envelope public.phase3_key_envelopes;
  v_batch public.phase2_migration_batches;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Server authorization is required';
  end if;

  select *
  into v_grant
  from public.phase3_access_grants g
  where g.clinic_owner_id = v_owner_id
    and g.grantee_user_id = p_actor_user_id
  order by g.created_at desc
  limit 1;

  if not found
    or v_grant.status <> 'active'
    or now() < v_grant.valid_from
    or now() >= v_grant.valid_until then
    raise exception 'Temporary access is not active';
  end if;

  select *
  into strict v_envelope
  from public.phase3_key_envelopes e
  where e.grant_id = v_grant.id
    and e.grantee_user_id = p_actor_user_id
    and e.retired_at is null;

  select *
  into strict v_batch
  from public.phase2_migration_batches b
  where b.owner_id = v_owner_id
    and b.key_version = v_envelope.key_version
    and b.status = 'activated';

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
    'session.login',
    'success',
    'aal1_password_verified',
    left(nullif(trim(p_device_hint), ''), 120),
    jsonb_build_object('valid_until', v_grant.valid_until)
  );

  return jsonb_build_object(
    'grant', to_jsonb(v_grant),
    'envelope', to_jsonb(v_envelope) - 'created_at' - 'retired_at' - 'id',
    'batch', jsonb_build_object(
      'id', v_batch.id,
      'owner_id', v_batch.owner_id,
      'key_version', v_batch.key_version,
      'status', v_batch.status,
      'activated_at', v_batch.activated_at
    )
  );
end;
$$;

create or replace function public.phase3_execute_delegated_operation(
  p_actor_user_id uuid,
  p_operation text,
  p_record_type text default null,
  p_resource_fingerprint text default null,
  p_row jsonb default null,
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
  v_batch public.phase2_migration_batches;
  v_permission text;
  v_action text;
  v_reason text;
  v_data jsonb;
  v_rows integer := 0;
  v_patient_code text;
  v_existing boolean;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Server authorization is required';
  end if;

  select *
  into v_grant
  from public.phase3_access_grants g
  where g.clinic_owner_id = v_owner_id
    and g.grantee_user_id = p_actor_user_id
  order by g.created_at desc
  limit 1
  for update;

  if not found then
    v_reason := 'no_grant';
  elsif v_grant.status <> 'active' then
    v_reason := 'grant_' || v_grant.status;
  elsif now() < v_grant.valid_from then
    v_reason := 'grant_not_started';
  elsif now() >= v_grant.valid_until then
    v_reason := 'grant_expired';
  elsif not exists (
    select 1 from public.phase3_key_envelopes e
    where e.grant_id = v_grant.id
      and e.grantee_user_id = p_actor_user_id
      and e.retired_at is null
  ) then
    v_reason := 'key_envelope_unavailable';
  end if;

  select *
  into v_batch
  from public.phase2_migration_batches b
  where b.owner_id = v_owner_id
    and b.status = 'activated'
  order by b.activated_at desc
  limit 1;

  if v_reason is null and v_batch.id is null then
    v_reason := 'active_batch_unavailable';
  end if;

  if p_operation = 'patient.list' then
    v_permission := 'patients.read';
    v_action := 'patient.read';
  elsif p_operation = 'patient.upsert' then
    v_patient_code := p_row->>'patient_code';
    select exists (
      select 1 from public.phase2_patient_records r
      where r.owner_id = v_owner_id
        and r.patient_code = v_patient_code
        and r.key_version = v_batch.key_version
    ) into v_existing;
    v_permission := case when v_existing
      then 'patients.update' else 'patients.create' end;
    v_action := case when v_existing
      then 'patient.update' else 'patient.create' end;
  elsif p_operation = 'related.get' then
    v_permission := 'related.read';
    v_action := 'related.read';
  elsif p_operation = 'related.upsert' then
    v_patient_code := p_row->>'patient_code';
    select exists (
      select 1 from public.phase2_related_records r
      where r.owner_id = v_owner_id
        and r.patient_code = v_patient_code
        and r.record_type = p_record_type
        and r.key_version = v_batch.key_version
    ) into v_existing;
    v_permission := case when v_existing
      then 'related.update' else 'related.create' end;
    v_action := case when v_existing
      then 'related.update' else 'related.create' end;
  else
    v_reason := coalesce(v_reason, 'invalid_operation');
    v_action := 'invalid_request';
  end if;

  if v_reason is null and not (v_permission = any(v_grant.permissions)) then
    v_reason := 'permission_denied';
  end if;
  if p_resource_fingerprint is not null
    and p_resource_fingerprint !~ '^[0-9a-f]{64}$' then
    v_reason := coalesce(v_reason, 'invalid_resource_fingerprint');
  end if;
  if p_operation in ('related.get', 'related.upsert')
    and p_record_type not in ('visits', 'scans', 'procedures', 'labs') then
    v_reason := coalesce(v_reason, 'invalid_record_type');
  end if;

  if v_reason is null and p_operation in ('patient.upsert', 'related.upsert') then
    if p_row->>'owner_id' <> v_owner_id::text
      or (p_row->>'key_version')::integer <> v_batch.key_version
      or p_row->>'migration_batch_id' <> v_batch.id::text
      or length(coalesce(p_row->>'patient_code', '')) not between 1 and 100
      or coalesce(p_row->>'plaintext_sha256', '') !~ '^[a-f0-9]{64}$'
      or jsonb_typeof(p_row->'encrypted_data') <> 'object' then
      v_reason := 'invalid_encrypted_row';
    end if;
  end if;

  perform set_config('anc.phase3_owner_command', 'authorized', true);

  if v_reason is not null then
    insert into public.phase3_security_audit (
      clinic_owner_id, actor_user_id, target_user_id, grant_id,
      event_type, outcome, assurance_level, device_hint, metadata
    )
    values (
      v_owner_id, p_actor_user_id, p_actor_user_id, v_grant.id,
      'delegated.' || coalesce(v_action, 'invalid_request'),
      'denied', 'aal1_password_verified',
      left(nullif(trim(p_device_hint), ''), 120),
      jsonb_strip_nulls(jsonb_build_object(
        'reason', v_reason,
        'operation', p_operation,
        'record_type', p_record_type,
        'resource_fingerprint', p_resource_fingerprint
      ))
    );
    return jsonb_build_object('status', 'denied', 'reason', v_reason);
  end if;

  if p_operation = 'patient.list' then
    select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
    into v_data
    from public.phase2_patient_records r
    where r.owner_id = v_owner_id
      and r.migration_batch_id = v_batch.id;
    v_rows := jsonb_array_length(v_data);
  elsif p_operation = 'patient.upsert' then
    insert into public.phase2_patient_records (
      owner_id, patient_code, key_version, encrypted_data,
      source_updated_at, plaintext_sha256, migration_batch_id
    )
    values (
      v_owner_id,
      p_row->>'patient_code',
      v_batch.key_version,
      p_row->'encrypted_data',
      nullif(p_row->>'source_updated_at', '')::timestamptz,
      p_row->>'plaintext_sha256',
      v_batch.id
    )
    on conflict (owner_id, patient_code, key_version)
    do update set
      encrypted_data = excluded.encrypted_data,
      source_updated_at = excluded.source_updated_at,
      plaintext_sha256 = excluded.plaintext_sha256,
      migration_batch_id = excluded.migration_batch_id;
    v_rows := 1;
    v_data := 'null'::jsonb;
  elsif p_operation = 'related.get' then
    select to_jsonb(r)
    into v_data
    from public.phase2_related_records r
    where r.owner_id = v_owner_id
      and r.migration_batch_id = v_batch.id
      and r.patient_code = p_row->>'patient_code'
      and r.record_type = p_record_type;
    v_rows := case when v_data is null then 0 else 1 end;
  else
    insert into public.phase2_related_records (
      owner_id, patient_code, record_type, key_version,
      encrypted_data, plaintext_sha256, migration_batch_id
    )
    values (
      v_owner_id,
      p_row->>'patient_code',
      p_record_type,
      v_batch.key_version,
      p_row->'encrypted_data',
      p_row->>'plaintext_sha256',
      v_batch.id
    )
    on conflict (owner_id, patient_code, record_type, key_version)
    do update set
      encrypted_data = excluded.encrypted_data,
      plaintext_sha256 = excluded.plaintext_sha256,
      migration_batch_id = excluded.migration_batch_id;
    v_rows := 1;
    v_data := 'null'::jsonb;
  end if;

  insert into public.phase3_security_audit (
    clinic_owner_id, actor_user_id, target_user_id, grant_id,
    event_type, outcome, assurance_level, device_hint, metadata
  )
  values (
    v_owner_id, p_actor_user_id, p_actor_user_id, v_grant.id,
    'delegated.' || v_action, 'success', 'aal1_password_verified',
    left(nullif(trim(p_device_hint), ''), 120),
    jsonb_strip_nulls(jsonb_build_object(
      'operation', p_operation,
      'record_type', p_record_type,
      'resource_fingerprint', p_resource_fingerprint,
      'rows_affected', v_rows
    ))
  );

  return jsonb_build_object(
    'status', 'success',
    'data', coalesce(v_data, 'null'::jsonb)
  );
end;
$$;

revoke all on function public.phase3_activate_temporary_account(
  uuid, uuid, integer, integer, text, text, jsonb, text
) from public, anon, authenticated;
revoke all on function public.phase3_bootstrap_temporary_account(uuid, text)
from public, anon, authenticated;
revoke all on function public.phase3_execute_delegated_operation(
  uuid, text, text, text, jsonb, text
) from public, anon, authenticated;

grant execute on function public.phase3_activate_temporary_account(
  uuid, uuid, integer, integer, text, text, jsonb, text
) to service_role;
grant execute on function public.phase3_bootstrap_temporary_account(uuid, text)
to service_role;
grant execute on function public.phase3_execute_delegated_operation(
  uuid, text, text, text, jsonb, text
) to service_role;
