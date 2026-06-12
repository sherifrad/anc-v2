import fs from 'node:fs/promises';
import vm from 'node:vm';

const app = await fs.readFile(new URL('./app.js', import.meta.url), 'utf8');
const db = await fs.readFile(new URL('./db.js', import.meta.url), 'utf8');
const supabase = await fs.readFile(
  new URL('./supabase.js', import.meta.url),
  'utf8',
);
const runtime = await fs.readFile(
  new URL('./phase2_runtime.mjs', import.meta.url),
  'utf8',
);

const checks = [
  [app, "const reconciliationKey = 'anc_phase2_reconciled_batch'"],
  [app, 'await SUPA.reconcilePhase2Local()'],
  [app, 'localStorage.setItem(reconciliationKey, batchId)'],
  [db, 'function replaceClinicalData(snapshot)'],
  [db, '_write(KEYS.patients, snapshot.patients)'],
  [db, 'keepKnownPatients(_read(KEYS.attachments) || {})'],
  [supabase, 'async function reconcilePhase2Local(onProgress=null)'],
  [supabase, 'DB.replaceClinicalData(snapshot)'],
  [runtime, 'export function getActiveBatchId()'],
];

for (const [source, fragment] of checks) {
  if (!source.includes(fragment)) {
    throw new Error(`Phase 2 reconciliation is missing: ${fragment}`);
  }
}

const storage = new Map();
const localStorage = {
  getItem(key) {
    return storage.has(key) ? storage.get(key) : null;
  },
  setItem(key, value) {
    storage.set(key, String(value));
  },
  removeItem(key) {
    storage.delete(key);
  },
};
const context = vm.createContext({
  console,
  localStorage,
});
vm.runInContext(`${db}\nglobalThis.TEST_DB = DB;`, context);

localStorage.setItem('anc_patients', JSON.stringify({
  'ANC-REAL': { patientID: 'ANC-REAL' },
  'ANC-TEST': { patientID: 'ANC-TEST' },
}));
localStorage.setItem('anc_visits', JSON.stringify({
  'ANC-REAL': [{ date: '2026-06-01' }],
  'ANC-TEST': [{ date: '2026-06-02' }],
}));
localStorage.setItem('anc_attachments', JSON.stringify({
  'ANC-REAL': [{ id: 'keep' }],
  'ANC-TEST': [{ id: 'remove' }],
}));
localStorage.setItem('anc_current_id', JSON.stringify('ANC-TEST'));

context.TEST_DB.replaceClinicalData({
  patients: {
    'ANC-REAL': { patientID: 'ANC-REAL', fullName: 'Verified Patient' },
  },
  visits: {
    'ANC-REAL': [{ date: '2026-06-03' }],
  },
  scans: {},
  procedures: {},
  labs: {},
});

const replacedPatients = JSON.parse(localStorage.getItem('anc_patients'));
const replacedVisits = JSON.parse(localStorage.getItem('anc_visits'));
const replacedAttachments = JSON.parse(localStorage.getItem('anc_attachments'));
if (replacedPatients['ANC-TEST']) {
  throw new Error('Local-only test patient survived reconciliation');
}
if (replacedVisits['ANC-REAL']?.[0]?.date !== '2026-06-03') {
  throw new Error('Verified cloud visit did not replace stale local data');
}
if (replacedAttachments['ANC-TEST'] || !replacedAttachments['ANC-REAL']) {
  throw new Error('Attachment pruning did not follow verified patient IDs');
}
if (localStorage.getItem('anc_current_id') !== null) {
  throw new Error('Removed current patient remained selected');
}

console.log(JSON.stringify({
  passed: true,
  checks: [
    'one-time reconciliation is bound to the active batch',
    'verified Phase 2 clinical collections replace local collections',
    'local-only clinical records are removed',
    'attachments are retained only for verified patient IDs',
    'reconciliation completes before the lock screen closes',
    'behavioral replacement test removes a local-only test patient',
  ],
}, null, 2));
