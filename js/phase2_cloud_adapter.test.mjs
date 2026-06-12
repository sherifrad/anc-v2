import {
  PHASE2_RUNTIME,
  buildPhase2PatientRow,
  buildPhase2RelatedRow,
  createPhase2CloudAdapter,
  decryptPhase2PatientRow,
  decryptPhase2RelatedRow,
} from './phase2_cloud_adapter.mjs';
import {
  createVaultDraft,
  unlockVaultWithPassphrase,
} from './phase2_crypto_draft.mjs';

const ownerId = PHASE2_RUNTIME.ownerId;
const passphrase = 'phase2-adapter-review-passphrase';
const { vault } = await createVaultDraft({ ownerId, passphrase });
const clinicKey = await unlockVaultWithPassphrase({ vault, passphrase });
const activeBatch = {
  id: '00000000-0000-4000-8000-000000000099',
  owner_id: ownerId,
  key_version: 1,
  status: 'activated',
};
const patient = {
  patientID: 'ANC-ADAPTER',
  fullName: 'Adapter Test Patient',
  updatedAt: '2026-06-12T00:00:00.000Z',
};
const visits = [{ date: '2026-06-12', findings: 'Adapter test' }];

const patientRow = await buildPhase2PatientRow({
  patient,
  clinicKey,
  ownerId,
  batch: activeBatch,
});
const patientResult = await decryptPhase2PatientRow({
  row: patientRow,
  clinicKey,
  ownerId,
  batch: activeBatch,
});
if (patientResult.patientID !== patient.patientID) {
  throw new Error('Phase 2 patient adapter round trip failed');
}

const relatedRow = await buildPhase2RelatedRow({
  recordType: 'visits',
  patientCode: patient.patientID,
  value: visits,
  clinicKey,
  ownerId,
  batch: activeBatch,
});
const relatedResult = await decryptPhase2RelatedRow({
  row: relatedRow,
  clinicKey,
  ownerId,
  batch: activeBatch,
});
if (relatedResult[0]?.findings !== visits[0].findings) {
  throw new Error('Phase 2 related adapter round trip failed');
}

let inactiveBatchRejected = false;
try {
  await buildPhase2PatientRow({
    patient,
    clinicKey,
    ownerId,
    batch: { ...activeBatch, status: 'activation_approved' },
  });
} catch {
  inactiveBatchRejected = true;
}
if (!inactiveBatchRejected) {
  throw new Error('Pre-activation batch was accepted for live writes');
}

let wrongBindingRejected = false;
try {
  await decryptPhase2PatientRow({
    row: { ...patientRow, migration_batch_id: crypto.randomUUID() },
    clinicKey,
    ownerId,
    batch: activeBatch,
  });
} catch {
  wrongBindingRejected = true;
}
if (!wrongBindingRejected) {
  throw new Error('Wrong active-batch binding was accepted');
}

let tamperedHashRejected = false;
try {
  await decryptPhase2RelatedRow({
    row: { ...relatedRow, plaintext_sha256: '0'.repeat(64) },
    clinicKey,
    ownerId,
    batch: activeBatch,
  });
} catch {
  tamperedHashRejected = true;
}
if (!tamperedHashRejected) {
  throw new Error('Tampered related hash was accepted');
}

let runtimeDisabled = false;
try {
  createPhase2CloudAdapter({
    supabaseClient: {},
    clinicKey,
    ownerId,
    batch: activeBatch,
    runtimeEnabled: false,
  });
} catch (error) {
  runtimeDisabled = error.message === 'Phase 2 runtime is disabled';
}
if (!runtimeDisabled) {
  throw new Error('Disabled Phase 2 runtime created a live adapter');
}

console.log(JSON.stringify({
  passed: true,
  runtimeEnabled: PHASE2_RUNTIME.enabled,
  checks: [
    'patient encrypt/decrypt round trip',
    'related encrypt/decrypt round trip',
    'pre-activation write rejection',
    'batch-binding rejection',
    'integrity-hash rejection',
    'explicitly disabled runtime blocks live adapter',
  ],
}, null, 2));
