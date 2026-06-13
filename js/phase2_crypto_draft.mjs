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
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

function assertOwnerAndVersion(ownerId, keyVersion) {
  if (!UUID_PATTERN.test(ownerId || '')) {
    throw new Error('Owner UID must be a valid UUID');
  }
  if (!Number.isInteger(keyVersion) || keyVersion < 1) {
    throw new Error('Key version must be a positive integer');
  }
}

function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('JSON values must contain finite numbers');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => {
      if (item === undefined) throw new Error('JSON arrays cannot contain undefined');
      return canonicalJson(item);
    }).join(',')}]`;
  }
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(key => {
      if (value[key] === undefined) {
        throw new Error('JSON objects cannot contain undefined');
      }
      return `${JSON.stringify(key)}:${canonicalJson(value[key])}`;
    }).join(',')}}`;
  }
  throw new Error('Value must be plain JSON data');
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlToBytes(value, { expectedLength, minimumLength=1 }={}) {
  if (
    typeof value !== 'string'
    || !BASE64URL_PATTERN.test(value)
    || value.length % 4 === 1
  ) {
    throw new Error('Invalid base64url value');
  }
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  let binary;
  try {
    binary = atob(padded);
  } catch {
    throw new Error('Invalid base64url value');
  }
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  if (expectedLength != null && bytes.length !== expectedLength) {
    throw new Error(`Decoded value must be ${expectedLength} bytes`);
  }
  if (bytes.length < minimumLength) throw new Error('Decoded value is too short');
  return bytes;
}

function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

function wrappingAad(ownerId, keyVersion, purpose) {
  return encoder.encode(canonicalJson({
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

async function importAesGcmKey(rawBytes, usages, { extractable=false } = {}) {
  return crypto.subtle.importKey(
    'raw',
    rawBytes,
    { name: 'AES-GCM', length: 256 },
    extractable,
    usages,
  );
}

function grantWrappingAad({
  ownerId,
  granteeUserId,
  grantId,
  keyVersion,
}) {
  assertOwnerAndVersion(ownerId, keyVersion);
  if (!UUID_PATTERN.test(granteeUserId || '') || !UUID_PATTERN.test(grantId || '')) {
    throw new Error('Grant envelope identity is invalid');
  }
  return encoder.encode(canonicalJson({
    app: 'anc-emr',
    ownerId,
    granteeUserId,
    grantId,
    keyVersion,
    purpose: 'temporary-data-entry',
    formatVersion: PHASE2_CRYPTO_DRAFT.formatVersion,
  }));
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
  if (!wrapped || typeof wrapped !== 'object') {
    throw new Error('Wrapped key data is missing');
  }
  const raw = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: base64UrlToBytes(wrapped.iv, { expectedLength: 12 }),
      additionalData: aad,
    },
    wrappingKey,
    base64UrlToBytes(wrapped.ciphertext, { minimumLength: 48 }),
  );
  if (raw.byteLength !== 32) throw new Error('Unwrapped Clinic Data Key is invalid');
  return new Uint8Array(raw);
}

export async function createVaultDraft({ ownerId, passphrase, keyVersion=1 }) {
  assertOwnerAndVersion(ownerId, keyVersion);

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
      format_version: PHASE2_CRYPTO_DRAFT.formatVersion,
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

function validateVault(vault) {
  if (!vault || typeof vault !== 'object') throw new Error('Vault data is required');
  assertOwnerAndVersion(vault.owner_id, vault.key_version);
  if (vault.format_version !== PHASE2_CRYPTO_DRAFT.formatVersion) {
    throw new Error('Unsupported vault format version');
  }
  if (vault.algorithm !== PHASE2_CRYPTO_DRAFT.algorithm) {
    throw new Error('Unsupported vault encryption algorithm');
  }
  if (
    !vault.kdf
    || vault.kdf.name !== PHASE2_CRYPTO_DRAFT.kdf
    || vault.kdf.iterations !== PHASE2_CRYPTO_DRAFT.iterations
  ) {
    throw new Error('Unsupported or weakened vault KDF configuration');
  }
  if (!['draft', 'active', 'retired'].includes(vault.status)) {
    throw new Error('Vault status is invalid');
  }
  base64UrlToBytes(vault.kdf.salt, { expectedLength: 32 });
}

export async function unlockVaultWithPassphrase({ vault, passphrase }) {
  validateVault(vault);
  const passphraseKey = await derivePassphraseKey(
    passphrase,
    base64UrlToBytes(vault.kdf.salt, { expectedLength: 32 }),
    vault.kdf.iterations,
  );
  const rawClinicKey = await decryptRawKey(
    vault.wrapped_by_passphrase,
    passphraseKey,
    wrappingAad(vault.owner_id, vault.key_version, 'passphrase-wrap'),
  );
  return importAesGcmKey(
    rawClinicKey,
    ['encrypt', 'decrypt'],
    { extractable: true },
  );
}

export async function unlockVaultWithRecoveryKey({ vault, recoveryKey }) {
  validateVault(vault);
  const wrappingKey = await importAesGcmKey(
    base64UrlToBytes(recoveryKey, { expectedLength: 32 }),
    ['encrypt', 'decrypt'],
  );
  const rawClinicKey = await decryptRawKey(
    vault.wrapped_by_recovery,
    wrappingKey,
    wrappingAad(vault.owner_id, vault.key_version, 'recovery-wrap'),
  );
  return importAesGcmKey(
    rawClinicKey,
    ['encrypt', 'decrypt'],
    { extractable: true },
  );
}

export async function createTemporaryGrantEnvelope({
  clinicKey,
  password,
  ownerId,
  granteeUserId,
  grantId,
  keyVersion,
}) {
  if (!clinicKey) throw new Error('Unlock clinic encryption before activation');
  const salt = randomBytes(32);
  const wrappingKey = await derivePassphraseKey(
    password,
    salt,
    PHASE2_CRYPTO_DRAFT.iterations,
  );
  const rawClinicKey = new Uint8Array(
    await crypto.subtle.exportKey('raw', clinicKey),
  );
  try {
    return {
      format_version: PHASE2_CRYPTO_DRAFT.formatVersion,
      algorithm: PHASE2_CRYPTO_DRAFT.algorithm,
      wrapping_method: 'password-pbkdf2-sha256',
      wrapped_key: {
        kdf: {
          name: PHASE2_CRYPTO_DRAFT.kdf,
          iterations: PHASE2_CRYPTO_DRAFT.iterations,
          salt: bytesToBase64Url(salt),
        },
        ...await encryptRawKey(
          rawClinicKey,
          wrappingKey,
          grantWrappingAad({
            ownerId,
            granteeUserId,
            grantId,
            keyVersion,
          }),
        ),
      },
    };
  } finally {
    rawClinicKey.fill(0);
  }
}

export async function unlockTemporaryGrantEnvelope({
  envelope,
  password,
  ownerId,
  granteeUserId,
  grantId,
  keyVersion,
}) {
  if (
    !envelope
    || envelope.format_version !== PHASE2_CRYPTO_DRAFT.formatVersion
    || envelope.algorithm !== PHASE2_CRYPTO_DRAFT.algorithm
    || envelope.wrapping_method !== 'password-pbkdf2-sha256'
    || envelope.wrapped_key?.kdf?.name !== PHASE2_CRYPTO_DRAFT.kdf
    || envelope.wrapped_key?.kdf?.iterations !== PHASE2_CRYPTO_DRAFT.iterations
  ) {
    throw new Error('Temporary key envelope is invalid');
  }
  const wrappingKey = await derivePassphraseKey(
    password,
    base64UrlToBytes(envelope.wrapped_key.kdf.salt, { expectedLength: 32 }),
    envelope.wrapped_key.kdf.iterations,
  );
  const rawClinicKey = await decryptRawKey(
    envelope.wrapped_key,
    wrappingKey,
    grantWrappingAad({
      ownerId,
      granteeUserId,
      grantId,
      keyVersion,
    }),
  );
  try {
    return await importAesGcmKey(
      rawClinicKey,
      ['encrypt', 'decrypt'],
      { extractable: true },
    );
  } finally {
    rawClinicKey.fill(0);
  }
}

export async function encryptDraftPayload(clinicKey, value, context) {
  if (!clinicKey) throw new Error('Clinic Data Key is required');
  const iv = randomBytes(12);
  const aad = encoder.encode(canonicalJson(context));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    clinicKey,
    encoder.encode(canonicalJson(value)),
  );
  return {
    version: 1,
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
  };
}

export async function decryptDraftPayload(clinicKey, encrypted, context) {
  if (!clinicKey) throw new Error('Clinic Data Key is required');
  if (!encrypted || encrypted.version !== PHASE2_CRYPTO_DRAFT.formatVersion) {
    throw new Error('Encrypted payload version is unsupported');
  }
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: base64UrlToBytes(encrypted.iv, { expectedLength: 12 }),
      additionalData: encoder.encode(canonicalJson(context)),
    },
    clinicKey,
    base64UrlToBytes(encrypted.ciphertext, { minimumLength: 16 }),
  );
  return JSON.parse(decoder.decode(plaintext));
}
