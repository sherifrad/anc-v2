-- APPLIED 2026-06-12: PHASE 3 FOUNDATION INDEXES
--
-- Adds indexes for foreign-key lookups without enabling Phase 3 features.

begin;

create index if not exists phase3_access_grants_grantee_user_id_idx
on public.phase3_access_grants (grantee_user_id);

create index if not exists phase3_access_grants_created_by_idx
on public.phase3_access_grants (created_by);

create index if not exists phase3_key_envelopes_clinic_owner_id_idx
on public.phase3_key_envelopes (clinic_owner_id);

create index if not exists phase3_key_envelopes_grantee_user_id_idx
on public.phase3_key_envelopes (grantee_user_id);

create index if not exists phase3_key_envelopes_grant_identity_idx
on public.phase3_key_envelopes (
  grant_id,
  clinic_owner_id,
  grantee_user_id
);

create index if not exists phase3_security_audit_clinic_owner_created_idx
on public.phase3_security_audit (clinic_owner_id, created_at desc);

create index if not exists phase3_security_audit_actor_user_id_idx
on public.phase3_security_audit (actor_user_id);

create index if not exists phase3_security_audit_target_user_id_idx
on public.phase3_security_audit (target_user_id);

create index if not exists phase3_security_audit_grant_id_idx
on public.phase3_security_audit (grant_id);

commit;
