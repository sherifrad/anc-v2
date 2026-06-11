-- ANC EMR Phase 2A staging audit
--
-- Read-only independent check after encrypted staging.

select
  b.id as batch_id,
  b.status,
  b.key_version,
  b.expected_counts,
  b.uploaded_counts,
  b.verified_at,
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
    select count(distinct p.patient_code)
    from public.phase2_patient_records p
    where p.migration_batch_id = b.id
  ) as distinct_patients,
  (
    select count(*)
    from public.phase2_patient_records p
    where p.migration_batch_id = b.id
      and p.key_version <> b.key_version
  ) + (
    select count(*)
    from public.phase2_related_records r
    where r.migration_batch_id = b.id
      and r.key_version <> b.key_version
  ) as wrong_key_version_rows
from public.phase2_migration_batches b
order by b.created_at desc;
