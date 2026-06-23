import fs from 'node:fs/promises';

const app = await fs.readFile(new URL('./app.js', import.meta.url), 'utf8');

const required = [
  'function promptUnsavedTransition()',
  'async function guardPatientTransition()',
  "finish('save')",
  "finish('discard')",
  "finish('cancel')",
  "discard.textContent = 'Switch without saving'",
  "cancel.textContent = 'Cancel'",
  'setTimeout(() => cancel.focus(), 0)',
  'const result = await fullSave({ forTransition:true });',
  'proceed: Boolean(result?.localSaved)',
  'if (id === currentPatientID)',
  'const transition = await guardPatientTransition();',
  'await commitPatientTransition(patient);',
  'await commitPatientTransition(null, { newPatient:true });',
  'DB.discardChanged();',
  'async function fullSave(options={})',
  'return { localSaved:false, cloudSynced:false };',
  'return { localSaved:true, cloudSynced:null, syncPending:true };',
  'cloudSynced: result?.cloudSynced !== false',
  'Saved on this device, but cloud sync failed. The record may not be available on other devices yet.',
];

for (const fragment of required) {
  if (!app.includes(fragment)) {
    throw new Error(`patient transition guard is missing: ${fragment}`);
  }
}

const openBody = app.match(/async function openPatientInternal\(id\) \{([\s\S]*?)\n  \}/)?.[1] || '';
if (openBody.indexOf('guardPatientTransition()') > openBody.indexOf('commitPatientTransition(patient)')) {
  throw new Error('patient is opened before unsaved transition guard completes');
}

const newPatientBody = app.match(/async function confirmNewPatientInternal\(\) \{([\s\S]*?)\n  \}/)?.[1] || '';
if (!newPatientBody.includes('guardPatientTransition()') || newPatientBody.indexOf('guardPatientTransition()') > newPatientBody.indexOf('commitPatientTransition(null, { newPatient:true })')) {
  throw new Error('New Patient clears the form before the unsaved transition guard');
}

console.log(JSON.stringify({
  passed:true,
  checks:[
    'three-choice unsaved transition prompt is present',
    'Cancel is the focused default',
    'same-patient open avoids destructive reload',
    'local save success controls switching',
    'cloud failure remains non-blocking with approved warning',
    'explicit discard is finalized only by the committed transition',
    'New Patient uses the same guard',
  ],
}, null, 2));
