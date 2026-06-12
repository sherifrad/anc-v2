-- Remove confirmed Phase 1 test record ANC-0001
-- Authorized by the clinic owner on 2026-06-12.
-- Aborts unless the exact record and expected linked-row counts still match.

begin;

do $remove_confirmed_test_record$
declare
  target_patient_id uuid;
  affected integer;
begin
  if (
    select count(*)
    from public.patients
    where patient_code = 'ANC-0001'
      and created_at = '2026-06-11 20:37:13.368133+00'::timestamptz
      and updated_at = '2026-06-11 20:37:13.368133+00'::timestamptz
  ) <> 1 then
    raise exception 'The confirmed test patient no longer matches the reviewed record';
  end if;

  select id into target_patient_id
  from public.patients
  where patient_code = 'ANC-0001'
    and created_at = '2026-06-11 20:37:13.368133+00'::timestamptz
    and updated_at = '2026-06-11 20:37:13.368133+00'::timestamptz;

  if (select count(*) from public.visits where patient_id = target_patient_id) <> 1
    or (select count(*) from public.scans where patient_id = target_patient_id) <> 1
    or (select count(*) from public.procedures where patient_id = target_patient_id) <> 1
    or (select count(*) from public.labs where patient_id = target_patient_id) <> 1 then
    raise exception 'The linked test rows no longer match the reviewed counts';
  end if;

  delete from public.patients
  where id = target_patient_id
    and patient_code = 'ANC-0001';

  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'The test cleanup did not delete exactly one patient';
  end if;

  if exists (
    select 1 from public.visits where patient_id = target_patient_id
    union all
    select 1 from public.scans where patient_id = target_patient_id
    union all
    select 1 from public.procedures where patient_id = target_patient_id
    union all
    select 1 from public.labs where patient_id = target_patient_id
  ) then
    raise exception 'A linked test row remained after cascading deletion';
  end if;
end
$remove_confirmed_test_record$;

commit;

select
  (select count(*) from public.patients) as phase1_patients,
  (select count(*) from public.visits) as phase1_visit_rows,
  (select count(*) from public.scans) as phase1_scan_rows,
  (select count(*) from public.procedures) as phase1_procedure_rows,
  (select count(*) from public.labs) as phase1_lab_rows,
  (select count(*) from public.patients where patient_code = 'ANC-0001')
    as confirmed_test_rows_remaining;
