import fs from 'node:fs/promises';
import vm from 'node:vm';

const db = await fs.readFile(new URL('./db.js', import.meta.url), 'utf8');

function loadDb() {
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
  const context = vm.createContext({ console, localStorage });
  vm.runInContext(`${db}\nglobalThis.TEST_DB = DB;`, context);
  return { DB: context.TEST_DB, localStorage };
}

const { DB } = loadDb();
const patientID = DB.savePatient({
  fullName: 'Archive Workflow Test',
  patientStatus: 'Active Follow-up',
});
DB.saveVisits(patientID, [{ date: '2026-06-19', findings: 'Routine visit' }]);
DB.saveScans(patientID, [{ date: '2026-06-19', type: 'Growth scan' }]);
DB.saveProcedures(patientID, [{ date: '2026-06-19', type: 'Anti-D' }]);
DB.saveLabs(patientID, { t1: { CBC: { hb: '11.8' } }, t2: {}, t3: {} });

let missingReasonError = false;
try {
  DB.archivePatient(patientID, '   ', 'owner');
} catch {
  missingReasonError = true;
}
if (!missingReasonError) {
  throw new Error('archivePatient did not require an archive reason');
}

const archived = DB.archivePatient(patientID, 'Duplicate registration created in error', 'owner');
if (!DB.isArchived(archived) || !archived.archivedAt || archived.archivedBy !== 'owner') {
  throw new Error('archivePatient did not set archive metadata');
}
if (archived.archiveReason !== 'Duplicate registration created in error') {
  throw new Error('archivePatient did not preserve the archive reason');
}
if (archived.archiveAudit?.[0]?.operation !== 'archive') {
  throw new Error('archivePatient did not append archive audit event');
}
if (!DB.getVisits(patientID).length || !DB.getScans(patientID).length || !DB.getProcedures(patientID).length || !DB.getLabs(patientID)) {
  throw new Error('archivePatient removed related clinical data');
}

const exported = DB.exportAll();
const imported = loadDb().DB;
if (!imported.importAll(exported)) {
  throw new Error('importAll rejected exported archive data');
}
const importedPatient = imported.getPatient(patientID);
if (!imported.isArchived(importedPatient) || importedPatient.archiveReason !== archived.archiveReason) {
  throw new Error('export/import did not preserve archive metadata');
}

const restored = imported.restorePatient(patientID, 'owner');
if (imported.isArchived(restored) || restored.archivedAt || restored.archiveReason) {
  throw new Error('restorePatient did not clear active archive metadata');
}
if (restored.archiveAudit?.at(-1)?.operation !== 'restore') {
  throw new Error('restorePatient did not append restore audit event');
}
if (!imported.getVisits(patientID).length || !imported.getScans(patientID).length || !imported.getProcedures(patientID).length || !imported.getLabs(patientID)) {
  throw new Error('restorePatient removed related clinical data');
}

console.log(JSON.stringify({
  passed: true,
  checks: [
    'archive reason is required',
    'archive metadata is stored on the patient record',
    'archive audit event is appended',
    'related clinical collections are preserved',
    'export/import preserves archive metadata',
    'restore clears active archive state and appends restore audit',
  ],
}, null, 2));
