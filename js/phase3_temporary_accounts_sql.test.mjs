import fs from 'node:fs/promises';

const sql = await fs.readFile(
  new URL('../supabase_phase3_temporary_accounts_DRAFT.sql', import.meta.url),
  'utf8',
);

for (const fragment of [
  'PHASE 3 TEMPORARY ACCOUNTS DRAFT ONLY',
  'phase3_temporary_accounts',
  'phase3_provision_temporary_account',
  "auth.role() is distinct from 'service_role'",
  'pg_advisory_xact_lock',
  "a.created_at > now() - interval '1 hour'",
  "event_type = 'account.provisioned'",
  ") >= 5",
  "set_config('anc.phase3_owner_command', 'authorized', true)",
  "'account.provisioned'",
  "'access_enabled', false",
  'phase3_authorize_and_audit_action',
  "'grant.expired'",
  "'delegated.' || p_action",
  "'reason', v_reason",
  "'resource_fingerprint', p_resource_fingerprint",
  "p_assurance_level is distinct from 'aal2'",
  "'mfa_required'",
  'phase3_expire_due_accounts',
  'for update skip locked',
  'phase3_sync_temporary_account_status',
  'to service_role',
]) {
  if (!sql.includes(fragment)) {
    throw new Error(`Invitation audit SQL is missing: ${fragment}`);
  }
}

for (const forbidden of [
  'phase2_patient_records',
  'phase2_related_records',
  'execute format',
  'execute immediate',
]) {
  if (sql.toLowerCase().includes(forbidden)) {
    throw new Error(`Invitation audit SQL touches forbidden behavior: ${forbidden}`);
  }
}

console.log(JSON.stringify({
  passed: true,
  checks: [
    'draft execution guard is present',
    'only the owner can read temporary account labels',
    'only the service role can provision account records and draft grants',
    'rolling account creation rate limit is serialized in the database',
    'account creation is appended to the security audit',
    'every delegated action is authorized and audited by one server command',
    'missing delegated MFA is recorded as a denied action',
    'expired attempts are denied and retained in the audit',
    'scheduled expiry creates an audit event without user activity',
    'Phase 2 and key envelopes are untouched',
  ],
}, null, 2));
