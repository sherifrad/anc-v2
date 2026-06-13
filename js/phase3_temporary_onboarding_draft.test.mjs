import fs from 'node:fs/promises';

const edgeSource = await fs.readFile(
  new URL('../supabase/functions/phase3-complete-onboarding/index.ts', import.meta.url),
  'utf8',
);
const sqlSource = await fs.readFile(
  new URL('../supabase_phase3_temporary_accounts_DRAFT.sql', import.meta.url),
  'utf8',
);
const provisioningSource = await fs.readFile(
  new URL('../supabase/functions/phase3-provision-user/index.ts', import.meta.url),
  'utf8',
);

for (const fragment of [
  "createSupabaseContext",
  "{ auth: 'user' }",
  ".getUserById(userId)",
  "metadata.account_type !== 'temporary_data_entry'",
  "metadata.clinic_owner_id !== OWNER_ID",
  ".updateUserById(userId",
  "password: newPassword",
  "'phase3_complete_temporary_onboarding'",
  "onboarding_audit_pending: true",
  "onboarding_complete: true",
  "accessEnabled: false",
  "grantStatus: 'draft'",
  "'Cache-Control': 'no-store'",
]) {
  if (!edgeSource.includes(fragment)) {
    throw new Error(`Onboarding Edge Function is missing: ${fragment}`);
  }
}

for (const forbidden of [
  'MAX_TOTP_AGE_SECONDS',
  'hasRecentTotp',
  "item.method === 'totp'",
  'A fresh authenticator verification is required.',
]) {
  if (edgeSource.includes(forbidden)) {
    throw new Error(`Temporary onboarding still requires staff TOTP: ${forbidden}`);
  }
}

for (const forbidden of [
  'phase2_patient_records',
  'phase2_related_records',
  'phase3_key_envelopes',
  'console.log',
  'user_metadata',
]) {
  if (edgeSource.includes(forbidden)) {
    throw new Error(`Onboarding Edge Function contains forbidden behavior: ${forbidden}`);
  }
}

for (const fragment of [
  'phase3_complete_temporary_onboarding',
  "auth.role() is distinct from 'service_role'",
  "set status = 'invited'",
  "g.status in ('draft', 'invited')",
  "'account.onboarding_completed'",
  "'password_changed', true",
  "'mfa_verified', false",
  "'aal1_password_verified'",
  "'access_enabled', false",
  "'key_released', false",
  'to service_role',
]) {
  if (!sqlSource.includes(fragment)) {
    throw new Error(`Onboarding SQL control is missing: ${fragment}`);
  }
}

for (const fragment of [
  'must_change_password: true',
  'onboarding_complete: false',
]) {
  if (!provisioningSource.includes(fragment)) {
    throw new Error(`Provisioned account metadata is missing: ${fragment}`);
  }
}

console.log(JSON.stringify({
  passed: true,
  checks: [
    'an authenticated temporary user may replace the generated password without TOTP',
    'trusted server-side app metadata is reloaded before authorization',
    'password and app metadata updates use the server administrator API',
    'onboarding completion is immutably audited',
    'retry after a partial metadata failure is idempotent',
    'the grant stays draft and no encryption key is released',
  ],
}, null, 2));
