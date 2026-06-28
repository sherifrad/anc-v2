import fs from 'node:fs/promises';
import vm from 'node:vm';

const calcSource = await fs.readFile(new URL('./calc.js', import.meta.url), 'utf8');
const context = vm.createContext({ console, CONSTANTS:{} });
vm.runInContext(`${calcSource}\nglobalThis.TEST_CALC = CALC;`, context);
const CALC = context.TEST_CALC;

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

function assertDating(method, inputs, refDate, expected) {
  const result = CALC.deriveDating(method, inputs, refDate);
  assertEqual(result.lmpDate, expected.lmpDate, `${expected.label} lmpDate`);
  assertEqual(CALC.toInputDate(result.edd), expected.edd, `${expected.label} edd`);
  assertEqual(result.ga.totalDays, expected.totalDays, `${expected.label} GA total days`);
  assertEqual(result.label, expected.label, `${expected.label} label`);
}

assertDating('lmp', {lmpDate:'2026-01-01'}, '2026-02-12', {
  label:'LMP', lmpDate:'2026-01-01', edd:'2026-10-08', totalDays:42,
});

assertDating('embryo-transfer', {embryoTransferDate:'2026-01-20', embryoAge:'3'}, '2026-02-03', {
  label:'ART - Day-3 Embryo Transfer', lmpDate:'2026-01-03', edd:'2026-10-10', totalDays:31,
});

assertDating('embryo-transfer', {embryoTransferDate:'2026-01-20', embryoAge:'5'}, '2026-02-03', {
  label:'ART - Day-5 Blastocyst Transfer', lmpDate:'2026-01-01', edd:'2026-10-08', totalDays:33,
});

assertDating('embryo-transfer', {embryoTransferDate:'2026-01-20', embryoAge:'6'}, '2026-02-03', {
  label:'ART - Day-6 Blastocyst Transfer', lmpDate:'2025-12-31', edd:'2026-10-07', totalDays:34,
});

assertDating('ultrasound', {ultrasoundDate:'2026-03-15', ultrasoundGAWeeks:'9', ultrasoundGADays:'2'}, '2026-03-29', {
  label:'Dating by Ultrasound', lmpDate:'2026-01-09', edd:'2026-10-16', totalDays:79,
});

assertDating('manual', {manualGAWeeks:'12', manualGADays:'4'}, '2026-04-01', {
  label:'Established Dating', lmpDate:'2026-01-03', edd:'2026-10-10', totalDays:88,
});

console.log(JSON.stringify({
  passed:true,
  checks:[
    'LMP dating derives GA and EDD',
    'Day-3 embryo transfer derives equivalent LMP',
    'Day-5 embryo transfer derives equivalent LMP',
    'Day-6 embryo transfer derives equivalent LMP',
    'Ultrasound dating derives equivalent LMP',
    'Manual GA dating derives equivalent LMP',
  ],
}, null, 2));
