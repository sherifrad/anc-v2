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

function loadDb(localStorage, uuidPrefix='uuid') {
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
const DB = loadDb(storage, 'new');

const patientID = DB.savePatient({ fullName: 'UUID Phase One Patient' });
const created = DB.getPatient(patientID);
if (patientID !== 'ANC-0001' || !created.patientUuid) {
  throw new Error('new patient did not receive both patientID and patientUuid');
}

DB.saveVisits(patientID, [{ date: '2026-06-19', findings: 'Visit preserved' }]);
DB.saveScans(patientID, [{ date: '2026-06-19', category: 'Growth scan' }]);
DB.saveProcedures(patientID, [{ date: '2026-06-19', type: 'Anti-D' }]);
DB.saveLabs(patientID, { t1: { CBC: { hb: '11.9' } }, t2: {}, t3: {} });
if (!DB.getVisits(patientID).length || !DB.getScans(patientID).length || !DB.getProcedures(patientID).length || !DB.getLabs(patientID)) {
  throw new Error('related records no longer load by existing patientID');
}

const oldStorage = memoryStorage();
oldStorage.setItem('anc_patients', JSON.stringify({
  'ANC-0099': { patientID: 'ANC-0099', fullName: 'Old Local Patient' },
}));
const oldDB = loadDb(oldStorage, 'old');
const oldPatient = oldDB.getPatient('ANC-0099');
if (!oldPatient.patientUuid) {
  throw new Error('old patient did not receive patientUuid when loaded');
}
const exportedOld = JSON.parse(oldDB.exportAll());
if (!exportedOld.patients['ANC-0099'].patientUuid) {
  throw new Error('exportAll did not include generated patientUuid');
}

const importOldDB = loadDb(memoryStorage(), 'import-old');
const oldBackup = JSON.stringify({
  patients: { 'ANC-0002': { patientID: 'ANC-0002', fullName: 'Backup Without UUID' } },
  visits: { 'ANC-0002': [{ date: '2026-06-19' }] },
});
if (!importOldDB.importAll(oldBackup)) {
  throw new Error('importAll rejected old backup without UUID');
}
if (!importOldDB.getPatient('ANC-0002').patientUuid) {
  throw new Error('importAll did not generate patientUuid for old backup');
}
if (!importOldDB.getVisits('ANC-0002').length) {
  throw new Error('importAll broke related data keyed by patientID');
}

const importUuidDB = loadDb(memoryStorage(), 'import-preserve');
const backupUuid = 'existing-import-uuid';
if (!importUuidDB.importAll(JSON.stringify({
  patients: { 'ANC-0003': { patientID: 'ANC-0003', patientUuid: backupUuid, fullName: 'Backup With UUID' } },
}))) {
  throw new Error('importAll rejected backup with UUID');
}
if (importUuidDB.getPatient('ANC-0003').patientUuid !== backupUuid) {
  throw new Error('importAll did not preserve imported patientUuid');
}

const conflictStorage = memoryStorage();
const conflictDB = loadDb(conflictStorage, 'conflict-local');
const conflictID = conflictDB.savePatient({ fullName: 'Local Conflict Patient' });
const localUuid = conflictDB.getPatient(conflictID).patientUuid;
conflictDB.saveVisits(conflictID, [{ date: '2026-06-19', findings: 'Local visit' }]);
if (!conflictDB.importAll(JSON.stringify({
  patients: {
    [conflictID]: {
      patientID: conflictID,
      patientUuid: 'different-imported-uuid',
      fullName: 'Imported Conflict Patient',
    },
  },
  visits: {
    [conflictID]: [{ date: '2026-06-20', findings: 'Imported visit' }],
  },
}))) {
  throw new Error('importAll rejected conflict backup instead of warning and skipping conflict');
}
const retainedConflictPatient = conflictDB.getPatient(conflictID);
if (retainedConflictPatient.patientUuid !== localUuid || retainedConflictPatient.fullName !== 'Local Conflict Patient') {
  throw new Error('importAll overwrote a same-MRN patient with a different UUID');
}
if (conflictDB.getVisits(conflictID)[0].findings !== 'Local visit') {
  throw new Error('importAll overwrote related data for a skipped MRN conflict');
}
if (!/Skipped imported patient ANC-0001/.test(conflictDB.getLastImportWarnings()[0] || '')) {
  throw new Error('importAll did not expose a clear MRN conflict warning');
}

const legacyConflictDB = loadDb(memoryStorage(), 'legacy-conflict');
const legacyConflictID = legacyConflictDB.savePatient({ fullName: 'Local Legacy Conflict' });
const legacyConflictUuid = legacyConflictDB.getPatient(legacyConflictID).patientUuid;
legacyConflictDB.importAll(JSON.stringify({
  patients: {
    [legacyConflictID]: {
      patientID: legacyConflictID,
      fullName: 'Imported Legacy No UUID',
    },
  },
}));
if (
  legacyConflictDB.getPatient(legacyConflictID).patientUuid !== legacyConflictUuid
  || legacyConflictDB.getPatient(legacyConflictID).fullName !== 'Local Legacy Conflict'
) {
  throw new Error('importAll overwrote same-MRN local patient with a no-UUID backup record');
}
if (!legacyConflictDB.getLastImportWarnings().length) {
  throw new Error('importAll did not warn for same-MRN no-UUID import conflict');
}

const auditEvent = conflictDB.appendAuditEvent({
  operation: 'patient.update',
  patientID: conflictID,
  patientUuid: localUuid,
  entityType: 'patient',
});
if (auditEvent.patientUuid !== localUuid) {
  throw new Error('audit event did not preserve patientUuid');
}

const archived = conflictDB.archivePatient(conflictID, 'Duplicate entered in error', 'owner');
if (archived.patientUuid !== localUuid || !conflictDB.isArchived(archived)) {
  throw new Error('archivePatient did not preserve patientUuid');
}
const restored = conflictDB.restorePatient(conflictID, 'owner');
if (restored.patientUuid !== localUuid || conflictDB.isArchived(restored)) {
  throw new Error('restorePatient did not preserve patientUuid');
}

const appAuditChecks = [
  'function resolveAuditPatientUuid(event)',
  'patientUuid: resolveAuditPatientUuid(event)',
  'DB.getPatient(id)?.patientUuid',
];
for (const fragment of appAuditChecks) {
  if (!app.includes(fragment)) {
    throw new Error(`app audit UUID enrichment is missing: ${fragment}`);
  }
}

console.log(JSON.stringify({
  passed: true,
  checks: [
    'new patients receive patientID and patientUuid',
    'old patients receive patientUuid on load/export',
    'old imports generate patientUuid',
    'imports preserve existing patientUuid',
    'same-MRN different-UUID import conflicts are skipped with warning',
    'same-MRN missing-UUID import conflicts are skipped with warning',
    'related records remain keyed by patientID',
    'audit events can carry patientUuid',
    'app audit wrapper enriches patient events with patientUuid',
    'archive and restore preserve patientUuid',
  ],
}, null, 2));
