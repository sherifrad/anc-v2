import fs from 'node:fs/promises';
import vm from 'node:vm';

const dbSource = await fs.readFile(new URL('./db.js', import.meta.url), 'utf8');

function loadDb(initial={}, failKey='') {
  const store = new Map(Object.entries(initial));
  const localStorage = {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) {
      if (key === failKey) throw new Error(`simulated failure for ${key}`);
      store.set(key, String(value));
    },
    removeItem(key) { store.delete(key); },
  };
  const context = vm.createContext({ console, localStorage });
  vm.runInContext(`${dbSource}\nglobalThis.TEST_DB = DB;`, context);
  return { DB: context.TEST_DB, store };
}

for (const [key, read] of [
  ['anc_patients', DB => DB.getAllPatients()],
  ['anc_visits', DB => DB.getVisits('ANC-0001')],
  ['anc_scans', DB => DB.getScans('ANC-0001')],
  ['anc_labs', DB => DB.getLabs('ANC-0001')],
]) {
  const { DB, store } = loadDb({ [key]: '{corrupted' });
  let error;
  try { read(DB); } catch (caught) { error = caught; }
  if (error?.name !== 'StorageReadError' || error.key !== key) {
    throw new Error(`${key} corruption did not throw StorageReadError`);
  }
  if (store.get(key) !== '{corrupted') {
    throw new Error(`${key} corruption was overwritten during read`);
  }
}

{
  const { DB, store } = loadDb({
    anc_patients: JSON.stringify({}),
    anc_visits: '{corrupted',
  });
  let error;
  try { DB.assertClinicalStorageReadable(); } catch (caught) { error = caught; }
  if (error?.name !== 'StorageReadError' || error.key !== 'anc_visits') {
    throw new Error('clinical storage preflight did not identify corrupted visits');
  }
  if (store.get('anc_visits') !== '{corrupted') {
    throw new Error('clinical storage preflight overwrote corrupted visits');
  }

  const patientsBefore = store.get('anc_patients');
  let importError;
  try {
    DB.importAll(JSON.stringify({
      patients: { 'ANC-0002': { patientID:'ANC-0002', fullName:'Import Block Test' } },
      visits: {},
    }));
  } catch (caught) {
    importError = caught;
  }
  if (importError?.name !== 'StorageReadError') {
    throw new Error('import did not stop on corrupted local clinical storage');
  }
  if (store.get('anc_patients') !== patientsBefore || store.get('anc_visits') !== '{corrupted') {
    throw new Error('import changed storage after corruption preflight failed');
  }
}

{
  const { DB } = loadDb({}, 'anc_last_save');
  DB.markChanged();
  let error;
  try { DB.clearChanged(); } catch (caught) { error = caught; }
  if (error?.name !== 'StorageWriteError' || error.key !== 'anc_last_save') {
    throw new Error('clearChanged did not propagate last-save write failure');
  }
  if (!DB.hasPendingChanges()) {
    throw new Error('clearChanged cleared pending state before metadata write succeeded');
  }
  DB.discardChanged();
  if (DB.hasPendingChanges()) {
    throw new Error('discardChanged did not explicitly clear in-memory pending state');
  }
}

console.log(JSON.stringify({
  passed: true,
  checks: [
    'corrupted clinical JSON throws StorageReadError',
    'corrupted values are not overwritten',
    'clinical storage preflight identifies corruption',
    'import cannot overwrite corrupted clinical storage',
    'clearChanged retains pending state after metadata write failure',
    'discardChanged explicitly clears pending state',
  ],
}, null, 2));
