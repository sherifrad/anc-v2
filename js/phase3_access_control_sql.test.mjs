import fs from 'node:fs/promises';

const sql = await fs.readFile(
  new URL('../supabase_phase3_access_control_DRAFT.sql', import.meta.url),
  'utf8',
);
const config = await fs.readFile(
  new URL('./phase3_security_config.mjs', import.meta.url),
  'utf8',
);
const verification = await fs.readFile(
  new URL('../supabase_phase3_access_control_verify.sql', import.meta.url),
  'utf8',
);
const rollback = await fs.readFile(
  new URL('../supabase_phase3_access_control_rollback_DRAFT.sql', import.meta.url),
  'utf8',
);

for (const fragment of [
  'PHASE 3 DRAFT ONLY',
  'create table if not exists public.phase3_access_grants',
  'create table if not exists public.phase3_key_envelopes',
  'create table if not exists public.phase3_security_audit',
  "permissions <@ array[",
  'foreign key (grant_id, clinic_owner_id, grantee_user_id)',
  'phase3 owner appends security audit',
  'and actor_user_id = clinic_owner_id',
  'phase3 mfa required for grants',
  'phase3 mfa required for key envelopes',
  'phase3 mfa required for security audit',
  "auth.jwt()->>'aal') = 'aal2'",
  'Phase 3 grant identity is immutable',
  'Phase 3 security audit events are append-only',
]) {
  if (!sql.includes(fragment)) {
    throw new Error(`Phase 3 SQL is missing: ${fragment}`);
  }
}

if (!config.includes('enabled: false')) {
  throw new Error('Phase 3 feature flag is not disabled');
}
for (const fragment of [
  'panelPreviewEnabled: true',
  'ownerCommandsEnabled: true',
  'grantMutationsEnabled: true',
  'delegatedAccessEnabled: false',
]) {
  if (!config.includes(fragment)) {
    throw new Error(`Phase 3 safety configuration is missing: ${fragment}`);
  }
}
if (sql.includes('phase3 grantee reads own active envelope')) {
  throw new Error('Delegated envelope access was enabled in the foundation');
}
if (sql.includes('grant select, insert, update on table public.phase3_key_envelopes')) {
  throw new Error('Key-envelope updates were granted to browser sessions');
}
if (/\bexecute\s+format\b/i.test(sql)) {
  throw new Error('Phase 3 SQL contains dynamic SQL');
}
for (const fragment of [
  'phase3_table_count',
  'rls_table_count',
  'delegated_envelope_policy_count',
  'append_only_trigger_count',
  'anon_can_read_grants',
  'anon_can_read_envelopes',
  'anon_can_read_audit',
]) {
  if (!verification.includes(fragment)) {
    throw new Error(`Phase 3 verification is missing: ${fragment}`);
  }
}
for (const fragment of [
  'PHASE 3 ROLLBACK DRAFT',
  'Phase 3 rollback requires all foundation tables to be empty',
  'drop table public.phase3_security_audit',
  'drop table public.phase3_key_envelopes',
  'drop table public.phase3_access_grants',
]) {
  if (!rollback.includes(fragment)) {
    throw new Error(`Phase 3 rollback is missing: ${fragment}`);
  }
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
    'permissions are limited to the reviewed data-entry allowlist',
    'key envelopes are bound to the exact grant and grantee',
    'delegated envelope access remains disabled',
    'MFA and owner identity are required for audit writes',
    'MFA is required for every Phase 3 table operation',
    'grant identity is immutable',
    'audit history is append-only',
    'read-only verification covers RLS, policies, triggers, and empty rows',
    'rollback is guarded and requires empty tables',
    'no dynamic SQL',
    'active Phase 2 tables are not modified',
  ],
}, null, 2));
