-- PHASE 3 EMPTY-CONTAINER ROLLBACK DRAFT - DO NOT RUN
--
-- Removes only empty Phase 3 foundation objects. It aborts if any Phase 3
-- access grant, key envelope, or audit event exists.

do $phase3_rollback_guard$
begin
  raise exception 'PHASE 3 ROLLBACK DRAFT: explicit owner approval required';
end
$phase3_rollback_guard$;

begin;

do $phase3_require_empty$
begin
  if (select count(*) from public.phase3_access_grants) <> 0
    or (select count(*) from public.phase3_key_envelopes) <> 0
    or (select count(*) from public.phase3_security_audit) <> 0 then
    raise exception 'Phase 3 rollback requires all foundation tables to be empty';
  end if;
end
$phase3_require_empty$;

drop table public.phase3_security_audit;
drop table public.phase3_key_envelopes;
drop table public.phase3_access_grants;
drop function public.phase3_prevent_audit_mutation();
drop function public.phase3_protect_grant_identity();
drop function public.phase3_set_updated_at();

commit;
