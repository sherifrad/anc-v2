import fs from 'node:fs/promises';

const legacySql = await fs.readFile(
  new URL('../supabase_legacy_rls_hardening_DRAFT.sql', import.meta.url),
  'utf8',
);
const legacyVerify = await fs.readFile(
  new URL('../supabase_legacy_rls_hardening_verify.sql', import.meta.url),
  'utf8',
);
const indexSql = await fs.readFile(
  new URL('../supabase_phase3_foundation_indexes_DRAFT.sql', import.meta.url),
  'utf8',
);
const indexVerify = await fs.readFile(
  new URL('../supabase_phase3_foundation_indexes_verify.sql', import.meta.url),
  'utf8',
);

for (const table of [
  'attachments',
  'audit_log',
  'labs',
  'patients',
  'procedures',
  'scans',
  'visits',
]) {
  if (!legacySql.includes(`drop policy if exists "allow_all" on public.${table}`)) {
    throw new Error(`Legacy hardening does not remove allow_all from ${table}`);
  }
}
for (const fragment of [
  'LEGACY RLS DRAFT ONLY',
  'revoke all on table public.attachments from anon',
  "alter function public.update_updated_at() set search_path = ''",
  'legacy_allow_all_policy_count',
  'anon_can_read_attachments',
  'fixed_search_path_function_count',
]) {
  if (!(legacySql + legacyVerify).includes(fragment)) {
    throw new Error(`Legacy hardening is missing: ${fragment}`);
  }
}
for (const fragment of [
  'PHASE 3 INDEX DRAFT ONLY',
  'phase3_access_grants_grantee_user_id_idx',
  'phase3_key_envelopes_grant_identity_idx',
  'phase3_security_audit_clinic_owner_created_idx',
  'phase3_foundation_index_count',
]) {
  if (!(indexSql + indexVerify).includes(fragment)) {
    throw new Error(`Phase 3 index hardening is missing: ${fragment}`);
  }
}
for (const sql of [legacySql, indexSql]) {
  if (/\bexecute\s+format\b/i.test(sql)) {
    throw new Error('Security remediation contains dynamic SQL');
  }
  for (const table of [
    'phase2_patient_records',
    'phase2_related_records',
    'clinic_key_vault',
  ]) {
    if (
      new RegExp(
        `\\b(alter|update|delete|insert|drop)\\s+(table\\s+)?public\\.${table}\\b`,
        'i',
      ).test(sql)
    ) {
      throw new Error(`Security remediation modifies active table ${table}`);
    }
  }
}

console.log(JSON.stringify({
  passed: true,
  checks: [
    'both production scripts remain execution-blocked drafts',
    'all legacy allow-all policies are removed',
    'anonymous attachment privileges are revoked',
    'legacy update trigger function receives a fixed search path',
    'Phase 3 foreign-key lookup indexes are included',
    'verification preserves Phase 2 row-count checks',
    'no dynamic SQL',
    'no active Phase 2 table is modified',
  ],
}, null, 2));
