import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile(new URL('./app.js', import.meta.url), 'utf8');
const instrumented = source.replace(
  'init, openPatient, confirmDeletePatient,',
  `init, openPatient,
    _testCommitPatientTransition:commitPatientTransition,
    _testSetCurrentPatientID:id => { currentPatientID = id; },
    _testGetCurrentPatientID:() => currentPatientID,
    _testGetSafetyState:() => _safetyState,
    confirmDeletePatient,`
);

function fakeElement() {
  return {
    value:'', checked:false, disabled:false, hidden:false, className:'', innerHTML:'', textContent:'',
    style:{},
    classList:{ add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    querySelectorAll(){ return []; }, querySelector(){ return null; }, contains(){ return false; },
    getAttribute(){ return null; }, setAttribute(){}, removeAttribute(){}, focus(){},
  };
}

function createRuntime({ failSetCurrent=false, failRender=false, failRollback=false } = {}) {
  const elements = new Map();
  const getElement = id => {
    if (!elements.has(id)) elements.set(id, fakeElement());
    return elements.get(id);
  };
  if (failRender) {
    const fullName = getElement('fullName');
    let value = 'Previous Patient';
    let failed = false;
    Object.defineProperty(fullName, 'value', {
      get(){ return value; },
      set(next){
        if (!failed) { failed = true; throw new Error('simulated target render failure'); }
        value = next;
      },
      configurable:true,
    });
  }

  let storedID = 'ANC-OLD';
  let pending = true;
  let modalCount = 0;
  const DB = {
    assertClinicalStorageReadable(){ return true; },
    getPatient(id){ return id === 'ANC-NEW' ? { patientID:'ANC-NEW', fullName:'New Patient' } : null; },
    hasPendingChanges(){ return false; },
    getCurrentPatient(){ return storedID; },
    setCurrentPatient(id){
      if (failSetCurrent && id === 'ANC-NEW') throw new Error('simulated current ID write failure');
      if (failRollback && id === 'ANC-OLD') throw new Error('simulated rollback write failure');
      storedID = id;
    },
    discardChanged(){ pending = false; },
    getVisits(){ return []; }, getScans(){ return []; }, getProcedures(){ return []; },
    getLabs(){ return null; }, getProblems(){ return []; }, getActiveProblems(){ return []; }, getMedications(){ return []; },
    getActiveMedications(){ return []; },
    getMedicationMemory(){ return []; }, isArchived(){ return false; },
  };
  const document = {
    readyState:'loading',
    addEventListener(){},
    getElementById:getElement,
    querySelectorAll(){ return []; },
    querySelector(){ return null; },
  };
  const context = vm.createContext({
    console, document, DB,
    UI:{ toast(){}, modal(){ modalCount++; }, riskBadgeHTML(){ return ''; }, collectMedications(){ return []; },
      visitMedicationOptionsHTML(){ return ''; }, scanRowHTML(){ return ''; }, procRowHTML(){ return ''; },
      visitRowHTML(){ return ''; }, buildLabGrid(){ return ''; }, applyStatusColor(){}, },
    CALC:{
      todayISO(){ return '2026-06-20'; }, getGA(){ return null; }, getEDD(){ return null; },
      getTrimester(){ return null; }, getLabIntelText(){ return ''; }, getMilestones(){ return []; },
      formatDate(){ return ''; },
    }, CONSTANTS:{}, AUTH:{}, SUPA:{}, CRYPTO:{},
    window:{ scrollTo(){} }, location:{}, navigator:{}, crypto:globalThis.crypto,
    sessionStorage:{ getItem(){ return null; }, setItem(){}, removeItem(){} },
    setTimeout(){ return 1; }, clearTimeout(){}, setInterval(){ return 1; }, requestAnimationFrame(fn){ fn(); },
    FileReader:class {}, Blob:class {}, URL:{ createObjectURL(){ return ''; }, revokeObjectURL(){} },
  });
  vm.runInContext(`${instrumented}\nglobalThis.TEST_APP = APP;`, context);
  context.TEST_APP._testSetCurrentPatientID('ANC-OLD');
  return {
    APP:context.TEST_APP,
    getStoredID:() => storedID,
    isPending:() => pending,
    getModalCount:() => modalCount,
    elements,
  };
}

{
  const runtime = createRuntime();
  const result = await runtime.APP.openPatient('ANC-NEW');
  if (result?.opened !== true) throw new Error('normal patient transition did not open target patient');
  if (runtime.elements.get('patientSummaryView')?.hidden !== false) {
    throw new Error('existing patient did not open in Summary First mode after transition');
  }
}

{
  const runtime = createRuntime({ failRender:true, failRollback:true });
  const result = await runtime.APP.openPatient('ANC-NEW');
  if (result?.opened !== false || !result.error?.rollbackError) {
    throw new Error('catastrophic rollback failure was not returned safely');
  }
  if (runtime.APP._testGetSafetyState() !== 'transition-recovery-required') {
    throw new Error('catastrophic rollback failure did not activate transition recovery');
  }
  if (!runtime.isPending()) throw new Error('catastrophic rollback failure cleared pending state');
  const blockedSave = await runtime.APP.fullSave();
  if (blockedSave?.localSaved !== false) throw new Error('recovery-required state allowed Manual Save');
  const blockedOpen = await runtime.APP.openPatient('ANC-NEW');
  if (blockedOpen?.opened !== false) throw new Error('recovery-required state allowed patient switching');
}

{
  const runtime = createRuntime({ failSetCurrent:true });
  const result = await runtime.APP.openPatient('ANC-NEW');
  if (result?.opened !== false || !result.error) {
    throw new Error('public openPatient did not resolve with a contained failure result');
  }
  if (runtime.getModalCount() !== 1) {
    throw new Error('public openPatient failure was not shown visibly');
  }
  if (runtime.APP._testGetCurrentPatientID() !== 'ANC-OLD' || runtime.getStoredID() !== 'ANC-OLD') {
    throw new Error('public openPatient failure changed patient identity');
  }
}

for (const scenario of [
  { failSetCurrent:true, message:'current ID write failure' },
  { failRender:true, message:'target render failure' },
]) {
  const runtime = createRuntime(scenario);
  let error;
  try {
    await runtime.APP._testCommitPatientTransition({ patientID:'ANC-NEW', fullName:'New Patient' });
  } catch (caught) { error = caught; }
  if (!error) throw new Error(`${scenario.message} did not reject transition`);
  if (runtime.APP._testGetCurrentPatientID() !== 'ANC-OLD') {
    throw new Error(`${scenario.message} changed in-memory patient identity`);
  }
  if (runtime.getStoredID() !== 'ANC-OLD') {
    throw new Error(`${scenario.message} changed persisted patient identity`);
  }
  if (!runtime.isPending()) {
    throw new Error(`${scenario.message} discarded pending changes`);
  }
}

console.log(JSON.stringify({
  passed:true,
  checks:[
    'current-ID write failure preserves in-memory and stored identity',
    'target-render failure rolls persisted identity back',
    'failed transitions preserve pending changes',
    'public openPatient contains rejection and shows a visible error',
    'catastrophic rollback failure blocks saves and further switching',
    'successful existing-patient transition opens Summary First',
  ],
}, null, 2));
