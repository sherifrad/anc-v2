import fs from 'node:fs/promises';
import vm from 'node:vm';

const [html, appSource, stylesheet] = await Promise.all([
  fs.readFile(new URL('../index.html', import.meta.url), 'utf8'),
  fs.readFile(new URL('./app.js', import.meta.url), 'utf8'),
  fs.readFile(new URL('../css/style.css', import.meta.url), 'utf8'),
]);

for (const id of [
  'patientSummaryShell',
  'btnSummaryOpenWorkspace',
  'focusedWorkspaceBar',
  'btnEditorBackToSummary',
]) {
  if (!html.includes(`id="${id}"`)) throw new Error(`missing shell DOM id ${id}`);
}

if (!appSource.includes("document.getElementById('btnSummaryOpenWorkspace')?.addEventListener('click'")) {
  throw new Error('summary shell open-workspace control is not wired');
}
if (!appSource.includes("document.getElementById('btnEditorBackToSummary')?.addEventListener('click'")) {
  throw new Error('focused workspace back-to-summary control is not wired');
}
if (!/#patientEditor\s*\[\s*hidden\s*\]\s*\{[^}]*display\s*:\s*none\s*(?:!important)?[^}]*\}/.test(stylesheet)) {
  throw new Error('patient editor hidden state is not enforced by CSS');
}

const instrumented = appSource.replace(
  'init, openPatient, confirmDeletePatient,',
  `init, openPatient,
    _testSetRecordMode:setRecordMode,
    _testSetCurrentPatientID:id => { currentPatientID = id; },
    _testGetCurrentPatientID:() => currentPatientID,
    confirmDeletePatient,`
);

function fakeElement(initial={}) {
  return {
    value:'', checked:false, disabled:false, hidden:false, className:'', innerHTML:'', textContent:'',
    style:{},
    classList:{
      add(){}, remove(){},
      toggle(_name, force){ this.toggled = force; },
      contains(){ return false; },
    },
    querySelectorAll(){ return []; }, querySelector(){ return null; }, contains(){ return false; },
    getAttribute(){ return null; }, setAttribute(){}, removeAttribute(){}, focus(){},
    ...initial,
  };
}

const elements = new Map();
const getElement = id => {
  if (!elements.has(id)) elements.set(id, fakeElement());
  return elements.get(id);
};
getElement('fullName').value = 'Unsaved Local Edit';

const DB = {
  getPatient(id){ return id === 'ANC-0001' ? { patientID:id, fullName:'Shell Toggle Patient' } : null; },
  isArchived(){ return false; },
};

const context = vm.createContext({
  console,
  document:{
    readyState:'loading',
    addEventListener(){},
    getElementById:getElement,
    querySelectorAll(){ return []; },
    querySelector(){ return null; },
  },
  DB,
  UI:{ toast(){}, riskBadgeHTML(){ return ''; } },
  CALC:{ todayISO(){ return '2026-06-28'; } },
  AUTH:{ getSessionKind(){ return 'owner'; } },
  SUPA:{ isPhase2RuntimeEnabled(){ return false; } },
  CRYPTO:{ isUnlocked(){ return false; }, isEnabled(){ return false; } },
  window:{ scrollTo(){} },
  location:{}, navigator:{}, crypto:globalThis.crypto,
  sessionStorage:{ getItem(){ return null; }, setItem(){}, removeItem(){} },
  setTimeout(){ return 1; }, clearTimeout(){}, setInterval(){ return 1; }, requestAnimationFrame(fn){ fn(); },
  FileReader:class {}, Blob:class {}, URL:{ createObjectURL(){ return ''; }, revokeObjectURL(){} },
});

vm.runInContext(`${instrumented}\nglobalThis.TEST_APP = APP;`, context);
const APP = context.TEST_APP;
APP._testSetCurrentPatientID('ANC-0001');

APP._testSetRecordMode('summary');
if (APP._testGetCurrentPatientID() !== 'ANC-0001') throw new Error('summary toggle changed current patient ID');
if (getElement('patientSummaryView').hidden !== false) throw new Error('summary shell was not shown');
if (getElement('patientEditor').hidden !== true) throw new Error('focused workspace was not hidden in summary mode');
if (getElement('fullName').value !== 'Unsaved Local Edit') throw new Error('summary toggle cleared unsaved editor value');

APP._testSetRecordMode('edit');
if (APP._testGetCurrentPatientID() !== 'ANC-0001') throw new Error('edit toggle changed current patient ID');
if (getElement('patientSummaryView').hidden !== true) throw new Error('summary shell was not hidden in edit mode');
if (getElement('patientEditor').hidden !== false) throw new Error('focused workspace was not shown in edit mode');
if (getElement('fullName').value !== 'Unsaved Local Edit') throw new Error('edit toggle cleared unsaved editor value');

console.log(JSON.stringify({
  passed:true,
  checks:[
    'summary shell and focused workspace controls exist',
    'shell controls are wired to app toggling',
    'summary/edit toggling preserves currentPatientID',
    'summary/edit toggling does not rebuild or clear unsaved editor values',
    'patient editor hidden state is enforced by CSS',
  ],
}, null, 2));
