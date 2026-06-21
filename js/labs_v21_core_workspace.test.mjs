import fs from 'node:fs/promises';
import vm from 'node:vm';

const constantsSource = await fs.readFile(new URL('./constants.js', import.meta.url), 'utf8');
const calcSource = await fs.readFile(new URL('./calc.js', import.meta.url), 'utf8');
const uiSource = await fs.readFile(new URL('./ui.js', import.meta.url), 'utf8');
const appSource = await fs.readFile(new URL('./app.js', import.meta.url), 'utf8');
const indexSource = await fs.readFile(new URL('../index.html', import.meta.url), 'utf8');

const document = {
  labRoot:null,
  querySelectorAll() { return []; },
  getElementById(id) { return id === 'labTrimesterContent' ? this.labRoot : null; },
};
const context = vm.createContext({
  console, document, setTimeout, clearTimeout,
  DB:{}, APP:{}, crypto:globalThis.crypto,
});
vm.runInContext(`${constantsSource}\nglobalThis.TEST_CONSTANTS=CONSTANTS;`, context);
vm.runInContext(`${calcSource}\nglobalThis.TEST_CALC=CALC;`, context);
context.CONSTANTS = context.TEST_CONSTANTS;
context.CALC = context.TEST_CALC;
vm.runInContext(`${uiSource}\nglobalThis.TEST_UI=UI;`, context);
const {TEST_UI:UI, TEST_CONSTANTS:CONSTANTS, TEST_CALC:CALC} = context;

if (!indexSource.includes('id="labWorkspace"') || /id="labSection_t[123]"/.test(indexSource)) {
  throw new Error('Labs V2.1 workspace did not replace the legacy stacked trimester containers');
}
if (!indexSource.includes('js/constants.js?v=17') || !indexSource.includes('js/ui.js?v=17')) {
  throw new Error('Labs definitions and renderer do not use the coordinated V2.1 cache boundary');
}

for (const panel of ['booking','cbc','diabetes','urinalysis','renal','liver','coagulation','pet','thyroid','infection','genetic','custom']) {
  if (!CONSTANTS.LAB_PANEL_DEFINITIONS.some(item => item.code === panel)) {
    throw new Error(`Labs V2.1 panel is missing: ${panel}`);
  }
}
if (CONSTANTS.LAB_TEST_LIBRARY.Urine_Protein?.testCode !== 'Urine_Protein') {
  throw new Error('Urine Protein no longer uses the risk-compatible Urine_Protein key');
}

for (const [label, labs] of [
  ['missing Labs record', null],
  ['empty Labs object', {}],
  ['empty trimester maps', {t1:{},t2:{},t3:{}}],
]) {
  const html = UI.buildLabsWorkspace(labs, null);
  if (!html.trim() || !html.includes('data-lab-trim="t1"')
    || !html.includes('data-lab-trim="t2"') || !html.includes('data-lab-trim="t3"')
    || !html.includes('data-panel="urinalysis"')
    || !html.includes('data-test-code="Urine_Protein"')
    || !html.includes('data-lab-action="add"')) {
    throw new Error(`${label} did not render the default executable Labs workspace`);
  }
}

UI.buildLabsWorkspace({t1:{},t2:{},t3:{}}, null);
const pendingControls = {
  '.lab-v21-value':{value:'',dataset:{key:'Urine_Nitrite',trim:'t1'}},
  '.lab-v21-date':{value:'',dataset:{fallbackDate:'',originalResultDate:''}},
  '.lab-v21-result-status':{value:'pending',dataset:{originalStatus:''}},
  '.lab-v21-notes':{value:''},
  '.lab-v21-legacy-ordered':{value:''},
};
document.labRoot = {
  querySelectorAll(selector) {
    if (selector === '.lab-v21-row') return [{querySelector: item => pendingControls[item] || null}];
    return [];
  },
};
const pendingRerender = UI.addCustomLabDefinition({testCode:'custom_pending_check',testName:'Pending check'});
document.labRoot = null;
const pendingLabs = UI.collectLabs();
if (!pendingRerender.ok || pendingLabs.t1.Urine_Nitrite?.status !== 'pending'
  || pendingLabs.t1.Urine_Nitrite?.resultDate) {
  throw new Error('layout rerender lost a pending result or created a fake result date');
}

const oldLabs = {
  t1:{
    Urine_Protein:{value:'300',ordered:'2026-01-02',notes:'legacy metadata'},
    CBC:{Hb:'9.8',ordered:'2026-01-03'},
    Legacy_Custom_Test:{value:'Detected',ordered:'2026-01-04',legacyField:'preserve me'},
  },
  t2:{}, t3:{},
};
const oldHtml = UI.buildLabsWorkspace(oldLabs, null);
if (!oldHtml.trim() || !oldHtml.includes('data-panel="urinalysis"')) {
  throw new Error('legacy Labs data produced an empty workspace');
}
if (!oldHtml.includes('value="2026-01-02"') || !oldHtml.includes('lab-v21-legacy-ordered')) {
  throw new Error('legacy ordered date is not used as the non-destructive result-date fallback');
}
if (oldHtml.includes('class="lab-ordered"')) {
  throw new Error('legacy ordered date remains visibly duplicated in Labs V2.1');
}
if (!oldHtml.includes('Legacy Custom Test')) {
  throw new Error('unknown legacy test was not recovered into the Custom panel');
}
const untouched = UI.collectLabs();
if (untouched.t1.Urine_Protein.resultDate || untouched.t1.Urine_Protein.ordered !== '2026-01-02') {
  throw new Error('opening old Labs data destructively rewrote its date metadata');
}

UI.buildLabsWorkspace(oldLabs, null);
const hiddenHtml = UI.hideLabTest('t1','Urine_Protein');
const hiddenLabs = UI.collectLabs();
if (hiddenHtml.includes('data-test-code="Urine_Protein"')) {
  throw new Error('hidden test remains visible');
}
if (hiddenLabs.t1.Urine_Protein?.value !== '300' || hiddenLabs.t1.Urine_Protein?.notes !== 'legacy metadata') {
  throw new Error('hiding a test erased its stored result or metadata');
}
const restoredHtml = UI.restoreLabTest('t1','Urine_Protein');
if (!restoredHtml.includes('value="300"')) {
  throw new Error('restoring a test did not reveal its previous result');
}

UI.buildLabsWorkspace(null, {
  hiddenTestCodes:{t1:['TSH'],t2:[],t3:[]},
  customTests:[{testCode:'custom_clinic',testName:'Clinic test',panelCode:'custom',valueType:'text'}],
});
const newPatientLabs = UI.collectLabs();
if (newPatientLabs._layout || Object.keys(newPatientLabs.t1).length) {
  throw new Error('clinic template pre-created patient layout or empty result objects');
}

UI.buildLabsWorkspace({
  t1:{custom_stable:{value:'12',resultDate:'2026-02-01'}},t2:{},t3:{},
  _layout:{customTests:[{testCode:'custom_stable',testName:'Original name',panelCode:'custom',valueType:'text'}]},
}, null);
const renamed = UI.updateCustomLabDefinition('custom_stable',{testName:'Renamed display',panelCode:'renal'});
if (!renamed.ok || !UI.collectLabs().t1.custom_stable || UI.collectLabs().t1.Renamed_display) {
  throw new Error('renaming a custom test changed its stable storage identity');
}
const duplicate = UI.addCustomLabDefinition({testCode:'custom_other',testName:'Renamed display'});
if (duplicate.ok || !duplicate.message) throw new Error('duplicate custom test name was silently accepted');

UI.buildLabsWorkspace(oldLabs, null);
const risk = CALC.assessRisk({}, UI.collectLabs(), []);
if (!risk.triggers.high.some(item => item.includes('Proteinuria'))) {
  throw new Error('current risk consumer can no longer retrieve Urine_Protein');
}

for (const required of [
  "if (!state.dirty || _archivedRecordMode) return;",
  "auditPersistedLabLayout(id, labLayoutAtSave.actions);",
  "DB.saveSetting('labsV21Template'",
  "DB.saveLabs(id,       labsToSave);",
]) {
  if (!appSource.includes(required)) throw new Error(`Labs V2.1 app integration missing: ${required}`);
}
const autosaveBody = appSource.match(/async function performAutoSave\(\) \{([\s\S]*?)\n  \}/)?.[1] || '';
if (autosaveBody.includes('promptLabLayoutPersistence')) {
  throw new Error('autosave can open the Labs layout persistence prompt');
}

console.log(JSON.stringify({
  passed:true,
  checks:[
    'compact grouped workspace and trimester tabs',
    'missing, empty, and empty-trimester records render predefined tests',
    'pending result survives layout rerender without a fake date',
    'coordinated Labs asset cache boundary prevents mixed renderer definitions',
    'one visible date with non-destructive legacy fallback',
    'old and unknown lab records remain visible',
    'hide and restore preserve results and metadata',
    'clinic template does not create empty patient results',
    'custom test identity remains stable across rename',
    'duplicate custom names are rejected visibly',
    'Urine_Protein remains compatible with risk consumers',
    'layout prompt is manual-save-only and post-persistence',
  ],
},null,2));
