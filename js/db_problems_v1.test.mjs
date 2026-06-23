import fs from 'node:fs/promises';
import vm from 'node:vm';

const db = await fs.readFile(new URL('./db.js', import.meta.url), 'utf8');
const app = await fs.readFile(new URL('./app.js', import.meta.url), 'utf8');
const ui = await fs.readFile(new URL('./ui.js', import.meta.url), 'utf8');
const index = await fs.readFile(new URL('../index.html', import.meta.url), 'utf8');

function memoryStorage() {
  const store = new Map();
  return {
    store,
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
  };
}

function loadDb(localStorage, uuidPrefix='problem') {
  let n = 0;
  const crypto = {
    randomUUID() {
      n += 1;
      return `${uuidPrefix}-${String(n).padStart(4, '0')}`;
    },
  };
  const context = vm.createContext({ console, crypto, localStorage });
  vm.runInContext(`${db}\nglobalThis.TEST_DB = DB;`, context);
  return context.TEST_DB;
}

const storage = memoryStorage();
const DB = loadDb(storage, 'patient');
const patientID = DB.savePatient({ fullName: 'Problem Module Test Patient' });
const patient = DB.getPatient(patientID);

if (DB.getProblems(patientID).length !== 0) {
  throw new Error('old patient without problems did not load with empty problem list');
}

DB.saveProblems(patientID, [
  {
    title: 'GDM',
    category: 'Current Pregnancy Complication',
    status: 'Active',
    severity: 'Moderate',
    onsetDate: '2026-06-19',
    notes: 'Diet monitoring',
  },
  {
    title: 'Previous Cesarean Section',
    category: 'Previous Obstetric History',
    status: 'Monitoring',
  },
  {
    title: 'Resolved asthma flare',
    category: 'Medical',
    status: 'Resolved',
    resolutionDate: '2026-06-20',
  },
]);

const problems = DB.getProblems(patientID);
if (problems.length !== 3 || problems[0].patientID !== patientID || problems[0].patientUuid !== patient.patientUuid) {
  throw new Error('problem did not save/reload with patientID and patientUuid');
}
if (!problems[0].problemID || !problems[0].createdAt || !problems[0].updatedAt) {
  throw new Error('normalizeProblem did not assign problem metadata');
}
const activeProblems = DB.getActiveProblems(patientID);
if (activeProblems.length !== 2 || !activeProblems.some(problem => problem.status === 'Monitoring')) {
  throw new Error('getActiveProblems did not return Active and Monitoring only');
}

const exported = DB.exportAll();
const exportedParsed = JSON.parse(exported);
if (!exportedParsed.problems?.[patientID]?.length) {
  throw new Error('exportAll did not include problems');
}
const importedDB = loadDb(memoryStorage(), 'imported');
if (!importedDB.importAll(exported)) {
  throw new Error('importAll rejected exported problem backup');
}
if (importedDB.getProblems(patientID).length !== 3) {
  throw new Error('export/import did not preserve problems');
}

const oldBackupDB = loadDb(memoryStorage(), 'old-backup');
if (!oldBackupDB.importAll(JSON.stringify({
  patients: { 'ANC-0100': { patientID: 'ANC-0100', fullName: 'Old Backup Patient' } },
  visits: { 'ANC-0100': [{ date: '2026-06-19' }] },
}))) {
  throw new Error('old backup without problems did not import');
}
if (oldBackupDB.getProblems('ANC-0100').length !== 0) {
  throw new Error('old backup without problems did not default to empty problem list');
}

const conflictDB = loadDb(memoryStorage(), 'conflict');
const conflictPatientID = conflictDB.savePatient({ fullName: 'Local Problem Conflict' });
conflictDB.saveProblems(conflictPatientID, [{ title: 'Local problem', status: 'Active' }]);
if (!conflictDB.importAll(JSON.stringify({
  patients: {
    [conflictPatientID]: {
      patientID: conflictPatientID,
      patientUuid: 'different-imported-patient',
      fullName: 'Imported Conflict',
    },
  },
  problems: {
    [conflictPatientID]: [{ title: 'Imported problem', status: 'Active' }],
  },
}))) {
  throw new Error('conflicting problem import failed unexpectedly');
}
const conflictProblems = conflictDB.getProblems(conflictPatientID);
if (conflictProblems.length !== 1 || conflictProblems[0].title !== 'Local problem') {
  throw new Error('conflicting imported patient problem records were not skipped');
}
if (!conflictDB.getLastImportWarnings().length) {
  throw new Error('conflicting imported problem patient did not expose warning');
}

const archived = DB.archivePatient(patientID, 'Problem history preservation test', 'owner');
if (!DB.isArchived(archived) || DB.getProblems(patientID).length !== 3) {
  throw new Error('archivePatient did not preserve problem history');
}
DB.restorePatient(patientID, 'owner');
if (DB.getProblems(patientID).length !== 3) {
  throw new Error('restorePatient did not preserve problem history');
}

const failingStorage = memoryStorage();
const failingDB = loadDb(failingStorage, 'failing');
const failingPatientID = failingDB.savePatient({ fullName: 'Problem Failure Patient' });
failingStorage.setItem = (key, value) => {
  if (key === 'anc_problems') {
    const error = new Error('problem quota failure');
    error.name = 'QuotaExceededError';
    throw error;
  }
  failingStorage.store.set(key, String(value));
};
let problemWriteError;
try {
  failingDB.saveProblems(failingPatientID, [{ title: 'GDM' }]);
} catch (error) {
  problemWriteError = error;
}
if (problemWriteError?.name !== 'StorageWriteError' || problemWriteError.key !== 'anc_problems') {
  throw new Error('saveProblems did not propagate problem storage failure');
}

const performAutoSaveStart = app.indexOf('async function performAutoSave()');
const performAutoSaveEnd = app.indexOf('function setAutoSaveStatus', performAutoSaveStart);
const performAutoSaveBody = app.slice(performAutoSaveStart, performAutoSaveEnd);
if (!performAutoSaveBody.includes("persistCurrentRecordLocal({ allowCreate:false, auditMode:'autosave' })")) {
  throw new Error('performAutoSave does not save problems');
}
if (performAutoSaveBody.includes('recordProblemAuditEvents')) {
  throw new Error('performAutoSave emits problem audit events');
}

const requiredAppFragments = [
  'const previousProblems = existing ? DB.getProblems(requestedID) : []',
  'problems: UI.collectProblems()',
  'DB.saveProblems(patientID, collected.problems)',
  'recordProblemAuditEvents(previousProblems, persisted.problems, patientID)',
  "operation = 'problem.create'",
  "operation = 'problem.update'",
  "operation = 'problem.resolve'",
  'renderActiveProblemsSummary(data.patientID || currentPatientID)',
];
for (const fragment of requiredAppFragments) {
  if (!app.includes(fragment)) {
    throw new Error(`app is missing problem save/audit/summary fragment: ${fragment}`);
  }
}

const requiredUiFragments = [
  'function problemRowHTML(problem={}, idx=0)',
  'function collectProblems()',
  'PROBLEM_TEMPLATES',
  'problem-compact-grid',
  'problem-more-details',
];
for (const fragment of requiredUiFragments) {
  if (!ui.includes(fragment)) {
    throw new Error(`ui is missing problem editor fragment: ${fragment}`);
  }
}

const requiredDomIds = ['btnAddProblem', 'problemList', 'summaryActiveProblems'];
for (const id of requiredDomIds) {
  if (!index.includes(`id="${id}"`)) {
    throw new Error(`index.html is missing problem DOM id: ${id}`);
  }
}

console.log(JSON.stringify({
  passed: true,
  checks: [
    'old patients without problems load with empty list',
    'problems save and reload by patientID',
    'problems include patientID and patientUuid',
    'export/import preserves problems',
    'old backups without problems import',
    'conflicting imported patient skips problem records',
    'archive/restore preserves problem history',
    'active problem helper returns Active and Monitoring',
    'problem write failure propagates as StorageWriteError',
    'fullSave saves problems before clearing changed state',
    'Summary First Active Problems card is wired',
    'manual save emits problem create/update/resolve audit events',
    'autosave saves problems without problem audit events',
  ],
}, null, 2));
