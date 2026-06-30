import fs from 'node:fs/promises';
import vm from 'node:vm';

const indexSource = await fs.readFile(new URL('../index.html', import.meta.url), 'utf8');
const styleSource = await fs.readFile(new URL('../css/style.css', import.meta.url), 'utf8');
const appSource = await fs.readFile(new URL('./app.js', import.meta.url), 'utf8');
const calcSource = await fs.readFile(new URL('./calc.js', import.meta.url), 'utf8');

function assert(condition, message, failures) {
  if (!condition) failures.push(message);
}

function attrsFrom(tag) {
  const attrs = {};
  for (const match of tag.matchAll(/\s([a-zA-Z0-9_-]+)(?:="([^"]*)")?/g)) {
    attrs[match[1]] = match[2] ?? true;
  }
  return attrs;
}

function extractDatingGroups() {
  const groups = [];
  const groupPattern = /<div\s+([^>]*data-dating-field="[^"]+"[^>]*)>([\s\S]*?)<\/div>/g;
  for (const match of indexSource.matchAll(groupPattern)) {
    const attrs = attrsFrom(`<div ${match[1]}>`);
    const label = match[2].match(/<label[^>]*>([\s\S]*?)<\/label>/)?.[1]?.replace(/<[^>]+>/g, '').trim() || '';
    groups.push({
      field: attrs['data-dating-field'],
      className: attrs.class || '',
      initiallyHidden: Object.prototype.hasOwnProperty.call(attrs, 'hidden'),
      label,
      html: match[0],
    });
  }
  return groups;
}

function replaceFunction(source, name, replacement) {
  const start = source.indexOf(`function ${name}`);
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

function fakeElement(group) {
  return {
    value:'',
    innerHTML:group?.label || '',
    textContent:group?.label || '',
    hidden:Boolean(group?.initiallyHidden),
    readOnly:false,
    disabled:false,
    dataset:{ datingField:group?.field || '' },
    className:group?.className || '',
    addEventListener(){},
    classList:{ contains(name){ return (group?.className || '').split(/\s+/).includes(name); } },
  };
}

function createRuntime(groups) {
  let instrumented = replaceFunction(
    appSource,
    'updateCalculations',
    `function updateCalculations() {
      const lmp = document.getElementById('lmpDate')?.value || '';
      const calc = document.getElementById('calcDate')?.value || CALC.todayISO();
      const ga = CALC.getGA(lmp, calc);
      const edd = CALC.getEDD(lmp);
      document.getElementById('calcGA').textContent = ga ? String(ga.weeks) : '—';
      document.getElementById('calcEDD').textContent = CALC.formatDate(edd);
    }`
  );
  instrumented = instrumented.replace(
    'fullSave, quickSave, importBackup, downloadRollbackBackup, verifyRollbackBackup,',
    `fullSave, quickSave, importBackup,
      _testApplyDatingUiState:applyDatingUiState,
      _testApplyDating:applyDating,
      downloadRollbackBackup, verifyRollbackBackup,`
  );

  const methodFields = groups
    .filter(group => group.className.split(/\s+/).includes('dating-method-field'))
    .map(fakeElement);
  const lmpGroup = fakeElement(groups.find(group => group.field === 'lmp'));
  const elements = new Map([
    ['datingMethod', { value:'lmp', addEventListener(){} }],
    ['lmpDate', { value:'', readOnly:false, disabled:false, addEventListener(){} }],
    ['lmpDateLabel', { innerHTML:'LMP <span class="required">*</span>', addEventListener(){} }],
    ['calcDate', { value:'2026-02-03', addEventListener(){} }],
    ['calcGA', { textContent:'', addEventListener(){} }],
    ['calcEDD', { textContent:'', addEventListener(){} }],
    ['embryoTransferDate', { value:'2026-01-20', addEventListener(){} }],
    ['embryoAge', { value:'5', addEventListener(){} }],
    ['ultrasoundDatingDate', { value:'2026-03-15', addEventListener(){} }],
    ['ultrasoundGAWeeks', { value:'9', addEventListener(){} }],
    ['ultrasoundGADays', { value:'2', addEventListener(){} }],
    ['manualGAWeeks', { value:'12', addEventListener(){} }],
    ['manualGADays', { value:'4', addEventListener(){} }],
  ]);

  const context = vm.createContext({
    console,
    document:{
      readyState:'loading',
      addEventListener(){},
      getElementById(id){ return elements.get(id) || null; },
      querySelectorAll(selector){
        if (selector === '.dating-method-field') return methodFields;
        if (selector === '[data-dating-field]') return [lmpGroup, ...methodFields];
        return [];
      },
      querySelector(){ return null; },
    },
    window:{},
    navigator:{},
    location:{},
    localStorage:{ getItem(){ return null; }, setItem(){}, removeItem(){} },
    sessionStorage:{ getItem(){ return null; }, setItem(){}, removeItem(){} },
    setTimeout, clearTimeout, setInterval(){ return 1; }, requestAnimationFrame(fn){ fn(); },
    DB:{ getPatient(){ return null; }, markChanged(){} },
    UI:{ modal(){}, toast(){}, riskBadgeHTML(){ return ''; } },
    AUTH:{}, SUPA:{ isPhase2RuntimeEnabled(){ return false; } },
    CRYPTO:{ isEnabled(){ return false; }, isUnlocked(){ return false; }, lock(){} },
    CONSTANTS:{},
  });
  vm.runInContext(`${calcSource}\n${instrumented}\nglobalThis.TEST_APP=APP;`, context);
  return { APP:context.TEST_APP, elements, methodFields };
}

function hasExplicitHiddenRule() {
  const hiddenRules = [...styleSource.matchAll(/([^{}]*\[hidden\][^{]*)\{([^}]*)\}/g)]
    .map(match => ({ selector:match[1].trim(), body:match[2].trim() }));
  const datingSpecificRule = hiddenRules.find(rule =>
    rule.selector === '.dating-method-field[hidden]' &&
    /display\s*:\s*none/i.test(rule.body)
  );
  const rejectedGlobalRule = hiddenRules.find(rule =>
    (/^\[hidden\]$/.test(rule.selector) || /,\s*\[hidden\](?:\s*,|$)/.test(rule.selector)) &&
    /display\s*:\s*none/i.test(rule.body)
  );
  const rejectedFieldGroupRule = hiddenRules.find(rule =>
    /\.field-group\[hidden\]/.test(rule.selector) &&
    /display\s*:\s*none/i.test(rule.body)
  );
  const broadEffectiveRule = hiddenRules.find(rule =>
    /display\s*:\s*none/i.test(rule.body)
    && (
      /dating-method-field/.test(rule.selector)
      || /field-group/.test(rule.selector)
      || /^\[hidden\]/.test(rule.selector)
      || /,\s*\[hidden\]/.test(rule.selector)
    )
  );
  return { hiddenRules, datingSpecificRule, rejectedGlobalRule, rejectedFieldGroupRule, broadEffectiveRule };
}

const failures = [];
const groups = extractDatingGroups();
const fields = groups.map(group => group.field);
const uniqueFields = [...new Set(fields)].sort();

assert(JSON.stringify(uniqueFields) === JSON.stringify(['embryo-transfer','lmp','manual','ultrasound']), `Real index.html Dating groups are ${uniqueFields.join(', ')}`, failures);

const coverage = groups.map(group => ({
  field: group.field,
  label: group.label,
  className: group.className,
  targetedByRuntimeSelector: group.className.split(/\s+/).includes('dating-method-field'),
  initiallyHidden: group.initiallyHidden,
}));

groups.filter(group => group.field !== 'lmp').forEach(group => {
  assert(group.className.split(/\s+/).includes('dating-method-field'), `${group.field} group is not targeted by .dating-method-field`, failures);
});

const runtime = createRuntime(groups);
const hiddenByMethod = {};
for (const method of ['lmp','embryo-transfer','ultrasound','manual']) {
  runtime.elements.get('datingMethod').value = method;
  runtime.APP._testApplyDatingUiState(method);
  hiddenByMethod[method] = runtime.methodFields.map(field => ({
    field: field.dataset.datingField,
    hidden: field.hidden,
  }));
}

function allHidden(method, fieldName) {
  return hiddenByMethod[method].filter(item => item.field === fieldName).every(item => item.hidden === true);
}

assert(allHidden('lmp', 'embryo-transfer'), 'Selecting LMP does not hide ART groups', failures);
assert(allHidden('lmp', 'ultrasound'), 'Selecting LMP does not hide Ultrasound groups', failures);
assert(allHidden('lmp', 'manual'), 'Selecting LMP does not hide Manual groups', failures);
assert(allHidden('embryo-transfer', 'ultrasound'), 'Selecting ART does not set hidden=true on Ultrasound groups', failures);
assert(allHidden('embryo-transfer', 'manual'), 'Selecting ART does not set hidden=true on Manual groups', failures);
assert(allHidden('ultrasound', 'embryo-transfer'), 'Selecting Ultrasound does not set hidden=true on ART groups', failures);
assert(allHidden('ultrasound', 'manual'), 'Selecting Ultrasound does not set hidden=true on Manual groups', failures);
assert(allHidden('manual', 'embryo-transfer'), 'Selecting Manual does not set hidden=true on ART groups', failures);
assert(allHidden('manual', 'ultrasound'), 'Selecting Manual does not set hidden=true on Ultrasound groups', failures);

runtime.APP._testApplyDatingUiState('embryo-transfer');
assert(runtime.elements.get('lmpDate').readOnly === true, 'Equivalent LMP is not read-only in ART mode', failures);
assert(runtime.elements.get('lmpDate').disabled === false, 'Equivalent LMP is disabled in ART mode', failures);
assert(runtime.elements.get('lmpDateLabel').innerHTML === 'Equivalent LMP (Calculated)', 'Equivalent LMP label is not applied', failures);

const css = hasExplicitHiddenRule();
const fieldGroupDisplayFlex = /\.field-group\s*\{[^}]*display\s*:\s*flex/i.test(styleSource);
assert(Boolean(css.datingSpecificRule), 'Missing exact .dating-method-field[hidden] display:none rule', failures);
assert(!css.rejectedGlobalRule, 'Global [hidden] override is not allowed for this slice', failures);
assert(!css.rejectedFieldGroupRule, '.field-group[hidden] override is not allowed for this slice', failures);
const cssDefect = fieldGroupDisplayFlex && !css.datingSpecificRule;
assert(!cssDefect, 'CSS defect confirmed: .field-group display:flex exists, but no Dating-specific [hidden] rule covers Dating field groups', failures);

console.log(JSON.stringify({
  passed: failures.length === 0,
  realDatingDomInventory: coverage,
  runtimeSelector: '.dating-method-field',
  hiddenPropertyResultByMethod: hiddenByMethod,
  cssHiddenAnalysis: {
    fieldGroupDisplayFlex,
    hiddenRules: css.hiddenRules,
    requiredDatingHiddenRule: css.datingSpecificRule || null,
    rejectedGlobalHiddenRule: css.rejectedGlobalRule || null,
    rejectedFieldGroupHiddenRule: css.rejectedFieldGroupRule || null,
    broadEffectiveHiddenRule: css.broadEffectiveRule || null,
    cssDefectConfirmed: cssDefect,
  },
  previousTestFalseConfidence:
    'Previous test created synthetic Dating elements and treated element.hidden as visibility; it did not parse real index.html or detect CSS that can override [hidden].',
}, null, 2));

if (failures.length) {
  throw new Error(`Dating UI-state reproduction failed:\n- ${failures.join('\n- ')}`);
}
