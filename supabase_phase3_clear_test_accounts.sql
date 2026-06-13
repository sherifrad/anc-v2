-- One-time cleanup authorized by the clinic owner on 2026-06-13.
-- Removes only managed Phase 3 temporary test identities and their Phase 3
-- grants/audit. It does not touch patient data or the clinical audit_log.

begin;

do $cleanup$
declare
  v_owner_id constant uuid :=
    'bfcaa90e-c49c-4a94-8cfd-06a16a96a094'::uuid;
  v_ids uuid[];
begin
  select coalesce(array_agg(a.user_id), '{}'::uuid[])
  into v_ids
  from public.phase3_temporary_accounts a
  where a.clinic_owner_id = v_owner_id;

  perform set_config('anc.phase3_owner_command', 'authorized', true);
  perform set_config('anc.phase3_auth_containment', 'authorized', true);

  alter table public.phase3_security_audit disable trigger user;
  delete from public.phase3_security_audit
  where clinic_owner_id = v_owner_id
    and (
      target_user_id = any(v_ids)
      or actor_user_id = any(v_ids)
      or grant_id in (
        select g.id
        from public.phase3_access_grants g
        where g.clinic_owner_id = v_owner_id
          and g.grantee_user_id = any(v_ids)
      )
    );
  alter table public.phase3_security_audit enable trigger user;

  delete from public.phase3_key_envelopes
  where clinic_owner_id = v_owner_id
    and grantee_user_id = any(v_ids);

  delete from public.phase3_access_grants
  where clinic_owner_id = v_owner_id
    and grantee_user_id = any(v_ids);

  delete from public.phase3_temporary_accounts
  where clinic_owner_id = v_owner_id
    and user_id = any(v_ids);

  delete from auth.users u
  where u.id = any(v_ids)
    and u.raw_app_meta_data->>'account_type' = 'temporary_data_entry'
    and u.raw_app_meta_data->>'clinic_owner_id' = v_owner_id::text;
end
$cleanup$;

commit;
