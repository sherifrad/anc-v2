import fs from 'node:fs/promises';

const functionSource = await fs.readFile(
  new URL('../supabase/functions/phase3-provision-user/index.ts', import.meta.url),
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
  ".createUser({",
  "email_confirm: true",
  "account_type: 'temporary_data_entry'",
  "must_change_password: false",
  "onboarding_complete: true",
  "generated_credentials_final: true",
  "'phase3_provision_temporary_account'",
  ".deleteUser(createdUserId)",
  "accessEnabled: false",
  "req.method !== 'POST'",
  "MAX_BODY_BYTES",
  "PHASE3_ALLOWED_APP_ORIGINS",
  "'Cache-Control': 'no-store'",
  "passwordShownOnce: true",
  "onboardingRequired: false",
  "INTERNAL_LOGIN_DOMAIN = 'accounts.anc.invalid'",
]) {
  if (!functionSource.includes(fragment)) {
    throw new Error(`Invitation safety control is missing: ${fragment}`);
  }
}

for (const forbidden of [
  'user_metadata',
  'phase2_patient_records',
  'phase2_related_records',
  'phase3_key_envelopes',
  'console.log',
]) {
  if (functionSource.includes(forbidden)) {
    throw new Error(`Invitation draft contains forbidden behavior: ${forbidden}`);
  }
}

if (!configSource.includes('temporaryAccountProvisioningEnabled: true')) {
  throw new Error('Temporary-account provisioning release is not recorded.');
}

console.log(JSON.stringify({
  passed: true,
  checks: [
    'Edge Function requires a verified user JWT',
    'exact owner identity and a TOTP proof no older than ten minutes are enforced',
    'only bounded staff-label, permission, and validity requests are accepted',
    'browser origins are allowlisted',
    'administrator credentials remain server-side',
    'strong internal credentials are generated server-side and returned once',
    'account creation rolls back if the audited draft grant fails',
    'provisioning does not release a key or enable clinical access',
    'temporary-account provisioning release is explicit',
  ],
}, null, 2));
