import fs from 'node:fs/promises';

const app = await fs.readFile(new URL('./app.js', import.meta.url), 'utf8');
const ui = await fs.readFile(new URL('./ui.js', import.meta.url), 'utf8');
const css = await fs.readFile(new URL('../css/style.css', import.meta.url), 'utf8');
const index = await fs.readFile(new URL('../index.html', import.meta.url), 'utf8');

const requiredAppFragments = [
  "function setPatientWorkspaceState(state)",
  "if (viewKey === 'patient')",
  "if (currentPatientID) showPatientWorkspace();",
  "else showPatientPlaceholder();",
  "showPatientWorkspace();\n    loadPatientIntoForm(p);\n    renderNavActive('patient');",
  "renderNavActive('patient');\n    showPatientWorkspace();",
  "function getCurrentEditorActiveMedications()",
  "const suppressed = new Set();",
  "const editorMedications = UI.collectMedications();",
  "suppressed.add(normalizeMedicationHelperKey(med));",
  "DB.getActiveMedications(currentPatientID).forEach(add);",
  "function refreshVisitMedicationHelpers()",
  "function refreshVisitMedicationHelpersBeforeUse(event)",
  "function medicationHelperEditorSignature()",
  "function refreshVisitMedicationHelpersIfEditorChanged()",
  "function startMedicationHelperWatcher()",
  "function processPendingVisitMedicationSelections()",
  "startMedicationHelperWatcher();",
  "function loadPatientIntoForm(p) {\n    startMedicationHelperWatcher();",
  "function openPatient(id) {\n    const p = DB.getPatient(id);\n    if (!p) return;\n    startMedicationHelperWatcher();",
  "document.getElementById('visitBody').addEventListener('pointerdown', refreshVisitMedicationHelpersBeforeUse);",
  "document.getElementById('visitBody').addEventListener('focusin', refreshVisitMedicationHelpersBeforeUse);",
  "select.innerHTML = UI.visitMedicationOptionsHTML(medications);",
  "document.getElementById('medicationList')?.addEventListener('input', handleMedicationInput);",
  "document.getElementById('medicationList')?.addEventListener('input', handleMedicationStatusEvent);",
  "document.getElementById('medicationList')?.addEventListener('change', handleMedicationStatusEvent);",
  "function handleMedicationStatusEvent(event)",
  "if (!event.target.classList.contains('med-status')) return;",
  "select.replaceChildren();",
  "setText('recordModeTitle', 'New patient registration', 'New patient registration');",
  "body.insertAdjacentHTML('beforeend', UI.scanRowHTML({ category:'Quick limited clinic scan' }, idx, lmp));",
  "body.insertAdjacentHTML('beforeend', UI.visitRowHTML({}, idx, lmp, activeMedicationsForCurrentPatient()));",
  "scrollRowIntoView(newRow);",
  "refreshVisitMedicationHelpers();",
  "function insertActiveMedicationIntoVisit(select)",
  "const allowed = new Set(Array.from(freshOptions.options).map(option => option.value).filter(Boolean));",
  "textarea.value = existing ? `${existing}\\n${value}` : value;",
  "if (e.target.classList.contains('visit-med-insert'))",
];

for (const fragment of requiredAppFragments) {
  if (!app.includes(fragment)) {
    throw new Error(`app.js missing post-implementation fix fragment: ${fragment}`);
  }
}

const addScanBody = app.slice(app.indexOf('function addScanRow()'), app.indexOf('function addProcRow()'));
if (addScanBody.includes('rerenderScanRows(') || addScanBody.includes('UI.collectScans({ includeDrafts:true })')) {
  throw new Error('addScanRow should append directly without full scan collection/rerender');
}

const addVisitBody = app.slice(app.indexOf('function addVisitRow()'), app.indexOf('function openCollapsibleForList'));
if (addVisitBody.includes('innerHTML =') || addVisitBody.includes('UI.collectVisits()')) {
  throw new Error('addVisitRow should append directly without full visit rerender/collection');
}
if (!addVisitBody.includes('refreshVisitMedicationHelpers();')) {
  throw new Error('addVisitRow should refresh visit medication helpers after appending');
}

const workspaceBody = app.slice(app.indexOf('function setPatientWorkspaceState(state)'), app.indexOf('function showPatientWorkspace()'));
for (const fragment of ['placeholder.hidden', 'workspace.hidden', 'placeholder.style.display', 'workspace.style.display']) {
  if (!workspaceBody.includes(fragment)) {
    throw new Error(`workspace state handler does not control ${fragment}`);
  }
}

const medicationSourceBody = app.slice(app.indexOf('function getCurrentEditorActiveMedications()'), app.indexOf('function activeMedicationsForCurrentPatient()'));
const medicationKeyBody = app.slice(app.indexOf('function normalizeMedicationHelperKey(med={})'), app.indexOf('function getCurrentEditorActiveMedications()'));
for (const fragment of ['med.doseAmount || med.dose', 'normalizeMedicationHelperNumber(med.timesPerDay || med.frequency', 'normalizeMedicationHelperNumber(med.durationDays || med.duration', 'med.genericName']) {
  if (!medicationKeyBody.includes(fragment)) {
    throw new Error(`medication helper normalized key missing ${fragment}`);
  }
}
if (!app.includes('function normalizeMedicationHelperNumber(value)') || !app.includes('text.match(/\\d+(?:\\.\\d+)?/)')) {
  throw new Error('medication helper key must normalize text frequency/duration values to match structured editor values');
}
if (!medicationSourceBody.includes("const suppressed = new Set();")) {
  throw new Error('editor medication helper source must build a suppression set from inactive editor rows');
}
if (!medicationSourceBody.includes("const editorMedications = UI.collectMedications();")) {
  throw new Error('editor medication helper source must collect all current editor medications before saved DB medications');
}
if (!medicationSourceBody.includes("suppressed.add(normalizeMedicationHelperKey(med));")) {
  throw new Error('inactive editor medications must suppress matching saved active medications');
}
if (!medicationSourceBody.includes("if (suppressed.has(key)) return;")) {
  throw new Error('saved medication merge must skip keys suppressed by inactive editor rows');
}
if (!medicationSourceBody.includes("statusOf(med) === 'Active'")) {
  throw new Error('editor medication helper source must exclude stopped/completed/suspended medications');
}
if (medicationSourceBody.includes('DB.getMedicationMemory')) {
  throw new Error('medication memory patterns must not directly feed visit medication helpers');
}
if (medicationSourceBody.indexOf('const editorMedications = UI.collectMedications();') > medicationSourceBody.indexOf('DB.getActiveMedications(currentPatientID).forEach(add);')) {
  throw new Error('editor medications should be merged before saved DB medications');
}

const refreshBody = app.slice(app.indexOf('function refreshVisitMedicationHelpers()'), app.indexOf('function scrollRowIntoView'));
if (!refreshBody.includes('select.replaceChildren();') || refreshBody.indexOf('select.replaceChildren();') > refreshBody.indexOf('select.innerHTML = UI.visitMedicationOptionsHTML(medications);')) {
  throw new Error('visit medication helper selects should be cleared before rebuilding options');
}
if (!refreshBody.includes('function refreshVisitMedicationHelpersBeforeUse(event)') || !refreshBody.includes("event.target.classList.contains('visit-med-insert')")) {
  throw new Error('visit medication helper should refresh from current editor state before use');
}
if (!refreshBody.includes('function medicationHelperEditorSignature()') || !refreshBody.includes("row.querySelector('.med-status')?.value")) {
  throw new Error('visit medication helper should watch current editor medication status/content');
}
if (!refreshBody.includes('setInterval(refreshVisitMedicationHelpersIfEditorChanged, 500)')) {
  throw new Error('visit medication helper watcher should refresh options when editor state changes without a reliable DOM event');
}

const insertMedicationBody = app.slice(app.indexOf('function insertActiveMedicationIntoVisit(select)'), app.indexOf('function medicationRowHasContent(row)'));
if (!insertMedicationBody.includes('getCurrentEditorActiveMedications()') || !insertMedicationBody.includes('allowed.has(value)')) {
  throw new Error('visit medication insertion must reject stale inactive helper options');
}
if (!insertMedicationBody.includes('function processPendingVisitMedicationSelections()') || !insertMedicationBody.includes('if (select.value) insertActiveMedicationIntoVisit(select);')) {
  throw new Error('visit medication helper should process pending selected values even if change events are missed');
}

const medicationStatusEventBody = app.slice(app.indexOf('function handleMedicationStatusEvent(event)'), app.indexOf('function handleMedicationChange(event)'));
if (!medicationStatusEventBody.includes("event.target.classList.contains('med-status')") || !medicationStatusEventBody.includes('refreshVisitMedicationHelpers();')) {
  throw new Error('medication status changes should refresh visit medication helpers directly');
}

const requiredUiFragments = [
  "'Chronic Medical Disease'",
  "'Current Pregnancy Complication'",
  "'Previous Obstetric History'",
  "'Fetal Problem'",
  "'Gynecologic Problem'",
  "'Monitoring / Follow-up'",
  "'Other'",
  "const displayCategory = PROBLEM_CATEGORIES.includes(problem.category) ? problem.category : (problem.category ? 'Other' : '');",
  "function medicationVisitText(med={})",
  "function visitMedicationHelperHTML(activeMedications=[])",
  "function visitMedicationOptionsHTML(activeMedications=[])",
  "visitMedicationOptionsHTML,",
  "class=\"visit-med-insert\"",
  "class=\"med-dose-strip\"",
  "Dose | Unit | ×/day | Days",
];

for (const fragment of requiredUiFragments) {
  if (!ui.includes(fragment)) {
    throw new Error(`ui.js missing post-implementation fix fragment: ${fragment}`);
  }
}

if (ui.includes('Administrative') || ui.includes("'Medical',") || ui.includes("'Current pregnancy'")) {
  throw new Error('Problem categories still contain old/non-ANC category names');
}

const requiredCssFragments = [
  '.collapsible-body:not(.collapsed){max-height:none!important;opacity:1}',
  '.data-table td textarea{min-height:72px;resize:vertical}',
  '.visits-table td textarea{min-height:88px}',
  '.visit-med-helper',
  '.med-dose-strip',
  '.med-dose-group{grid-column:span 2}',
  '#noPatientPlaceholder[hidden],#patientWorkspace[hidden]{display:none!important}',
];

for (const fragment of requiredCssFragments) {
  if (!css.includes(fragment)) {
    throw new Error(`style.css missing post-implementation fix fragment: ${fragment}`);
  }
}

if (!index.includes('Add medication adds to this patient. Save as pattern only remembers this drug/dose pattern for future use.')) {
  throw new Error('Medication section does not distinguish Add Medication from Save as pattern');
}

console.log(JSON.stringify({
  passed: true,
  checks: [
    'patient workspace state is centralized',
    'workspace state controls hidden and display state',
    'patient nav forces workspace with a current patient and placeholder without one',
    'opening patient and new patient paths finish in workspace mode',
    'add visit appends directly and scrolls row into view',
    'add visit refreshes active medication helper options',
    'add ultrasound appends directly and scrolls row into view',
    'scan type rerender path remains separate from add scan',
    'open collapsibles use natural height',
    'medication dose/unit/times/day/duration are grouped',
    'unsaved active editor medications feed visit helpers before saved medications',
    'stopped/completed/suspended medications are excluded from visit helpers',
    'medication status select events directly refresh visit helpers',
    'visit helper options are cleared before rebuild',
    'new patient title is not left as No patient selected',
    'problem categories are ANC-only and no Administrative category remains',
    'visit active medication helper appends text without overwriting',
    'Add Medication and Save as pattern wording are distinct',
  ],
}, null, 2));
