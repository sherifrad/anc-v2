import fs from 'node:fs/promises';
import vm from 'node:vm';

const [dbSource, appSource] = await Promise.all([
  fs.readFile(new URL('./db.js', import.meta.url), 'utf8'),
  fs.readFile(new URL('./app.js', import.meta.url), 'utf8'),
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
    _testUpdateSyncStatus:updateSyncStatus,
    _testSetCurrentPatientID:id => { currentPatientID = id; },
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

function memoryStorage() {
  const values = new Map();
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

function createRuntime() {
  const localStorage = memoryStorage();
  const elements = new Map();
  const listeners = new Map();
  const documentListeners = new Map();
  const timers = [];
  const logs = [];
  const calls = {
    isOnline:0, savePatient:0, saveRelated:0, getPatient:0, getAllPatients:0,
    getRelated:0, dashboardRefreshes:0,
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
    isPhase2RuntimeEnabled(){ return true; },
    async isOnline(){ calls.isOnline += 1; return true; },
    async savePatient(){ calls.savePatient += 1; },
    async saveRelated(){ calls.saveRelated += 1; },
    async getPatient(){ calls.getPatient += 1; return null; },
    async getAllPatients(){ calls.getAllPatients += 1; return {}; },
    async getRelated(){ calls.getRelated += 1; return null; },
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
  };
  const context = vm.createContext({
    console:{
      info(...args){ logs.push({ level:'info', args }); },
      warn(...args){ logs.push({ level:'warn', args }); },
      error(...args){ logs.push({ level:'error', args }); },
      log(...args){ logs.push({ level:'log', args }); },
    },
    document, window, navigator:{ onLine:true, userAgent:'Basic Offline isolation test' },
    localStorage, UI, CALC, SUPA, CONSTANTS:{},
    AUTH:{
      getSessionKind(){ return 'owner'; },
      getAccessToken(){ throw new Error('AUTH.getAccessToken must not be called in Basic Offline mode'); },
    },
    CRYPTO:{ isUnlocked(){ return false; }, isEnabled(){ return false; } },
    location:{ reload(){} }, sessionStorage:{ getItem(){ return null; }, setItem(){}, removeItem(){} },
    crypto:globalThis.crypto, structuredClone,
    setTimeout(fn){ timers.push(fn); return timers.length; }, clearTimeout(){},
    setInterval(){ return 1; }, clearInterval(){}, requestAnimationFrame(fn){ fn(); },
    FileReader:class {}, Blob:class {}, URL:{ createObjectURL(){ return ''; }, revokeObjectURL(){} },
  });
  vm.runInContext(`${dbSource}\nglobalThis.TEST_DB=DB;`, context);
  vm.runInContext(`${instrumented}\nglobalThis.TEST_APP=APP;`, context);
  getElement('fullName').value = 'Basic Offline Patient';
  getElement('riskLevelInput').value = 'Low Risk';
  getElement('patientStatus').value = 'Active Follow-up';
  getElement('calcDate').value = '2026-06-23';
  return {
    APP:context.TEST_APP, DB:context.TEST_DB, calls, logs, listeners,
    documentListeners, timers, getElement,
  };
}

const checks = [];

{
  const runtime = createRuntime();
  const saved = runtime.APP._testPersistCurrentRecordLocal({ allowCreate:true, auditMode:'manual' });
  if (!saved.localSaved || !runtime.DB.getPatient(saved.patientID)) {
    throw new Error('Basic Offline local persistence did not save locally');
  }
  if (runtime.DB.hasPendingCloudSync(saved.patientID) || runtime.DB.hasPendingCloudSync()) {
    throw new Error('Basic Offline save created a pending cloud-sync snapshot');
  }
  if (runtime.timers.length) throw new Error('Basic Offline save scheduled an incremental sync debounce');
  if (runtime.logs.some(log => String(log.args[0]).includes('[ANC incremental sync]'))) {
    throw new Error('Basic Offline save emitted incremental-sync logs');
  }
  checks.push('Basic Offline save remains local-only and creates no cloud queue');
}

{
  const runtime = createRuntime();
  runtime.APP._testBindAutomaticCloudEvents();
  if (runtime.listeners.size || runtime.documentListeners.has('visibilitychange')) {
    throw new Error('Basic Offline mode bound automatic cloud event listeners');
  }
  checks.push('Basic Offline boot binds no online, focus, or visibility cloud listeners');
}

{
  const runtime = createRuntime();
  await runtime.APP._testUpdateSyncStatus();
  if (runtime.calls.isOnline) throw new Error('Basic Offline sync status probed SUPA.isOnline');
  if (runtime.getElement('syncStatus').textContent !== '○ Basic offline') {
    throw new Error('Basic Offline sync status did not render local offline state');
  }
  checks.push('Basic Offline sync status does not probe Supabase');
}

{
  const runtime = createRuntime();
  const saved = runtime.APP._testPersistCurrentRecordLocal({ allowCreate:true, auditMode:'manual' });
  await runtime.APP._testRunAutomaticIncrementalSync();
  await runtime.APP._testRefreshCloudPatient(saved.patientID);
  await runtime.APP._testRefreshCloudPatientIndex('focus');
  await runtime.APP._testResumeAutomaticCloudActivity('focus');
  await runtime.APP._testRenderNavActive('database');
  const cloudCalls = [
    'isOnline','savePatient','saveRelated','getPatient','getAllPatients','getRelated',
  ].filter(name => runtime.calls[name]);
  if (cloudCalls.length) throw new Error(`Basic Offline cloud path invoked: ${cloudCalls.join(', ')}`);
  if (runtime.logs.some(log => String(log.args[0]).includes('[ANC incremental sync]'))) {
    throw new Error('Basic Offline automatic cloud path emitted incremental-sync logs');
  }
  checks.push('Basic Offline worker, refresh, focus, and database triggers are no-ops');
}

if (!appSource.includes('function basicOfflineReleaseActive()')) {
  throw new Error('Basic Offline runtime source of truth is missing');
}

console.log(JSON.stringify({ passed:true, checks }, null, 2));
