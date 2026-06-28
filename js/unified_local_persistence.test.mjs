import fs from 'node:fs/promises';
import vm from 'node:vm';

const [dbSource, appSource, indexSource] = await Promise.all([
  fs.readFile(new URL('./db.js', import.meta.url), 'utf8'),
  fs.readFile(new URL('./app.js', import.meta.url), 'utf8'),
  fs.readFile(new URL('../index.html', import.meta.url), 'utf8'),
]);

const instrumentedApp = appSource.replace(
  'init, openPatient, confirmDeletePatient,',
  `init, openPatient,
    _testPersistCurrentRecordLocal:persistCurrentRecordLocal,
    _testPerformAutoSave:performAutoSave,
    _testSetCurrentPatientID:id => { currentPatientID = id; },
    _testQuarantineLegacyManualSyncControls:quarantineLegacyManualSyncControls,
    confirmDeletePatient,`
);

function fakeElement(initial={}) {
  return {
    value:'', checked:false, disabled:false, hidden:false, tabIndex:0,
    className:'', innerHTML:'', textContent:'', onclick:null, style:{},
    classList:{ add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    querySelectorAll(){ return []; }, querySelector(){ return null; }, contains(){ return false; },
    getAttribute(){ return null; }, setAttribute(name,value){ this[name]=value; }, removeAttribute(){},
    addEventListener(){}, removeEventListener(){}, focus(){}, scrollIntoView(){}, closest(){ return null; },
    ...initial,
  };
}

function createLocalStorage() {
  const values = new Map();
  let failKey = '';
  return {
    get length(){ return values.size; },
    key(index){ return [...values.keys()][index] ?? null; },
    getItem(key){ return values.has(key) ? values.get(key) : null; },
    setItem(key,value){
      if (key === failKey) throw Object.assign(new Error(`simulated failure for ${key}`), {name:'QuotaExceededError'});
      values.set(key, String(value));
    },
    removeItem(key){ values.delete(key); },
    clear(){ values.clear(); },
    failOn(key){ failKey = key; },
    stopFailing(){ failKey = ''; },
  };
}

function createRuntime() {
  const elements = new Map();
  const missingElements = new Set();
  const getElement = id => {
    if (missingElements.has(id)) return null;
    if (!elements.has(id)) elements.set(id, fakeElement());
    return elements.get(id);
  };
  const localStorage = createLocalStorage();
  const state = {
    visits:[], scans:[], procedures:[], labs:{}, problems:[], medications:[],
    toasts:[], cloudCalls:[],
    collectCounts:{visits:0,scans:0,procedures:0,labs:0,problems:0,medications:0},
  };

  const UI = {
    toast(message,type){ state.toasts.push({message,type}); }, modal(){},
    collectVisits(){ state.collectCounts.visits += 1; return structuredClone(state.visits); },
    collectScans(){ state.collectCounts.scans += 1; return structuredClone(state.scans); },
    collectProcs(){ state.collectCounts.procedures += 1; return structuredClone(state.procedures); },
    collectLabs(){ state.collectCounts.labs += 1; return structuredClone(state.labs); },
    collectProblems(){ state.collectCounts.problems += 1; return structuredClone(state.problems); },
    collectMedications(){ state.collectCounts.medications += 1; return structuredClone(state.medications); },
    labLayoutState(){ return {dirty:false,actions:[],template:null}; },
    markLabActionsPersisted(){}, markLabLayoutDecisionComplete(){},
    updateStorageMeter(){}, applyStatusColor(){}, riskBadgeHTML(){ return ''; },
    sameDayLabItems(){ return []; }, sameDayProcedureItems(){ return []; },
    obstetricHistorySummary(){
      return {tpalText:'T0 P0 A0 L0',deliveryText:'No previous delivery',complications:[],rows:[]};
    },
  };
  const CALC = {
    todayISO(){ return '2026-06-23'; }, validateTPAL(){ return []; },
    assessRisk(){ return {suggested:'Low Risk',triggers:{high:[],middle:[]}}; },
    getGA(){ return null; }, getEDD(){ return null; }, getTrimester(){ return null; },
    deriveDating(method='lmp'){ return {lmpDate:'',edd:null,ga:null,label:method === 'lmp' ? 'LMP' : method}; },
    getLabIntelText(){ return ''; }, getMilestones(){ return []; }, formatDate(){ return ''; },
  };
  const document = {
    readyState:'loading', addEventListener(){}, getElementById:getElement,
    querySelectorAll(){ return []; }, querySelector(){ return null; },
  };
  const context = vm.createContext({
    console, document, localStorage, UI, CALC, CONSTANTS:{},
    AUTH:{ getSessionKind(){ return 'owner'; } },
    SUPA:{
      isPhase2RuntimeEnabled(){ return true; },
      async savePatient(data){ state.cloudCalls.push({type:'patient',data:structuredClone(data)}); },
      async saveRelated(type,id,data){ state.cloudCalls.push({type,id,data:structuredClone(data)}); },
    },
    CRYPTO:{ isUnlocked(){ return true; } },
    window:{scrollTo(){},open(){ return null;}}, location:{reload(){}}, navigator:{},
    crypto:globalThis.crypto,
    sessionStorage:{getItem(){return null;},setItem(){},removeItem(){}},
    setTimeout(){return 1;},clearTimeout(){},setInterval(){return 1;},clearInterval(){},
    requestAnimationFrame(fn){fn();}, FileReader:class {}, Blob:class {},
    URL:{createObjectURL(){return '';},revokeObjectURL(){}}, structuredClone,
  });
  vm.runInContext(`${dbSource}\nglobalThis.TEST_DB=DB;`, context);
  vm.runInContext(`${instrumentedApp}\nglobalThis.TEST_APP=APP;`, context);

  function setPatientForm({id='', name='Synthetic Unified Save Patient'}={}) {
    getElement('fullName').value = name;
    getElement('patientID').value = id;
    getElement('riskLevelInput').value = 'Low Risk';
    getElement('patientStatus').value = 'Active Follow-up';
    getElement('calcDate').value = '2026-06-23';
  }
  setPatientForm();
  return {APP:context.TEST_APP, DB:context.TEST_DB, state, elements, missingElements, getElement, localStorage, setPatientForm};
}

function patientIDs(runtime) {
  return Object.keys(runtime.DB.getAllPatients());
}

const checks = [];

{
  const runtime = createRuntime();
  runtime.state.visits = [{date:'2026-06-23',notes:'manual-create'}];
  const result = await runtime.APP.fullSave();
  if (!result.localSaved || patientIDs(runtime).length !== 1) throw new Error('Manual Save did not create exactly one patient');
  if (runtime.getElement('patientSaveState').textContent !== 'Saved locally') throw new Error('Manual Save did not display local save success');
  if (Object.values(runtime.state.collectCounts).some(count => count !== 1)) throw new Error(`Manual Save collection counts: ${JSON.stringify(runtime.state.collectCounts)}`);
  checks.push('new patient Manual Save creates exactly one patient');
}

{
  const runtime = createRuntime();
  runtime.state.visits = [{date:'2026-06-23',notes:'quick-create'}];
  const result = await runtime.APP.quickSave();
  if (!result.localSaved || patientIDs(runtime).length !== 1) throw new Error('Quick Save did not create exactly one patient');
  if (runtime.getElement('patientSaveState').textContent !== 'Saved locally') throw new Error('Quick Save did not display local save success');
  if (Object.values(runtime.state.collectCounts).some(count => count !== 1)) throw new Error(`Quick Save collection counts: ${JSON.stringify(runtime.state.collectCounts)}`);
  checks.push('new patient Quick Save creates exactly one patient');
}

{
  const runtime = createRuntime();
  const created = runtime.APP._testPersistCurrentRecordLocal({allowCreate:true,auditMode:'manual'});
  const originalUuid = created.patient.patientUuid;
  runtime.APP._testSetCurrentPatientID(created.patientID);
  runtime.setPatientForm({id:created.patientID});
  runtime.state.visits = [
    {date:'2026-06-20',notes:'visit-one'},
    {date:'2026-06-23',notes:'visit-two'},
  ];
  Object.keys(runtime.state.collectCounts).forEach(key => { runtime.state.collectCounts[key] = 0; });
  const autosaved = await runtime.APP._testPerformAutoSave();
  if (!autosaved.localSaved || autosaved.patientID !== created.patientID) throw new Error('Autosave changed the patient ID');
  if (autosaved.patient.patientUuid !== originalUuid) throw new Error('Autosave changed the patient UUID');
  if (Object.values(runtime.state.collectCounts).some(count => count !== 1)) throw new Error(`Autosave collection counts: ${JSON.stringify(runtime.state.collectCounts)}`);
  await runtime.APP.fullSave();
  if (patientIDs(runtime).length !== 1) throw new Error('Autosave followed by Manual Save created a duplicate');
  if (runtime.DB.getVisits(created.patientID).length !== 2) throw new Error('Multiple visits did not survive local persistence');
  checks.push('existing autosave preserves identity and autosave then Manual Save does not duplicate');
  checks.push('multiple visits survive reload from the local DB');
}

{
  const runtime = createRuntime();
  const created = runtime.APP._testPersistCurrentRecordLocal({allowCreate:true,auditMode:'manual'});
  runtime.APP._testSetCurrentPatientID(created.patientID);
  runtime.setPatientForm({id:created.patientID});
  runtime.state.visits = [{date:'2026-06-23',notes:'quick-then-manual'}];
  await runtime.APP.quickSave();
  await runtime.APP.fullSave();
  if (patientIDs(runtime).length !== 1) throw new Error('Quick Save followed by Manual Save created a duplicate');
  checks.push('Quick Save followed by Manual Save does not duplicate');
}

{
  const runtime = createRuntime();
  const created = runtime.APP._testPersistCurrentRecordLocal({allowCreate:true,auditMode:'manual'});
  runtime.APP._testSetCurrentPatientID(created.patientID);
  runtime.setPatientForm({id:created.patientID});
  runtime.state.visits = [{date:'2026-06-23',notes:'edited immediately before lock'}];
  await runtime.APP._testPerformAutoSave();
  if (runtime.DB.getVisits(created.patientID)[0]?.notes !== 'edited immediately before lock') {
    throw new Error('Lock-path local persistence did not retain the visit edit');
  }
  checks.push('visit edit survives the local persistence used by lock and reload');
}

{
  const runtime = createRuntime();
  const created = runtime.APP._testPersistCurrentRecordLocal({allowCreate:true,auditMode:'manual'});
  runtime.APP._testSetCurrentPatientID(created.patientID);
  runtime.setPatientForm({id:created.patientID});
  runtime.DB.markChanged();
  runtime.localStorage.failOn('anc_scans');
  const result = await runtime.APP._testPerformAutoSave();
  if (result !== false) throw new Error('Failed collection write reported local success');
  if (!runtime.DB.hasPendingChanges()) throw new Error('Failed collection write cleared pending changes');
  if (runtime.getElement('patientSaveState').textContent === 'Saved') throw new Error('Failed collection write displayed Saved');
  if (runtime.state.toasts.some(item => item.type === 'success')) throw new Error('Failed collection write displayed a success toast');
  checks.push('required collection failure preserves pending state and blocks success');
}

{
  const runtime = createRuntime();
  runtime.DB.markChanged();
  runtime.localStorage.failOn('anc_incremental_sync_v1');
  const result = await runtime.APP.fullSave();
  if (result.localSaved || !runtime.DB.hasPendingChanges()) {
    throw new Error('pending-sync marker failure allowed local save success or cleared pending changes');
  }
  if (runtime.getElement('patientSaveState').textContent === 'Saved locally') {
    throw new Error('pending-sync marker failure displayed local save success');
  }
  checks.push('pending-sync marker failure blocks save completion and preserves pending changes');
}

{
  const runtime = createRuntime();
  runtime.state.visits = [{date:'2026-06-23',notes:'same-snapshot'}];
  runtime.state.scans = [{date:'2026-06-22',category:'Growth scan'}];
  runtime.state.procedures = [{date:'2026-06-21',name:'Synthetic procedure'}];
  runtime.state.labs = {t1:{CBC:{value:'11'}}};
  runtime.state.problems = [{title:'Synthetic problem',status:'Active'}];
  runtime.state.medications = [{drugName:'Synthetic medicine',status:'Active'}];
  const persisted = runtime.APP._testPersistCurrentRecordLocal({allowCreate:true,auditMode:'manual'});
  const required = ['patient','visits','scans','procedures','labs','problems','medications','patientID','created','localSaved'];
  if (required.some(key => !(key in persisted))) throw new Error('Unified persistence result omitted a required snapshot field');
  if (!Object.isFrozen(persisted) || !Object.isFrozen(persisted.visits)) throw new Error('Persisted snapshot is not immutable');
  if (
    persisted.visits[0]?.notes !== 'same-snapshot'
    || persisted.scans[0]?.category !== 'Growth scan'
    || persisted.procedures[0]?.name !== 'Synthetic procedure'
    || persisted.labs?.t1?.CBC?.value !== '11'
    || persisted.problems[0]?.title !== 'Synthetic problem'
    || persisted.medications[0]?.drugName !== 'Synthetic medicine'
  ) {
    throw new Error('Unified persistence returned a different snapshot than it stored');
  }
  checks.push('all local triggers share the immutable unified snapshot structure');
}

{
  const runtime = createRuntime();
  runtime.state.visits = [{date:'2026-06-23',notes:'saved visit'}];
  runtime.state.scans = [{date:'2026-06-22',category:'Saved scan'}];
  runtime.state.procedures = [{date:'2026-06-21',type:'Saved procedure'}];
  runtime.state.labs = {t1:{CBC:{value:'12'}}};
  runtime.state.problems = [{title:'Saved problem',status:'Active'}];
  runtime.state.medications = [{drugName:'Saved medicine',status:'Active'}];
  const created = runtime.APP._testPersistCurrentRecordLocal({allowCreate:true,auditMode:'manual'});
  runtime.APP._testSetCurrentPatientID(created.patientID);
  runtime.setPatientForm({id:created.patientID});
  runtime.state.visits = [];
  runtime.state.scans = [];
  runtime.state.procedures = [];
  runtime.state.labs = {};
  runtime.state.problems = [];
  runtime.state.medications = [];
  ['visitBody','ultraBody','procBody','labWorkspace','problemList','medicationList']
    .forEach(id => runtime.missingElements.add(id));
  runtime.APP._testPersistCurrentRecordLocal({allowCreate:false,auditMode:'manual'});
  if (
    runtime.DB.getVisits(created.patientID)[0]?.notes !== 'saved visit'
    || runtime.DB.getScans(created.patientID)[0]?.category !== 'Saved scan'
    || runtime.DB.getProcedures(created.patientID)[0]?.type !== 'Saved procedure'
    || runtime.DB.getLabs(created.patientID)?.t1?.CBC?.value !== '12'
    || runtime.DB.getProblems(created.patientID)[0]?.title !== 'Saved problem'
    || runtime.DB.getMedications(created.patientID)[0]?.drugName !== 'Saved medicine'
  ) {
    throw new Error('Missing collection DOM overwrote saved collection data');
  }
  checks.push('missing collection DOM preserves saved core collection data');
}

{
  const functionBody = (name, nextName) => {
    const start = appSource.indexOf(`function ${name}`);
    const end = appSource.indexOf(`function ${nextName}`, start + 1);
    return appSource.slice(start, end < 0 ? undefined : end);
  };
  const autosaveBody = functionBody('performAutoSave()', 'setAutoSaveStatus');
  const fullSaveBody = functionBody('fullSave(options={})', 'quickSave');
  const quickSaveBody = functionBody('quickSave()', 'loadPatientIntoForm');
  if (!autosaveBody.includes("persistCurrentRecordLocal({ allowCreate:false, auditMode:'autosave' })")) {
    throw new Error('Autosave bypasses unified local persistence');
  }
  if (!fullSaveBody.includes("persistCurrentRecordLocal({ allowCreate:true, auditMode:'manual' })")) {
    throw new Error('Manual Save bypasses unified local persistence');
  }
  if (!quickSaveBody.includes("persistCurrentRecordLocal({ allowCreate:false, auditMode:'manual' })")) {
    throw new Error('Existing-patient Quick Save bypasses unified local persistence');
  }
  if (quickSaveBody.includes('await performAutoSave()')) {
    throw new Error('Quick Save still performs a duplicate autosave pass');
  }
  if ((appSource.match(/const saved = await performAutoSave\(\);/g) || []).length < 3) {
    throw new Error('Lock, inactivity lock, and sign-out do not reuse the unified autosave path');
  }
  checks.push('Manual Save, Quick Save, Autosave, lock, inactivity, and sign-out use one local path');
}

{
  const runtime = createRuntime();
  const pushItem = fakeElement();
  const pullItem = fakeElement();
  const push = runtime.getElement('navSyncPush');
  const pull = runtime.getElement('navSyncPull');
  push.closest = () => pushItem;
  pull.closest = () => pullItem;
  runtime.APP._testQuarantineLegacyManualSyncControls();
  if (!push.hidden || !pull.hidden || !push.disabled || !pull.disabled || !pushItem.hidden || !pullItem.hidden) {
    throw new Error('Legacy Push/Pull controls remain available at runtime');
  }
  if (!/id="navSyncPush"[^>]*hidden/.test(indexSource) || !/id="navSyncPull"[^>]*hidden/.test(indexSource)) {
    throw new Error('Legacy Push/Pull controls are not hidden before application boot');
  }
  checks.push('legacy Push/Pull controls are unavailable in the normal UI');
}

console.log(JSON.stringify({passed:true,checks}, null, 2));
