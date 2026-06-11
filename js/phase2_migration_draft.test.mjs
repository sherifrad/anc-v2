import {
  createVaultDraft,
  unlockVaultWithPassphrase,
} from './phase2_crypto_draft.mjs';
import {
  buildMigrationDraft,
  verifyEncryptedMigrationPackageDraft,
  verifyMigrationDraft,
  verifyMigrationDraftDeep,
} from './phase2_migration_draft.mjs';

const ownerId = 'bfcaa90e-c49c-4a94-8cfd-06a16a96a094';
const passphrase = 'review-only-clinic-passphrase';
const legacy = {
  patients: {
    'ANC-0001': {
      patientID: 'ANC-0001',
      fullName: 'Draft Patient One',
      updatedAt: '2026-06-11T00:00:00.000Z',
    },
    'ANC-0002': {
      patientID: 'ANC-0002',
      fullName: 'Draft Patient Two',
      updatedAt: '2026-06-11T01:00:00.000Z',
    },
  },
  visits: {
    'ANC-0001': [{ date: '2026-06-01', findings: 'Draft visit' }],
    'ANC-0002': [],
  },
  scans: {
    'ANC-0001': [{ date: '2026-06-02', type: 'Draft scan' }],
  },
  procedures: {},
  labs: {
    'ANC-0002': { t1: { CBC: { Hb: '11.2' } } },
  },
};

const { vault } = await createVaultDraft({ ownerId, passphrase });
const clinicKey = await unlockVaultWithPassphrase({ vault, passphrase });
const migrationPackage = await buildMigrationDraft({
  legacy,
  clinicKey,
  ownerId,
  batchId: '00000000-0000-4000-8000-000000000001',
});
const verification = verifyMigrationDraft({ legacy, migrationPackage });
const deepVerification = await verifyMigrationDraftDeep({
  legacy,
  migrationPackage,
  clinicKey,
});
const encryptedPackageVerification = await verifyEncryptedMigrationPackageDraft({
  migrationPackage,
  clinicKey,
});

if (!verification.verified) throw new Error('Migration package did not verify');
if (!deepVerification.deepVerified) throw new Error('Migration package did not deep verify');
if (!encryptedPackageVerification.verified) {
  throw new Error('Encrypted package did not verify without source');
}
if (deepVerification.decryptedRows !== 6) throw new Error('Unexpected decrypted row count');
if (verification.patientRows !== 2) throw new Error('Unexpected patient row count');
if (verification.relatedRows !== 4) throw new Error('Unexpected related row count');
if (migrationPackage.batch.status !== 'staged') throw new Error('Batch was not staged');

const missingRowPackage = {
  ...migrationPackage,
  patients: migrationPackage.patients.slice(0, 1),
};
let missingRowRejected = false;
try {
  verifyMigrationDraft({ legacy, migrationPackage: missingRowPackage });
} catch {
  missingRowRejected = true;
}
if (!missingRowRejected) throw new Error('Missing patient row was not rejected');

const wrongBatchPackage = {
  ...migrationPackage,
  related: migrationPackage.related.map((row, index) =>
    index === 0 ? { ...row, migration_batch_id: 'wrong-batch' } : row
  ),
};
let wrongBatchRejected = false;
try {
  verifyMigrationDraft({ legacy, migrationPackage: wrongBatchPackage });
} catch {
  wrongBatchRejected = true;
}
if (!wrongBatchRejected) throw new Error('Wrong batch binding was not rejected');

const malformedLegacy = {
  ...legacy,
  patients: {
    ...legacy.patients,
    'ANC-BAD': null,
  },
};
const failedPackage = await buildMigrationDraft({
  legacy: malformedLegacy,
  clinicKey,
  ownerId,
  batchId: '00000000-0000-4000-8000-000000000002',
});
if (failedPackage.batch.status !== 'failed' || failedPackage.failures.length !== 1) {
  throw new Error('Malformed record did not fail the batch');
}
let failedBatchRejected = false;
try {
  verifyMigrationDraft({ legacy: malformedLegacy, migrationPackage: failedPackage });
} catch {
  failedBatchRejected = true;
}
if (!failedBatchRejected) throw new Error('Failed batch was not rejected');

const tamperedCiphertextPackage = structuredClone(migrationPackage);
const encryptedPatient = tamperedCiphertextPackage.patients[0].encrypted_data;
const tamperIndex = Math.floor(encryptedPatient.ciphertext.length / 2);
const tamperOriginal = encryptedPatient.ciphertext[tamperIndex];
encryptedPatient.ciphertext = encryptedPatient.ciphertext.slice(0, tamperIndex)
  + (tamperOriginal === 'A' ? 'B' : 'A')
  + encryptedPatient.ciphertext.slice(tamperIndex + 1);
let tamperedCiphertextRejected = false;
try {
  await verifyMigrationDraftDeep({
    legacy,
    migrationPackage: tamperedCiphertextPackage,
    clinicKey,
  });
} catch {
  tamperedCiphertextRejected = true;
}
if (!tamperedCiphertextRejected) {
  throw new Error('Tampered migration ciphertext was not rejected');
}

const tamperedHashPackage = structuredClone(migrationPackage);
tamperedHashPackage.related[0].plaintext_sha256 = '0'.repeat(64);
let tamperedHashRejected = false;
try {
  await verifyMigrationDraftDeep({
    legacy,
    migrationPackage: tamperedHashPackage,
    clinicKey,
  });
} catch {
  tamperedHashRejected = true;
}
if (!tamperedHashRejected) {
  throw new Error('Tampered migration hash was not rejected');
}

const wrongKeyVault = await createVaultDraft({
  ownerId,
  passphrase: 'different-review-only-passphrase',
  keyVersion: 2,
});
const wrongClinicKey = await unlockVaultWithPassphrase({
  vault: wrongKeyVault.vault,
  passphrase: 'different-review-only-passphrase',
});
let wrongClinicKeyRejected = false;
try {
  await verifyMigrationDraftDeep({
    legacy,
    migrationPackage,
    clinicKey: wrongClinicKey,
  });
} catch {
  wrongClinicKeyRejected = true;
}
if (!wrongClinicKeyRejected) {
  throw new Error('Wrong Clinic Data Key was not rejected');
}

let nonJsonLegacyRejected = false;
try {
  await buildMigrationDraft({
    legacy: {
      ...legacy,
      patients: {
        ...legacy.patients,
        'ANC-0003': { patientID: 'ANC-0003', unsafe: undefined },
      },
    },
    clinicKey,
    ownerId,
  });
} catch {
  nonJsonLegacyRejected = true;
}
if (!nonJsonLegacyRejected) {
  throw new Error('Non-JSON legacy data was not rejected');
}

console.log(JSON.stringify({
  passed: true,
  checks: [
    'shadow package build',
    'patient and related row counts',
    'plaintext integrity hashes',
    'batch binding',
    'deep decrypt-and-compare verification',
    'encrypted package verification without plaintext source',
    'missing row rejection',
    'malformed record fails whole batch',
    'tampered ciphertext rejection',
    'tampered hash rejection',
    'wrong Clinic Data Key rejection',
    'non-JSON legacy data rejection',
  ],
}, null, 2));
