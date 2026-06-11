-- ANC EMR Phase 2A key-vault status
--
-- Read-only metadata check. Wrapped keys and KDF values are not displayed.

select
  count(*) over () as vault_rows,
  owner_id,
  key_version,
  format_version,
  algorithm,
  status,
  created_at,
  updated_at
from public.clinic_key_vault
order by key_version;
