import {
  formatRecoveryCode,
  parseRecoveryCode,
} from './phase2_recovery_draft.mjs';

const recoveryKey = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde';
const formatted = await formatRecoveryCode(recoveryKey);
const parsed = await parseRecoveryCode(formatted);

if (parsed !== recoveryKey) {
  throw new Error('Recovery code round trip failed');
}
if (!formatted.startsWith('ANC2.')) {
  throw new Error('Recovery code prefix is missing');
}

const compact = formatted.replace(/\./g, '');
let compactRejected = false;
try {
  await parseRecoveryCode(compact);
} catch {
  compactRejected = true;
}
if (!compactRejected) {
  throw new Error('Recovery code without structure was not rejected');
}

const middle = Math.floor(formatted.length / 2);
const original = formatted[middle];
const replacement = original === 'A' ? 'B' : 'A';
const mistyped = formatted.slice(0, middle) + replacement + formatted.slice(middle + 1);
let typoRejected = false;
try {
  await parseRecoveryCode(mistyped);
} catch {
  typoRejected = true;
}
if (!typoRejected) {
  throw new Error('Recovery code typo was not rejected');
}

let shortKeyRejected = false;
try {
  await formatRecoveryCode('too-short');
} catch {
  shortKeyRejected = true;
}
if (!shortKeyRejected) {
  throw new Error('Short recovery key was not rejected');
}

console.log(JSON.stringify({
  passed: true,
  sampleFormat: formatted,
  checks: [
    'recovery format round trip',
    'prefix validation',
    'group structure validation',
    'typing-error checksum rejection',
    'key-length validation',
  ],
}, null, 2));
