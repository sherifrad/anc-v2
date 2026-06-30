import fs from 'node:fs/promises';
import vm from 'node:vm';

const [dbSource, appSource] = await Promise.all([
  fs.readFile(new URL('./db.js', import.meta.url), 'utf8'),
  fs.readFile(new URL('./app.js', import.meta.url), 'utf8'),
]);

function instrumentApp(source) {
  return source.replace(
    'init, openPatient, confirmDeletePatient,',
    `init, openPatient,
      _testPersistCurrentRecordLocal:persistCurrentRecordLocal,
      _testRunAutomaticIncrementalSync:runAutomaticIncrementalSync,
      _testRefreshCloudPatient:refreshCloudPatient,
      _testRefreshCloudPatientIndex:refreshCloudPatientIndex,
      _testResumeAutomaticCloudActivity:resumeAutomaticCloudActivity,
      _testBindAutomaticCloudEvents:bindAutomaticCloudEvents,
      _testRenderNavActive:renderNavActive,
      _testUpdateSyncStatus:updateSyncStatus,
      _testScheduleAutomaticIncrementalSync:scheduleAutomaticIncrementalSync,
      _testSetCurrentPatientID:id => { currentPatientID = id; },
      _testBasicOfflineReleaseActive:basicOfflineReleaseActive,
      confirmDeletePatient,`
  );
}

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

function memoryStorage() {
  const values = new Map();
  let failKey = '';
  return {
    values,
    get length(){ return values.size; },
    key(index){ return [...values.keys()][index] ?? null; },
    getItem(key){ return values.has(key) ? values.get(key) : null; },
    setItem(key,value){
      if (key === failKey) throw Object.assign(new Error(`simulated failure for ${key}`), { name:'QuotaExceededError' });
      values.set(key, String(value));
    },
    removeItem(key){ values.delete(key); },
    clear(){ values.clear(); },
    failOn(key){ failKey = key; },
  };
}

function createRuntime({ basicOffline=true }={}) {
  const localStorage = memoryStorage();
  const elements = new Map();
  const listeners = new Map();
  const documentListeners = new Map();
  const timers = [];
  const logs = [];
  const calls = {
    isOnline:0, savePatient:0, saveRelated:0, getPatient:0, getAllPatients:0,
    getRelated:0, markPendingCloudSync:0, getAccessToken:0, getSession:0,
    createClient:0, dashboardRefreshes:0,
  };
  const getElement = id => {
    if (!elements.has(id)) elements.set(id, fakeElement());
    return elements.get(id);
  };
  getElement('view-dashboard').classList.contains = cls => cls === 'active';
  getElement('syncStatus').textContent = 'Checking sync...';

  const UI = {
    toast(){}, modal(){},
    collectVisits(){ return [{ date:'2026-06-23', notes:'local only' }]; },
    collectScans(){ return []; }, collectProcs(){ return []; },
    collectLabs(){ return {}; }, collectProblems(){ return []; }, collectMedications(){ return []; },
    labLayoutState(){ return { dirty:false, actions:[], template:null }; },
    markLabActionsPersisted(){}, markLabLayoutDecisionComplete(){}, updateStorageMeter(){},
    renderDBTable(){}, renderDashboard(){ calls.dashboardRefreshes += 1; },
    applyStatusColor(){}, riskBadgeHTML(){ return ''; }, buildLabsWorkspace(){ return '<div>Labs</div>'; },
    scanRowHTML(){ return ''; }, procRowHTML(){ return ''; }, visitRowHTML(){ return ''; },
    problemRowHTML(){ return ''; }, medicationRowHTML(){ return ''; }, initCollapsible(){},
    sameDayLabItems(){ return []; }, sameDayProcedureItems(){ return []; },
    obstetricHistorySummary(){ return { tpalText:'T0 P0 A0 L0', deliveryText:'No previous delivery', complications:[], rows:[] }; },
  };
  const CALC = {
    todayISO(){ return '2026-06-23'; }, validateTPAL(){ return []; }, debounce(fn){ return fn; },
    assessRisk(){ return { suggested:'Low Risk', triggers:{ high:[], middle:[] } }; },
    getGA(){ return null; }, getEDD(){ return null; }, getTrimester(){ return null; },
    getLabIntelText(){ return ''; }, getMilestones(){ return []; }, formatDate(){ return ''; },
    deriveDating(){ return { lmpDate:'', edd:'', ga:null, label:'LMP' }; },
  };
  const SUPA = {
    isPhase2RuntimeEnabled(){ return false; },
    async isOnline(){ calls.isOnline += 1; return true; },
    async savePatient(){ calls.savePatient += 1; },
    async saveRelated(){ calls.saveRelated += 1; },
    async getPatient(patientID){
      calls.getPatient += 1;
      return { patientID, fullName:'Cloud Patient', updatedAt:'2099-01-01T00:00:00.000Z' };
    },
    async getAllPatients(){
      calls.getAllPatients += 1;
      return { 'ANC-9999':{ patientID:'ANC-9999', patientUuid:'cloud-uuid', fullName:'Cloud Index Patient', updatedAt:'2099-01-01T00:00:00.000Z' } };
    },
    async getRelated(){ calls.getRelated += 1; return []; },
  };
  const document = {
    readyState:'loading', visibilityState:'visible',
    addEventListener(type,fn){
      const list = documentListeners.get(type) || [];
      list.push(fn);
      documentListeners.set(type, list);
    },
    getElementById:getElement, querySelectorAll(){ return []; }, querySelector(){ return null; },
  };
  const window = {
    scrollTo(){}, open(){ return null; },
    addEventListener(type,fn){
      const list = listeners.get(type) || [];
      list.push(fn);
      listeners.set(type, list);
    },
    supabase:{
      createClient(){
        calls.createClient += 1;
        return {
          auth:{
            async getSession(){ calls.getSession += 1; return { data:{ session:null }, error:null }; },
          },
        };
      },
    },
  };
  const source = basicOffline
    ? appSource
    : appSource.replace('authGate:true', 'authGate:false');
  const context = vm.createContext({
    console:{
      info(...args){ logs.push({ level:'info', args }); },
      warn(...args){ logs.push({ level:'warn', args }); },
      error(...args){ logs.push({ level:'error', args }); },
      log(...args){ logs.push({ level:'log', args }); },
    },
    document, window, navigator:{ onLine:true, userAgent:'Basic Offline isolation addendum test' },
    localStorage, UI, CALC, SUPA, CONSTANTS:{},
    AUTH:{
      getSessionKind(){ return 'owner'; },
      async getAccessToken(){ calls.getAccessToken += 1; return 'synthetic-token'; },
      async getSession(){ calls.getSession += 1; return null; },
    },
    CRYPTO:{ isUnlocked(){ return true; }, isEnabled(){ return false; } },
    location:{ reload(){} }, sessionStorage:{ getItem(){ return null; }, setItem(){}, removeItem(){} },
    crypto:globalThis.crypto, structuredClone,
    setTimeout(fn, delay=0){ timers.push({ fn, delay }); return timers.length; }, clearTimeout(){},
    setInterval(){ return 1; }, clearInterval(){}, requestAnimationFrame(fn){ fn(); },
    FileReader:class {}, Blob:class {}, URL:{ createObjectURL(){ return ''; }, revokeObjectURL(){} },
  });
  vm.runInContext(`${dbSource}\nconst originalMarkPendingCloudSync = DB.markPendingCloudSync;\nDB.markPendingCloudSync = function(...args){ globalThis.TEST_CALLS.markPendingCloudSync += 1; return originalMarkPendingCloudSync.apply(DB, args); };\nglobalThis.TEST_DB=DB;`, context);
  context.TEST_CALLS = calls;
  vm.runInContext(`${instrumentApp(source)}\nglobalThis.TEST_APP=APP;`, context);
  getElement('fullName').value = basicOffline ? 'Basic Offline Patient' : 'Future Online Patient';
  getElement('riskLevelInput').value = 'Low Risk';
  getElement('patientStatus').value = 'Active Follow-up';
  getElement('calcDate').value = '2026-06-23';

  async function dispatchWindow(type) {
    await Promise.all((listeners.get(type) || []).map(fn => fn({ type })));
  }
  async function dispatchDocument(type) {
    await Promise.all((documentListeners.get(type) || []).map(fn => fn({ type })));
  }
  return {
    APP:context.TEST_APP, DB:context.TEST_DB, calls, logs, listeners,
    documentListeners, timers, getElement, localStorage, dispatchWindow, dispatchDocument,
  };
}

function incrementalLogs(runtime) {
  return runtime.logs
    .filter(log => String(log.args[0]).includes('[ANC incremental sync]'))
    .map(log => String(log.args[1] || ''));
}

const checks = [];

{
  const runtime = createRuntime();
  if (!runtime.APP._testBasicOfflineReleaseActive()) throw new Error('Basic Offline gate is not active in default runtime');
  await runtime.APP.init();
  if (runtime.listeners.has('online') || runtime.listeners.has('focus') || runtime.documentListeners.has('visibilitychange')) {
    throw new Error('Basic Offline boot bound automatic cloud event listeners');
  }
  if (runtime.timers.some(timer => timer.delay === 2000)) {
    throw new Error('Basic Offline boot scheduled delayed Supabase status probe');
  }
  if (runtime.calls.isOnline || runtime.calls.getAccessToken || runtime.calls.getSession || runtime.calls.createClient) {
    throw new Error('Basic Offline boot reached Supabase/Auth status path');
  }
  checks.push('Basic Offline boot binds no cloud listeners and schedules no delayed Supabase probe');
}

{
  const runtime = createRuntime();
  await runtime.APP._testUpdateSyncStatus();
  if (runtime.calls.isOnline) throw new Error('Basic Offline updateSyncStatus called SUPA.isOnline');
  if (runtime.calls.getAccessToken || runtime.calls.getSession || runtime.calls.createClient) {
    throw new Error('Basic Offline updateSyncStatus reached Auth/client path');
  }
  checks.push('Basic Offline sync status reaches no Auth/session/token/client path');
}

{
  const runtime = createRuntime();
  runtime.DB.markChanged();
  const saved = runtime.APP._testPersistCurrentRecordLocal({ allowCreate:true, auditMode:'manual' });
  if (!saved.localSaved || !runtime.DB.getPatient(saved.patientID)) throw new Error('Basic Offline local save failed');
  if (runtime.DB.hasPendingChanges()) throw new Error('Basic Offline local save did not clear normal dirty state');
  if (runtime.calls.markPendingCloudSync) throw new Error('Basic Offline local save called DB.markPendingCloudSync');
  if (runtime.DB.hasPendingCloudSync()) throw new Error('Basic Offline local save created a cloud snapshot');
  if (runtime.timers.length) throw new Error('Basic Offline local save scheduled incremental sync');
  if (runtime.calls.savePatient || runtime.calls.saveRelated) throw new Error('Basic Offline local save called Supabase write path');
  checks.push('Basic Offline local save succeeds, clears dirty state, and creates no cloud queue');
}

{
  const runtime = createRuntime();
  const saved = runtime.APP._testPersistCurrentRecordLocal({ allowCreate:true, auditMode:'manual' });
  await runtime.APP._testBindAutomaticCloudEvents();
  await runtime.dispatchWindow('online');
  await runtime.dispatchWindow('focus');
  await runtime.dispatchDocument('visibilitychange');
  await runtime.APP._testRenderNavActive('database');
  runtime.APP._testScheduleAutomaticIncrementalSync();
  await runtime.APP._testRunAutomaticIncrementalSync();
  await runtime.APP._testRefreshCloudPatient(saved.patientID);
  await runtime.APP._testRefreshCloudPatientIndex('manual');
  await runtime.APP._testResumeAutomaticCloudActivity('manual');
  const cloudCalls = ['isOnline','savePatient','saveRelated','getPatient','getAllPatients','getRelated']
    .filter(name => runtime.calls[name]);
  if (cloudCalls.length) throw new Error(`Basic Offline event/worker path invoked cloud calls: ${cloudCalls.join(', ')}`);
  const forbiddenLogs = ['trigger-fired','local-snapshot-queued','debounce-scheduled','worker-entered','patient-refresh-entered'];
  const emitted = incrementalLogs(runtime).filter(event => forbiddenLogs.includes(event));
  if (emitted.length) throw new Error(`Basic Offline emitted forbidden sync logs: ${emitted.join(', ')}`);
  checks.push('Basic Offline events, scheduler, worker, and refresh paths return before cloud work or trace logs');
}

{
  const runtime = createRuntime({ basicOffline:false });
  if (runtime.APP._testBasicOfflineReleaseActive()) throw new Error('Future online fixture did not disable Basic Offline gate');
  const onlinePatientID = runtime.DB.savePatient({
    patientID:'ANC-9000',
    patientUuid:'online-local-uuid',
    fullName:'Future Online Patient',
    updatedAt:'2026-06-23T00:00:00.000Z',
  });
  runtime.APP._testSetCurrentPatientID(onlinePatientID);
  runtime.DB.saveVisits(onlinePatientID, [{ date:'2026-06-23', notes:'future online visit' }]);
  runtime.DB.markPendingCloudSync(runtime.DB.getPatient(onlinePatientID), runtime.DB.getVisits(onlinePatientID));
  runtime.APP._testBindAutomaticCloudEvents();
  await runtime.APP._testUpdateSyncStatus();
  await runtime.APP._testRunAutomaticIncrementalSync();
  await runtime.APP._testRefreshCloudPatient(onlinePatientID);
  await runtime.APP._testRefreshCloudPatientIndex('future-online');
  await runtime.APP._testResumeAutomaticCloudActivity('future-online');
  if (!runtime.listeners.has('online') || !runtime.listeners.has('focus') || !runtime.documentListeners.has('visibilitychange')) {
    throw new Error('Future online fixture could not bind cloud event listeners');
  }
  if (!runtime.calls.isOnline || !runtime.calls.savePatient || !runtime.calls.saveRelated || !runtime.calls.getPatient || !runtime.calls.getAllPatients) {
    throw new Error('Future online cloud functions were not retained/callable');
  }
  if (!incrementalLogs(runtime).some(event => event === 'worker-entered')) {
    throw new Error('Future online worker trace path was not retained');
  }
  checks.push('Future online functions remain present and callable when Basic Offline gate is disabled');
}

{
  const runtime = createRuntime();
  runtime.DB.markChanged();
  runtime.localStorage.failOn('anc_incremental_sync_v1');
  const result = runtime.APP._testPersistCurrentRecordLocal({ allowCreate:true, auditMode:'manual' });
  if (!result.localSaved || runtime.DB.hasPendingChanges()) {
    throw new Error('Basic Offline treated pending marker write failure as required persistence');
  }
  if (runtime.calls.markPendingCloudSync || runtime.DB.hasPendingCloudSync()) {
    throw new Error('Basic Offline touched pending marker despite sync isolation');
  }
  const onlineRuntime = createRuntime({ basicOffline:false });
  onlineRuntime.DB.markChanged();
  onlineRuntime.localStorage.failOn('anc_incremental_sync_v1');
  let onlineFailed = false;
  try {
    onlineRuntime.APP._testPersistCurrentRecordLocal({ allowCreate:true, auditMode:'manual' });
  } catch {
    onlineFailed = true;
  }
  if (!onlineFailed) throw new Error('Future online fixture did not preserve pending-marker failure semantics');
  checks.push('Pending-marker failure is ignored only under Basic Offline contract');
}

if (!appSource.includes('function basicOfflineReleaseActive()')) {
  throw new Error('Runtime source of truth was not preserved');
}

console.log(JSON.stringify({ passed:true, checks }, null, 2));
