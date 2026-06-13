import {
  createVaultDraft,
  createTemporaryGrantEnvelope,
  decryptDraftPayload,
  encryptDraftPayload,
  unlockVaultWithPassphrase,
  unlockVaultWithRecoveryKey,
  unlockTemporaryGrantEnvelope,
} from './phase2_crypto_draft.mjs';

const ownerId = 'bfcaa90e-c49c-4a94-8cfd-06a16a96a094';
const passphrase = 'review-only-clinic-passphrase';
const context = {
  ownerId,
  table: 'patients',
  recordId: 'ANC-TEST',
  keyVersion: 1,
};
const patient = {
  patientID: 'ANC-TEST',
  fullName: 'Draft Test Record',
};

const { vault, recoveryKey } = await createVaultDraft({
  ownerId,
  passphrase,
});

if (vault.status !== 'draft') {
  throw new Error('New vault was not created in draft status');
}
if (vault.kdf.iterations !== 600000) {
  throw new Error('Unexpected PBKDF2 iteration count');
}

const passphraseKey = await unlockVaultWithPassphrase({ vault, passphrase });
const encrypted = await encryptDraftPayload(passphraseKey, patient, context);
const encryptedAgain = await encryptDraftPayload(passphraseKey, patient, context);
const passphraseResult = await decryptDraftPayload(passphraseKey, encrypted, context);

const recoveredKey = await unlockVaultWithRecoveryKey({ vault, recoveryKey });
const recoveryResult = await decryptDraftPayload(recoveredKey, encrypted, context);

const granteeUserId = '11111111-1111-4111-8111-111111111111';
const grantId = '22222222-2222-4222-8222-222222222222';
const staffPassword = 'Generated-Temporary-Password-92!';
const grantEnvelope = await createTemporaryGrantEnvelope({
  clinicKey: passphraseKey,
  password: staffPassword,
  ownerId,
  granteeUserId,
  grantId,
  keyVersion: vault.key_version,
});
const delegatedKey = await unlockTemporaryGrantEnvelope({
  envelope: grantEnvelope,
  password: staffPassword,
  ownerId,
  granteeUserId,
  grantId,
  keyVersion: vault.key_version,
});
const delegatedResult = await decryptDraftPayload(
  delegatedKey,
  encrypted,
  context,
);

if (encrypted.iv === encryptedAgain.iv) {
  throw new Error('Payload encryption reused an IV');
}
if (encrypted.ciphertext === encryptedAgain.ciphertext) {
  throw new Error('Repeated payload encryption produced identical ciphertext');
}
if (
  passphraseResult.patientID !== patient.patientID
  || passphraseResult.fullName !== patient.fullName
) {
  throw new Error('Passphrase round trip failed');
}
if (
  recoveryResult.patientID !== patient.patientID
  || recoveryResult.fullName !== patient.fullName
) {
  throw new Error('Recovery round trip failed');
}
if (delegatedResult.patientID !== patient.patientID) {
  throw new Error('Temporary grant envelope round trip failed');
}

let wrongPassphraseRejected = false;
try {
  await unlockVaultWithPassphrase({ vault, passphrase: 'incorrect-passphrase' });
} catch {
  wrongPassphraseRejected = true;
}
if (!wrongPassphraseRejected) {
  throw new Error('Wrong passphrase was not rejected');
}

let wrongContextRejected = false;
try {
  await decryptDraftPayload(passphraseKey, encrypted, {
    ...context,
    recordId: 'ANC-TAMPERED',
  });
} catch {
  wrongContextRejected = true;
}
if (!wrongContextRejected) {
  throw new Error('Modified record context was not rejected');
}

let wrongRecoveryKeyRejected = false;
try {
  const { recoveryKey: unrelatedRecoveryKey } = await createVaultDraft({
    ownerId,
    passphrase,
    keyVersion: 2,
  });
  await unlockVaultWithRecoveryKey({
    vault,
    recoveryKey: unrelatedRecoveryKey,
  });
} catch {
  wrongRecoveryKeyRejected = true;
}
if (!wrongRecoveryKeyRejected) {
  throw new Error('Wrong recovery key was not rejected');
}

let wrongOwnerRejected = false;
try {
  await unlockVaultWithPassphrase({
    vault: {
      ...vault,
      owner_id: '00000000-0000-0000-0000-000000000000',
    },
    passphrase,
  });
} catch {
  wrongOwnerRejected = true;
}
if (!wrongOwnerRejected) {
  throw new Error('Modified owner UID was not rejected');
}

let wrongVersionRejected = false;
try {
  await unlockVaultWithPassphrase({
    vault: {
      ...vault,
      key_version: vault.key_version + 1,
    },
    passphrase,
  });
} catch {
  wrongVersionRejected = true;
}
if (!wrongVersionRejected) {
  throw new Error('Modified key version was not rejected');
}

let tamperedCiphertextRejected = false;
try {
  const index = Math.floor(encrypted.ciphertext.length / 2);
  const original = encrypted.ciphertext[index];
  const replacement = original === 'A' ? 'B' : 'A';
  await decryptDraftPayload(passphraseKey, {
    ...encrypted,
    ciphertext: encrypted.ciphertext.slice(0, index)
      + replacement
      + encrypted.ciphertext.slice(index + 1),
  }, context);
} catch {
  tamperedCiphertextRejected = true;
}
if (!tamperedCiphertextRejected) {
  throw new Error('Modified ciphertext was not rejected');
}

let malformedVaultRejected = false;
try {
  await unlockVaultWithPassphrase({
    vault: {
      ...vault,
      kdf: {
        ...vault.kdf,
        salt: 'invalid!',
      },
    },
    passphrase,
  });
} catch {
  malformedVaultRejected = true;
}
if (!malformedVaultRejected) {
  throw new Error('Malformed vault data was not rejected');
}

let weakenedKdfRejected = false;
try {
  await unlockVaultWithPassphrase({
    vault: {
      ...vault,
      kdf: { ...vault.kdf, iterations: 1000 },
    },
    passphrase,
  });
} catch {
  weakenedKdfRejected = true;
}
if (!weakenedKdfRejected) {
  throw new Error('Weakened KDF configuration was not rejected');
}

let unsupportedFormatRejected = false;
try {
  await unlockVaultWithPassphrase({
    vault: { ...vault, format_version: 999 },
    passphrase,
  });
} catch {
  unsupportedFormatRejected = true;
}
if (!unsupportedFormatRejected) {
  throw new Error('Unsupported vault format was not rejected');
}

let malformedPayloadRejected = false;
try {
  await decryptDraftPayload(passphraseKey, {
    ...encrypted,
    version: 999,
  }, context);
} catch {
  malformedPayloadRejected = true;
}
if (!malformedPayloadRejected) {
  throw new Error('Unsupported payload format was not rejected');
}

let nonJsonPayloadRejected = false;
try {
  await encryptDraftPayload(passphraseKey, { unsafe: undefined }, context);
} catch {
  nonJsonPayloadRejected = true;
}
if (!nonJsonPayloadRejected) {
  throw new Error('Non-JSON payload was not rejected');
}

console.log(JSON.stringify({
  passed: true,
  checks: [
    'draft status and KDF configuration',
    'passphrase unwrap',
    'recovery unwrap',
    'password-wrapped temporary grant unwrap',
    'payload round trip',
    'unique IV and ciphertext generation',
    'wrong passphrase rejection',
    'record-context tamper rejection',
    'wrong recovery key rejection',
    'owner UID binding',
    'key-version binding',
    'ciphertext tamper rejection',
    'malformed vault rejection',
    'weakened KDF rejection',
    'unsupported vault and payload version rejection',
    'non-JSON payload rejection',
  ],
}, null, 2));
