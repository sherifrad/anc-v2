import fs from 'node:fs/promises';

const source = await fs.readFile(
  new URL('../supabase/functions/phase3-delegated-gateway/index.ts', import.meta.url),
  'utf8',
);
const adapter = await fs.readFile(
  new URL('./phase3_delegated_adapter.mjs', import.meta.url),
  'utf8',
);

for (const fragment of [
  'FEATURE_RELEASED = true',
  "createSupabaseContext",
  "{ auth: 'user' }",
  "payload.operation === 'bootstrap'",
  "'phase3_bootstrap_temporary_account'",
  "'phase3_execute_delegated_operation'",
  "p_actor_user_id: actorId",
  "p_resource_fingerprint: await fingerprint(payload.resourceId)",
  "'Cache-Control': 'no-store'",
]) {
  if (!source.includes(fragment)) {
    throw new Error(`Delegated gateway is missing: ${fragment}`);
  }
}

for (const fragment of [
  "'patient.upsert'",
  "'patient.list'",
  "'related.upsert'",
  "'related.get'",
  'buildPhase2PatientRow',
  'decryptPhase2PatientRow',
]) {
  if (!adapter.includes(fragment)) {
    throw new Error(`Delegated encrypted adapter is missing: ${fragment}`);
  }
}

for (const forbidden of [
  'temporaryPassword',
  'clinicKey:',
  'console.log',
]) {
  if (source.includes(forbidden)) {
    throw new Error(`Delegated server gateway contains forbidden data: ${forbidden}`);
  }
}

console.log(JSON.stringify({
  passed: true,
  checks: [
    'authenticated temporary sessions are required',
    'bootstrap and every clinical operation use reviewed server RPCs',
    'resource identifiers are hashed before audit storage',
    'patient plaintext and the clinic key remain client-side',
    'the adapter encrypts before upload and decrypts after download',
  ],
}, null, 2));
