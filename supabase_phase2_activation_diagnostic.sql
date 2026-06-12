-- ANC EMR Phase 2 activation diagnostic
-- Read-only. No records are modified.

with approved_batch as (
  select id, created_at, expected_counts, uploaded_counts
  from public.phase2_migration_batches
  where owner_id = 'bfcaa90e-c49c-4a94-8cfd-06a16a96a094'::uuid
    and key_version = 1
    and status = 'activation_approved'
  order by created_at desc
  limit 1
),
phase1_counts as (
  select
    (select count(*) from public.patients) as patients,
    (select count(*) from public.visits) as visits,
    (select count(*) from public.scans) as scans,
    (select count(*) from public.procedures) as procedures,
    (select count(*) from public.labs) as labs
),
phase1_updates as (
  select
    (select count(*) from public.patients p, approved_batch b
      where p.updated_at > b.created_at) as patients_after_checkpoint,
    (select count(*) from public.visits v, approved_batch b
      where v.updated_at > b.created_at) as visits_after_checkpoint,
    (select count(*) from public.scans s, approved_batch b
      where s.updated_at > b.created_at) as scans_after_checkpoint,
    (select count(*) from public.procedures p, approved_batch b
      where p.updated_at > b.created_at) as procedures_after_checkpoint,
    (select count(*) from public.labs l, approved_batch b
      where l.updated_at > b.created_at) as labs_after_checkpoint
),
shadow_counts as (
  select
    (select count(*)
      from public.phase2_patient_records p, approved_batch b
      where p.migration_batch_id = b.id) as encrypted_patients,
    (select count(*)
      from public.phase2_related_records r, approved_batch b
      where r.migration_batch_id = b.id) as encrypted_related
)
select
  b.id as batch_id,
  b.created_at as migration_checkpoint,
  b.expected_counts,
  b.uploaded_counts,
  c.patients as phase1_patients,
  c.visits as phase1_visit_rows,
  c.scans as phase1_scan_rows,
  c.procedures as phase1_procedure_rows,
  c.labs as phase1_lab_rows,
  c.visits + c.scans + c.procedures + c.labs as phase1_related_rows,
  s.encrypted_patients,
  s.encrypted_related,
  u.patients_after_checkpoint,
  u.visits_after_checkpoint,
  u.scans_after_checkpoint,
  u.procedures_after_checkpoint,
  u.labs_after_checkpoint
from approved_batch b
cross join phase1_counts c
cross join phase1_updates u
cross join shadow_counts s;
