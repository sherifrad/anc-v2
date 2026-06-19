import fs from 'node:fs/promises';
import vm from 'node:vm';

const db = await fs.readFile(new URL('./db.js', import.meta.url), 'utf8');
const app = await fs.readFile(new URL('./app.js', import.meta.url), 'utf8');

function loadDb(localStorage) {
  const context = vm.createContext({ console, localStorage });
  vm.runInContext(`${db}\nglobalThis.TEST_DB = DB;`, context);
  return context.TEST_DB;
}

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

const storage = memoryStorage();
const DB = loadDb(storage);

if (DB.hasPendingChanges()) {
  throw new Error('Fresh DB unexpectedly has pending changes');
}

const event = DB.appendAuditEvent({
  actor: 'owner',
  operation: 'patient.create',
  patientID: 'ANC-0001',
  entityType: 'patient',
  summary: 'Created test patient',
});

if (!event.eventID || !event.timestamp || event.status !== 'success') {
  throw new Error('appendAuditEvent did not fill required fields');
}
if (DB.hasPendingChanges()) {
  throw new Error('appendAuditEvent marked clinical data as changed');
}
if (DB.getAuditEvents({ patientID: 'ANC-0001' }).length !== 1) {
  throw new Error('getAuditEvents patient filter failed');
}
if (DB.getAuditEvents({ operation: 'patient.update' }).length !== 0) {
  throw new Error('getAuditEvents operation filter failed');
}

const exported = JSON.parse(DB.exportAll());
if (!Array.isArray(exported.auditEvents) || exported.auditEvents[0].eventID !== event.eventID) {
  throw new Error('exportAll did not include auditEvents');
}

const importedStorage = memoryStorage();
const importedDB = loadDb(importedStorage);
const duplicatePayload = JSON.stringify({
  ...exported,
  auditEvents: [
    ...exported.auditEvents,
    exported.auditEvents[0],
    {
      eventID: 'audit_imported_extra',
      timestamp: '2026-06-19T00:00:00.000Z',
      actor: 'owner',
      operation: 'import',
      patientID: '',
      entityType: 'backup',
      summary: 'Imported test backup',
      status: 'success',
    },
  ],
});
if (!importedDB.importAll(duplicatePayload)) {
  throw new Error('importAll rejected audit payload');
}
const importedEvents = importedDB.getAuditEvents();
if (importedEvents.filter(item => item.eventID === event.eventID).length !== 1) {
  throw new Error('importAll duplicated audit event IDs');
}
if (!importedEvents.some(item => item.eventID === 'audit_imported_extra')) {
  throw new Error('importAll did not merge imported audit events');
}

const failingStorage = memoryStorage();
failingStorage.setItem = (key, value) => {
  if (key === 'anc_audit_events_v1') throw new Error('audit quota failure');
  failingStorage.store.set(key, String(value));
};
const failingDB = loadDb(failingStorage);
let auditError;
try {
  failingDB.appendAuditEvent({ operation: 'patient.update', entityType: 'patient' });
} catch (error) {
  auditError = error;
}
if (auditError?.name !== 'AuditWriteError') {
  throw new Error('appendAuditEvent did not throw AuditWriteError');
}
if (failingStorage.getItem('anc_last_change') !== null) {
  throw new Error('audit write failure recursively marked clinical changes');
}

const appChecks = [
  'const _autosaveAuditAtByPatient = {}',
  '15 * 60 * 1000',
  "operation: 'patient.autosave'",
  'Autosaved patient record and related collections',
  'recordAutosaveAudit(id)',
];
for (const fragment of appChecks) {
  if (!app.includes(fragment)) {
    throw new Error(`Audit Trail V1 app throttle is missing: ${fragment}`);
  }
}

console.log(JSON.stringify({
  passed: true,
  checks: [
    'appendAuditEvent fills required event fields',
    'audit writes do not mark clinical pending changes',
    'getAuditEvents supports simple filters',
    'exportAll includes auditEvents',
    'importAll merges auditEvents without duplicates',
    'audit write failure throws AuditWriteError without recursion',
    'autosave audit is throttled and summarized',
  ],
}, null, 2));
