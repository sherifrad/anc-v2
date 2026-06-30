import fs from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const [
  html,
  worker,
  adapterSource,
  dbSource,
  appSource,
] = await Promise.all([
  fs.readFile(new URL('index.html', root), 'utf8'),
  fs.readFile(new URL('service-worker.js', root), 'utf8'),
  fs.readFile(new URL('js/basic_offline_adapter.js', root), 'utf8'),
  fs.readFile(new URL('js/db.js', root), 'utf8'),
  fs.readFile(new URL('js/app.js', root), 'utf8'),
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function scriptSources(markup) {
  return [...markup.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match => match[1]);
}

function shellAssets(source) {
  const match = source.match(/const APP_SHELL = \[([\s\S]*?)\];/);
  assert(match, 'Service worker APP_SHELL was not found');
  return [...match[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
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

function memoryStorage(calls) {
  const values = new Map();
  return {
    get length(){ return values.size; },
    key(index){ return [...values.keys()][index] ?? null; },
    getItem(key){ return values.has(key) ? values.get(key) : null; },
    setItem(key,value){ calls.storageWrites += 1; values.set(key, String(value)); },
    removeItem(key){ calls.storageWrites += 1; values.delete(key); },
    clear(){ calls.storageWrites += 1; values.clear(); },
  };
}

async function rejectsWithPaused(promise, message) {
  try {
    await promise;
  } catch (error) {
    assert(String(error.message || error).includes(message), `Unexpected rejection: ${error.message || error}`);
    return;
  }
  throw new Error(`Expected rejection: ${message}`);
}

function createAdapterContext() {
  const calls = { fetch:0, timers:0, storageWrites:0 };
  const context = vm.createContext({
    console,
    fetch(){ calls.fetch += 1; return Promise.reject(new Error('fetch should not run')); },
    setTimeout(){ calls.timers += 1; return 1; },
    setInterval(){ calls.timers += 1; return 1; },
    clearTimeout(){}, clearInterval(){},
    Promise,
  });
  context.window = context;
  context.globalThis = context;
  context.localStorage = memoryStorage(calls);
  vm.runInContext(adapterSource, context);
  return { context, calls };
}

function createBootRuntime() {
  const calls = { fetch:0, timers:0, storageWrites:0, dashboardRefreshes:0 };
  const elements = new Map();
  const getElement = id => {
    if (!elements.has(id)) elements.set(id, fakeElement());
    return elements.get(id);
  };
  getElement('view-dashboard').classList.contains = cls => cls === 'active';
  getElement('syncStatus').textContent = 'Offline';

  const bootErrors = [];
  const document = {
    readyState:'loading',
    visibilityState:'visible',
    body:fakeElement(),
    addEventListener(){},
    getElementById:getElement,
    querySelector(){ return null; },
    querySelectorAll(){ return []; },
  };
  const window = {
    addEventListener(){},
    scrollTo(){},
    open(){ return null; },
  };
  const context = vm.createContext({
    console:{
      ...console,
      error(...args){ bootErrors.push(args); },
    },
    document,
    window,
    navigator:{ onLine:false, userAgent:'Basic Offline app shell test' },
    localStorage:memoryStorage(calls),
    sessionStorage:{ getItem(){ return null; }, setItem(){}, removeItem(){} },
    location:{ reload(){} },
    fetch(){ calls.fetch += 1; return Promise.reject(new Error('fetch should not run')); },
    setTimeout(){ calls.timers += 1; return 1; },
    setInterval(){ calls.timers += 1; return 1; },
    clearTimeout(){},
    clearInterval(){},
    requestAnimationFrame(fn){ fn(); },
    crypto:globalThis.crypto,
    structuredClone,
    Blob:class {},
    FileReader:class {},
    URL:{ createObjectURL(){ return ''; }, revokeObjectURL(){} },
    CONSTANTS:{},
    CRYPTO:{ isUnlocked(){ return true; }, isEnabled(){ return false; } },
    UI:{
      toast(){}, modal(){},
      collectVisits(){ return []; }, collectScans(){ return []; }, collectProcs(){ return []; },
      collectLabs(){ return {}; }, collectProblems(){ return []; }, collectMedications(){ return []; },
      labLayoutState(){ return { dirty:false, actions:[], template:null }; },
      markLabActionsPersisted(){}, markLabLayoutDecisionComplete(){}, updateStorageMeter(){},
      renderDBTable(){}, renderDashboard(){ calls.dashboardRefreshes += 1; },
      applyStatusColor(){}, riskBadgeHTML(){ return ''; }, buildLabsWorkspace(){ return '<div>Labs</div>'; },
      scanRowHTML(){ return ''; }, procRowHTML(){ return ''; }, visitRowHTML(){ return ''; },
      problemRowHTML(){ return ''; }, medicationRowHTML(){ return ''; }, initCollapsible(){},
      sameDayLabItems(){ return []; }, sameDayProcedureItems(){ return []; },
      obstetricHistorySummary(){ return { tpalText:'T0 P0 A0 L0', deliveryText:'No previous delivery', complications:[], rows:[] }; },
    },
    CALC:{
      todayISO(){ return '2026-07-01'; }, validateTPAL(){ return []; }, debounce(fn){ return fn; },
      assessRisk(){ return { suggested:'Low Risk', triggers:{ high:[], middle:[] } }; },
      getGA(){ return null; }, getEDD(){ return null; }, getTrimester(){ return null; },
      getLabIntelText(){ return ''; }, getMilestones(){ return []; }, formatDate(){ return ''; },
      deriveDating(){ return { lmpDate:'', edd:'', ga:null, label:'LMP' }; },
    },
  });
  context.window.window = context.window;
  vm.runInContext(adapterSource, context);
  context.AUTH = context.window.AUTH;
  context.SUPA = context.window.SUPA;
  vm.runInContext(`${dbSource}\nglobalThis.TEST_DB = DB;`, context);
  vm.runInContext(`${appSource}\nglobalThis.TEST_APP = APP;`, context);
  return { APP:context.TEST_APP, calls, bootErrors };
}

const checks = [];
const scripts = scriptSources(html);

assert(!html.includes('cdn.jsdelivr.net/npm/@supabase/supabase-js'), 'index.html still loads Supabase CDN');
assert(!scripts.some(src => /(^|\/)js\/auth\.js(?:\?|$)/.test(src)), 'index.html still loads js/auth.js');
assert(!scripts.some(src => /(^|\/)js\/supabase\.js(?:\?|$)/.test(src)), 'index.html still loads js/supabase.js');
assert(scripts.includes('js/basic_offline_adapter.js?v=1'), 'index.html does not load Basic Offline adapter');
assert(scripts.indexOf('js/basic_offline_adapter.js?v=1') < scripts.indexOf('js/app.js?v=27'), 'Basic Offline adapter does not load before app.js');
checks.push('Basic Offline index shell excludes CDN/Auth/SUPA scripts and loads adapter before app.js');

{
  const { context, calls } = createAdapterContext();
  assert(context.AUTH, 'Adapter did not define window.AUTH');
  assert(context.SUPA, 'Adapter did not define window.SUPA');
  assert(calls.fetch === 0, 'Adapter evaluation performed fetch');
  assert(calls.timers === 0, 'Adapter evaluation created timers');
  assert(calls.storageWrites === 0, 'Adapter evaluation wrote storage');
  assert(context.AUTH.getSessionKind() === 'owner', 'AUTH.getSessionKind did not return owner');
  assert(await context.AUTH.requireAccess() === true, 'AUTH.requireAccess did not allow Basic Offline access');
  await context.AUTH.signOut();
  assert(await context.SUPA.isPhase2RuntimeEnabled() === false, 'SUPA.isPhase2RuntimeEnabled did not return false');
  assert(await context.SUPA.isOnline() === false, 'SUPA.isOnline did not return false');
  await rejectsWithPaused(context.SUPA.savePatient({}), 'SUPA paused for Basic Offline Release');
  await rejectsWithPaused(context.AUTH.getAccessToken(), 'AUTH paused for Basic Offline Release');
  assert(calls.fetch === 0 && calls.timers === 0 && calls.storageWrites === 0, 'Safe adapter calls performed network/timer/storage work');
  checks.push('Adapter supplies minimal AUTH/SUPA offline contract with no network, timers, or storage writes');
}

{
  const runtime = createBootRuntime();
  await runtime.APP.init();
  assert(runtime.bootErrors.length === 0, `App boot logged errors: ${runtime.bootErrors.map(args => args.join(' ')).join('; ')}`);
  assert(runtime.calls.fetch === 0, 'App boot performed fetch with Basic Offline adapter');
  checks.push('Real app.js evaluates and boots with the Basic Offline adapter and no AUTH/SUPA ReferenceError');
}

const assets = shellAssets(worker);
assert(worker.includes("const CACHE_NAME = 'anc-emr-v2-shell-31';"), 'Service worker cache name is not shell 31');
assert(assets.includes('./js/basic_offline_adapter.js?v=1'), 'Service worker does not precache Basic Offline adapter');
for (const forbidden of [
  './js/auth.js?v=25',
  './js/supabase.js?v=19',
  './js/phase2_runtime_config.mjs',
  './js/phase2_runtime.mjs?v=18',
  './js/phase2_cloud_adapter.mjs?v=2',
  './js/phase2_crypto_draft.mjs',
  './js/phase2_migration_draft.mjs',
  './js/phase3_security_config.mjs?v=4',
  './js/phase3_temporary_auth.mjs?v=3',
  './js/phase3_access_control.mjs?v=5',
  './js/phase3_access_control_ui.mjs?v=26',
  './js/phase3_delegated_adapter.mjs?v=2',
]) {
  assert(!assets.includes(forbidden), `Service worker still precaches deferred/cloud asset: ${forbidden}`);
}
assert(worker.includes('caches.keys()') && worker.includes('caches.delete(key)'), 'Service worker old-cache cleanup is missing');
checks.push('Service worker shell 31 precaches adapter and excludes deferred cloud/security modules');

for (const file of [
  'js/auth.js',
  'js/supabase.js',
  'js/phase2_runtime_config.mjs',
  'js/phase2_runtime.mjs',
  'js/phase2_cloud_adapter.mjs',
  'js/phase2_crypto_draft.mjs',
  'js/phase2_migration_draft.mjs',
  'js/phase3_security_config.mjs',
  'js/phase3_temporary_auth.mjs',
  'js/phase3_access_control.mjs',
  'js/phase3_access_control_ui.mjs',
  'js/phase3_delegated_adapter.mjs',
]) {
  await fs.access(new URL(file, root));
}
checks.push('Future online source files remain in the repository');

for (const forbidden of ['docs/STATE_SCHEMA.md', 'js/db.js']) {
  checks.push(`${forbidden} unchanged by app-shell test scope`);
}

console.log(JSON.stringify({ passed:true, checks }, null, 2));
