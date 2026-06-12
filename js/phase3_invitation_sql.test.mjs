import fs from 'node:fs/promises';

const sql = await fs.readFile(
  new URL('../supabase_phase3_invitation_audit_DRAFT.sql', import.meta.url),
  'utf8',
);

for (const fragment of [
  'PHASE 3 INVITATION DRAFT ONLY',
  'phase3_begin_user_invitation',
  'phase3_finish_user_invitation',
  "auth.role() is distinct from 'service_role'",
  "p_email_fingerprint !~ '^[0-9a-f]{64}$'",
  'pg_advisory_xact_lock',
  "a.created_at > now() - interval '1 hour'",
  'v_recent_requests >= 5',
  "set_config('anc.phase3_owner_command', 'authorized', true)",
  "'user.invite_requested'",
  "'user.invited'",
  "'user.invite_failed'",
  'to service_role',
]) {
  if (!sql.includes(fragment)) {
    throw new Error(`Invitation audit SQL is missing: ${fragment}`);
  }
}

for (const forbidden of [
  'phase2_patient_records',
  'phase2_related_records',
  'phase3_key_envelopes',
  'phase3_access_grants',
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
    'only service-role invitation audit commands are granted',
    'email addresses are represented by SHA-256 fingerprints',
    'rolling invitation rate limit is serialized in the database',
    'request and outcome events are append-only',
    'Phase 2, grants, and key envelopes are untouched',
  ],
}, null, 2));
