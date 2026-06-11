/*
 * PHASE 2A RECOVERY REVIEW DRAFT - NOT LOADED BY THE APP
 *
 * Formats a base64url recovery key as grouped text with a checksum.
 */

const encoder = new TextEncoder();
const PREFIX = 'ANC2';
const GROUP_SIZE = 5;

async function checksum(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest).slice(0, 5))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

function normalize(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '');
}

function group(value) {
  return value.match(new RegExp(`.{1,${GROUP_SIZE}}`, 'g'))?.join('.') || '';
}

export async function formatRecoveryCode(base64UrlKey) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(base64UrlKey || '')) {
    throw new Error('Recovery key must be a 256-bit base64url value');
  }

  const check = await checksum(`${PREFIX}:${base64UrlKey}`);
  return `${PREFIX}.${group(base64UrlKey)}.${check}`;
}

export async function parseRecoveryCode(formattedCode) {
  const normalized = normalize(formattedCode);
  if (!normalized.startsWith(`${PREFIX}.`)) {
    throw new Error('Recovery code prefix is invalid');
  }

  const withoutPrefix = normalized.slice(PREFIX.length + 1);
  const parts = withoutPrefix.split('.').filter(Boolean);
  if (parts.length < 2) throw new Error('Recovery code is incomplete');

  const suppliedChecksum = parts.pop();
  const keyText = parts.join('');
  if (!/^[A-Za-z0-9_-]{43}$/.test(keyText)) {
    throw new Error('Recovery key content is invalid');
  }
  if (!/^[A-F0-9]{10}$/.test(suppliedChecksum)) {
    throw new Error('Recovery checksum is invalid');
  }

  const expectedChecksum = await checksum(`${PREFIX}:${keyText}`);
  if (suppliedChecksum !== expectedChecksum) {
    throw new Error('Recovery checksum failed; the code may contain a typing error');
  }

  return keyText;
}
