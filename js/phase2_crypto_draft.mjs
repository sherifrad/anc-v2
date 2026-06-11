/*
 * PHASE 2A REVIEW DRAFT - NOT LOADED BY THE APP
 *
 * Pure Web Crypto helpers for generating and wrapping a shared Clinic Data Key.
 * No Supabase calls, localStorage writes, record migration, or UI activation.
 */

export const PHASE2_CRYPTO_DRAFT = {
  formatVersion: 1,
  algorithm: 'AES-256-GCM',
  kdf: 'PBKDF2-SHA256',
  iterations: 600000,
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

function wrappingAad(ownerId, keyVersion, purpose) {
  return encoder.encode(JSON.stringify({
    app: 'anc-emr',
    ownerId,
    keyVersion,
    purpose,
    formatVersion: PHASE2_CRYPTO_DRAFT.formatVersion,
  }));
}

async function derivePassphraseKey(passphrase, salt, iterations) {
  if (!passphrase || passphrase.length < 12) {
    throw new Error('Phase 2 clinic passphrase must be at least 12 characters');
  }

  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function benchmarkPassphraseKdfDraft({
  iterations=PHASE2_CRYPTO_DRAFT.iterations,
  runs=3,
}) {
  if (!Number.isInteger(iterations) || iterations < 100000) {
    throw new Error('Benchmark iterations must be at least 100000');
  }
  if (!Number.isInteger(runs) || runs < 1 || runs > 10) {
    throw new Error('Benchmark runs must be between 1 and 10');
  }

  const salt = randomBytes(32);
  const samplesMs = [];
  for (let index = 0; index < runs; index++) {
    const startedAt = performance.now();
    await derivePassphraseKey(
      'phase2-benchmark-only-passphrase',
      salt,
      iterations,
    );
    samplesMs.push(Math.round(performance.now() - startedAt));
  }

  return {
    iterations,
    runs,
    samplesMs,
    averageMs: Math.round(
      samplesMs.reduce((sum, value) => sum + value, 0) / samplesMs.length,
    ),
    maxMs: Math.max(...samplesMs),
  };
}

async function importAesGcmKey(rawBytes, usages) {
  return crypto.subtle.importKey(
    'raw',
    rawBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    usages,
  );
}

async function encryptRawKey(rawClinicKey, wrappingKey, aad) {
  const iv = randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    wrappingKey,
    rawClinicKey,
  );
  return {
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
  };
}

async function decryptRawKey(wrapped, wrappingKey, aad) {
  const raw = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: base64UrlToBytes(wrapped.iv),
      additionalData: aad,
    },
    wrappingKey,
    base64UrlToBytes(wrapped.ciphertext),
  );
  return new Uint8Array(raw);
}

export async function createVaultDraft({ ownerId, passphrase, keyVersion=1 }) {
  if (!ownerId) throw new Error('Owner UID is required');

  const rawClinicKey = randomBytes(32);
  const passphraseSalt = randomBytes(32);
  const recoveryKey = randomBytes(32);
  const passphraseKey = await derivePassphraseKey(
    passphrase,
    passphraseSalt,
    PHASE2_CRYPTO_DRAFT.iterations,
  );
  const recoveryWrappingKey = await importAesGcmKey(recoveryKey, ['encrypt', 'decrypt']);

  const wrappedByPassphrase = await encryptRawKey(
    rawClinicKey,
    passphraseKey,
    wrappingAad(ownerId, keyVersion, 'passphrase-wrap'),
  );
  const wrappedByRecovery = await encryptRawKey(
    rawClinicKey,
    recoveryWrappingKey,
    wrappingAad(ownerId, keyVersion, 'recovery-wrap'),
  );

  return {
    vault: {
      owner_id: ownerId,
      key_version: keyVersion,
      algorithm: PHASE2_CRYPTO_DRAFT.algorithm,
      kdf: {
        name: PHASE2_CRYPTO_DRAFT.kdf,
        iterations: PHASE2_CRYPTO_DRAFT.iterations,
        salt: bytesToBase64Url(passphraseSalt),
      },
      wrapped_by_passphrase: wrappedByPassphrase,
      wrapped_by_recovery: wrappedByRecovery,
      status: 'draft',
    },
    recoveryKey: bytesToBase64Url(recoveryKey),
  };
}

export async function unlockVaultWithPassphrase({ vault, passphrase }) {
  const passphraseKey = await derivePassphraseKey(
    passphrase,
    base64UrlToBytes(vault.kdf.salt),
    vault.kdf.iterations,
  );
  const rawClinicKey = await decryptRawKey(
    vault.wrapped_by_passphrase,
    passphraseKey,
    wrappingAad(vault.owner_id, vault.key_version, 'passphrase-wrap'),
  );
  return importAesGcmKey(rawClinicKey, ['encrypt', 'decrypt']);
}

export async function unlockVaultWithRecoveryKey({ vault, recoveryKey }) {
  const wrappingKey = await importAesGcmKey(
    base64UrlToBytes(recoveryKey),
    ['encrypt', 'decrypt'],
  );
  const rawClinicKey = await decryptRawKey(
    vault.wrapped_by_recovery,
    wrappingKey,
    wrappingAad(vault.owner_id, vault.key_version, 'recovery-wrap'),
  );
  return importAesGcmKey(rawClinicKey, ['encrypt', 'decrypt']);
}

export async function encryptDraftPayload(clinicKey, value, context) {
  const iv = randomBytes(12);
  const aad = encoder.encode(JSON.stringify(context));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    clinicKey,
    encoder.encode(JSON.stringify(value)),
  );
  return {
    version: 1,
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
  };
}

export async function decryptDraftPayload(clinicKey, encrypted, context) {
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: base64UrlToBytes(encrypted.iv),
      additionalData: encoder.encode(JSON.stringify(context)),
    },
    clinicKey,
    base64UrlToBytes(encrypted.ciphertext),
  );
  return JSON.parse(decoder.decode(plaintext));
}
