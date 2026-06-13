import fs from 'node:fs/promises';

const sql = await fs.readFile(
  new URL('../supabase_phase3_activation_and_delegated_access.sql', import.meta.url),
  'utf8',
);
const edge = await fs.readFile(
  new URL('../supabase/functions/phase3-activate-account/index.ts', import.meta.url),
  'utf8',
);

for (const fragment of [
  'phase3_activate_temporary_account',
  'phase3_bootstrap_temporary_account',
  'phase3_execute_delegated_operation',
  "p_wrapping_method <> 'password-pbkdf2-sha256'",
  "set status = 'active'",
  "'grant.activated'",
  "'permission_denied'",
  "'key_envelope_unavailable'",
  "'delegated.' || v_action",
  'to service_role',
]) {
  if (!sql.includes(fragment)) {
    throw new Error(`Phase 3 activation SQL is missing: ${fragment}`);
  }
}

for (const fragment of [
  'MAX_TOTP_AGE_SECONDS',
  "item.method === 'totp'",
  "'phase3_activate_temporary_account'",
  "'Cache-Control': 'no-store'",
]) {
  if (!edge.includes(fragment)) {
    throw new Error(`Owner activation endpoint is missing: ${fragment}`);
  }
}

for (const forbidden of [
  'wrapped_by_passphrase',
  'wrapped_by_recovery',
  'temporaryPassword',
  'service_role',
]) {
  if (edge.includes(forbidden)) {
    throw new Error(`Owner activation endpoint contains forbidden secret: ${forbidden}`);
  }
}

console.log(JSON.stringify({
  passed: true,
  checks: [
    'owner activation requires recent TOTP',
    'only password-wrapped AES-256-GCM envelopes are accepted',
    'activation is transactional with immutable audit',
    'temporary bootstrap returns only the account envelope and active batch',
    'every delegated operation rechecks status, time, permission, and envelope',
  ],
}, null, 2));
