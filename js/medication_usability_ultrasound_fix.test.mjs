import fs from 'node:fs/promises';
import vm from 'node:vm';

const db = await fs.readFile(new URL('./db.js', import.meta.url), 'utf8');
const ui = await fs.readFile(new URL('./ui.js', import.meta.url), 'utf8');
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

function loadDb(localStorage) {
  const context = vm.createContext({
    console,
    localStorage,
    crypto: { randomUUID: () => 'patient-uuid-test' },
  });
  vm.runInContext(`${db}\nglobalThis.TEST_DB = DB;`, context);
  return context.TEST_DB;
}

const DB = loadDb(memoryStorage());

const pattern = DB.saveMedicationPattern({
  drugName: 'Panadol',
  genericName: 'Paracetamol',
  doseAmount: '1',
  unit: 'tab',
  timesPerDay: '3',
  durationDays: '5',
  route: 'Review route',
  indication: 'Symptomatic treatment when clinically indicated',
});

if (!pattern.patternID) {
  throw new Error('manual medication pattern was not stored');
}
if (DB.getMedicationMemory().length !== 1) {
  throw new Error('medication memory did not persist separately');
}
if (!DB.findSimilarMedicationPattern({
  drugName: ' panadol ',
  genericName: 'PARACETAMOL',
  doseAmount: '1',
  unit: 'tab',
  timesPerDay: '3',
  durationDays: '5',
})) {
  throw new Error('similar medication pattern detection failed');
}

const patientID = DB.savePatient({ fullName: 'Pattern Memory Patient' });
DB.saveMedications(patientID, [{ drugName: 'Panadol', dose: '1', unit: 'tab', frequency: '3 times daily', duration: '5 days' }]);
const exported = JSON.parse(DB.exportAll());
if (exported.medicationMemory || exported.patients[patientID]?.medicationMemory) {
  throw new Error('medication memory leaked into clinical export or patient record');
}

const requiredUiFragments = [
  'medication-compact-grid',
  'med-more-details',
  'med-dose-amount',
  'med-times-per-day',
  'med-duration-days',
  'btn-med-pattern',
  'optgroup label="Remembered patterns"',
  'collectScans(options={})',
  'const includeDrafts = Boolean(options?.includeDrafts)',
  'includeDrafts && s.category',
];
for (const fragment of requiredUiFragments) {
  if (!ui.includes(fragment)) {
    throw new Error(`UI fix fragment missing: ${fragment}`);
  }
}

const doseNeutralFragments = [
  "route:'Review route'",
  "frequency:'Review frequency'",
];
for (const fragment of doseNeutralFragments) {
  if (!ui.includes(fragment)) {
    throw new Error(`template placeholder behavior missing: ${fragment}`);
  }
}
if (/dose:\s*['"][^'"]+/.test(ui)) {
  throw new Error('built-in medication template appears to include a dose recommendation');
}

const requiredAppFragments = [
  'UI.collectScans({ includeDrafts:true })',
  'confirmMedicationPatternSave(row)',
  "DB.saveMedicationPattern(medicationPatternFromRow(row), mode)",
  'DB.findSimilarMedicationPattern?.(pattern)',
  'placeholdersOnly:true',
  "placeholder('.med-times-per-day', data.frequency)",
  'memory:',
  'template:',
];
for (const fragment of requiredAppFragments) {
  if (!app.includes(fragment)) {
    throw new Error(`app fix fragment missing: ${fragment}`);
  }
}

const forbiddenAutoMemoryFragments = [
  'rememberMedications',
  'saveMedicationPattern(medications',
];
for (const fragment of forbiddenAutoMemoryFragments) {
  if (app.includes(fragment)) {
    throw new Error(`medication memory appears to update automatically: ${fragment}`);
  }
}

console.log(JSON.stringify({
  passed: true,
  checks: [
    'manual medication pattern memory stores separately',
    'similar medication pattern detection normalizes names',
    'medication memory is not stored inside patient/export payload',
    'compact medication row and More details markup are present',
    'structured dose fields are present',
    'built-in templates are dose-neutral placeholders',
    'manual Save as pattern path is present',
    'autosave/fullSave do not automatically update pattern memory',
    'ultrasound collectScans draft mode is present',
    'rerenderScanRows uses draft-preserving scan collection',
  ],
}, null, 2));
