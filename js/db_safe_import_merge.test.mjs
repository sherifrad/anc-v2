import fs from 'node:fs/promises';
import vm from 'node:vm';

const dbSource = await fs.readFile(new URL('./db.js', import.meta.url), 'utf8');

function loadDb() {
  const store = new Map();
  const localStorage = {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); },
  };
  const context = vm.createContext({ console, localStorage });
  vm.runInContext(`${dbSource}\nglobalThis.TEST_DB = DB;`, context);
  return { DB: context.TEST_DB, store };
}

const { DB, store } = loadDb();
const patientA = {
  patientID:'ANC-0001',
  patientUuid:'11111111-1111-4111-8111-111111111111',
  fullName:'Local Patient A',
};
store.set('anc_patients', JSON.stringify({ 'ANC-0001': patientA }));
store.set('anc_visits', JSON.stringify({ 'ANC-0001': [{ date:'2026-01-01', notes:'Local A visit' }] }));
store.set('anc_scans', JSON.stringify({ 'ANC-0001': [{ date:'2026-01-02', findings:'Local A scan' }] }));
store.set('anc_medications', JSON.stringify({ 'ANC-0001': [{ drugName:'Local A medication', status:'Active' }] }));
store.set('anc_problems', JSON.stringify({ 'ANC-0001': [{ title:'Local A problem', status:'Active' }] }));

const patientB = {
  patientID:'ANC-0002',
  patientUuid:'22222222-2222-4222-8222-222222222222',
  fullName:'Imported Patient B',
};
if (!DB.importAll(JSON.stringify({
  patients: { 'ANC-0002': patientB },
  visits: { 'ANC-0002': [{ date:'2026-02-01', notes:'Imported B visit' }] },
}))) throw new Error('new-patient import failed');

let patients = DB.getAllPatients();
if (!patients['ANC-0001'] || !patients['ANC-0002']) {
  throw new Error('import did not preserve local A and add imported B');
}
if (DB.getVisits('ANC-0001')[0]?.notes !== 'Local A visit' || DB.getVisits('ANC-0002')[0]?.notes !== 'Imported B visit') {
  throw new Error('patient-by-patient visit merge failed');
}
if (DB.getMedications('ANC-0001')[0]?.drugName !== 'Local A medication' || DB.getProblems('ANC-0001')[0]?.title !== 'Local A problem') {
  throw new Error('missing imported collections erased local medication/problem data');
}

if (!DB.importAll(JSON.stringify({
  patients: { 'ANC-0001': { ...patientA, fullName:'Updated Patient A' } },
  scans: { 'ANC-0001': [{ date:'2026-03-01', findings:'Updated A scan' }] },
}))) throw new Error('matching UUID import failed');
if (DB.getPatient('ANC-0001')?.fullName !== 'Updated Patient A' || DB.getScans('ANC-0001')[0]?.findings !== 'Updated A scan') {
  throw new Error('matching MRN/UUID did not update patient data');
}
if (!DB.getPatient('ANC-0002')) throw new Error('matching-patient update removed unrelated B');
const matchingResult = DB.getLastImportResult();
if (
  !matchingResult.ok
  || !matchingResult.acceptedPatientIDs.includes('ANC-0001')
  || !matchingResult.updatedPatientIDs.includes('ANC-0001')
  || matchingResult.skippedPatientIDs.length
) {
  throw new Error('structured import result did not identify the updated patient');
}

const beforeConflictVisit = JSON.stringify(DB.getVisits('ANC-0001'));
if (!DB.importAll(JSON.stringify({
  patients: { 'ANC-0001': { ...patientA, patientUuid:'99999999-9999-4999-8999-999999999999', fullName:'Conflicting A' } },
  visits: { 'ANC-0001': [{ date:'2030-01-01', notes:'Conflicting visit' }] },
  medications: { 'ANC-0001': [{ drugName:'Conflicting medication' }] },
}))) throw new Error('conflict import did not complete with warning');
if (DB.getPatient('ANC-0001')?.fullName !== 'Updated Patient A') throw new Error('conflict overwrote local patient');
if (JSON.stringify(DB.getVisits('ANC-0001')) !== beforeConflictVisit) throw new Error('conflict overwrote related visits');
if (DB.getMedications('ANC-0001')[0]?.drugName !== 'Local A medication') throw new Error('conflict overwrote medication data');
if (!DB.getLastImportWarnings().some(warning => warning.includes('ANC-0001'))) throw new Error('conflict warning was not recorded');
const conflictResult = DB.getLastImportResult();
if (!conflictResult.skippedPatientIDs.includes('ANC-0001') || conflictResult.updatedPatientIDs.includes('ANC-0001')) {
  throw new Error('structured import result did not identify the skipped conflict');
}

const archivedLocal = DB.archivePatient('ANC-0001', 'Local archive reason', 'local-owner');
const localArchivedAt = archivedLocal.archivedAt;
if (!DB.importAll(JSON.stringify({
  patients: {
    'ANC-0001': {
      ...patientA,
      fullName:'Imported demographics while archived',
      isArchived:false,
      archivedAt:'',
      archivedBy:'',
      archiveReason:'',
      archiveAudit:[],
    },
  },
}))) throw new Error('archived matching-patient import failed');
const archivedAfterActiveImport = DB.getPatient('ANC-0001');
if (!archivedAfterActiveImport.isArchived || archivedAfterActiveImport.archiveReason !== 'Local archive reason') {
  throw new Error('active import cleared local archive state');
}
if (archivedAfterActiveImport.archivedAt !== localArchivedAt || archivedAfterActiveImport.archivedBy !== 'local-owner') {
  throw new Error('active import replaced local archive metadata');
}
if (!archivedAfterActiveImport.archiveAudit.some(event => event.operation === 'archive')) {
  throw new Error('active import erased local archive audit');
}
if (archivedAfterActiveImport.fullName !== 'Imported demographics while archived') {
  throw new Error('archive invariant prevented safe demographic import update');
}

DB.restorePatient('ANC-0001', 'local-owner');
if (!DB.importAll(JSON.stringify({
  patients: {
    'ANC-0001': {
      ...patientA,
      isArchived:true,
      archivedAt:'2026-06-20T12:00:00.000Z',
      archivedBy:'import-owner',
      archiveReason:'Imported archive reason',
      archiveAudit:[{ operation:'archive', timestamp:'2026-06-20T12:00:00.000Z', actor:'import-owner', reason:'Imported archive reason' }],
    },
  },
}))) throw new Error('imported archived patient failed');
const activeAfterArchivedImport = DB.getPatient('ANC-0001');
if (!activeAfterArchivedImport.isArchived || activeAfterArchivedImport.archiveReason !== 'Imported archive reason') {
  throw new Error('same-UUID imported archive state was not accepted');
}
if (!activeAfterArchivedImport.archiveAudit.some(event => event.actor === 'local-owner')) {
  throw new Error('imported archive state erased existing local archive history');
}

if (!DB.importAll(JSON.stringify({
  patients: { 'ANC-0001': { patientID:'ANC-0001', fullName:'Missing UUID A' } },
  problems: { 'ANC-0001': [{ title:'Conflicting missing UUID problem' }] },
}))) throw new Error('missing-UUID conflict import did not complete');
if (DB.getProblems('ANC-0001')[0]?.title !== 'Local A problem') throw new Error('missing-UUID conflict overwrote problems');

const visitsMap = JSON.parse(store.get('anc_visits'));
if (Object.keys(visitsMap).some(id => !DB.getPatient(id))) {
  throw new Error('import created orphan visit collections');
}

console.log(JSON.stringify({
  passed:true,
  checks:[
    'new imported patient merges with unrelated local patient',
    'matching MRN and UUID updates existing patient',
    'different or missing UUID conflicts are skipped with warnings',
    'conflicting related collections are skipped',
    'missing collections preserve local medications/problems',
    'partial collection import preserves unrelated data without orphans',
    'active import cannot clear a local archive state',
    'same-UUID imported archive state preserves archive history',
    'structured import result identifies updated and skipped patients',
  ],
}, null, 2));
