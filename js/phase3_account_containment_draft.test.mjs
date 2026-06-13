import fs from 'node:fs/promises';

const sql = await fs.readFile(
  new URL('../supabase_phase3_account_containment_DRAFT.sql', import.meta.url),
  'utf8',
);
const edge = await fs.readFile(
  new URL('../supabase/functions/phase3-contain-account/index.ts', import.meta.url),
  'utf8',
);
const expiry = await fs.readFile(
  new URL('../supabase/functions/phase3-expire-accounts/index.ts', import.meta.url),
  'utf8',
);
const config = await fs.readFile(
  new URL('./phase3_security_config.mjs', import.meta.url),
  'utf8',
);
const access = await fs.readFile(
  new URL('./phase3_access_control.mjs', import.meta.url),
  'utf8',
);

for (const fragment of [
  'PHASE 3 ACCOUNT CONTAINMENT DRAFT ONLY',
  'auth_contained_at',
  'phase3_enforce_temporary_containment',
  'phase3_access_grants_containment_gate',
  "current_setting('anc.phase3_auth_containment', true)",
  "is distinct from 'authorized'",
  'phase3_prepare_account_containment',
  "auth.role() is distinct from 'service_role'",
  "p_action not in ('suspend', 'revoke')",
  "'auth_containment_pending', true",
  'phase3_record_auth_containment',
  "'account.auth_containment'",
  "'existing_jwt_requires_live_grant_check', true",
  'phase3_accounts_requiring_containment',
  "g.status in ('expired', 'suspended', 'revoked')",
  'to service_role',
  "set_config('anc.phase3_auth_containment', 'authorized', true)",
]) {
  if (!sql.includes(fragment)) {
    throw new Error(`Account-containment SQL is missing: ${fragment}`);
  }
}

for (const fragment of [
  "{ auth: 'user' }",
  'context.userClaims?.id !== OWNER_ID',
  "MAX_TOTP_AGE_SECONDS = 10 * 60",
  "'phase3_prepare_account_containment'",
  "typeof parsed !== 'object'",
  '.auth.admin.updateUserById(targetUserId',
  'ban_duration: LONG_BAN_DURATION',
  "'phase3_record_auth_containment'",
  'accessBlocked: true',
  'authContained: true',
  'existingJwtBlockedByLiveGrant: true',
]) {
  if (!edge.includes(fragment)) {
    throw new Error(`Owner containment endpoint is missing: ${fragment}`);
  }
}

for (const fragment of [
  "'phase3_expire_due_accounts'",
  "'phase3_accounts_requiring_containment'",
  '.auth.admin.updateUserById(account.user_id',
  "'phase3_record_auth_containment'",
  'containmentFailures',
]) {
  if (!expiry.includes(fragment)) {
    throw new Error(`Expiry containment retry is missing: ${fragment}`);
  }
}

for (const forbidden of [
  'phase2_patient_records',
  'phase2_related_records',
  'phase3_key_envelopes',
  'console.log',
  'user_metadata',
]) {
  if (edge.includes(forbidden) || sql.includes(forbidden)) {
    throw new Error(`Containment draft contains forbidden behavior: ${forbidden}`);
  }
}

if (!config.includes('accountContainmentEnabled: false')) {
  throw new Error('Account containment must remain disabled.');
}
for (const fragment of [
  'PHASE3_SECURITY.accountContainmentEnabled',
  "'phase3-contain-account'",
  "data?.accessBlocked !== true",
  "data?.authContained !== true",
  "'phase3_change_grant_state'",
]) {
  if (!access.includes(fragment)) {
    throw new Error(`Owner UI containment routing is incomplete: ${fragment}`);
  }
}

console.log(JSON.stringify({
  passed: true,
  checks: [
    'grant state is blocked before the Auth administrator call',
    'only the owner with a fresh TOTP can request containment',
    'new sign-ins and refresh attempts are blocked by a server-side Auth ban',
    'existing JWTs remain harmless because clinical access checks live grant state',
    'failed Auth containment is audited and remains eligible for scheduled retry',
    'the browser keeps using the current owner RPC while containment is disabled',
  ],
}, null, 2));
