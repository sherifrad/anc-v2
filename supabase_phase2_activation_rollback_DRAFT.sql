-- PHASE 2 PRODUCTION ROLLBACK DRAFT - DO NOT RUN
--
-- Use only after redeploying the disabled Phase 1 runtime or the stable
-- phase1-stable-2026-06-11 tag.

do $phase2_rollback_guard$
begin
  raise exception 'PHASE 2 ROLLBACK DRAFT: explicit clinic-owner rollback is required';
end
$phase2_rollback_guard$;

begin;

do $phase2_rollback$
declare
  clinic_owner constant uuid :=
    'bfcaa90e-c49c-4a94-8cfd-06a16a96a094'::uuid;
  affected integer;
begin
  update public.phase2_migration_batches
  set status = 'rolled_back'
  where owner_id = clinic_owner
    and key_version = 1
    and status = 'activated';
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Expected exactly one activated migration batch';
  end if;

  update public.clinic_key_vault
  set status = 'draft'
  where owner_id = clinic_owner
    and key_version = 1
    and status = 'active';
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Expected exactly one active clinic key';
  end if;
end
$phase2_rollback$;

commit;
