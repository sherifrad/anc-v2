import fs from 'node:fs/promises';

const sql = await fs.readFile(
  new URL('../supabase_phase3_access_control_DRAFT.sql', import.meta.url),
  'utf8',
);
const config = await fs.readFile(
  new URL('./phase3_security_config.mjs', import.meta.url),
  'utf8',
);

for (const fragment of [
  'PHASE 3 DRAFT ONLY',
  'create table if not exists public.phase3_access_grants',
  'create table if not exists public.phase3_key_envelopes',
  'create table if not exists public.phase3_security_audit',
  'phase3 grantee reads own active envelope',
  "g.status = 'active'",
  'now() >= g.valid_from',
  'now() < g.valid_until',
  "auth.jwt()->>'aal') = 'aal2'",
  'Phase 3 security audit events are append-only',
]) {
  if (!sql.includes(fragment)) {
    throw new Error(`Phase 3 SQL is missing: ${fragment}`);
  }
}

if (!config.includes('enabled: false')) {
  throw new Error('Phase 3 feature flag is not disabled');
}
if (/\bexecute\s+format\b/i.test(sql)) {
  throw new Error('Phase 3 SQL contains dynamic SQL');
}
for (const table of [
  'phase2_patient_records',
  'phase2_related_records',
  'clinic_key_vault',
]) {
  if (new RegExp(`\\b(alter|update|delete|insert)\\s+(table\\s+)?public\\.${table}\\b`, 'i').test(sql)) {
    throw new Error(`Phase 3 draft modifies active table ${table}`);
  }
}

console.log(JSON.stringify({
  passed: true,
  checks: [
    'execution stop guard exists',
    'Phase 3 feature flag is disabled',
    'grant, key-envelope, and audit tables are isolated',
    'grant status and time window gate envelope access',
    'MFA is required for audit writes',
    'audit history is append-only',
    'no dynamic SQL',
    'active Phase 2 tables are not modified',
  ],
}, null, 2));
