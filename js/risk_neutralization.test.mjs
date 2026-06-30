import fs from 'node:fs/promises';
import vm from 'node:vm';

const [html, appSource, uiSource, calcSource] = await Promise.all([
  fs.readFile(new URL('../index.html', import.meta.url), 'utf8'),
  fs.readFile(new URL('./app.js', import.meta.url), 'utf8'),
  fs.readFile(new URL('./ui.js', import.meta.url), 'utf8'),
  fs.readFile(new URL('./calc.js', import.meta.url), 'utf8'),
]);

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}`);
  if (start < 0) throw new Error(`Missing function ${name}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Could not determine function boundary for ${name}`);
}

if (!html.includes('id="riskLevelInput" value=""')) {
  throw new Error('riskLevelInput must initialize blank, not Low Risk');
}
if (html.includes('id="riskLevelInput" value="Low Risk"')) {
  throw new Error('riskLevelInput still defaults missing risk to Low Risk');
}
if (!html.includes('High / Moderate Risk')) {
  throw new Error('dashboard risk label must use Moderate Risk wording');
}

for (const forbidden of [
  "riskLevel:     document.getElementById('riskLevelInput').value || 'Low Risk'",
  "p.riskLevel||'Low Risk'",
  "data.riskLevel||'Low Risk'",
  "Risk: ${data.riskLevel||'Low Risk'}",
]) {
  if (appSource.includes(forbidden)) throw new Error(`risk fallback remains: ${forbidden}`);
}

const collectFormDataBody = functionBody(appSource, 'collectFormData');
if (!collectFormDataBody.includes("riskLevel:     normalizeRiskLevel(document.getElementById('riskLevelInput').value)")) {
  throw new Error('collectFormData must preserve blank risk instead of defaulting to Low Risk');
}

const loadPatientBody = functionBody(appSource, 'loadPatientIntoForm');
if (!loadPatientBody.includes("set('riskLevelInput', normalizeRiskLevel(p.riskLevel))")) {
  throw new Error('loadPatientIntoForm must preserve missing risk as blank');
}
if (!loadPatientBody.includes("UI.riskBadgeHTML(p.riskLevel)")) {
  throw new Error('loadPatientIntoForm must render risk from stored value without Low fallback');
}

const riskPanelBody = functionBody(appSource, 'showRiskPanel');
if (!riskPanelBody.includes('Not recorded') || !riskPanelBody.includes('Moderate Risk')) {
  throw new Error('manual risk panel must support Not recorded and Moderate Risk');
}
if (riskPanelBody.includes('Middle Risk')) {
  throw new Error('manual risk panel must not offer legacy Middle Risk');
}

const runRiskEngineBody = functionBody(appSource, 'runRiskEngine');
if (runRiskEngineBody.includes('setRiskLevel(')) {
  throw new Error('runRiskEngine must not mutate official riskLevel');
}
if (!runRiskEngineBody.includes('Clinical Risk Advisory')) {
  throw new Error('runRiskEngine should preserve clinical triggers as advisories');
}

const placentaBody = functionBody(appSource, 'handlePlacentaChange');
if (placentaBody.includes('setRiskLevel(')) {
  throw new Error('placenta findings must not mutate official riskLevel');
}
if (!placentaBody.includes('Clinical Risk Advisory')) {
  throw new Error('placenta findings should remain visible as clinical advisories');
}

const uiContext = vm.createContext({ console, CALC:{}, CONSTANTS:{} });
vm.runInContext(`${uiSource}\nglobalThis.TEST_UI = UI;`, uiContext);
const UI = uiContext.TEST_UI;

if (!UI.riskBadgeHTML('').includes('Not recorded')) {
  throw new Error('missing risk badge must display Not recorded');
}
if (UI.riskBadgeHTML('').includes('risk-low')) {
  throw new Error('missing risk badge must not use low-risk styling');
}
if (!UI.riskBadgeHTML('Middle Risk').includes('Moderate Risk')) {
  throw new Error('legacy Middle Risk must display as Moderate Risk');
}
if (!UI.riskBadgeHTML('Moderate Risk').includes('risk-middle')) {
  throw new Error('Moderate Risk must use moderate styling');
}

const calcContext = vm.createContext({
  console,
  CONSTANTS:{
    LOW_PLACENTA_VALUES:['Low-lying'],
    assessDoppler(){ return null; },
    assessFGRRisk(){ return []; },
  },
});
vm.runInContext(`${calcSource}\nglobalThis.TEST_CALC = CALC;`, calcContext);
const CALC = calcContext.TEST_CALC;

const multiple = CALC.assessRisk({pregnancyType:'Twin'}, {}, []);
if (multiple.suggested !== 'High Risk' || !multiple.triggers.high.includes('Multiple pregnancy')) {
  throw new Error('multiple pregnancy trigger was not preserved');
}
const middle = CALC.assessRisk({age:'37'}, {}, []);
if (middle.suggested !== 'Moderate Risk' || !middle.triggers.middle.some(item => item.includes('Advanced maternal age'))) {
  throw new Error('middle-risk clinical trigger must now suggest Moderate Risk advisory');
}
const low = CALC.assessRisk({}, {}, []);
if (low.suggested !== 'Low Risk') throw new Error('low-risk advisory baseline changed unexpectedly');

console.log(JSON.stringify({
  passed:true,
  checks:[
    'risk input initializes blank',
    'missing risk is not collected or loaded as Low Risk',
    'manual risk panel supports Not recorded, Low, Moderate, and High',
    'legacy Middle Risk displays as Moderate Risk',
    'missing risk badge displays neutral Not recorded',
    'risk engine and placenta findings do not call setRiskLevel',
    'clinical risk triggers remain available as advisories',
  ],
}, null, 2));
