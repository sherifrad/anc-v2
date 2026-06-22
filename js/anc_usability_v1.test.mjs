import fs from 'node:fs/promises';
import vm from 'node:vm';

const constantsSource=await fs.readFile(new URL('./constants.js',import.meta.url),'utf8');
const calcSource=await fs.readFile(new URL('./calc.js',import.meta.url),'utf8');
const uiSource=await fs.readFile(new URL('./ui.js',import.meta.url),'utf8');
const appSource=await fs.readFile(new URL('./app.js',import.meta.url),'utf8');
const indexSource=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');

const document={querySelectorAll(){return[];},getElementById(){return null;}};
const context=vm.createContext({console,document,DB:{},APP:{},setTimeout,clearTimeout});
vm.runInContext(`${constantsSource}\nglobalThis.TEST_CONSTANTS=CONSTANTS;`,context);
vm.runInContext(`${calcSource}\nglobalThis.TEST_CALC=CALC;`,context);
context.CONSTANTS=context.TEST_CONSTANTS;context.CALC=context.TEST_CALC;
vm.runInContext(`${uiSource}\nglobalThis.TEST_UI=UI;`,context);
const UI=context.TEST_UI;

const twoCs=UI.obstetricHistorySummary([
  {year:'2019',outcome:'Live birth',deliveryType:'Planned cesarean',livingStatus:'Alive'},
  {year:'2022',outcome:'Live birth',deliveryType:'Cesarean section',livingStatus:'Alive'},
],{t:2,p:0,a:0,l:2});
if(twoCs.deliveryText!=='Previous deliveries: 2 CS')throw new Error('two CS summary is incorrect');
if(twoCs.tpalText!=='T2 P0 A0 L2')throw new Error('TPAL summary is incorrect');

const mixed=UI.obstetricHistorySummary([
  {outcome:'Live birth',deliveryType:'Cesarean section'},
  {outcome:'Live birth',deliveryType:'Normal vaginal delivery'},
],{});
if(mixed.deliveryText!=='Previous deliveries: 1 CS, 1 NVD')throw new Error('mixed delivery summary is incorrect');
const incomplete=UI.obstetricHistorySummary([{outcome:'Live birth',deliveryType:''}],{});
if(!incomplete.deliveryText.includes('mode incomplete'))throw new Error('missing delivery mode is not identified');
if(UI.obstetricHistorySummary([],{}).deliveryText!=='No previous delivery')throw new Error('empty delivery history wording is incorrect');

const outcomes=UI.obstetricHistorySummary([
  {year:'2019',outcome:'Molar pregnancy',molarManagement:'Evacuation'},
  {year:'2020',outcome:'Ectopic pregnancy',ectopicManagement:'Surgical management'},
  {year:'2021',outcome:'Pregnancy loss',lossTrimester:'First trimester',lossManagement:'Medical management'},
  {year:'2022',outcome:'Stillbirth',deliveryType:'Instrumental vaginal delivery',gestationalAge:'35',majorComplication:'Previous PET / hypertensive disorder'},
],{});
for(const text of ['Molar pregnancy','Ectopic pregnancy','Pregnancy loss','Stillbirth','Preterm birth','Operative vaginal delivery']){
  if(!JSON.stringify(outcomes).includes(text))throw new Error(`obstetric summary missing ${text}`);
}

const labs={
  t1:{
    CBC:{Hb:'9.8',PLT:'145',resultDate:'2026-06-21',updatedAt:'2026-06-21T08:00:00Z'},
    Fasting_Blood_Glucose:{value:'86',resultDate:'2026-06-21',updatedAt:'2026-06-21T08:00:00Z'},
    Urine_Protein:{value:'10',resultDate:'2026-06-20'},
  },
  t2:{CBC:{Hb:'10.1',resultDate:'2026-06-21',updatedAt:'2026-06-21T10:00:00Z'}},t3:{},
};
const sameDay=UI.sameDayLabItems(labs,'2026-06-21');
if(!sameDay.some(item=>item.key==='CBC.Hb'&&item.value==='10.1'))throw new Error('latest duplicate same-day result was not selected');
if(sameDay.some(item=>item.key==='Urine_Protein'))throw new Error('different-day lab was included');
if(!['high','low'].includes(sameDay[0]?.flag))throw new Error('abnormal Labs are not sorted first');
if(UI.sameDayLabItems(labs,'').length)throw new Error('undated visit produced a Lab Summary');
if(UI.localClinicalDate('2026-06-21')!=='2026-06-21')throw new Error('date-only local matching changed the calendar day');

const procedures=UI.sameDayProcedureItems([{date:'2026-06-21',type:'Cervical cerclage'},{date:'2026-06-20',type:'Other'}],'2026-06-21');
if(procedures.length!==1||procedures[0].label!=='Cervical cerclage')throw new Error('same-day procedure derivation failed');

const visitHtml=UI.visitRowHTML({procSummary:'legacy procedure',labSummary:'legacy lab'},0,'2026-01-01',[]);
if(visitHtml.includes('class="visit-proc"')||visitHtml.includes('class="visit-lab"'))throw new Error('new visit UI still exposes editable procedure or Lab Summary');
if(!visitHtml.includes('visit-proc-legacy')||!visitHtml.includes('visit-lab-legacy'))throw new Error('legacy visit summaries are not preserved');

for(const id of ['btnAddPreviousPregnancyBottom','btnAddProblemBottom','btnAddMedicationBottom','btnAddScanBottom','btnAddProcBottom','btnAddVisitBottom','patientActionHeader','patientMoreMenu']){
  if(!indexSource.includes(`id="${id}"`))throw new Error(`missing usability control ${id}`);
}
if(indexSource.includes('<!-- ACTION BAR -->')||/class="action-bar"/.test(indexSource))throw new Error('stacked bottom patient action bar remains');
for(const required of ['refreshVisitDerivedSummaries','btnArchiveCurrentPatient','showCurrentPatientAudit','allowRepeatableAdd']){
  if(!appSource.includes(required))throw new Error(`missing app integration ${required}`);
}

console.log(JSON.stringify({passed:true,checks:[
  'generated TPAL and delivery summaries','important obstetric complications','loss/ectopic/molar rows',
  'same-day Labs and duplicate resolution','abnormal-first Labs','same-day procedures',
  'legacy visit summary retention','bottom actions and patient header integration',
]},null,2));
