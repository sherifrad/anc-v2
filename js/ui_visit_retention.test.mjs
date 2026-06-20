import fs from 'node:fs/promises';
import vm from 'node:vm';

const uiSource = await fs.readFile(new URL('./ui.js', import.meta.url), 'utf8');
let rows = [];
const document = {
  querySelectorAll(selector) {
    return selector === '#visitBody tr[data-idx]' ? rows : [];
  },
  getElementById() { return null; },
};
const context = vm.createContext({
  console,
  document,
  CONSTANTS: {},
  CALC: {},
  DB: {},
  APP: {},
  setTimeout,
  clearTimeout,
});
vm.runInContext(`${uiSource}\nglobalThis.TEST_UI = UI;`, context);

const selectors = {
  date: '.visit-date',
  findings: '.visit-findings',
  bp: '.visit-bp',
  weight: '.visit-weight',
  meds: '.visit-meds',
  procSummary: '.visit-proc',
  labSummary: '.visit-lab',
  notes: '.visit-notes',
};

function row(values={}) {
  return {
    querySelector(selector) {
      const entry = Object.entries(selectors).find(([, css]) => css === selector);
      return { value: entry ? (values[entry[0]] || '') : '' };
    },
  };
}

for (const field of ['bp','meds','notes','procSummary','labSummary','weight']) {
  rows = [row({ [field]: field === 'weight' ? '70' : `${field} only` })];
  const visits = context.TEST_UI.collectVisits();
  if (visits.length !== 1 || !visits[0][field]) {
    throw new Error(`visit with only ${field} was discarded`);
  }
}

rows = [row({})];
if (context.TEST_UI.collectVisits().length !== 0) {
  throw new Error('empty visit row was retained');
}

console.log(JSON.stringify({
  passed: true,
  checks: [
    'BP-only visit is retained',
    'medication-only visit is retained',
    'notes-only visit is retained',
    'procedure-only visit is retained',
    'lab-summary-only visit is retained',
    'weight-only visit is retained',
    'empty visit row is excluded',
  ],
}, null, 2));
