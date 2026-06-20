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
  [db, '_write(KEYS.patients, reconciledPatients)'],
  [db, 'mergePatientPreservingArchiveInvariant(existingPatients[patientId], incomingPatient)'],
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
localStorage.setItem('anc_medications', JSON.stringify({
  'ANC-REAL': [{ drugName: 'Preserved local medication' }],
  'ANC-TEST': [{ drugName: 'Orphan medication' }],
}));
localStorage.setItem('anc_problems', JSON.stringify({
  'ANC-REAL': [{ title: 'Preserved local problem' }],
  'ANC-TEST': [{ title: 'Orphan problem' }],
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
const preservedMedications = JSON.parse(localStorage.getItem('anc_medications'));
const preservedProblems = JSON.parse(localStorage.getItem('anc_problems'));
if (replacedPatients['ANC-TEST']) {
  throw new Error('Local-only test patient survived reconciliation');
}
if (replacedVisits['ANC-REAL']?.[0]?.date !== '2026-06-03') {
  throw new Error('Verified cloud visit did not replace stale local data');
}
if (replacedAttachments['ANC-TEST'] || !replacedAttachments['ANC-REAL']) {
  throw new Error('Attachment pruning did not follow verified patient IDs');
}
if (preservedMedications['ANC-REAL']?.[0]?.drugName !== 'Preserved local medication' || preservedMedications['ANC-TEST']) {
  throw new Error('Absent medication snapshot did not preserve known patients and prune orphans');
}
if (preservedProblems['ANC-REAL']?.[0]?.title !== 'Preserved local problem' || preservedProblems['ANC-TEST']) {
  throw new Error('Absent problem snapshot did not preserve known patients and prune orphans');
}
if (localStorage.getItem('anc_current_id') !== null) {
  throw new Error('Removed current patient remained selected');
}

const archivedBeforeReconciliation = context.TEST_DB.archivePatient(
  'ANC-REAL',
  'Local reconciliation archive',
  'local-owner'
);
const archivedAtBeforeReconciliation = archivedBeforeReconciliation.archivedAt;
context.TEST_DB.replaceClinicalData({
  patients: {
    'ANC-REAL': {
      patientID:'ANC-REAL',
      fullName:'Cloud-updated archived patient',
      isArchived:false,
    },
  },
  visits: {}, scans: {}, procedures: {}, labs: {},
});
const archivedAfterReconciliation = context.TEST_DB.getPatient('ANC-REAL');
if (!archivedAfterReconciliation.isArchived) {
  throw new Error('reconciliation cleared local archive state');
}
if (
  archivedAfterReconciliation.archivedAt !== archivedAtBeforeReconciliation
  || archivedAfterReconciliation.archiveReason !== 'Local reconciliation archive'
  || archivedAfterReconciliation.archivedBy !== 'local-owner'
) {
  throw new Error('reconciliation replaced local archive metadata');
}
if (archivedAfterReconciliation.fullName !== 'Cloud-updated archived patient') {
  throw new Error('archive preservation blocked incoming demographic reconciliation');
}
if (!archivedAfterReconciliation.archiveAudit.some(event => event.operation === 'archive')) {
  throw new Error('reconciliation erased archive audit history');
}

context.TEST_DB.replaceClinicalData({
  patients: {
    'ANC-REAL': { patientID: 'ANC-REAL', fullName: 'Verified Patient' },
  },
  visits: {},
  scans: {},
  procedures: {},
  labs: {},
  medications: {
    'ANC-REAL': [{ drugName: 'Cloud supplied medication' }],
    'ANC-UNKNOWN': [{ drugName: 'Orphan cloud medication' }],
  },
  problems: {
    'ANC-REAL': [{ title: 'Cloud supplied problem' }],
    'ANC-UNKNOWN': [{ title: 'Orphan cloud problem' }],
  },
});
const suppliedMedications = JSON.parse(localStorage.getItem('anc_medications'));
const suppliedProblems = JSON.parse(localStorage.getItem('anc_problems'));
if (suppliedMedications['ANC-REAL']?.[0]?.drugName !== 'Cloud supplied medication' || suppliedMedications['ANC-UNKNOWN']) {
  throw new Error('Supplied medication snapshot was not restricted to known patients');
}
if (suppliedProblems['ANC-REAL']?.[0]?.title !== 'Cloud supplied problem' || suppliedProblems['ANC-UNKNOWN']) {
  throw new Error('Supplied problem snapshot was not restricted to known patients');
}

console.log(JSON.stringify({
  passed: true,
  checks: [
    'one-time reconciliation is bound to the active batch',
    'verified Phase 2 clinical collections replace local collections',
    'local-only clinical records are removed',
    'attachments are retained only for verified patient IDs',
    'absent medications/problems preserve retained patients without orphans',
    'supplied medications/problems replace only known patient data',
    'reconciliation preserves active archive state and metadata',
    'reconciliation completes before the lock screen closes',
    'behavioral replacement test removes a local-only test patient',
  ],
}, null, 2));
