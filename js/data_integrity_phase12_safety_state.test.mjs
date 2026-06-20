import fs from 'node:fs/promises';
import vm from 'node:vm';

const appSource = await fs.readFile(new URL('./app.js', import.meta.url), 'utf8');
const instrumented = appSource.replace(
  'init, openPatient, confirmDeletePatient,',
  `init, openPatient,
    _testGetSafetyState:() => _safetyState,
    _testTransitionSafetyState:transitionSafetyState,
    _testBeginImportOperation:beginImportOperation,
    _testCompleteImportOperation:completeImportOperation,
    _testFailImportOperation:failImportOperation,
    _testRecoverApplicationFromStoredData:recoverApplicationFromStoredData,
    _testEnsureClinicalMutationAllowed:ensureClinicalMutationAllowed,
    _testInitializeRecoveryMarkerState:initializeRecoveryMarkerState,
    _testResumeRecoveryAfterReload:resumeRecoveryAfterReload,
    _testApplyImportPayload:applyImportPayload,
    confirmDeletePatient,`
);

function fakeElement() {
  return {
    value:'', checked:false, disabled:false, hidden:false, className:'', innerHTML:'',
    textContent:'', style:{ display:'' },
    classList:{ add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    querySelectorAll(){ return []; }, querySelector(){ return null; }, contains(){ return false; },
    getAttribute(){ return null; }, setAttribute(){}, removeAttribute(){}, focus(){}, addEventListener(){},
  };
}

function createRuntime({ preflightError=null, importError=null, initialMarker='', currentID='ANC-OLD', pending=true } = {}) {
  const elements = new Map();
  const getElement = id => {
    if (!elements.has(id)) elements.set(id, fakeElement());
    return elements.get(id);
  };
  const session = new Map();
  if (initialMarker) session.set('anc_safety_recovery_v1', initialMarker);
  let reloads = 0;
  let modalCount = 0;
  let discarded = 0;
  const DB = {
    assertClinicalStorageReadable(){ if (preflightError) throw preflightError; return true; },
    getCurrentPatient(){ return currentID; },
    getPatient(id){ return id === 'ANC-OLD' ? { patientID:id, fullName:'Old Patient' } : null; },
    hasPendingChanges(){ return pending; },
    discardChanged(){ discarded++; }, getAllPatients(){ return {}; }, isArchived(){ return false; },
    getStorageInfo(){ return {}; }, getVisits(){ return []; }, getScans(){ return []; },
    importAll(){ if (importError) throw importError; return true; },
    getLastImportResult(){ return { updatedPatientIDs:[] }; },
    getLastImportWarnings(){ return []; }, appendAuditEvent(event){ return event; },
  };
  const document = {
    readyState:'loading', addEventListener(){}, getElementById:getElement,
    querySelectorAll(){ return []; }, querySelector(){ return null; },
  };
  const context = vm.createContext({
    console, document, DB,
    sessionStorage:{
      getItem(key){ return session.has(key) ? session.get(key) : null; },
      setItem(key,value){ session.set(key,String(value)); },
      removeItem(key){ session.delete(key); },
    },
    UI:{ modal(){ modalCount++; }, toast(){}, riskBadgeHTML(){ return ''; }, renderDashboard(){}, renderDBTable(){} },
    CALC:{}, CONSTANTS:{}, AUTH:{ getSessionKind(){ return 'owner'; } }, SUPA:{}, CRYPTO:{},
    location:{ reload(){ reloads++; } }, window:{}, navigator:{}, crypto:globalThis.crypto,
    setTimeout(){ return 1; }, clearTimeout(){}, setInterval(){ return 1; }, requestAnimationFrame(fn){ fn(); },
    FileReader:class {}, Blob:class {}, URL:{ createObjectURL(){ return ''; }, revokeObjectURL(){} },
  });
  vm.runInContext(`${instrumented}\nglobalThis.TEST_APP=APP;`, context);
  return {
    APP:context.TEST_APP,
    marker:() => session.get('anc_safety_recovery_v1') || '',
    reloads:() => reloads,
    modalCount:() => modalCount,
    discarded:() => discarded,
  };
}

{
  const runtime = createRuntime({ currentID:null, pending:false });
  const imported = await runtime.APP._testApplyImportPayload('{}', {
    summary:'runtime import', successMessage:'done',
  });
  if (!imported || runtime.APP._testGetSafetyState() !== 'normal' || runtime.discarded() !== 1) {
    throw new Error('successful import did not resume normal autosave state');
  }
}

{
  const runtime = createRuntime({ currentID:null, pending:false, importError:new Error('simulated import write failure') });
  const imported = await runtime.APP._testApplyImportPayload('{}', {
    summary:'runtime failed import', successMessage:'must not complete',
  });
  if (imported || runtime.APP._testGetSafetyState() !== 'import-recovery-required') {
    throw new Error('failed import did not remain in recovery-required state');
  }
}

{
  const runtime = createRuntime({
    currentID:null,
    initialMarker:JSON.stringify({ version:1, kind:'import' }),
  });
  if (!runtime.APP._testInitializeRecoveryMarkerState()) throw new Error('valid reload marker was not detected');
  if (runtime.APP._testGetSafetyState() !== 'reload-recovering') {
    throw new Error('valid reload marker did not enter reload-recovering');
  }
  if (!runtime.APP._testResumeRecoveryAfterReload()) throw new Error('verified reload recovery did not complete');
  if (runtime.APP._testGetSafetyState() !== 'normal' || runtime.marker()) {
    throw new Error('successful reload recovery did not resume normal state and clear marker');
  }
}

{
  const runtime = createRuntime({ initialMarker:JSON.stringify({ version:1, kind:'import', patient:{ name:'forbidden' } }) });
  runtime.APP._testInitializeRecoveryMarkerState();
  if (runtime.APP._testGetSafetyState() !== 'transition-recovery-required') {
    throw new Error('invalid recovery marker did not fail safely');
  }
}

{
  const { APP } = createRuntime();
  APP._testBeginImportOperation();
  if (APP._testGetSafetyState() !== 'import-applying') throw new Error('normal -> import-applying failed');
  APP._testCompleteImportOperation();
  if (APP._testGetSafetyState() !== 'normal') throw new Error('import-applying -> normal failed');
}

{
  const runtime = createRuntime();
  runtime.APP._testBeginImportOperation();
  runtime.APP._testFailImportOperation(new Error('simulated import failure'));
  if (runtime.APP._testGetSafetyState() !== 'import-recovery-required') {
    throw new Error('failed import did not enter recovery-required state');
  }
  if (runtime.APP._testEnsureClinicalMutationAllowed('Save') !== false) {
    throw new Error('recovery-required state allowed a clinical mutation');
  }
  const manualSave = await runtime.APP.fullSave();
  if (manualSave?.localSaved !== false) throw new Error('recovery-required state allowed Manual Save');
  if (await runtime.APP.quickSave() !== false) throw new Error('recovery-required state allowed Quick Save');
  const opened = await runtime.APP.openPatient('ANC-OLD');
  if (opened?.opened !== false) throw new Error('recovery-required state allowed patient switching');
  if (runtime.APP.confirmArchivePatient('ANC-OLD') !== false) throw new Error('recovery-required state allowed Archive');
  if (runtime.APP.restoreArchivedPatient('ANC-OLD') !== false) throw new Error('recovery-required state allowed Restore');
  if (runtime.APP.importBackup({ name:'blocked.json' }) !== undefined) throw new Error('blocked import returned unexpectedly');
  if (!runtime.APP._testRecoverApplicationFromStoredData()) throw new Error('valid recovery did not start reload');
  if (runtime.APP._testGetSafetyState() !== 'reload-recovering' || runtime.reloads() !== 1) {
    throw new Error('recovery did not enter reload-recovering exactly once');
  }
  const marker = JSON.parse(runtime.marker());
  if (JSON.stringify(Object.keys(marker).sort()) !== JSON.stringify(['kind','version'])) {
    throw new Error('recovery marker contains fields beyond version and kind');
  }
}

{
  const runtime = createRuntime({ preflightError:new Error('simulated structural failure') });
  runtime.APP._testBeginImportOperation();
  runtime.APP._testFailImportOperation(new Error('simulated import failure'));
  if (runtime.APP._testRecoverApplicationFromStoredData() !== false) {
    throw new Error('failed recovery preflight attempted reload');
  }
  if (runtime.APP._testGetSafetyState() !== 'import-recovery-required' || runtime.reloads() !== 0) {
    throw new Error('failed recovery preflight did not remain safely suspended');
  }
}

{
  const runtime = createRuntime();
  let error;
  try { runtime.APP._testTransitionSafetyState('normal'); } catch (caught) { error = caught; }
  if (error?.name !== 'SafetyStateTransitionError') throw new Error('invalid state transition did not throw');
  if (runtime.APP._testGetSafetyState() !== 'transition-recovery-required') {
    throw new Error('invalid state transition did not fail into a safe recovery state');
  }
}

console.log(JSON.stringify({
  passed:true,
  checks:[
    'normal -> import-applying -> normal',
    'failed import enters import-recovery-required',
    'recovery-required state blocks mutations',
    'public Save, Quick Save, switch, archive, restore, and import paths are blocked',
    'recovery marker contains no patient or clinical data',
    'recovery preflight failure does not reload or resume',
    'invalid lifecycle transition fails into recovery-required state',
    'verified reload recovery clears marker and resumes normal state',
    'invalid recovery marker structure fails safely',
    'successful import returns to normal and failed import remains suspended',
  ],
}, null, 2));
