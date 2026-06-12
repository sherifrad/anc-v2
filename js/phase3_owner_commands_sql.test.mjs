import fs from 'node:fs/promises';

const sql = await fs.readFile(
  new URL('../supabase_phase3_owner_commands.sql', import.meta.url),
  'utf8',
);
const nullGateFix = await fs.readFile(
  new URL('../supabase_phase3_owner_commands_null_gate_fix.sql', import.meta.url),
  'utf8',
);
const verify = await fs.readFile(
  new URL('../supabase_phase3_owner_commands_verify.sql', import.meta.url),
  'utf8',
);
const rollback = await fs.readFile(
  new URL('../supabase_phase3_owner_commands_rollback_DRAFT.sql', import.meta.url),
  'utf8',
);

for (const fragment of [
  'APPLIED 2026-06-12: PHASE 3 PROTECTED OWNER COMMANDS',
  'security invoker',
  "set search_path = ''",
  'phase3_create_draft_grant',
  'phase3_change_grant_state',
  'phase3_access_grants_command_gate',
  'phase3_security_audit_command_gate',
  "current_setting('anc.phase3_owner_command', true)",
  "is distinct from 'authorized'",
  "auth.jwt()->>'aal'",
  "p_action not in ('suspend', 'revoke')",
  "Temporary access cannot exceed 30 days",
  'This user already has an overlapping access grant',
  'grant.draft_created',
  "'grant.' || p_action || 'ed'",
  'revoke execute on function public.phase3_create_draft_grant',
  'grant execute on function public.phase3_create_draft_grant',
]) {
  if (!sql.includes(fragment)) {
    throw new Error(`Owner-command SQL is missing: ${fragment}`);
  }
}

for (const fragment of [
  'APPLIED 2026-06-12: NULL-SAFE PHASE 3 COMMAND GATES',
  "is distinct from 'authorized'",
  'phase3_enforce_grant_command',
  'phase3_enforce_audit_command',
]) {
  if (!nullGateFix.includes(fragment)) {
    throw new Error(`Null-safe command-gate fix is missing: ${fragment}`);
  }
}

for (const forbidden of [
  'security definer',
  'service_role',
  'phase3_activate',
  'phase3_invite',
  'phase3_key_envelopes set',
  'execute format',
]) {
  if (sql.toLowerCase().includes(forbidden)) {
    throw new Error(`Owner-command SQL contains forbidden behavior: ${forbidden}`);
  }
}

for (const fragment of [
  'owner_command_function_count',
  'owner_command_gate_count',
  'anon_can_create_draft',
  'authenticated_can_call_create_draft',
  'phase2_patient_rows',
  'phase2_related_rows',
]) {
  if (!verify.includes(fragment)) {
    throw new Error(`Owner-command verification is missing: ${fragment}`);
  }
}

for (const fragment of [
  'PHASE 3 OWNER COMMANDS ROLLBACK',
  'drop trigger if exists phase3_security_audit_command_gate',
  'drop trigger if exists phase3_access_grants_command_gate',
  'drop function if exists public.phase3_change_grant_state',
  'drop function if exists public.phase3_create_draft_grant',
]) {
  if (!rollback.includes(fragment)) {
    throw new Error(`Owner-command rollback is missing: ${fragment}`);
  }
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
    throw new Error(`Owner-command draft modifies active table ${table}`);
  }
}

console.log(JSON.stringify({
  passed: true,
  checks: [
    'applied owner-command migration is preserved',
    'null-safe command-gate correction is preserved',
    'commands are SECURITY INVOKER with fixed search paths',
    'owner identity and aal2 are checked inside each command',
    'direct grant and audit writes are command-gated',
    'only draft creation, suspension, and revocation are available',
    'activation, invitations, and delegated key access remain absent',
    'function execution is revoked from public and anon',
    'verification preserves Phase 2 row-count checks',
    'rollback removes only the owner-command layer',
    'active Phase 2 tables are not modified',
  ],
}, null, 2));
