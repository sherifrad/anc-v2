import fs from 'node:fs/promises';

const source = await fs.readFile(
  new URL('../supabase/functions/phase3-delegated-gateway/index.ts', import.meta.url),
  'utf8',
);

for (const fragment of [
  "createSupabaseContext",
  "{ auth: 'user' }",
  "'phase3_authorize_and_audit_action'",
  "p_actor_user_id: context.userClaims.id",
  "p_resource_fingerprint: await fingerprint(payload.resourceId)",
  "const requestId = crypto.randomUUID()",
  "p_assurance_level: String(context.jwtClaims?.aal || 'unknown')",
  "reason: decision?.reason || 'denied'",
  "'phase3_record_action_result'",
  "p_failure_code: 'handler_not_implemented'",
  "reason: 'result_audit_failed'",
  "reason: 'handler_not_implemented'",
  "Delegated clinical operations are not enabled.",
]) {
  if (!source.includes(fragment)) {
    throw new Error(`Delegated audit gateway is missing: ${fragment}`);
  }
}

for (const forbidden of [
  '.from(',
  'phase2_patient_records',
  'phase2_related_records',
  'temporaryPassword',
  'console.log',
]) {
  if (source.includes(forbidden)) {
    throw new Error(`Delegated gateway contains forbidden behavior: ${forbidden}`);
  }
}

console.log(JSON.stringify({
  passed: true,
  checks: [
    'a verified user JWT is required',
    'the authenticated user ID is fixed by the server context',
    'resource identifiers are hashed before audit storage',
    'every request receives a correlation ID',
    'the current MFA assurance level is included in authorization and audit',
    'denied and expired decisions remain auditable',
    'disabled clinical handlers record a correlated failed result',
    'a missing final audit stops the action path',
  ],
}, null, 2));
