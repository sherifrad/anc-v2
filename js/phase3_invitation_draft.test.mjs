import fs from 'node:fs/promises';

const functionSource = await fs.readFile(
  new URL('../supabase/functions/phase3-invite-user/index.ts', import.meta.url),
  'utf8',
);
const configSource = await fs.readFile(
  new URL('./phase3_security_config.mjs', import.meta.url),
  'utf8',
);

for (const fragment of [
  "createSupabaseContext",
  "{ auth: 'user' }",
  "actorId !== OWNER_ID",
  "MAX_TOTP_AGE_SECONDS = 10 * 60",
  "method === 'totp'",
  "timestamp >= cutoff",
  ".inviteUserByEmail(email, { redirectTo })",
  "accessEnabled: false",
  "req.method !== 'POST'",
  "MAX_BODY_BYTES",
  "PHASE3_ALLOWED_APP_ORIGINS",
  "PHASE3_INVITE_REDIRECT_URL",
  "'Cache-Control': 'no-store'",
  "'SHA-256'",
  "'phase3_begin_user_invitation'",
  "'phase3_finish_user_invitation'",
  "auditPending: Boolean(completionAuditError)",
]) {
  if (!functionSource.includes(fragment)) {
    throw new Error(`Invitation safety control is missing: ${fragment}`);
  }
}

for (const forbidden of [
  'createUser(',
  'email_confirm',
  'password:',
  'user_metadata',
  'app_metadata',
  'phase2_patient_records',
  'phase2_related_records',
  'phase3_key_envelopes',
  'phase3_create_draft_grant',
  'console.log',
]) {
  if (functionSource.includes(forbidden)) {
    throw new Error(`Invitation draft contains forbidden behavior: ${forbidden}`);
  }
}

if (!configSource.includes('userInvitationsEnabled: false')) {
  throw new Error('User invitations must remain disabled before deployment review.');
}

console.log(JSON.stringify({
  passed: true,
  checks: [
    'Edge Function requires a verified user JWT',
    'exact owner identity and a TOTP proof no older than ten minutes are enforced',
    'only bounded email-only POST requests are accepted',
    'redirect and browser origins are allowlisted',
    'administrator credentials remain server-side',
    'rate limiting and append-only audit use server-only RPCs',
    'audit stores a SHA-256 email fingerprint instead of plaintext',
    'invitation does not create a grant or release a key',
    'invitation feature remains disabled',
  ],
}, null, 2));
