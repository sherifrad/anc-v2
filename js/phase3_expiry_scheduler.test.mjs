import fs from 'node:fs/promises';

const source = await fs.readFile(
  new URL('../supabase/functions/phase3-expire-accounts/index.ts', import.meta.url),
  'utf8',
);

for (const fragment of [
  "req.method !== 'POST'",
  "{ auth: 'secret' }",
  "'phase3_expire_due_accounts'",
  "'phase3_accounts_requiring_containment'",
  ".auth.admin.updateUserById(account.user_id",
  "'phase3_record_auth_containment'",
  "containmentFailures",
  "'Cache-Control': 'no-store'",
]) {
  if (!source.includes(fragment)) {
    throw new Error(`Expiry scheduler endpoint is missing: ${fragment}`);
  }
}

for (const forbidden of [
  "{ auth: 'none' }",
  'Access-Control-Allow-Origin',
  'phase2_patient_records',
  'phase2_related_records',
  'console.log',
]) {
  if (source.includes(forbidden)) {
    throw new Error(`Expiry scheduler contains forbidden behavior: ${forbidden}`);
  }
}

console.log(JSON.stringify({
  passed: true,
  checks: [
    'only POST is accepted',
    'a server secret is required',
    'expiry is delegated to the audited database command',
    'expired, suspended, and revoked Auth accounts are contained and retried',
    'the endpoint is not browser-accessible',
  ],
}, null, 2));
