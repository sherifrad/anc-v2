import fs from 'node:fs/promises';
import {
  classifySessionUser,
  isStaffUsername,
  loginIdentifier,
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

const configSource = await fs.readFile(
  new URL('./phase3_security_config.mjs', import.meta.url),
  'utf8',
);
const authSource = await fs.readFile(new URL('./auth.js', import.meta.url), 'utf8');
const htmlSource = await fs.readFile(new URL('../index.html', import.meta.url), 'utf8');

for (const fragment of [
  'temporaryAccountProvisioningEnabled: true',
  'temporaryAccountOnboardingEnabled: false',
  'delegatedAccessEnabled: true',
]) {
  if (!configSource.includes(fragment)) {
    throw new Error(`The temporary route release state is incorrect: ${fragment}`);
  }
}

for (const fragment of [
  "classifySessionUser(session.user, OWNER_UID)",
  "'phase3-delegated-gateway'",
  "operation: 'bootstrap'",
  'getTemporaryAccessContext',
  "'Email or staff username'",
]) {
  if (!authSource.includes(fragment)) {
    throw new Error(`Temporary authentication route is incomplete: ${fragment}`);
  }
}

if (htmlSource.includes('id="authPendingPanel"')) {
  throw new Error('The obsolete owner-approval waiting screen is still present.');
}
for (const removedId of ['authPasswordChangePanel', 'authNewPassword', 'authConfirmPassword']) {
  if (htmlSource.includes(`id="${removedId}"`)) {
    throw new Error(`Removed password onboarding UI is still present: ${removedId}`);
  }
}

console.log(JSON.stringify({
  passed: true,
  checks: [
    'staff usernames map to private internal Auth emails',
    'owner email login remains unchanged',
    'only trusted app metadata can identify a temporary account',
    'generated credentials bootstrap encrypted temporary access directly',
    'no staff password replacement or TOTP enrollment is presented',
    'temporary onboarding stays removed while delegated access is enabled',
  ],
}, null, 2));
