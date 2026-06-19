import fs from 'node:fs/promises';
import vm from 'node:vm';

const db = await fs.readFile(new URL('./db.js', import.meta.url), 'utf8');
const app = await fs.readFile(new URL('./app.js', import.meta.url), 'utf8');

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

function loadDb(localStorage, uuidPrefix='med') {
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
const patientID = DB.savePatient({ fullName: 'Medication Module Test Patient' });
const patient = DB.getPatient(patientID);

if (DB.getMedications(patientID).length !== 0) {
  throw new Error('old patient without medications did not load with empty medication list');
}

DB.saveMedications(patientID, [
  {
    drugName: 'Aspirin',
    genericName: 'Acetylsalicylic acid',
    dose: '',
    unit: '',
    route: '',
    frequency: '',
    indication: 'Preeclampsia prophylaxis when clinically indicated',
    startDate: '2026-06-19',
    status: 'Active',
  },
  {
    drugName: 'Iron',
    status: 'Completed',
    stopDate: '2026-06-20',
  },
]);

const meds = DB.getMedications(patientID);
if (meds.length !== 2 || meds[0].patientID !== patientID || meds[0].patientUuid !== patient.patientUuid) {
  throw new Error('medication did not save/reload with patientID and patientUuid');
}
if (!meds[0].medicationID || !meds[0].createdAt || !meds[0].updatedAt) {
  throw new Error('normalizeMedication did not assign medication metadata');
}
if (DB.getActiveMedications(patientID).length !== 1 || DB.getActiveMedications(patientID)[0].drugName !== 'Aspirin') {
  throw new Error('getActiveMedications did not return only active medications');
}

const exported = DB.exportAll();
const importedDB = loadDb(memoryStorage(), 'imported');
if (!importedDB.importAll(exported)) {
  throw new Error('importAll rejected exported medication backup');
}
if (importedDB.getMedications(patientID).length !== 2) {
  throw new Error('export/import did not preserve medications');
}

const oldBackupDB = loadDb(memoryStorage(), 'old-backup');
if (!oldBackupDB.importAll(JSON.stringify({
  patients: { 'ANC-0100': { patientID: 'ANC-0100', fullName: 'Old Backup Patient' } },
  visits: { 'ANC-0100': [{ date: '2026-06-19' }] },
}))) {
  throw new Error('old backup without medications did not import');
}
if (oldBackupDB.getMedications('ANC-0100').length !== 0) {
  throw new Error('old backup without medications did not default to empty medication list');
}

const conflictDB = loadDb(memoryStorage(), 'conflict');
const conflictPatientID = conflictDB.savePatient({ fullName: 'Local Medication Conflict' });
conflictDB.saveMedications(conflictPatientID, [{ drugName: 'Local aspirin', status: 'Active' }]);
if (!conflictDB.importAll(JSON.stringify({
  patients: {
    [conflictPatientID]: {
      patientID: conflictPatientID,
      patientUuid: 'different-imported-patient',
      fullName: 'Imported Conflict',
    },
  },
  medications: {
    [conflictPatientID]: [{ drugName: 'Imported LMWH', status: 'Active' }],
  },
}))) {
  throw new Error('conflicting medication import failed unexpectedly');
}
const conflictMeds = conflictDB.getMedications(conflictPatientID);
if (conflictMeds.length !== 1 || conflictMeds[0].drugName !== 'Local aspirin') {
  throw new Error('conflicting imported patient medication records were not skipped');
}
if (!conflictDB.getLastImportWarnings().length) {
  throw new Error('conflicting imported medication patient did not expose warning');
}

const archived = DB.archivePatient(patientID, 'Medication history preservation test', 'owner');
if (!DB.isArchived(archived) || DB.getMedications(patientID).length !== 2) {
  throw new Error('archivePatient did not preserve medication history');
}
DB.restorePatient(patientID, 'owner');
if (DB.getMedications(patientID).length !== 2) {
  throw new Error('restorePatient did not preserve medication history');
}

const failingStorage = memoryStorage();
const failingDB = loadDb(failingStorage, 'failing');
const failingPatientID = failingDB.savePatient({ fullName: 'Medication Failure Patient' });
failingStorage.setItem = (key, value) => {
  if (key === 'anc_medications') {
    const error = new Error('medication quota failure');
    error.name = 'QuotaExceededError';
    throw error;
  }
  failingStorage.store.set(key, String(value));
};
let medicationWriteError;
try {
  failingDB.saveMedications(failingPatientID, [{ drugName: 'Aspirin' }]);
} catch (error) {
  medicationWriteError = error;
}
if (medicationWriteError?.name !== 'StorageWriteError' || medicationWriteError.key !== 'anc_medications') {
  throw new Error('saveMedications did not propagate medication storage failure');
}

const appSaveChecks = [
  'DB.saveMedications(id, UI.collectMedications())',
  'DB.saveMedications(id, UI.collectMedications());\n      DB.clearChanged();',
];
for (const fragment of appSaveChecks) {
  if (!app.includes(fragment)) {
    throw new Error(`app save path does not include medication fail-fast save: ${fragment}`);
  }
}

console.log(JSON.stringify({
  passed: true,
  checks: [
    'old patients without medications load with empty list',
    'medications save and reload by patientID',
    'medications include patientID and patientUuid',
    'export/import preserves medications',
    'old backups without medications import',
    'conflicting imported patient skips medication records',
    'archive/restore preserves medication history',
    'active medication helper returns only Active',
    'medication write failure propagates as StorageWriteError',
    'app save paths save medications before clearChanged',
  ],
}, null, 2));
