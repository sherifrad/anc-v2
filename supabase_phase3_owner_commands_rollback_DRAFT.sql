-- PHASE 3 OWNER COMMANDS ROLLBACK DRAFT - DO NOT RUN

do $phase3_owner_commands_rollback_guard$
begin
  raise exception 'PHASE 3 OWNER COMMANDS ROLLBACK: explicit approval required';
end
$phase3_owner_commands_rollback_guard$;

begin;

drop trigger if exists phase3_security_audit_command_gate
on public.phase3_security_audit;
drop trigger if exists phase3_access_grants_command_gate
on public.phase3_access_grants;

drop function if exists public.phase3_change_grant_state(
  uuid, text, text, text
);
drop function if exists public.phase3_create_draft_grant(
  uuid, text[], timestamptz, timestamptz, text
);
drop function if exists public.phase3_enforce_audit_command();
drop function if exists public.phase3_enforce_grant_command();

commit;
