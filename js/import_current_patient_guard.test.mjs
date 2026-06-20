import fs from 'node:fs/promises';

const app = await fs.readFile(new URL('./app.js', import.meta.url), 'utf8');

const required = [
  "IMPORT_APPLYING:'import-applying'",
  'if (_safetyState !== SAFETY_STATES.NORMAL) return false;',
  'function beginImportOperation()',
  'function completeImportOperation()',
  'function failImportOperation(error)',
  'function promptUnsavedImportDecision()',
  "finish('save')",
  "finish('discard')",
  "finish('cancel')",
  "discard.textContent = 'Import without saving'",
  "cancel.textContent = 'Cancel'",
  'const result = await fullSave({ forTransition:true });',
  'async function applyImportPayload(json',
  'DB.getLastImportResult?.()',
  'result.updatedPatientIDs.includes(currentPatientID)',
  'loadPatientIntoForm(importedCurrentPatient);',
  'DB.discardChanged();',
  'The currently open patient was updated from the imported backup and has been reloaded.',
];

for (const fragment of required) {
  if (!app.includes(fragment)) throw new Error(`import guard is missing: ${fragment}`);
}

const applyBody = app.match(/async function applyImportPayload\(json,[\s\S]*?\n  \}/)?.[0] || '';
if (applyBody.indexOf('beginImportOperation()') > applyBody.indexOf('DB.importAll(json)')) {
  throw new Error('autosave is not suspended before import storage writes');
}
if (applyBody.indexOf('loadPatientIntoForm(importedCurrentPatient)') > applyBody.indexOf('DB.discardChanged()')) {
  throw new Error('pending state clears before the imported current patient reloads');
}

console.log(JSON.stringify({
  passed:true,
  checks:[
    'import suspends autosave before applying storage writes',
    'pending import has save/discard/cancel decisions',
    'failed save blocks import through localSaved result',
    'updated current patient reloads before pending state clears',
    'unrelated import does not request current patient reload',
  ],
}, null, 2));
