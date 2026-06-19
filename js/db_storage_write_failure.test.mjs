import fs from 'node:fs/promises';
import vm from 'node:vm';

const db = await fs.readFile(new URL('./db.js', import.meta.url), 'utf8');

function loadDbWithStorage(localStorage) {
  const context = vm.createContext({ console, localStorage });
  vm.runInContext(`${db}\nglobalThis.TEST_DB = DB;`, context);
  return context.TEST_DB;
}

const quotaStorage = {
  store: new Map(),
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  },
  setItem(key, value) {
    if (key === 'anc_patients') {
      const error = new Error('quota reached');
      error.name = 'QuotaExceededError';
      throw error;
    }
    this.store.set(key, String(value));
  },
  removeItem(key) {
    this.store.delete(key);
  },
};

const failingPatientDb = loadDbWithStorage(quotaStorage);
let patientError;
try {
  failingPatientDb.savePatient({ fullName: 'Storage Failure Test' });
} catch (error) {
  patientError = error;
}

if (patientError?.name !== 'StorageWriteError') {
  throw new Error('savePatient did not throw StorageWriteError');
}
if (patientError.key !== 'anc_patients') {
  throw new Error(`savePatient reported the wrong failed key: ${patientError.key}`);
}
if (!/quota/i.test(patientError.reason || patientError.message)) {
  throw new Error('savePatient error did not include quota reason');
}

const importStorage = {
  store: new Map(),
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  },
  setItem(key, value) {
    if (key === 'anc_visits') {
      throw new Error('simulated visit write failure');
    }
    this.store.set(key, String(value));
  },
  removeItem(key) {
    this.store.delete(key);
  },
};

const importDb = loadDbWithStorage(importStorage);
const backup = JSON.stringify({
  patients: { 'ANC-0001': { patientID: 'ANC-0001', fullName: 'Import Test Patient' } },
  visits: { 'ANC-0001': [{ date: '2026-06-18' }] },
});

let importError;
try {
  importDb.importAll(backup);
} catch (error) {
  importError = error;
}

if (importError?.name !== 'StorageWriteError') {
  throw new Error('importAll did not propagate StorageWriteError');
}
if (importError.key !== 'anc_visits') {
  throw new Error(`importAll reported the wrong failed key: ${importError.key}`);
}

if (importDb.importAll('{not json') !== false) {
  throw new Error('importAll no longer returns false for invalid JSON');
}

console.log(JSON.stringify({
  passed: true,
  checks: [
    'savePatient propagates localStorage quota failure',
    'StorageWriteError includes the failed storage key and reason',
    'importAll propagates clinical collection write failures',
    'importAll still returns false for invalid JSON',
  ],
}, null, 2));
