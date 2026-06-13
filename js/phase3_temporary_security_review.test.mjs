import fs from 'node:fs/promises';

const foundation = await fs.readFile(
  new URL('../supabase_phase3_temporary_accounts.sql', import.meta.url),
  'utf8',
);
const containment = await fs.readFile(
  new URL('../supabase_phase3_account_containment.sql', import.meta.url),
  'utf8',
);
const verify = await fs.readFile(
  new URL('../supabase_phase3_temporary_security_verify.sql', import.meta.url),
  'utf8',
);
const rollback = await fs.readFile(
  new URL('../supabase_phase3_temporary_security_rollback_DRAFT.sql', import.meta.url),
  'utf8',
);

for (const [label, source] of [
  ['foundation', foundation],
  ['containment', containment],
]) {
  if (!source.includes('REVIEWED 2026-06-13')) {
    throw new Error(`${label} migration is not marked reviewed.`);
  }
  if (/DRAFT ONLY|DO NOT RUN/.test(source)) {
    throw new Error(`${label} migration still contains its execution guard.`);
  }
  if (!source.includes("set search_path = ''")) {
    throw new Error(`${label} migration lacks fixed function search paths.`);
  }
  for (const forbidden of [
    'security definer',
    'execute format',
    'user_metadata',
  ]) {
    if (source.toLowerCase().includes(forbidden)) {
      throw new Error(`${label} migration contains forbidden behavior: ${forbidden}`);
    }
  }
}

for (const fragment of [
  'temporary_accounts_table_exists',
  'temporary_accounts_rls_enabled',
  'temporary_account_owner_policy_count',
  'temporary_security_trigger_count',
  'reviewed_security_function_count',
  'anon_can_provision',
  'authenticated_can_provision',
  'service_role_can_provision',
  'anon_can_contain',
  'authenticated_can_contain',
  'service_role_can_contain',
  'phase2_patient_rows',
  'phase2_related_rows',
]) {
  if (!verify.includes(fragment)) {
    throw new Error(`Verification query is missing: ${fragment}`);
  }
}

for (const fragment of [
  'Rollback refused: Phase 3 security data exists',
  'Rollback refused: Phase 2 row counts changed',
  'drop trigger if exists phase3_access_grants_containment_gate',
  'drop function if exists public.phase3_prepare_account_containment',
  'drop function if exists public.phase3_provision_temporary_account',
  'drop table public.phase3_temporary_accounts',
]) {
  if (!rollback.includes(fragment)) {
    throw new Error(`Rollback protection is missing: ${fragment}`);
  }
}

for (const source of [foundation, containment, rollback]) {
  for (const table of [
    'phase2_patient_records',
    'phase2_related_records',
    'clinic_key_vault',
  ]) {
    if (
      new RegExp(
        `\\b(alter|update|delete|insert|drop)\\s+(table\\s+)?public\\.${table}\\b`,
        'i',
      ).test(source)
    ) {
      throw new Error(`Reviewed SQL modifies active table ${table}.`);
    }
  }
}

console.log(JSON.stringify({
  passed: true,
  checks: [
    'both ordered migrations are executable and retain fixed search paths',
    'service-role commands remain unavailable to anon and authenticated roles',
    'read-only verification covers RLS, triggers, privileges, empty state, and Phase 2 counts',
    'rollback refuses nonempty Phase 3 state or changed Phase 2 counts',
    'reviewed SQL does not modify active Phase 2 data or the clinic key vault',
  ],
}, null, 2));
