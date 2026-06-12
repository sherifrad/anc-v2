-- ANC EMR Phase 2 changed-record identification
-- Read-only. Displays record identifiers and timestamps, not decrypted PHI.

with approved_batch as (
  select id, created_at
  from public.phase2_migration_batches
  where owner_id = 'bfcaa90e-c49c-4a94-8cfd-06a16a96a094'::uuid
    and key_version = 1
    and status = 'activation_approved'
  order by created_at desc
  limit 1
),
phase1_records as (
  select
    p.id,
    p.patient_code,
    p.created_at,
    p.updated_at,
    (p.created_at > b.created_at) as created_after_checkpoint,
    (p.updated_at > b.created_at) as updated_after_checkpoint
  from public.patients p
  cross join approved_batch b
),
shadow_records as (
  select p.patient_code
  from public.phase2_patient_records p
  join approved_batch b on b.id = p.migration_batch_id
)
select
  p.patient_code,
  case
    when s.patient_code is null then 'missing_from_phase2'
    when p.updated_after_checkpoint then 'phase1_updated_after_checkpoint'
    else 'unchanged'
  end as comparison,
  p.created_at as phase1_created_at,
  p.updated_at as phase1_updated_at,
  p.created_after_checkpoint,
  p.updated_after_checkpoint,
  (select count(*) from public.visits v where v.patient_id = p.id)
    as phase1_visit_rows,
  (select count(*) from public.scans s2 where s2.patient_id = p.id)
    as phase1_scan_rows,
  (select count(*) from public.procedures pr where pr.patient_id = p.id)
    as phase1_procedure_rows,
  (select count(*) from public.labs l where l.patient_id = p.id)
    as phase1_lab_rows
from phase1_records p
left join shadow_records s on s.patient_code = p.patient_code
where s.patient_code is null
   or p.updated_after_checkpoint
order by p.updated_at desc;
