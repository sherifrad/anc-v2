import fs from 'node:fs/promises';
import vm from 'node:vm';

const appSource = await fs.readFile(new URL('./app.js', import.meta.url), 'utf8');
const dbSource = await fs.readFile(new URL('./db.js', import.meta.url), 'utf8');

function replaceFunction(source, name, replacement) {
  const asyncStart = source.indexOf(`async function ${name}`);
  const normalStart = source.indexOf(`function ${name}`);
  const start = asyncStart >= 0 ? asyncStart : normalStart;
  if (start < 0) throw new Error(`Missing function ${name}`);
  const open = source.indexOf('{', source.indexOf(')', start));
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
    if (depth === 0) return `${source.slice(0, start)}${replacement}${source.slice(i + 1)}`;
  }
  throw new Error(`Could not replace function ${name}`);
}

let instrumentSource = replaceFunction(
  appSource,
  'fullSave',
  `async function fullSave(options={}) {
    return globalThis.TEST_FULL_SAVE(options);
  }`
);
instrumentSource = replaceFunction(
  instrumentSource,
  'loadPatientIntoForm',
  `function loadPatientIntoForm(patient) {
    globalThis.TEST_LOAD_PATIENT(patient);
  }`
);
instrumentSource = replaceFunction(
  instrumentSource,
  'showPatientWorkspace',
  `function showPatientWorkspace() {
    globalThis.TEST_SHOW_WORKSPACE();
  }`
);
instrumentSource = replaceFunction(
  instrumentSource,
  'setAutoSaveStatus',
  `function setAutoSaveStatus(status) {
    globalThis.TEST_SET_AUTO_SAVE_STATUS(status);
  }`
);
instrumentSource = replaceFunction(
  instrumentSource,
  'performAutoSave',
  `async function performAutoSave() {
    return globalThis.TEST_PERFORM_AUTO_SAVE();
  }`
);
instrumentSource = replaceFunction(
  instrumentSource,
  'refreshDBTable',
  `function refreshDBTable() {
    globalThis.TEST_REFRESH_DB_TABLE();
  }`
);
instrumentSource = replaceFunction(
  instrumentSource,
  'refreshDashboard',
  `function refreshDashboard() {
    globalThis.TEST_REFRESH_DASHBOARD();
  }`
);

const instrumented = instrumentSource.replace(
  'fullSave, quickSave, importBackup, downloadRollbackBackup, verifyRollbackBackup,',
  `fullSave, quickSave, importBackup,
    _testDownloadBackup:downloadBackup,
    _testApplyImportPayload:applyImportPayload,
    _testBuildImportPayloadPreservingPatient:buildImportPayloadPreservingPatient,
    _testBuildSafeRestorePayload:buildSafeRestorePayload,
    _testMarkPatientChanged:markPatientChanged,
    _testIsNonClinicalFileControl:isNonClinicalFileControl,
    _testSetCurrentPatientID:(id) => { currentPatientID = id; },
    _testGetCurrentPatientID:() => currentPatientID,
    downloadRollbackBackup, verifyRollbackBackup,`
);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function fakeElement(id='') {
  const listeners = {};
  return {
    id, value:'', checked:false, disabled:false, hidden:false, className:'', innerHTML:'',
    textContent:'', style:{ display:'' }, clicked:false, onclick:null,
    files:[],
    classList:{ add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    querySelectorAll(){ return []; }, querySelector(){ return null; }, contains(){ return false; },
    getAttribute(){ return null; }, setAttribute(){}, removeAttribute(){}, focus(){},
    addEventListener(type, fn){ (listeners[type] ||= []).push(fn); },
    dispatchEvent(event){
      const normalized = {
        target:this, currentTarget:this, preventDefault(){}, stopPropagation(){},
        ...event,
      };
      (listeners[normalized.type] || []).forEach(fn => fn.call(this, normalized));
    },
    click(){
      this.clicked = true;
      if (this.onclick) this.onclick({ target:this, currentTarget:this, preventDefault(){}, stopPropagation(){} });
      (listeners.click || []).forEach(fn => fn.call(this, { type:'click', target:this, currentTarget:this, preventDefault(){}, stopPropagation(){} }));
    },
    _listeners:listeners,
  };
}

function flushAsync() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

const backupPayload = {
  version:'2.0',
  patients:{
    'ANC-ACTIVE':{ patientID:'ANC-ACTIVE', patientUuid:'uuid-active', fullName:'Backup Active' },
    'ANC-EXISTING-MOVED':{ patientID:'ANC-EXISTING-MOVED', patientUuid:'uuid-archived', fullName:'Backup Archived Different MRN' },
    'ANC-CONFLICT':{ patientID:'ANC-CONFLICT', patientUuid:'uuid-conflict-incoming', fullName:'Backup Conflict' },
    'ANC-NO-UUID':{ patientID:'ANC-NO-UUID', fullName:'Backup Missing UUID' },
    'ANC-BLANK-UUID':{ patientID:'ANC-BLANK-UUID', patientUuid:'', fullName:'Backup Blank UUID' },
    'ANC-OTHER':{ patientID:'ANC-OTHER', patientUuid:'uuid-other', fullName:'Backup Other' },
  },
  visits:{
    'ANC-ACTIVE':[{ id:'visit-backup' }], 'ANC-EXISTING-MOVED':[{ id:'visit-moved' }],
    'ANC-CONFLICT':[{ id:'visit-conflict' }], 'ANC-NO-UUID':[{ id:'visit-no-uuid' }],
    'ANC-BLANK-UUID':[{ id:'visit-blank-uuid' }], 'ANC-OTHER':[{ id:'visit-other' }],
  },
  scans:{
    'ANC-ACTIVE':[{ id:'scan-backup' }], 'ANC-EXISTING-MOVED':[{ id:'scan-moved' }],
    'ANC-CONFLICT':[{ id:'scan-conflict' }], 'ANC-NO-UUID':[{ id:'scan-no-uuid' }],
    'ANC-BLANK-UUID':[{ id:'scan-blank-uuid' }], 'ANC-OTHER':[{ id:'scan-other' }],
  },
  procedures:{
    'ANC-ACTIVE':[{ id:'proc-backup' }], 'ANC-EXISTING-MOVED':[{ id:'proc-moved' }],
    'ANC-CONFLICT':[{ id:'proc-conflict' }], 'ANC-NO-UUID':[{ id:'proc-no-uuid' }],
    'ANC-BLANK-UUID':[{ id:'proc-blank-uuid' }], 'ANC-OTHER':[{ id:'proc-other' }],
  },
  labs:{
    'ANC-ACTIVE':[{ id:'lab-backup' }], 'ANC-EXISTING-MOVED':[{ id:'lab-moved' }],
    'ANC-CONFLICT':[{ id:'lab-conflict' }], 'ANC-NO-UUID':[{ id:'lab-no-uuid' }],
    'ANC-BLANK-UUID':[{ id:'lab-blank-uuid' }], 'ANC-OTHER':[{ id:'lab-other' }],
  },
  problems:{
    'ANC-ACTIVE':[{ id:'problem-backup' }], 'ANC-EXISTING-MOVED':[{ id:'problem-moved' }],
    'ANC-CONFLICT':[{ id:'problem-conflict' }], 'ANC-NO-UUID':[{ id:'problem-no-uuid' }],
    'ANC-BLANK-UUID':[{ id:'problem-blank-uuid' }], 'ANC-OTHER':[{ id:'problem-other' }],
  },
  medications:{
    'ANC-ACTIVE':[{ id:'med-backup' }], 'ANC-EXISTING-MOVED':[{ id:'med-moved' }],
    'ANC-CONFLICT':[{ id:'med-conflict' }], 'ANC-NO-UUID':[{ id:'med-no-uuid' }],
    'ANC-BLANK-UUID':[{ id:'med-blank-uuid' }], 'ANC-OTHER':[{ id:'med-other' }],
  },
  attachments:{
    'ANC-ACTIVE':[{ id:'attachment-backup' }], 'ANC-EXISTING-MOVED':[{ id:'attachment-moved' }],
    'ANC-CONFLICT':[{ id:'attachment-conflict' }], 'ANC-NO-UUID':[{ id:'attachment-no-uuid' }],
    'ANC-BLANK-UUID':[{ id:'attachment-blank-uuid' }], 'ANC-OTHER':[{ id:'attachment-other' }],
  },
  settings:{ theme:'clinic' },
  auditEvents:[{ eventID:'audit-backup' }],
};

const existingLocalState = {
  patients:{
    'ANC-ACTIVE':{ patientID:'ANC-ACTIVE', patientUuid:'uuid-active', fullName:'Local Active Autosaved' },
    'ANC-ARCHIVED':{ patientID:'ANC-ARCHIVED', patientUuid:'uuid-archived', fullName:'Local Archived', isArchived:true },
    'ANC-CONFLICT':{ patientID:'ANC-CONFLICT', patientUuid:'uuid-conflict-local', fullName:'Local Conflict' },
  },
  visits:{ 'ANC-ACTIVE':[{ id:'visit-local' }], 'ANC-ARCHIVED':[{ id:'visit-archived-local' }], 'ANC-CONFLICT':[{ id:'visit-conflict-local' }] },
  scans:{ 'ANC-ACTIVE':[{ id:'scan-local' }], 'ANC-ARCHIVED':[{ id:'scan-archived-local' }], 'ANC-CONFLICT':[{ id:'scan-conflict-local' }] },
  procedures:{ 'ANC-ACTIVE':[{ id:'proc-local' }], 'ANC-ARCHIVED':[{ id:'proc-archived-local' }], 'ANC-CONFLICT':[{ id:'proc-conflict-local' }] },
  labs:{ 'ANC-ACTIVE':[{ id:'lab-local' }], 'ANC-ARCHIVED':[{ id:'lab-archived-local' }], 'ANC-CONFLICT':[{ id:'lab-conflict-local' }] },
  problems:{ 'ANC-ACTIVE':[{ id:'problem-local' }], 'ANC-ARCHIVED':[{ id:'problem-archived-local' }], 'ANC-CONFLICT':[{ id:'problem-conflict-local' }] },
  medications:{ 'ANC-ACTIVE':[{ id:'med-local' }], 'ANC-ARCHIVED':[{ id:'med-archived-local' }], 'ANC-CONFLICT':[{ id:'med-conflict-local' }] },
  attachments:{ 'ANC-ACTIVE':[{ id:'attachment-local' }], 'ANC-ARCHIVED':[{ id:'attachment-archived-local' }], 'ANC-CONFLICT':[{ id:'attachment-conflict-local' }] },
};

function createRuntime({
  exportJson=JSON.stringify({ version:'2.0', patients:{ 'ANC-1':{ patientID:'ANC-1' } } }),
  importResult=true,
  phase2EnabledThrows=true,
  phase2Enabled=true,
  cryptoUnlocked=false,
  cryptoThrows=true,
  pending=false,
  saveResult={ localSaved:true, cloudSynced:true },
  saveDelay=false,
  currentPatientID='',
  initialState=null,
} = {}) {
  const calls = {
    exportAll:0, importAll:0, phase2Enabled:0, cryptoIsEnabled:0, cryptoIsUnlocked:0,
    authGetClient:0, authGetSessionKind:0, isOnline:0, downloads:[], toasts:[], audit:[], modals:[],
    importedPayloads:[], anchorClicks:0, saves:[], reloads:[], workspaceShows:0, status:[],
    saveResolved:false, markChanged:0, changedStatus:0, importBackupFiles:[], verifyFiles:[],
    autosaveQueued:0, incrementalQueued:0,
    dbTableRefreshes:0, dashboardRefreshes:0,
  };
  let pendingClinicalChanges = false;
  const state = clone(initialState || {
    patients:{},
    visits:{},
    scans:{},
    procedures:{},
    labs:{},
    problems:{},
    medications:{},
    attachments:{},
  });
  let releaseSave;
  const saveGate = saveDelay
    ? new Promise(resolve => { releaseSave = resolve; })
    : Promise.resolve();
  const elements = new Map();
  const getElement = id => {
    if (!elements.has(id)) elements.set(id, fakeElement(id));
    return elements.get(id);
  };
  let lastBlob = null;
  const mergeMap = (name, imported, acceptedIDs) => {
    if (!imported || typeof imported !== 'object' || Array.isArray(imported)) return;
    acceptedIDs.forEach(id => {
      if (Object.prototype.hasOwnProperty.call(imported, id)) state[name][id] = clone(imported[id]);
    });
  };
  const DB = {
    exportAll(){ calls.exportAll += 1; return exportJson; },
    importAll(json){
      calls.importAll += 1;
      calls.importedPayloads.push(json);
      if (!importResult) return false;
      const parsed = JSON.parse(json);
      if (!parsed.patients || typeof parsed.patients !== 'object' || Array.isArray(parsed.patients)) return false;
      const acceptedIDs = Object.keys(parsed.patients);
      acceptedIDs.forEach(id => { state.patients[id] = clone(parsed.patients[id]); });
      ['visits','scans','procedures','labs','problems','medications','attachments']
        .forEach(name => mergeMap(name, parsed[name], acceptedIDs));
      return true;
    },
    markChanged(){ calls.markChanged += 1; pendingClinicalChanges = true; },
    hasPendingChanges(){ return pending || pendingClinicalChanges; },
    discardChanged(){ pendingClinicalChanges = false; },
    getLastImportResult(){
      const last = calls.importedPayloads.at(-1);
      if (!last) return { updatedPatientIDs:[] };
      return { updatedPatientIDs:Object.keys(JSON.parse(last).patients || {}) };
    },
    getLastImportWarnings(){ return []; },
    appendAuditEvent(event){ calls.audit.push(event); return event; },
    markPendingCloudSync(){ calls.incrementalQueued += 1; },
    getAllPatients(){ return state.patients; },
    getPatient(id){ return state.patients[id] || null; },
    getCurrentPatient(){ return currentPatientID; },
    getStorageInfo(){ return {}; },
    getVisits(id){ return state.visits[id] || []; },
    getScans(id){ return state.scans[id] || []; },
    getProcedures(id){ return state.procedures[id] || []; },
    getLabs(id){ return state.labs[id] || []; },
    getProblems(id){ return state.problems[id] || []; },
    getMedications(id){ return state.medications[id] || []; },
    getActiveProblems(id){ return state.problems[id] || []; },
    getActiveMedications(id){ return state.medications[id] || []; },
    isArchived(){ return false; },
  };
  const UI = {
    toast(message, type='info'){ calls.toasts.push({ message, type }); },
    modal(title, body, onConfirm){
      calls.modals.push({ title, body, onConfirm });
      const confirm = getElement('modalConfirm');
      confirm.onclick = onConfirm;
    },
    riskBadgeHTML(){ return ''; },
    renderDashboard(){},
    renderDBTable(){},
  };
  const context = vm.createContext({
    console,
    document:{
      readyState:'loading',
      addEventListener(){},
      getElementById:getElement,
      querySelectorAll(){ return []; },
      querySelector(){ return null; },
      createElement(tag){
        const el = fakeElement(tag);
        if (tag === 'a') {
          el.click = () => { calls.anchorClicks += 1; calls.downloads.push({ filename:el.download, blob:lastBlob }); };
        }
        return el;
      },
    },
    window:{},
    navigator:{},
    location:{ reload(){ calls.locationReloads = (calls.locationReloads || 0) + 1; } },
    localStorage:{ getItem(){ return null; }, setItem(){}, removeItem(){} },
    sessionStorage:{ getItem(){ return null; }, setItem(){}, removeItem(){} },
    setTimeout, clearTimeout, setInterval(){ return 1; }, requestAnimationFrame(fn){ fn(); },
    DB, UI,
    TEST_FULL_SAVE:async options => {
      calls.saves.push(options);
      await saveGate;
      calls.saveResolved = true;
      if (saveResult?.localSaved && currentPatientID) {
        state.patients[currentPatientID] = { patientID:currentPatientID, patientUuid:'uuid-active', fullName:'Saved Active' };
        state.visits[currentPatientID] = [{ id:'visit-saved' }];
        state.scans[currentPatientID] = [{ id:'scan-saved' }];
        state.procedures[currentPatientID] = [{ id:'proc-saved' }];
        state.labs[currentPatientID] = [{ id:'lab-saved' }];
        state.problems[currentPatientID] = [{ id:'problem-saved' }];
        state.medications[currentPatientID] = [{ id:'med-saved' }];
        state.attachments[currentPatientID] = [{ id:'attachment-saved' }];
      }
      return saveResult;
    },
    TEST_LOAD_PATIENT:patient => { calls.reloads.push(clone(patient)); },
    TEST_SHOW_WORKSPACE:() => { calls.workspaceShows += 1; },
    TEST_SET_AUTO_SAVE_STATUS:status => {
      calls.status.push(status);
      if (status === 'changed') calls.changedStatus += 1;
    },
    TEST_PERFORM_AUTO_SAVE:async () => {
      calls.autosaveQueued += 1;
      return false;
    },
    TEST_REFRESH_DB_TABLE:() => { calls.dbTableRefreshes += 1; },
    TEST_REFRESH_DASHBOARD:() => { calls.dashboardRefreshes += 1; },
    CALC:{ todayISO(){ return '2026-06-30'; }, formatDate(value){ return String(value || ''); } },
    CONSTANTS:{},
    AUTH:{
      getClient(){ calls.authGetClient += 1; throw new Error('owner session must not be required'); },
      getSessionKind(){ calls.authGetSessionKind += 1; throw new Error('owner session label unavailable'); },
    },
    SUPA:{
      isPhase2RuntimeEnabled(){
        calls.phase2Enabled += 1;
        if (phase2EnabledThrows) throw new Error('Phase 2 must not be consulted');
        return phase2Enabled;
      },
      isOnline(){ calls.isOnline += 1; throw new Error('online status must not be required'); },
    },
    CRYPTO:{
      isEnabled(){ calls.cryptoIsEnabled += 1; throw new Error('legacy crypto enabled check must not be required'); },
      isUnlocked(){
        calls.cryptoIsUnlocked += 1;
        if (!cryptoThrows) return cryptoUnlocked;
        if (cryptoUnlocked) return true;
        throw new Error('legacy crypto unlock must not be required');
      },
      async decrypt(){ throw new Error('decrypt must not run in this scenario'); },
      async encrypt(){ throw new Error('encrypt must not run in this scenario'); },
      lock(){},
    },
    Blob:class {
      constructor(parts, options) {
        this.parts = parts;
        this.options = options;
        lastBlob = this;
      }
    },
    URL:{ createObjectURL(){ return 'blob:test'; }, revokeObjectURL(){} },
    FileReader:class {
      readAsText(file) {
        this.onload?.({ target:{ result:file.content } });
      }
    },
    crypto:globalThis.crypto,
  });
  vm.runInContext(`${instrumented}\nglobalThis.TEST_APP=APP;`, context);
  if (currentPatientID) context.TEST_APP._testSetCurrentPatientID(currentPatientID);
  return {
    APP:context.TEST_APP,
    calls,
    state,
    elements,
    releaseSave:() => releaseSave?.(),
    hasPendingClinicalChanges:() => pendingClinicalChanges,
    downloadedText:() => calls.downloads[0]?.blob?.parts?.join('') || '',
  };
}

async function chooseSave(runtime, importPromise) {
  await flushAsync();
  runtime.elements.get('btnSaveThenImport').click();
  await importPromise;
  await flushAsync();
}

async function chooseDestructive(runtime, importPromise) {
  await flushAsync();
  runtime.elements.get('modalConfirm').click();
  await flushAsync();
  runtime.elements.get('modalConfirm').click();
  await importPromise;
  await flushAsync();
}

async function chooseCancel(runtime, importPromise) {
  await flushAsync();
  runtime.elements.get('modalCancel').click();
  await importPromise;
  await flushAsync();
}

{
  const runtime = createRuntime();
  for (const id of ['importFileInput','verifyBackupFileInput']) {
    for (const type of ['change','input']) {
      runtime.APP._testMarkPatientChanged({ type, target:{ id } });
    }
    if (!runtime.APP._testIsNonClinicalFileControl({ id })) {
      throw new Error(`${id} is not recognized as a non-clinical file control`);
    }
  }
  if (runtime.calls.markChanged !== 0 || runtime.calls.changedStatus !== 0) {
    throw new Error('Excluded backup file inputs marked clinical dirty state');
  }
  if (runtime.hasPendingClinicalChanges()) {
    throw new Error('Excluded backup file inputs created pending clinical changes');
  }
  if (runtime.calls.autosaveQueued !== 0 || runtime.calls.incrementalQueued !== 0) {
    throw new Error('Excluded backup file inputs queued autosave or incremental sync through dirty tracking');
  }
  if (runtime.APP._testIsNonClinicalFileControl({ id:'fileInput_attachment_0' })) {
    throw new Error('Dirty guard excluded a clinical/future file input too broadly');
  }
  if (runtime.APP._testIsNonClinicalFileControl({ id:'fullName' })) {
    throw new Error('Dirty guard excluded a normal clinical field');
  }
}

{
  const runtime = createRuntime();
  runtime.APP._testMarkPatientChanged({ type:'input', target:{ id:'fullName' } });
  runtime.APP._testMarkPatientChanged({ type:'change', target:{ id:'bloodGroup' } });
  if (runtime.calls.markChanged !== 2 || runtime.calls.changedStatus !== 2) {
    throw new Error('Normal clinical text/select fields did not mark the patient dirty');
  }
  if (!runtime.hasPendingClinicalChanges()) {
    throw new Error('Normal clinical dirty state was not recorded');
  }
}

{
  const runtime = createRuntime();
  await runtime.APP._testDownloadBackup();
  if (runtime.calls.exportAll !== 1) throw new Error('Basic backup did not call DB.exportAll exactly once');
  if (runtime.calls.phase2Enabled !== 0) throw new Error('Basic backup consulted Phase 2 runtime');
  if (runtime.calls.cryptoIsEnabled !== 0 || runtime.calls.cryptoIsUnlocked !== 0) {
    throw new Error('Basic backup consulted legacy crypto state');
  }
  if (runtime.calls.authGetClient !== 0 || runtime.calls.isOnline !== 0) {
    throw new Error('Basic backup required owner session or online status');
  }
  const payload = JSON.parse(runtime.downloadedText());
  if (!payload.patients || typeof payload.patients !== 'object') {
    throw new Error('Basic backup payload does not contain a valid patients collection');
  }
  if (!runtime.calls.downloads[0]?.filename?.startsWith('ANC_Backup_Local_')) {
    throw new Error('Basic backup did not use the local/plain filename prefix');
  }
  if (!runtime.calls.audit.some(event => event.operation === 'export' && event.entityType === 'backup' && event.status === 'success')) {
    throw new Error('Basic backup did not record a local export audit event');
  }
  if (!runtime.calls.toasts.some(toast => toast.type === 'success')) {
    throw new Error('Basic backup did not show a success toast');
  }
}

{
  const runtime = createRuntime({ exportJson:JSON.stringify({ visits:{} }) });
  await runtime.APP._testDownloadBackup();
  if (runtime.calls.downloads.length) throw new Error('Invalid plain backup payload was downloaded');
  if (!runtime.calls.toasts.some(toast => toast.type === 'error')) {
    throw new Error('Invalid plain backup payload did not report an error');
  }
}

{
  const original = clone(backupPayload);
  const runtime = createRuntime();
  const filteredJson = runtime.APP._testBuildImportPayloadPreservingPatient(original, 'ANC-ACTIVE');
  const filtered = JSON.parse(filteredJson);
  for (const name of ['patients','visits','scans','procedures','labs','problems','medications','attachments']) {
    if (Object.prototype.hasOwnProperty.call(filtered[name], 'ANC-ACTIVE')) {
      throw new Error(`Safe helper did not remove active patient from ${name}`);
    }
    if (!Object.prototype.hasOwnProperty.call(filtered[name], 'ANC-OTHER')) {
      throw new Error(`Safe helper removed other patient from ${name}`);
    }
  }
  if (!filtered.settings?.theme || filtered.auditEvents?.[0]?.eventID !== 'audit-backup') {
    throw new Error('Safe helper removed global settings or audit events');
  }
  if (JSON.stringify(original) !== JSON.stringify(backupPayload)) {
    throw new Error('Safe helper mutated the original payload object');
  }
}

{
  const runtime = createRuntime();
  const payload = { patients:{ 'ANC-ACTIVE':{} }, visits:null, scans:[], procedures:'bad' };
  const filtered = JSON.parse(runtime.APP._testBuildImportPayloadPreservingPatient(payload, 'ANC-ACTIVE'));
  if (filtered.visits !== null || !Array.isArray(filtered.scans) || filtered.procedures !== 'bad') {
    throw new Error('Safe helper mutated invalid optional collections');
  }
}

{
  const runtime = createRuntime();
  const original = clone(backupPayload);
  const result = runtime.APP._testBuildSafeRestorePayload(original, existingLocalState.patients);
  const filtered = JSON.parse(result.json);
  for (const skippedID of ['ANC-ACTIVE','ANC-EXISTING-MOVED','ANC-CONFLICT','ANC-NO-UUID','ANC-BLANK-UUID']) {
    if (Object.prototype.hasOwnProperty.call(filtered.patients, skippedID)) {
      throw new Error(`Whole-patient Safe Restore did not remove skipped patient ${skippedID}`);
    }
    for (const name of ['visits','scans','procedures','labs','problems','medications','attachments']) {
      if (Object.prototype.hasOwnProperty.call(filtered[name], skippedID)) {
        throw new Error(`Whole-patient Safe Restore did not remove ${name} for skipped patient ${skippedID}`);
      }
    }
  }
  if (filtered.patients['ANC-OTHER']?.fullName !== 'Backup Other' || filtered.visits['ANC-OTHER']?.[0]?.id !== 'visit-other') {
    throw new Error('Whole-patient Safe Restore removed the new patient or related collections');
  }
  if (result.counts.importedNewPatients !== 1
    || result.counts.preservedExistingPatients !== 2
    || result.counts.skippedIdentityConflicts !== 1
    || result.counts.skippedInvalidUuidRecords !== 2) {
    throw new Error(`Whole-patient Safe Restore counts were incorrect: ${JSON.stringify(result.counts)}`);
  }
  if (!filtered.settings?.theme || filtered.auditEvents?.[0]?.eventID !== 'audit-backup') {
    throw new Error('Whole-patient Safe Restore removed global settings or audit events');
  }
  if (JSON.stringify(original) !== JSON.stringify(backupPayload)) {
    throw new Error('Whole-patient Safe Restore mutated the original payload object');
  }
}

{
  const backup = JSON.stringify(backupPayload);
  const runtime = createRuntime({ pending:false, currentPatientID:'ANC-ACTIVE', initialState:existingLocalState });
  const importPromise = runtime.APP._testApplyImportPayload(backup, {
    summary:'plain restore', successMessage:'done',
  });
  await chooseSave(runtime, importPromise);
  if (runtime.calls.importAll !== 1 || runtime.calls.saves.length !== 0) {
    throw new Error('No-pending Safe Restore did not import filtered payload without saving');
  }
  if (runtime.state.patients['ANC-ACTIVE'].fullName !== 'Local Active Autosaved'
    || runtime.state.visits['ANC-ACTIVE']?.[0]?.id !== 'visit-local') {
    throw new Error('No-pending Safe Restore did not preserve the existing active patient');
  }
  if (runtime.state.patients['ANC-ARCHIVED'].fullName !== 'Local Archived'
    || runtime.state.visits['ANC-ARCHIVED']?.[0]?.id !== 'visit-archived-local') {
    throw new Error('No-pending Safe Restore did not preserve an existing archived patient');
  }
  if (runtime.state.patients['ANC-OTHER'].fullName !== 'Backup Other') {
    throw new Error('No-pending Safe Restore did not import the new patient');
  }
}

{
  const backup = JSON.stringify(backupPayload);
  const runtime = createRuntime({ pending:true, currentPatientID:'ANC-ACTIVE', saveDelay:true });
  const importPromise = runtime.APP._testApplyImportPayload(backup, {
    summary:'safe restore', successMessage:'done',
  });
  await flushAsync();
  runtime.elements.get('btnSaveThenImport').click();
  await flushAsync();
  if (runtime.calls.importAll !== 0) throw new Error('Import started before save resolved');
  runtime.releaseSave();
  await importPromise;
  await flushAsync();
  if (!runtime.calls.saveResolved || runtime.calls.saves[0]?.forTransition !== true) {
    throw new Error('Save branch did not await fullSave({ forTransition:true })');
  }
}

{
  const backup = JSON.stringify(backupPayload);
  const runtime = createRuntime({ pending:true, currentPatientID:'ANC-ACTIVE' });
  const importPromise = runtime.APP._testApplyImportPayload(backup, {
    summary:'safe restore', successMessage:'done',
  });
  await chooseSave(runtime, importPromise);
  if (runtime.calls.importAll !== 1) throw new Error('Safe branch did not import after successful save');
  const imported = JSON.parse(runtime.calls.importedPayloads[0]);
  for (const name of ['patients','visits','scans','procedures','labs','problems','medications','attachments']) {
    if (Object.prototype.hasOwnProperty.call(imported[name], 'ANC-ACTIVE')) {
      throw new Error(`Safe branch imported active patient ${name}`);
    }
  }
  if (runtime.state.patients['ANC-ACTIVE'].fullName !== 'Saved Active') {
    throw new Error('Safe branch did not preserve saved current patient core record');
  }
  for (const [name, expected] of Object.entries({
    visits:'visit-saved', scans:'scan-saved', procedures:'proc-saved', labs:'lab-saved',
    problems:'problem-saved', medications:'med-saved', attachments:'attachment-saved',
  })) {
    if (runtime.state[name]['ANC-ACTIVE']?.[0]?.id !== expected) {
      throw new Error(`Safe branch did not preserve saved current patient ${name}`);
    }
  }
  if (runtime.state.patients['ANC-OTHER'].fullName !== 'Backup Other' || runtime.state.visits['ANC-OTHER']?.[0]?.id !== 'visit-other') {
    throw new Error('Safe branch did not import other backup patients normally');
  }
  if (!runtime.calls.reloads.some(patient => patient.fullName === 'Saved Active') || runtime.calls.workspaceShows !== 1) {
    throw new Error('Safe branch did not reload the preserved current patient after import success');
  }
}

{
  const backup = JSON.stringify(backupPayload);
  const originalObject = clone(backupPayload);
  const runtime = createRuntime({ pending:true, currentPatientID:'', initialState:existingLocalState });
  const importPromise = runtime.APP._testApplyImportPayload(backup, {
    summary:'safe restore without active patient', successMessage:'done',
  });
  await chooseSave(runtime, importPromise);
  if (runtime.calls.importAll !== 1) throw new Error('Dashboard Safe Restore did not import');
  if (runtime.calls.importedPayloads[0] === backup) {
    throw new Error('Dashboard Safe Restore passed the original unfiltered payload');
  }
  const imported = JSON.parse(runtime.calls.importedPayloads[0]);
  for (const skippedID of ['ANC-ACTIVE','ANC-EXISTING-MOVED','ANC-CONFLICT','ANC-NO-UUID','ANC-BLANK-UUID']) {
    if (Object.prototype.hasOwnProperty.call(imported.patients, skippedID)) {
      throw new Error(`Dashboard Safe Restore imported skipped patient ${skippedID}`);
    }
    for (const name of ['visits','scans','procedures','labs','problems','medications','attachments']) {
      if (Object.prototype.hasOwnProperty.call(imported[name], skippedID)) {
        throw new Error(`Dashboard Safe Restore imported ${name} for skipped patient ${skippedID}`);
      }
    }
  }
  if (runtime.state.patients['ANC-ACTIVE']?.fullName !== 'Local Active Autosaved') {
    throw new Error('Dashboard Safe Restore changed an existing local active patient');
  }
  for (const [name, expected] of Object.entries({
    visits:'visit-local', scans:'scan-local', procedures:'proc-local', labs:'lab-local',
    problems:'problem-local', medications:'med-local', attachments:'attachment-local',
  })) {
    if (runtime.state[name]['ANC-ACTIVE']?.[0]?.id !== expected) {
      throw new Error(`Dashboard Safe Restore changed existing local ${name}`);
    }
  }
  if (runtime.state.patients['ANC-OTHER']?.fullName !== 'Backup Other'
    || runtime.state.visits['ANC-OTHER']?.[0]?.id !== 'visit-other'
    || runtime.state.attachments['ANC-OTHER']?.[0]?.id !== 'attachment-other') {
    throw new Error('Dashboard Safe Restore did not import the new patient and related collections');
  }
  if (runtime.calls.reloads.length !== 0 || runtime.calls.workspaceShows !== 0) {
    throw new Error('Dashboard Safe Restore reloaded or opened a patient workspace without an active patient');
  }
  if (runtime.calls.dbTableRefreshes !== 1 || runtime.calls.dashboardRefreshes !== 1) {
    throw new Error('Dashboard Safe Restore did not refresh patient table and dashboard');
  }
  if (backup !== JSON.stringify(backupPayload) || JSON.stringify(originalObject) !== JSON.stringify(backupPayload)) {
    throw new Error('Dashboard Safe Restore mutated the original payload string or object');
  }
}

{
  const runtime = createRuntime({ pending:true, currentPatientID:'ANC-ACTIVE', saveResult:{ localSaved:false, cloudSynced:false } });
  const importPromise = runtime.APP._testApplyImportPayload(JSON.stringify(backupPayload), {
    summary:'failed save', successMessage:'must not show',
  });
  await chooseSave(runtime, importPromise);
  if (runtime.calls.importAll !== 0 || runtime.calls.reloads.length !== 0) {
    throw new Error('Save failure did not abort import and reload');
  }
}

{
  const runtime = createRuntime({ pending:true, currentPatientID:'ANC-ACTIVE', importResult:false });
  const importPromise = runtime.APP._testApplyImportPayload(JSON.stringify(backupPayload), {
    summary:'failed import', successMessage:'must not show',
  });
  await chooseSave(runtime, importPromise);
  if (runtime.calls.importAll !== 1) throw new Error('Import failure scenario did not attempt import after save');
  if (runtime.calls.reloads.length !== 0 || runtime.calls.toasts.some(toast => toast.message === 'must not show')) {
    throw new Error('Import failure after save falsely showed success or reloaded current patient');
  }
}

{
  const runtime = createRuntime({ pending:true, currentPatientID:'ANC-ACTIVE' });
  const importPromise = runtime.APP._testApplyImportPayload(JSON.stringify(backupPayload), {
    summary:'destructive restore', successMessage:'done',
  });
  await flushAsync();
  runtime.elements.get('modalConfirm').click();
  await flushAsync();
  if (runtime.calls.importAll !== 0 || runtime.calls.modals.length < 2) {
    throw new Error('Destructive branch imported before second explicit confirmation');
  }
  runtime.elements.get('modalConfirm').click();
  await importPromise;
  await flushAsync();
  if (runtime.state.patients['ANC-ACTIVE'].fullName !== 'Backup Active') {
    throw new Error('Destructive branch did not allow backup current-patient data to win');
  }
  if (JSON.parse(runtime.calls.importedPayloads[0]).patients['ANC-ACTIVE'].fullName !== 'Backup Active') {
    throw new Error('Destructive branch did not use original unfiltered payload');
  }
  if (!runtime.calls.modals[0].body.includes('may replace existing matching records')
    || !runtime.calls.modals[1]?.body.includes('Existing matching records and their related clinical data may be overwritten')) {
    throw new Error('Destructive branch warnings were not explicit');
  }
}

{
  const backup = JSON.stringify(backupPayload);
  const runtime = createRuntime({ pending:false, currentPatientID:'', initialState:existingLocalState });
  const importPromise = runtime.APP._testApplyImportPayload(backup, {
    summary:'dashboard destructive restore', successMessage:'done',
  });
  await chooseDestructive(runtime, importPromise);
  if (runtime.calls.importedPayloads[0] !== backup) {
    throw new Error('Dashboard destructive restore did not use the original unfiltered payload');
  }
  if (runtime.state.patients['ANC-ACTIVE'].fullName !== 'Backup Active') {
    throw new Error('Dashboard destructive restore did not allow backup data to overwrite');
  }
  if (runtime.calls.reloads.length !== 0 || runtime.calls.workspaceShows !== 0) {
    throw new Error('Dashboard destructive restore opened a workspace without an active patient');
  }
}

{
  const runtime = createRuntime({ pending:true, currentPatientID:'ANC-ACTIVE' });
  const importPromise = runtime.APP._testApplyImportPayload(JSON.stringify(backupPayload), {
    summary:'cancel restore', successMessage:'must not show',
  });
  await chooseCancel(runtime, importPromise);
  if (runtime.calls.saves.length || runtime.calls.importAll || runtime.calls.reloads.length) {
    throw new Error('Cancel performed save, import, or reload');
  }
}

{
  const backup = JSON.stringify({ patients:{ 'ANC-2':{ patientID:'ANC-2', patientUuid:'uuid-2' } } });
  const runtime = createRuntime();
  runtime.APP.importBackup({ content:backup });
  await flushAsync();
  if (runtime.calls.phase2Enabled !== 0 || runtime.calls.cryptoIsUnlocked !== 0 || runtime.calls.cryptoIsEnabled !== 0) {
    throw new Error('Plain restore checked Phase 2 or legacy crypto before confirmation');
  }
  if (runtime.calls.importAll !== 0) throw new Error('Plain restore imported before confirmation');
  const modal = runtime.calls.modals.at(-1);
  if (!modal || modal.title !== 'Restore Unencrypted Backup') {
    throw new Error('Plain restore did not request unencrypted restore confirmation');
  }
  const restorePromise = modal.onConfirm();
  await flushAsync();
  if (runtime.calls.importAll !== 0) throw new Error('Plain restore imported before Safe/Destructive decision');
  runtime.elements.get('btnSaveThenImport').click();
  await restorePromise;
  await flushAsync();
  if (runtime.calls.importAll !== 1 || JSON.parse(runtime.calls.importedPayloads[0]).patients['ANC-2']?.patientUuid !== 'uuid-2') {
    throw new Error('Plain restore did not reach the existing DB.importAll merge pipeline');
  }
  if (runtime.calls.phase2Enabled !== 0 || runtime.calls.cryptoIsUnlocked !== 0 || runtime.calls.cryptoIsEnabled !== 0) {
    throw new Error('Plain restore checked Phase 2 or legacy crypto before import');
  }
}

{
  const runtime = createRuntime();
  runtime.APP.importBackup({ content:JSON.stringify({ patients:{} }) });
  await flushAsync();
  if (!runtime.calls.modals.length) throw new Error('Plain restore did not show confirmation');
  if (runtime.calls.importAll !== 0) throw new Error('Cancelled restore imported data');
}

{
  const runtime = createRuntime();
  runtime.APP.importBackup({ content:'{not json' });
  await flushAsync();
  if (runtime.calls.importAll !== 0) throw new Error('Malformed JSON reached import pipeline');
  if (!runtime.calls.toasts.some(toast => toast.type === 'error')) {
    throw new Error('Malformed JSON restore did not report an error');
  }
}

{
  const runtime = createRuntime({ importResult:false });
  runtime.APP.importBackup({ content:JSON.stringify({ visits:{} }) });
  await flushAsync();
  const modal = runtime.calls.modals.at(-1);
  const restorePromise = modal.onConfirm();
  await flushAsync();
  runtime.elements.get('btnSaveThenImport').click();
  await restorePromise;
  await flushAsync();
  if (runtime.calls.importAll !== 1) throw new Error('Invalid backup structure did not reach DB validation');
  if (!runtime.calls.toasts.some(toast => toast.message.includes('invalid backup file'))) {
    throw new Error('Invalid backup structure was not rejected by the import pipeline');
  }
}

{
  const runtime = createRuntime({ phase2EnabledThrows:false, phase2Enabled:true });
  runtime.APP.importBackup({ content:JSON.stringify({
    __ancBackup:true,
    encrypted:true,
    encryptionScheme:'phase2-shared-key',
    data:'encrypted',
  }) });
  await flushAsync();
  if (runtime.calls.importAll !== 0) throw new Error('Locked Phase 2 encrypted restore reached import');
  if (!runtime.calls.toasts.some(toast => toast.message.includes('Unlock shared clinic encryption'))) {
    throw new Error('Phase 2 encrypted restore did not require shared clinic unlock');
  }
}

{
  const runtime = createRuntime({ phase2EnabledThrows:false, phase2Enabled:false, cryptoUnlocked:false, cryptoThrows:false });
  runtime.APP.importBackup({ content:JSON.stringify({
    __ancBackup:true,
    encrypted:true,
    data:'encrypted',
  }) });
  await flushAsync();
  if (runtime.calls.importAll !== 0) throw new Error('Locked legacy encrypted restore reached import');
  if (!runtime.calls.toasts.some(toast => toast.message.includes('Unlock the app first'))) {
    throw new Error('Legacy encrypted restore did not require legacy unlock');
  }
}

for (const required of [
  "if (basicOfflineReleaseActive())",
  "_downloadJSON(json, 'ANC_Backup_Local')",
  "function hasUsablePatientUuid",
  "function buildImportPayloadPreservingPatient",
  "PATIENT_KEYED_IMPORT_COLLECTIONS",
  "_phase2Runtime.encryptPhase2Backup(json)",
  "CRYPTO.isEnabled() && CRYPTO.isUnlocked()",
  "raw.encryptionScheme === 'phase2-shared-key'",
  "DB.importAll(importJson)",
  "if (this.files[0]) { importBackup(this.files[0]); this.value=''; }",
  "if (this.files[0]) { verifyRollbackBackup(this.files[0]); this.value=''; }",
]) {
  if (!appSource.includes(required)) throw new Error(`Expected backup/restore source fragment missing: ${required}`);
}
if (appSource.includes('function validPatientUuid')) {
  throw new Error('Legacy validPatientUuid helper name remains in production source');
}
if (!appSource.includes('BASIC_RELEASE_PAUSED_FEATURES.authGate === true')) {
  throw new Error('Basic release detection is not based on the runtime configuration');
}
if (!dbSource.includes('function exportAll()') || !dbSource.includes("version: '2.0'")) {
  throw new Error('DB export shape unexpectedly changed');
}
if (!dbSource.includes('function importAll(jsonStr)') || !dbSource.includes('patients')) {
  throw new Error('DB import shape unexpectedly changed');
}
if (dbSource.includes('PHASE2_RUNTIME_ENABLED = false')) {
  throw new Error('Global Phase 2 disable was introduced');
}

console.log(JSON.stringify({
  passed:true,
  checks:[
    'Backup restore and verify file input events are excluded from clinical dirty tracking',
    'Excluded backup file inputs do not call DB.markChanged or set autosave status to changed',
    'Excluded backup file inputs do not create pending clinical changes or queue autosave/sync through dirty tracking',
    'Normal clinical text input and select change still mark the patient dirty',
    'Restore and Verify file-input handlers remain wired to importBackup and verifyRollbackBackup',
    'Basic Offline Backup selects the plain JSON branch',
    'Basic Offline Backup does not require Phase 2 unlock, legacy unlock, owner session, or online status',
    'Backup payload parses as valid JSON and contains patients',
    'Whole-patient Safe Restore skips existing UUIDs, MRN conflicts, and invalid UUID records',
    'Whole-patient Safe Restore removes related collections by incoming backup patient key',
    'Whole-patient Safe Restore reports import/preserve/conflict/invalid counts',
    'Safe restore choice awaits fullSave before import',
    'Save failure aborts import',
    'Safe restore filters patients, visits, scans, procedures, labs, problems, medications, and attachments',
    'Safe restore preserves other patients, global settings, and audit events',
    'Safe restore does not mutate the original backup payload',
    'Safe restore preserves current-patient core record and related collections',
    'Safe restore imports other backup patients normally',
    'No-pending restore still offers Safe Restore and preserves existing local patients',
    'Dashboard Safe Restore filters existing patients without depending on currentPatientID',
    'Dashboard Safe Restore imports only new patients and related collections',
    'Dashboard Safe Restore refreshes dashboard/table without opening a workspace',
    'Import failure after save does not falsely show success or reload',
    'Invalid optional collections are tolerated without mutation',
    'Destructive restore requires second confirmation, uses original payload, and allows backup data to win',
    'Dashboard destructive restore remains unfiltered after second confirmation',
    'Cancel performs no save, import, or reload',
    'Plain JSON Restore does not call Phase 2 or legacy unlock checks before confirmation or import',
    'Malformed JSON, invalid structure, and cancellation do not import data',
    'Phase 2 and legacy encrypted Restore remain protected',
    'No js/db.js, global Phase 2, schema, or storage-shape change was introduced',
  ],
}, null, 2));
