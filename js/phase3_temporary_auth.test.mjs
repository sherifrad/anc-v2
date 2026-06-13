import fs from 'node:fs/promises';
import {
  classifySessionUser,
  isStaffUsername,
  loginIdentifier,
  passwordValidationError,
  temporaryOnboardingState,
} from './phase3_temporary_auth.mjs';

const OWNER_ID = 'bfcaa90e-c49c-4a94-8cfd-06a16a96a094';

if (!isStaffUsername('anc-ABCD2345')) {
  throw new Error('Valid staff usernames must be recognized case-insensitively.');
}
if (isStaffUsername('ANC-INVALID1')) {
  throw new Error('Ambiguous or invalid staff usernames must be rejected.');
}
if (loginIdentifier('ANC-ABCD2345') !== 'anc-abcd2345@accounts.anc.invalid') {
  throw new Error('Staff usernames must map to the private internal login address.');
}
if (loginIdentifier('owner@example.com') !== 'owner@example.com') {
  throw new Error('Owner email addresses must remain unchanged.');
}

if (classifySessionUser({ id: OWNER_ID }, OWNER_ID) !== 'owner') {
  throw new Error('The exact owner ID must remain the owner route.');
}
if (classifySessionUser({
  id: 'staff-id',
  app_metadata: {
    account_type: 'temporary_data_entry',
    clinic_owner_id: OWNER_ID,
  },
}, OWNER_ID) !== 'temporary') {
  throw new Error('Trusted app metadata must identify temporary staff.');
}
if (classifySessionUser({
  id: 'staff-id',
  user_metadata: {
    account_type: 'temporary_data_entry',
    clinic_owner_id: OWNER_ID,
  },
}, OWNER_ID) !== 'unauthorized') {
  throw new Error('User-editable metadata must never authorize staff access.');
}

if (temporaryOnboardingState({ app_metadata: {} }) !== 'password_change_required') {
  throw new Error('The temporary password must be replaced.');
}
if (temporaryOnboardingState({
  app_metadata: { must_change_password: false, onboarding_complete: true },
}) !== 'waiting_for_owner') {
  throw new Error('Completed onboarding must stop at owner approval.');
}

if (passwordValidationError('Strong-Password-92!', 'Strong-Password-92!')) {
  throw new Error('A strong matching password must pass validation.');
}
if (!passwordValidationError('short', 'short')) {
  throw new Error('Weak passwords must fail validation.');
}

const configSource = await fs.readFile(
  new URL('./phase3_security_config.mjs', import.meta.url),
  'utf8',
);
const authSource = await fs.readFile(new URL('./auth.js', import.meta.url), 'utf8');
const htmlSource = await fs.readFile(new URL('../index.html', import.meta.url), 'utf8');

for (const fragment of [
  'temporaryAccountProvisioningEnabled: true',
  'temporaryAccountOnboardingEnabled: true',
  'delegatedAccessEnabled: false',
]) {
  if (!configSource.includes(fragment)) {
    throw new Error(`The temporary route release state is incorrect: ${fragment}`);
  }
}

for (const fragment of [
  "classifySessionUser(session.user, OWNER_UID)",
  'temporaryAuth.temporaryOnboardingState(',
  "'phase3-complete-onboarding'",
  "showPanel('authPendingPanel')",
  "'Email or staff username'",
]) {
  if (!authSource.includes(fragment)) {
    throw new Error(`Temporary authentication route is incomplete: ${fragment}`);
  }
}

for (const id of [
  'authPasswordChangePanel',
  'authNewPassword',
  'authConfirmPassword',
  'authPendingPanel',
]) {
  if (!htmlSource.includes(`id="${id}"`)) {
    throw new Error(`Temporary onboarding UI is missing: ${id}`);
  }
}

console.log(JSON.stringify({
  passed: true,
  checks: [
    'staff usernames map to private internal Auth emails',
    'owner email login remains unchanged',
    'only trusted app metadata can identify a temporary account',
    'temporary staff replace the generated password without TOTP enrollment',
    'completed setup stops at owner approval',
    'temporary onboarding is released while delegated access remains disabled',
  ],
}, null, 2));
