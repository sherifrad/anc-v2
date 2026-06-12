import {
  decryptPhase2Backup,
  encryptPhase2Backup,
  isPhase2Unlocked,
  lockPhase2Runtime,
  unlockPhase2Runtime,
  validateActivationState,
} from './phase2_runtime.mjs';
import { createVaultDraft } from './phase2_crypto_draft.mjs';
import { PHASE2_RUNTIME } from './phase2_runtime_config.mjs';

const passphrase = 'phase2-runtime-review-passphrase';
const created = await createVaultDraft({
  ownerId: PHASE2_RUNTIME.ownerId,
  passphrase,
});
const vault = { ...created.vault, status: 'active' };
const batch = {
  id: '00000000-0000-4000-8000-000000000088',
  owner_id: PHASE2_RUNTIME.ownerId,
  key_version: PHASE2_RUNTIME.keyVersion,
  status: 'activated',
  activated_at: '2026-06-12T10:00:00.000Z',
};

function createQuery(result, terminalMethod) {
  const query = {
    select() { return query; },
    eq() { return query; },
    limit() {
      if (terminalMethod !== 'limit') throw new Error('Unexpected limit query');
      return Promise.resolve(result);
    },
    maybeSingle() {
      if (terminalMethod !== 'maybeSingle') {
        throw new Error('Unexpected maybeSingle query');
      }
      return Promise.resolve(result);
    },
  };
  return query;
}

const supabaseClient = {
  from(table) {
    if (table === 'clinic_key_vault') {
      return createQuery({ data: vault, error: null }, 'maybeSingle');
    }
    if (table === 'phase2_migration_batches') {
      return createQuery({ data: [batch], error: null }, 'limit');
    }
    throw new Error(`Unexpected table ${table}`);
  },
};

let disabledRejected = false;
try {
  await unlockPhase2Runtime({
    supabaseClient,
    passphrase,
    runtimeEnabled: false,
  });
} catch (error) {
  disabledRejected = error.message === 'Phase 2 runtime is disabled';
}
if (!disabledRejected) throw new Error('Disabled runtime unlock was accepted');

await unlockPhase2Runtime({
  supabaseClient,
  passphrase,
});
if (!isPhase2Unlocked()) throw new Error('Shared clinic key did not unlock');

const plaintext = JSON.stringify({
  patients: { 'ANC-TEST': { patientID: 'ANC-TEST' } },
});
const encrypted = await encryptPhase2Backup(plaintext);
const decrypted = await decryptPhase2Backup(encrypted);
if (decrypted !== plaintext) throw new Error('Shared-key backup round trip failed');

let preactivationRejected = false;
try {
  validateActivationState({
    vault,
    batches: [{ ...batch, status: 'activation_approved', activated_at: null }],
  });
} catch {
  preactivationRejected = true;
}
if (!preactivationRejected) {
  throw new Error('Pre-activation state was accepted by the runtime');
}

lockPhase2Runtime();
if (isPhase2Unlocked()) throw new Error('Shared clinic key remained in memory');

console.log(JSON.stringify({
  passed: true,
  checks: [
    'disabled runtime rejects unlock',
    'active vault and batch unlock',
    'shared-key backup round trip',
    'pre-activation state rejection',
    'in-memory key lock',
  ],
}, null, 2));
