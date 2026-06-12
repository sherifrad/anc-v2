-- ANC EMR Phase 2 production activation verification
-- Read-only. No records are modified.

select
  b.id as batch_id,
  b.status as batch_status,
  v.status as vault_status,
  b.key_version,
  b.verification_evidence->>'explicit_approval' as explicit_approval,
  b.verification_evidence->>'approved_by' as approved_by,
  b.activated_at,
  (
    select count(*)
    from public.phase2_patient_records p
    where p.migration_batch_id = b.id
  ) as patient_rows,
  (
    select count(*)
    from public.phase2_related_records r
    where r.migration_batch_id = b.id
  ) as related_rows,
  (
    select count(*)
    from pg_trigger
    where tgrelid in (
      'public.phase2_patient_records'::regclass,
      'public.phase2_related_records'::regclass
    )
      and tgname in (
        'guard_phase2_patient_row',
        'guard_phase2_related_row'
      )
      and not tgisinternal
  ) as active_write_guard_count
from public.phase2_migration_batches b
join public.clinic_key_vault v
  on v.owner_id = b.owner_id
 and v.key_version = b.key_version
where b.owner_id = 'bfcaa90e-c49c-4a94-8cfd-06a16a96a094'::uuid
  and b.key_version = 1
order by b.created_at desc
limit 1;
