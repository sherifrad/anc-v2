import {
  decryptDraftPayload,
  encryptDraftPayload,
  unlockVaultWithPassphrase,
} from './phase2_crypto_draft.mjs';
import { createPhase2CloudAdapter } from './phase2_cloud_adapter.mjs';
import { PHASE2_RUNTIME } from './phase2_runtime_config.mjs';

let clinicKey = null;
let activeBatch = null;

function throwResultError(result) {
  if (result?.error) throw result.error;
  return result?.data;
}

export function validateActivationState({ vault, batches }) {
  if (
    !vault
    || vault.owner_id !== PHASE2_RUNTIME.ownerId
    || vault.key_version !== PHASE2_RUNTIME.keyVersion
    || vault.status !== 'active'
  ) {
    throw new Error('The shared clinic key is not active');
  }
  if (!Array.isArray(batches) || batches.length !== 1) {
    throw new Error('Exactly one activated Phase 2 batch is required');
  }
  const batch = batches[0];
  if (
    batch.owner_id !== PHASE2_RUNTIME.ownerId
    || batch.key_version !== PHASE2_RUNTIME.keyVersion
    || batch.status !== 'activated'
    || !batch.activated_at
  ) {
    throw new Error('The Phase 2 cloud batch is not active');
  }
  return { vault, batch };
}

export async function loadActivationState(supabaseClient) {
  const vaultResult = await supabaseClient
    .from('clinic_key_vault')
    .select(
      'owner_id,key_version,format_version,algorithm,kdf,'
      + 'wrapped_by_passphrase,wrapped_by_recovery,status',
    )
    .eq('owner_id', PHASE2_RUNTIME.ownerId)
    .eq('key_version', PHASE2_RUNTIME.keyVersion)
    .maybeSingle();
  const vault = throwResultError(vaultResult);

  const batchResult = await supabaseClient
    .from('phase2_migration_batches')
    .select('id,owner_id,key_version,status,activated_at')
    .eq('owner_id', PHASE2_RUNTIME.ownerId)
    .eq('key_version', PHASE2_RUNTIME.keyVersion)
    .eq('status', 'activated')
    .limit(2);
  const batches = throwResultError(batchResult);

  return validateActivationState({ vault, batches });
}

export async function unlockPhase2Runtime({
  supabaseClient,
  passphrase,
  runtimeEnabled=PHASE2_RUNTIME.enabled,
}) {
  if (!runtimeEnabled) throw new Error('Phase 2 runtime is disabled');
  if (!supabaseClient) throw new Error('Secure cloud session is unavailable');
  if (!passphrase) throw new Error('Enter the clinic encryption passphrase');

  const { vault, batch } = await loadActivationState(supabaseClient);
  const unlockedKey = await unlockVaultWithPassphrase({ vault, passphrase });
  const adapter = createPhase2CloudAdapter({
    supabaseClient,
    clinicKey: unlockedKey,
    ownerId: PHASE2_RUNTIME.ownerId,
    batch,
    runtimeEnabled,
  });

  clinicKey = unlockedKey;
  activeBatch = batch;
  return adapter;
}

export function isPhase2Unlocked() {
  return Boolean(clinicKey && activeBatch);
}

export function lockPhase2Runtime() {
  clinicKey = null;
  activeBatch = null;
}

function requireUnlocked() {
  if (!clinicKey || !activeBatch) {
    throw new Error('Unlock shared clinic encryption first');
  }
  return { clinicKey, batch: activeBatch };
}

function backupContext(backupId, keyVersion) {
  return {
    ownerId: PHASE2_RUNTIME.ownerId,
    table: 'phase2_backups',
    recordId: backupId,
    keyVersion,
  };
}

export async function encryptPhase2Backup(plaintext, backupId=crypto.randomUUID()) {
  const { clinicKey: key, batch } = requireUnlocked();
  return {
    backupId,
    keyVersion: batch.key_version,
    data: await encryptDraftPayload(
      key,
      plaintext,
      backupContext(backupId, batch.key_version),
    ),
  };
}

export async function decryptPhase2Backup({ data, backupId, keyVersion }) {
  const { clinicKey: key, batch } = requireUnlocked();
  if (keyVersion !== batch.key_version) {
    throw new Error('Backup key version does not match the active clinic key');
  }
  return decryptDraftPayload(
    key,
    data,
    backupContext(backupId, keyVersion),
  );
}
