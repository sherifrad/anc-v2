import fs from 'node:fs/promises';
import vm from 'node:vm';

const dbSource = await fs.readFile(new URL('./db.js', import.meta.url), 'utf8');

function loadDb(initial={}) {
  const store = new Map(Object.entries(initial));
  const localStorage = {
    getItem(key){ return store.has(key) ? store.get(key) : null; },
    setItem(key, value){ store.set(key, String(value)); },
    removeItem(key){ store.delete(key); },
  };
  const context = vm.createContext({ console, localStorage });
  vm.runInContext(`${dbSource}\nglobalThis.TEST_DB = DB;`, context);
  return { DB:context.TEST_DB, store };
}

const invalidCases = [
  ['anc_patients', [], 'patients top-level array'],
  ['anc_patients', { 'ANC-1':null }, 'patients null child'],
  ['anc_visits', [], 'visits top-level array'],
  ['anc_visits', { 'ANC-1':{} }, 'visits non-array child'],
  ['anc_scans', { 'ANC-1':'invalid' }, 'scans non-array child'],
  ['anc_procedures', 'invalid', 'procedures string'],
  ['anc_labs', [], 'labs top-level array'],
  ['anc_labs', { 'ANC-1':[] }, 'labs non-object child'],
  ['anc_attachments', { 'ANC-1':{} }, 'attachments non-array child'],
  ['anc_medications', 'invalid', 'medications string'],
  ['anc_problems', { 'ANC-1':null }, 'problems null child'],
  ['anc_audit_events_v1', {}, 'audit top-level object'],
  ['anc_audit_events_v1', [null], 'audit null child'],
];

for (const [key, value, label] of invalidCases) {
  const raw = JSON.stringify(value);
  const { DB, store } = loadDb({ [key]:raw });
  let error;
  try { DB.assertClinicalStorageReadable(); } catch (caught) { error = caught; }
  if (error?.name !== 'StorageShapeError' || error.key !== key) {
    throw new Error(`${label} did not throw StorageShapeError`);
  }
  if (store.get(key) !== raw) throw new Error(`${label} modified raw storage`);
}

const valid = loadDb({
  anc_patients:JSON.stringify({}), anc_visits:JSON.stringify({}), anc_scans:JSON.stringify({}),
  anc_procedures:JSON.stringify({}), anc_labs:JSON.stringify({}), anc_attachments:JSON.stringify({}),
  anc_medications:JSON.stringify({}), anc_problems:JSON.stringify({}), anc_audit_events_v1:JSON.stringify([]),
});
if (!valid.DB.assertClinicalStorageReadable()) throw new Error('valid empty collections were rejected');

{
  const raw = JSON.stringify([]);
  const { DB, store } = loadDb({ anc_patients:JSON.stringify({}), anc_visits:raw });
  let saveError;
  try { DB.saveVisits('ANC-1', [{ notes:'must not overwrite corruption' }]); } catch (caught) { saveError = caught; }
  if (saveError?.name !== 'StorageShapeError' || store.get('anc_visits') !== raw) {
    throw new Error('clinical write overwrote structurally invalid collection');
  }
  let importError;
  try { DB.importAll(JSON.stringify({ patients:{} })); } catch (caught) { importError = caught; }
  if (importError?.name !== 'StorageShapeError' || store.get('anc_visits') !== raw) {
    throw new Error('import overwrote structurally invalid collection');
  }
}

{
  const { DB, store } = loadDb({ anc_patients:JSON.stringify({}) });
  let importError;
  try {
    DB.importAll(JSON.stringify({ patients:{}, visits:[] }));
  } catch (caught) { importError = caught; }
  if (importError?.name !== 'StorageShapeError' || store.get('anc_patients') !== '{}') {
    throw new Error('invalid import payload shape was accepted or changed storage');
  }
  let reconciliationError;
  try {
    DB.replaceClinicalData({ patients:[], visits:{} });
  } catch (caught) { reconciliationError = caught; }
  if (reconciliationError?.name !== 'StorageShapeError' || store.get('anc_patients') !== '{}') {
    throw new Error('invalid reconciliation payload shape was accepted or changed storage');
  }
}

console.log(JSON.stringify({
  passed:true,
  checks:[
    'all clinical collections reject invalid top-level shapes',
    'map collections reject invalid immediate children',
    'valid empty maps and audit arrays are accepted',
    'blocked save and import preserve raw structurally invalid storage',
    'invalid import and reconciliation payload shapes are rejected before writes',
  ],
}, null, 2));
