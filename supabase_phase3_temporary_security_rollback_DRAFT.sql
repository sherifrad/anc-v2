-- PHASE 3 TEMPORARY SECURITY ROLLBACK - REVIEW BEFORE RUNNING
--
-- Refuses to run after any temporary account, grant, key envelope, or Phase 3
-- audit event exists. It never modifies Auth users or Phase 2 patient data.

begin;

do $phase3_temporary_security_rollback_guard$
begin
  if to_regclass('public.phase3_temporary_accounts') is null then
    raise exception 'Temporary-account foundation is not installed';
  end if;
  if (select count(*) from public.phase3_temporary_accounts) <> 0
    or (select count(*) from public.phase3_access_grants) <> 0
    or (select count(*) from public.phase3_key_envelopes) <> 0
    or (select count(*) from public.phase3_security_audit) <> 0 then
    raise exception 'Rollback refused: Phase 3 security data exists';
  end if;
  if (select count(*) from public.phase2_patient_records) <> 10
    or (select count(*) from public.phase2_related_records) <> 40 then
    raise exception 'Rollback refused: Phase 2 row counts changed';
  end if;
end
$phase3_temporary_security_rollback_guard$;

drop trigger if exists phase3_access_grants_containment_gate
on public.phase3_access_grants;
drop trigger if exists phase3_access_grants_sync_temporary_account
on public.phase3_access_grants;

drop function if exists public.phase3_accounts_requiring_containment();
drop function if exists public.phase3_record_auth_containment(
  uuid, uuid, uuid, text, text, text
);
drop function if exists public.phase3_prepare_account_containment(
  uuid, uuid, text, text, text
);
drop function if exists public.phase3_enforce_temporary_containment();
drop function if exists public.phase3_expire_due_accounts();
drop function if exists public.phase3_record_action_result(
  uuid, uuid, uuid, text, text, text, integer
);
drop function if exists public.phase3_authorize_and_audit_action(
  uuid, text, text, text, uuid, text, text
);
drop function if exists public.phase3_complete_temporary_onboarding(uuid, text);
drop function if exists public.phase3_provision_temporary_account(
  uuid, text, text, text[], timestamptz, timestamptz, text
);
drop function if exists public.phase3_sync_temporary_account_status();

drop table public.phase3_temporary_accounts;

commit;
