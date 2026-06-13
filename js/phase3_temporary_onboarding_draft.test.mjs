import fs from 'node:fs/promises';

const edgeSource = await fs.readFile(
  new URL('../supabase/functions/phase3-complete-onboarding/index.ts', import.meta.url),
  'utf8',
);
const migrationSource = await fs.readFile(
  new URL('../supabase_phase3_direct_temporary_credentials.sql', import.meta.url),
  'utf8',
);
const provisioningSource = await fs.readFile(
  new URL('../supabase/functions/phase3-provision-user/index.ts', import.meta.url),
  'utf8',
);
const authSource = await fs.readFile(new URL('./auth.js', import.meta.url), 'utf8');

for (const fragment of [
  'Temporary account onboarding was retired.',
  'status: 410',
  "'Cache-Control': 'no-store'",
]) {
  if (!edgeSource.includes(fragment)) {
    throw new Error(`The retired onboarding endpoint is incomplete: ${fragment}`);
  }
}
for (const forbidden of [
  'createSupabaseContext',
  'updateUserById',
  'newPassword',
  'phase3_complete_temporary_onboarding',
]) {
  if (edgeSource.includes(forbidden)) {
    throw new Error(`Retired onboarding code is still present: ${forbidden}`);
  }
}

for (const forbidden of [
  "'phase3-complete-onboarding'",
  'authPasswordChangePanel',
  'authNewPassword',
  'authConfirmPassword',
]) {
  if (authSource.includes(forbidden)) {
    throw new Error(`Browser authentication still invokes removed onboarding: ${forbidden}`);
  }
}

for (const fragment of [
  "must_change_password: false",
  "onboarding_complete: true",
  "generated_credentials_final: true",
  "onboardingRequired: false",
  "accessEnabled: false",
]) {
  if (!provisioningSource.includes(fragment)) {
    throw new Error(`Final generated credential control is missing: ${fragment}`);
  }
}

for (const fragment of [
  "'invited'",
  "'draft'",
  "'generated_credentials_final', true",
  "'onboarding_required', false",
  "'access_enabled', false",
  'to service_role',
]) {
  if (!migrationSource.includes(fragment)) {
    throw new Error(`Direct credential migration is missing: ${fragment}`);
  }
}

console.log(JSON.stringify({
  passed: true,
  checks: [
    'generated username and password are the final temporary credentials',
    'the browser no longer invokes password-change onboarding',
    'the obsolete onboarding Edge Function is dormant',
    'the identity is invited while its access grant remains draft',
    'no delegated access or encryption key is released',
  ],
}, null, 2));
