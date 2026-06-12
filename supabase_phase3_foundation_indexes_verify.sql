-- Read-only verification for Phase 3 foundation indexes.

select
  count(*) filter (
    where indexname in (
      'phase3_access_grants_grantee_user_id_idx',
      'phase3_access_grants_created_by_idx',
      'phase3_key_envelopes_clinic_owner_id_idx',
      'phase3_key_envelopes_grantee_user_id_idx',
      'phase3_key_envelopes_grant_identity_idx',
      'phase3_security_audit_clinic_owner_created_idx',
      'phase3_security_audit_actor_user_id_idx',
      'phase3_security_audit_target_user_id_idx',
      'phase3_security_audit_grant_id_idx'
    )
  ) as phase3_foundation_index_count,
  (select count(*) from public.phase3_access_grants) as grant_rows,
  (select count(*) from public.phase3_key_envelopes) as envelope_rows,
  (select count(*) from public.phase3_security_audit) as audit_rows,
  (select count(*) from public.phase2_patient_records) as phase2_patient_rows,
  (select count(*) from public.phase2_related_records) as phase2_related_rows
from pg_indexes
where schemaname = 'public';
