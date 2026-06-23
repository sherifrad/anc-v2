import fs from 'node:fs/promises';
import vm from 'node:vm';

const [dbSource, appSource, indexSource] = await Promise.all([
  fs.readFile(new URL('./db.js', import.meta.url), 'utf8'),
  fs.readFile(new URL('./app.js', import.meta.url), 'utf8'),
  fs.readFile(new URL('../index.html', import.meta.url), 'utf8'),
]);

const instrumented = appSource.replace(
  'init, openPatient, confirmDeletePatient,',
  `init, openPatient,
    _testPersistCurrentRecordLocal:persistCurrentRecordLocal,
    _testRunAutomaticIncrementalSync:runAutomaticIncrementalSync,
    _testRefreshCloudPatient:refreshCloudPatient,
    _testRefreshCloudPatientIndex:refreshCloudPatientIndex,
    _testResumeAutomaticCloudActivity:resumeAutomaticCloudActivity,
    _testBindAutomaticCloudEvents:bindAutomaticCloudEvents,
    _testRenderNavActive:renderNavActive,
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
    insertAdjacentHTML(){},
    ...initial,
  };
}

function memoryStorage(existing=null) {
  const values = existing || new Map();
  return {
    values,
    get length(){ return values.size; },
    key(index){ return [...values.keys()][index] ?? null; },
    getItem(key){ return values.has(key) ? values.get(key) : null; },
    setItem(key,value){ values.set(key,String(value)); },
    removeItem(key){ values.delete(key); },
    clear(){ values.clear(); },
  };
}

function cloudState(existing=null) {
  return existing || {
    patients:new Map(), visits:new Map(), calls:[],
    failPatient:false, failVisits:false, pushCalls:0, pullCalls:0,
    indexReads:0, patientReads:0,
  };
}

function createRuntime({storageValues=null, cloud=null, online=true, unlocked=true}={}) {
  const localStorage = memoryStorage(storageValues);
  const remote = cloudState(cloud);
  const elements = new Map();
  const getElement = id => {
    if (!elements.has(id)) elements.set(id, fakeElement());
    return elements.get(id);
  };
  const listeners = new Map();
  const documentListeners = new Map();
  const navigator = {onLine:online,userAgent:'Synthetic incremental sync test'};
  const security = {unlocked};
  const state = {
    visits:[], scans:[], procedures:[], labs:{}, problems:[], medications:[], toasts:[],
  };
  const UI = {
    toast(message,type){ state.toasts.push({message,type}); }, modal(){},
    collectVisits(){ return structuredClone(state.visits); }, collectScans(){ return structuredClone(state.scans); },
    collectProcs(){ return structuredClone(state.procedures); }, collectLabs(){ return structuredClone(state.labs); },
    collectProblems(){ return structuredClone(state.problems); }, collectMedications(){ return structuredClone(state.medications); },
    labLayoutState(){ return {dirty:false,actions:[],template:null}; },
    markLabActionsPersisted(){}, markLabLayoutDecisionComplete(){}, updateStorageMeter(){},
    renderDBTable(){}, renderDashboard(){},
    applyStatusColor(){}, riskBadgeHTML(){ return ''; }, buildLabsWorkspace(){ return '<div>Labs</div>'; },
    scanRowHTML(){ return ''; }, procRowHTML(){ return ''; }, visitRowHTML(){ return ''; },
    problemRowHTML(){ return ''; }, medicationRowHTML(){ return ''; }, initCollapsible(){},
    sameDayLabItems(){ return []; }, sameDayProcedureItems(){ return []; },
    obstetricHistorySummary(){ return {tpalText:'T0 P0 A0 L0',deliveryText:'No previous delivery',complications:[],rows:[]}; },
  };
  const CALC = {
    todayISO(){ return '2026-06-23'; }, validateTPAL(){ return []; }, debounce(fn){ return fn; },
    assessRisk(){ return {suggested:'Low Risk',triggers:{high:[],middle:[]}}; },
    getGA(){ return null; }, getEDD(){ return null; }, getTrimester(){ return null; },
    getLabIntelText(){ return ''; }, getMilestones(){ return []; }, formatDate(){ return ''; },
  };
  const SUPA = {
    isPhase2RuntimeEnabled(){ return false; },
    async isOnline(){ return navigator.onLine; },
    async savePatient(patient){
      remote.calls.push({kind:'patient',patientID:patient.patientID});
      if (remote.failPatient) throw new Error('simulated patient write failure');
      remote.patients.set(patient.patientID, structuredClone(patient));
    },
    async saveRelated(type,patientID,value){
      remote.calls.push({kind:'related',type,patientID});
      if (type !== 'visits') throw new Error(`automatic path wrote unrelated ${type}`);
      if (remote.failVisits) throw new Error('simulated visit write failure');
      remote.visits.set(patientID, structuredClone(value));
    },
    async getPatient(patientID){ remote.patientReads += 1; return structuredClone(remote.patients.get(patientID) || null); },
    async getAllPatients(){ remote.indexReads += 1; return Object.fromEntries([...remote.patients].map(([id,value]) => [id,structuredClone(value)])); },
    async getRelated(type,patientID){
      if (type !== 'visits') throw new Error(`automatic refresh read unrelated ${type}`);
      return structuredClone(remote.visits.get(patientID) ?? null);
    },
    async pushToCloud(){ remote.pushCalls += 1; throw new Error('legacy push invoked'); },
    async pullFromCloud(){ remote.pullCalls += 1; throw new Error('legacy pull invoked'); },
  };
  const document = {
    readyState:'loading', visibilityState:'visible',
    addEventListener(type,fn){
      const list=documentListeners.get(type)||[]; list.push(fn); documentListeners.set(type,list);
    },
    getElementById:getElement, querySelectorAll(){ return []; }, querySelector(){ return null; },
  };
  const window = {
    scrollTo(){}, open(){ return null; },
    addEventListener(type,fn){ const list=listeners.get(type)||[]; list.push(fn); listeners.set(type,list); },
  };
  const timers=[];
  const context=vm.createContext({
    console, document, window, navigator, localStorage, UI, CALC, SUPA, CONSTANTS:{},
    AUTH:{getSessionKind(){return 'owner';}}, CRYPTO:{isUnlocked(){return security.unlocked;}},
    location:{reload(){}}, sessionStorage:{getItem(){return null;},setItem(){},removeItem(){}},
    crypto:globalThis.crypto, structuredClone,
    setTimeout(fn){timers.push(fn);return timers.length;}, clearTimeout(){}, setInterval(){return 1;}, clearInterval(){},
    requestAnimationFrame(fn){fn();}, FileReader:class {}, Blob:class {},
    URL:{createObjectURL(){return '';},revokeObjectURL(){}},
  });
  vm.runInContext(`${dbSource}\nglobalThis.TEST_DB=DB;`,context);
  vm.runInContext(`${instrumented}\nglobalThis.TEST_APP=APP;`,context);
  getElement('fullName').value='Synthetic Incremental Sync Patient';
  getElement('riskLevelInput').value='Low Risk';
  getElement('patientStatus').value='Active Follow-up';
  getElement('calcDate').value='2026-06-23';

  async function dispatch(type) {
    await Promise.all((listeners.get(type)||[]).map(fn=>fn({type})));
  }
  return {
    APP:context.TEST_APP, DB:context.TEST_DB, state, remote, elements, getElement,
    localStorage, navigator, timers, dispatch, security, storageValues:localStorage.values,
  };
}

function createPatient(runtime, marker='initial visit') {
  runtime.state.visits=[{date:'2026-06-23',notes:marker}];
  return runtime.APP._testPersistCurrentRecordLocal({allowCreate:true,auditMode:'manual'});
}

const checks=[];

{
  const runtime=createRuntime();
  const saved=createPatient(runtime);
  const pending=runtime.DB.getPendingCloudSync(saved.patientID);
  if (!pending || pending.patient.patientID!==saved.patientID || pending.visits[0]?.notes!=='initial visit') {
    throw new Error('unified local save did not create the patient and Visit pending snapshot');
  }
  if (runtime.remote.calls.length) throw new Error('local persistence wrote to cloud directly');
  if (!runtime.timers.length) throw new Error('owner save did not start the automatic sync debounce');
  checks.push('unified local save creates a pending patient and Visit snapshot');
}

{
  const runtime=createRuntime({unlocked:false});
  const saved=createPatient(runtime,'adapter unavailable');
  if (!runtime.DB.hasPendingCloudSync(saved.patientID)) throw new Error('unready adapter lost the pending queue');
  if (runtime.getElement('patientSaveState').textContent!=='Saved locally — sync pending') {
    throw new Error('unready adapter left the status as plain Saved');
  }
  await runtime.APP._testRunAutomaticIncrementalSync();
  if (runtime.remote.calls.length) throw new Error('worker ran before adapter initialization');
  runtime.security.unlocked=true;
  await runtime.APP._testResumeAutomaticCloudActivity('unlock');
  if (runtime.DB.hasPendingCloudSync(saved.patientID) || !runtime.remote.patients.has(saved.patientID)) {
    throw new Error('adapter initialization did not resume the persistent queue');
  }
  checks.push('unready adapter stays pending and later initialization resumes synchronization');
}

{
  const runtime=createRuntime();
  const saved=createPatient(runtime,'only changed patient');
  await runtime.APP._testRunAutomaticIncrementalSync();
  const kinds=runtime.remote.calls.map(call=>call.kind==='patient'?'patient':call.type).join(',');
  if (kinds!=='visits,patient') throw new Error(`automatic sync wrote unexpected data: ${kinds}`);
  if (runtime.DB.hasPendingCloudSync(saved.patientID)) throw new Error('successful patient and Visit writes did not clear pending state');
  if (runtime.getElement('patientSaveState').textContent!=='Synced') throw new Error('successful two-write sync did not show Synced');
  checks.push('automatic sync writes only the changed patient and Visits, then clears pending');
}

{
  const storageValues=new Map([['anc_phase2_reconciled_batch','legacy-batch-marker']]);
  const runtime=createRuntime({storageValues});
  runtime.APP._testBindAutomaticCloudEvents();
  await runtime.dispatch('focus');
  if (runtime.remote.indexReads!==1) throw new Error('existing-session focus was suppressed by the legacy batch marker');
  await runtime.APP._testRenderNavActive('database');
  if (runtime.remote.indexReads!==2) throw new Error('Patient Database open did not invoke incremental refresh');
  if (!runtime.localStorage.getItem('anc_phase2_reconciled_batch')) throw new Error('test unexpectedly cleared website storage');
  checks.push('focus and Patient Database refresh ignore the legacy marker without clearing storage');
}

{
  const runtime=createRuntime();
  const saved=createPatient(runtime,'patient failure retained');
  runtime.remote.failPatient=true;
  await runtime.APP._testRunAutomaticIncrementalSync();
  if (!runtime.DB.hasPendingCloudSync(saved.patientID) || runtime.DB.getVisits(saved.patientID)[0]?.notes!=='patient failure retained') {
    throw new Error('patient-write failure lost local data or pending state');
  }
  if (runtime.getElement('patientSaveState').textContent!=='Saved locally — sync pending') throw new Error('patient-write failure showed unsafe status');
  checks.push('patient-write failure preserves local data and pending state');
}

{
  const runtime=createRuntime();
  const saved=createPatient(runtime,'visit failure retained');
  runtime.remote.failVisits=true;
  await runtime.APP._testRunAutomaticIncrementalSync();
  if (!runtime.DB.hasPendingCloudSync(saved.patientID) || runtime.DB.getVisits(saved.patientID)[0]?.notes!=='visit failure retained') {
    throw new Error('Visit-write failure lost local data or pending state');
  }
  runtime.remote.failVisits=false;
  await runtime.APP._testRunAutomaticIncrementalSync();
  if (runtime.remote.patients.size!==1 || runtime.remote.visits.size!==1 || runtime.remote.visits.get(saved.patientID).length!==1) {
    throw new Error('retry duplicated the patient or Visit collection');
  }
  if (runtime.remote.patients.get(saved.patientID).patientUuid!==saved.patient.patientUuid) throw new Error('retry changed patient UUID');
  checks.push('Visit-write failure remains pending and idempotent retry creates no duplicates');
}

{
  const runtime=createRuntime({online:false});
  const saved=createPatient(runtime,'offline edit');
  runtime.APP._testBindAutomaticCloudEvents();
  await runtime.APP._testRunAutomaticIncrementalSync();
  if (!runtime.DB.hasPendingCloudSync(saved.patientID) || runtime.remote.calls.length) throw new Error('offline edit did not remain local and pending');
  runtime.navigator.onLine=true;
  await runtime.dispatch('online');
  if (runtime.DB.hasPendingCloudSync(saved.patientID) || runtime.remote.visits.get(saved.patientID)?.[0]?.notes!=='offline edit') {
    throw new Error('online event did not retry the offline edit');
  }
  checks.push('offline edit syncs automatically on the online event');
}

{
  const remote=cloudState();
  const first=createRuntime({cloud:remote,online:false});
  const saved=createPatient(first,'reload pending');
  const reloaded=createRuntime({cloud:remote,storageValues:first.storageValues,online:true});
  await reloaded.APP._testRunAutomaticIncrementalSync();
  if (reloaded.DB.hasPendingCloudSync(saved.patientID) || remote.visits.get(saved.patientID)?.[0]?.notes!=='reload pending') {
    throw new Error('reload did not retain and retry pending data');
  }
  checks.push('reload retains and retries the pending operation');
}

{
  const runtime=createRuntime();
  const saved=createPatient(runtime,'unsynced local');
  runtime.remote.patients.set(saved.patientID,{...structuredClone(saved.patient),fullName:'Newer Cloud Name',updatedAt:'2099-01-01T00:00:00.000Z'});
  runtime.remote.visits.set(saved.patientID,[{date:'2026-06-23',notes:'newer cloud visit'}]);
  await runtime.APP._testRefreshCloudPatient(saved.patientID);
  if (runtime.DB.getPatient(saved.patientID).fullName==='Newer Cloud Name') throw new Error('cloud refresh overwrote pending local patient data');
  if (runtime.DB.getVisits(saved.patientID)[0]?.notes!=='unsynced local') throw new Error('cloud refresh overwrote pending local Visits');
  if (runtime.getElement('patientSaveState').textContent!=='Cloud update available — local changes preserved') {
    throw new Error('cloud/local conflict warning status was not shown');
  }
  checks.push('cloud refresh preserves unsynced local patient and Visit snapshots');
}

{
  const runtime=createRuntime();
  const saved=createPatient(runtime,'older local visit');
  runtime.DB.clearPendingCloudSync(saved.patientID);
  runtime.DB.discardChanged();
  const uuid=saved.patient.patientUuid;
  runtime.remote.patients.set(saved.patientID,{...structuredClone(saved.patient),fullName:'Cloud Refreshed Patient',patientUuid:uuid,updatedAt:'2099-01-01T00:00:00.000Z'});
  runtime.remote.visits.set(saved.patientID,[{date:'2026-06-24',notes:'newer cloud visit'}]);
  const result=await runtime.APP.openPatient(saved.patientID);
  if (!result.opened || runtime.DB.getPatient(saved.patientID).fullName!=='Cloud Refreshed Patient') throw new Error('opening the patient did not apply its newer cloud snapshot');
  if (runtime.DB.getVisits(saved.patientID)[0]?.notes!=='newer cloud visit') throw new Error('newer cloud Visits were not applied');
  if (runtime.DB.getPatient(saved.patientID).patientUuid!==uuid) throw new Error('cloud refresh changed patient UUID');
  const nextID=runtime.DB.savePatient({fullName:'Next Synthetic Patient'});
  if (nextID===saved.patientID || runtime.DB.getPatient(saved.patientID).fullName!=='Cloud Refreshed Patient') {
    throw new Error('cloud-applied MRN was overwritten by the next local patient ID');
  }
  checks.push('opening-path cloud refresh retrieves newer patient and Visits without local pending data');
}

{
  const runtime=createRuntime();
  const saved=createPatient(runtime,'index refresh');
  await runtime.APP._testRunAutomaticIncrementalSync();
  await runtime.APP._testRefreshCloudPatientIndex('database');
  if (runtime.remote.pushCalls || runtime.remote.pullCalls) throw new Error('automatic path invoked legacy full-database Push/Pull');
  if (appSource.includes('await SUPA.reconcilePhase2Local()')) throw new Error('incremental trigger invokes legacy full reconciliation');
  if (!appSource.includes("await refreshCloudPatient(id, { renderCurrent:true });")) throw new Error('openPatient path is not wired to targeted cloud refresh');
  if (!appSource.includes("resumeAutomaticCloudActivity('database')")) throw new Error('Patient Database path is not wired to automatic refresh');
  if (!saved.patientID) throw new Error('test setup failed');
  checks.push('automatic triggers avoid legacy full-database Push/Pull');
}

{
  const serviceWorkerSource=await fs.readFile(new URL('../service-worker.js',import.meta.url),'utf8');
  for (const asset of [
    'css/style.css?v=25','js/db.js?v=17','js/supabase.js?v=19','js/app.js?v=27',
    'js/phase2_runtime.mjs?v=18','js/phase2_cloud_adapter.mjs?v=2',
  ]) {
    if (!indexSource.includes(asset) && !serviceWorkerSource.includes(asset)) {
      throw new Error(`cache boundary is missing ${asset}`);
    }
  }
  if (!indexSource.includes("service-worker.js?v=30") || !indexSource.includes("updateViaCache:'none'")) {
    throw new Error('existing sessions are not forced to check the new service worker');
  }
  if (!serviceWorkerSource.includes("anc-emr-v2-shell-30")) throw new Error('service-worker cache was not advanced');
  checks.push('asset and service-worker versions force established sessions onto the POC runtime');
}

{
  const runtime=createRuntime();
  const cloudID='ANC-0042';
  runtime.remote.patients.set(cloudID,{
    patientID:cloudID,
    patientUuid:'42424242-4242-4242-8242-424242424242',
    fullName:'Cloud Only Synthetic Patient',
    updatedAt:'2099-01-01T00:00:00.000Z',
  });
  runtime.remote.visits.set(cloudID,[{date:'2026-06-23',notes:'cloud-only visit'}]);
  await runtime.APP._testRefreshCloudPatientIndex('startup');
  const newID=runtime.DB.savePatient({fullName:'New Local Synthetic Patient'});
  if (newID!=='ANC-0043' || runtime.DB.getPatient(cloudID)?.fullName!=='Cloud Only Synthetic Patient') {
    throw new Error('cloud refresh did not protect the imported MRN from local counter reuse');
  }
  checks.push('cloud-discovered MRNs advance the existing local counter without duplication');
}

{
  const runtime=createRuntime();
  const pushItem=fakeElement(); const pullItem=fakeElement();
  const push=runtime.getElement('navSyncPush'); const pull=runtime.getElement('navSyncPull');
  push.closest=()=>pushItem; pull.closest=()=>pullItem;
  runtime.APP._testQuarantineLegacyManualSyncControls();
  if (!push.hidden||!pull.hidden||!pushItem.hidden||!pullItem.hidden) throw new Error('legacy Push/Pull controls are visible');
  if (!/id="navSyncPush"[^>]*hidden/.test(indexSource)||!/id="navSyncPull"[^>]*hidden/.test(indexSource)) {
    throw new Error('legacy Push/Pull controls are visible before boot');
  }
  checks.push('legacy Push/Pull controls remain unavailable');
}

console.log(JSON.stringify({passed:true,checks},null,2));
