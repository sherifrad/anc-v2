-- ANC EMR Phase 2A cross-device verification audit
--
-- Read-only check. Phase 1 remains active.

select
  id as batch_id,
  status,
  key_version,
  verification_evidence->>'deep_verified' as deep_verified,
  verification_evidence->>'failed_rows' as failed_rows,
  verification_evidence->>'desktop_passed' as desktop_passed,
  verification_evidence->>'desktop_decrypted_rows' as desktop_decrypted_rows,
  verification_evidence->>'mobile_passed' as mobile_passed,
  verification_evidence->>'mobile_decrypted_rows' as mobile_decrypted_rows,
  verified_at,
  activated_at
from public.phase2_migration_batches
order by created_at desc;
