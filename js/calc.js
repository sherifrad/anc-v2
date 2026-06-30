/* ═══════════════════════════════════════════════════════════
   calc.js v2 — Obstetric Calculations + Risk Engine
═══════════════════════════════════════════════════════════ */

const CALC = (() => {

  /* ─── GA FROM ANY TWO DATES ─── */
  function getGA(lmpDate, refDate) {
    if (!lmpDate) return null;
    const lmp  = new Date(lmpDate);
    const ref  = refDate ? new Date(refDate) : new Date();
    if (isNaN(lmp) || isNaN(ref) || ref < lmp) return null;
    const days  = Math.floor((ref - lmp) / 864e5);
    return { weeks: Math.floor(days/7), days: days%7, totalDays: days };
  }

  /* ─── GA IN DECIMAL WEEKS ─── */
  function getGADecimal(lmpDate, refDate) {
    const g = getGA(lmpDate, refDate);
    return g ? g.weeks + g.days/7 : null;
  }

  /* ─── EDD ─── */
  function getEDD(lmpDate) {
    if (!lmpDate) return null;
    const d = new Date(lmpDate);
    if (isNaN(d)) return null;
    d.setDate(d.getDate() + 280);
    return d;
  }

  /* ─── TRIMESTER ─── */
  function getTrimester(weeks) {
    if (weeks === null || weeks === undefined) return null;
    if (weeks < 14) return {num:1, label:'First Trimester',  sub:'(1–13 weeks)',  key:'t1', color:'#f4a261', bg:'#fff3e0'};
    if (weeks < 28) return {num:2, label:'Second Trimester', sub:'(14–27 weeks)', key:'t2', color:'#4caf50', bg:'#e8f5e9'};
    return            {num:3, label:'Third Trimester',  sub:'(28+ weeks)',   key:'t3', color:'#2196f3', bg:'#e3f2fd'};
  }

  /* ─── FORMAT DATE ─── */
  function formatDate(d, fmt='DD-MMM-YYYY') {
    if (!d) return '—';
    const dt = typeof d === 'string' ? new Date(d) : d;
    if (isNaN(dt)) return '—';
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    if (fmt === 'DD-MMM-YYYY')
      return `${String(dt.getDate()).padStart(2,'0')}-${months[dt.getMonth()]}-${dt.getFullYear()}`;
    return dt.toLocaleDateString('en-GB');
  }

  function toInputDate(d) {
    if (!d) return '';
    const dt = typeof d === 'string' ? new Date(d) : d;
    if (isNaN(dt)) return '';
    const pad = number => String(number).padStart(2, '0');
    return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`;
  }

  function todayISO() { return new Date().toISOString().split('T')[0]; }

  function addDaysISO(dateValue, days) {
    if (!dateValue && dateValue !== 0) return '';
    const date = new Date(dateValue);
    if (isNaN(date)) return '';
    date.setDate(date.getDate() + days);
    return toInputDate(date);
  }

  function gaTotalDays(weeks, days) {
    const w = parseInt(weeks, 10);
    const d = parseInt(days, 10);
    if (Number.isNaN(w) || w < 0) return null;
    const safeDays = Number.isNaN(d) ? 0 : d;
    if (safeDays < 0 || safeDays > 6) return null;
    return (w * 7) + safeDays;
  }

  function deriveDating(method='lmp', inputs={}, refDate=todayISO()) {
    const selected = method || 'lmp';
    let lmpDate = '';
    let label = 'LMP';
    if (selected === 'embryo-transfer') {
      const age = String(inputs.embryoAge || '5');
      const offsets = { '3':17, '5':19, '6':20 };
      lmpDate = addDaysISO(inputs.embryoTransferDate, -offsets[age]);
      label = age === '3'
        ? 'ART - Day-3 Embryo Transfer'
        : `ART - Day-${age} Blastocyst Transfer`;
    } else if (selected === 'ultrasound') {
      const totalDays = gaTotalDays(inputs.ultrasoundGAWeeks, inputs.ultrasoundGADays);
      lmpDate = totalDays === null ? '' : addDaysISO(inputs.ultrasoundDate, -totalDays);
      label = 'Dating by Ultrasound';
    } else if (selected === 'manual') {
      const totalDays = gaTotalDays(inputs.manualGAWeeks, inputs.manualGADays);
      lmpDate = totalDays === null ? '' : addDaysISO(refDate || todayISO(), -totalDays);
      label = 'Established Dating';
    } else {
      lmpDate = inputs.lmpDate || '';
      label = 'LMP';
    }
    const edd = getEDD(lmpDate);
    const ga = getGA(lmpDate, refDate || todayISO());
    return { lmpDate, edd, ga, label };
  }

  /* ─── MILESTONES ─── */
  function getMilestones(weeks) {
    if (weeks === null || weeks === undefined) return [];
    const m = [];
    if (weeks >= 6  && weeks <= 10)  m.push({icon:'🔵',urgency:'info',    text:'Dating scan recommended if GA uncertain'});
    if (weeks >= 11 && weeks <= 13)  m.push({icon:'🔴',urgency:'urgent',  text:'NOW DUE: 1st Trimester Scan + NT + Double Test (PAPP-A, free β-hCG)'});
    if (weeks >= 10 && weeks <= 22)  m.push({icon:'🟡',urgency:'info',    text:'NIPT window: optimal 11–22 weeks'});
    if (weeks >= 18 && weeks <= 22)  m.push({icon:'🔴',urgency:'urgent',  text:'NOW DUE: Anomaly Scan (Level II) — fetal anatomy survey'});
    if (weeks >= 24 && weeks <= 28)  m.push({icon:'🟡',urgency:'warning', text:'OGTT 75g — GDM screening (IADPSG protocol)'});
    if (weeks >= 28 && weeks <= 30)  m.push({icon:'🔵',urgency:'info',    text:'Growth Scan | Anti-D (if Rh-) | TDaP vaccination | Influenza if due'});
    if (weeks >= 32 && weeks <= 34)  m.push({icon:'🔵',urgency:'info',    text:'Growth Scan + BPP assessment'});
    if (weeks >= 35 && weeks <= 37)  m.push({icon:'🟡',urgency:'warning', text:'GBS culture | Presentation check | Birth plan review'});
    if (weeks >= 36 && weeks <= 38)  m.push({icon:'🔴',urgency:'urgent',  text:'Pre-delivery labs: CBC, Coag, Group & Screen, Presentation'});
    if (weeks >= 40)                 m.push({icon:'🔴',urgency:'urgent',  text:'POST-DATE: Daily fetal kick count | CTG | IOL discussion'});
    if (weeks >= 42)                 m.push({icon:'⛔',urgency:'critical', text:'≥42 WEEKS — Urgent IOL or CS decision required'});
    return m;
  }

  /* ─── LAB INTELLIGENCE TEXT ─── */
  function getLabIntelText(weeks) {
    if (!weeks && weeks !== 0) return 'Enter LMP to see trimester-specific investigation checklist';
    if (weeks < 14) return `T1 (${weeks}w) — Order: CBC, Ferritin, TSH, FBG, Urine R/E, HBV, HIV, HCV, Rubella IgG, Blood Group & Rh, Indirect Coombs`;
    if (weeks < 28) return `T2 (${weeks}w) — Order: CBC, Ferritin, FBG, Urine R/E${weeks>=24?' | ⚠ OGTT now due (24–28w)':''}`;
    return `T3 (${weeks}w) — Order: CBC, Ferritin, FBG, PP Glucose, Coag Profile, Urine R/E, GBS${weeks>=36?' | ⚠ Pre-delivery labs now due':''}`;
  }

  /* ─── TPAL VALIDATION ─── */
  function validateTPAL(T,P,A,L) {
    const errors = [];
    const t=parseInt(T)||0, p=parseInt(P)||0, a=parseInt(A)||0, l=parseInt(L)||0;
    if (l > t+p) errors.push(`Living (${l}) cannot exceed Term+Preterm (${t+p})`);
    return errors;
  }

  /* ─── RISK ENGINE ─── */
  function assessRisk(patientData, labData, scanData) {
    const triggers = { high:[], middle:[] };

    // Multiple pregnancy
    if (['Twin','Triplet','Higher Order Multiple'].includes(patientData.pregnancyType))
      triggers.high.push('Multiple pregnancy');

    // Placenta (stored on patient data from last scan)
    if (CONSTANTS.LOW_PLACENTA_VALUES.includes(patientData.placentaLocation))
      triggers.high.push(`Placenta: ${patientData.placentaLocation}`);

    // Age
    const age = parseInt(patientData.age);
    if (!isNaN(age) && age >= 35) triggers.middle.push(`Advanced maternal age (${age})`);
    if (!isNaN(age) && age <= 18) triggers.middle.push(`Adolescent pregnancy (${age})`);

    // TPAL — recurrent loss
    if ((parseInt(patientData.tpalA)||0) >= 2)
      triggers.middle.push(`Recurrent pregnancy loss (${patientData.tpalA} abortions)`);

    // Lab triggers — labData structure: {t1:{keyName:{value,ordered,resultDate}}, t2:{...}}
    if (labData && typeof labData === 'object') {
      // Check FBG, OGTT across all trimesters
      const labChecks = [
        { keys:['Fasting_Blood_Glucose','FBG'], threshold:92, type:'gte', msg:'FBG ≥92 mg/dL (GDM threshold)', level:'high' },
        { keys:['OGTT_2h'],   threshold:153, type:'gte', msg:'OGTT 2h ≥153 mg/dL (GDM)', level:'high' },
        { keys:['Urine_Protein'], threshold:300, type:'gte', msg:'Proteinuria ≥300 mg', level:'high' },
        { keys:['Hb'], threshold:8.0,  type:'lte', msg:(v)=>`Severe anemia (Hb ${v} g/dL)`, level:'high' },
        { keys:['Hb'], threshold:10.5, type:'ltgt', low:8.0, msg:(v)=>`Anemia (Hb ${v} g/dL)`, level:'middle' },
        { keys:['TSH'], threshold:3.0, type:'gte', msg:(v)=>`TSH ${v} mIU/L (thyroid monitoring)`, level:'middle' },
      ];
      ['t1','t2','t3'].forEach(trim => {
        if (!labData[trim]) return;
        Object.entries(labData[trim]).forEach(([rawKey, entry]) => {
          if (!entry?.value) return;
          const val = parseFloat(entry.value);
          if (isNaN(val)) return;
          // Normalize key: replace underscores/spaces for comparison
          const normKey = rawKey.replace(/[\s_]+/g,'_');
          labChecks.forEach(check => {
            if (!check.keys.some(k => normKey.includes(k.replace(/\s+/g,'_')))) return;
            if (check.type === 'gte' && val >= check.threshold)
              triggers[check.level].push(typeof check.msg === 'function' ? check.msg(val) : check.msg);
            if (check.type === 'lte' && val <= check.threshold)
              triggers[check.level].push(typeof check.msg === 'function' ? check.msg(val) : check.msg);
            if (check.type === 'ltgt' && val <= check.threshold && val > check.low)
              triggers[check.level].push(typeof check.msg === 'function' ? check.msg(val) : check.msg);
          });
        });
      });
      // Check CBC sub-fields
      ['t1','t2','t3'].forEach(trim => {
        const cbc = labData[trim]?.['CBC'];
        if (!cbc) return;
        const hb = parseFloat(cbc.Hb);
        if (!isNaN(hb)) {
          if (hb < 8.0) triggers.high.push(`Severe anemia (Hb ${hb} g/dL)`);
          else if (hb < 10.5) triggers.middle.push(`Anemia (Hb ${hb} g/dL)`);
        }
      });
    }

    // Doppler & biometrics from scans
    if (Array.isArray(scanData)) {
      scanData.forEach(s => {
        // Parse GA from string like "14w+0d" or just a number
        const gaRaw = s.ga || '';
        const gaNum = parseInt(gaRaw) || 0;

        if (s.doppler?.UA_PI) {
          const res = CONSTANTS.assessDoppler('UA', s.doppler.UA_PI, gaNum);
          if (res?.severity === 'high') triggers.high.push('Abnormal Umbilical Artery Doppler');
        }
        if (s.doppler?.MCA_PI) {
          const res = CONSTANTS.assessDoppler('MCA', s.doppler.MCA_PI, gaNum);
          if (res?.severity === 'high') triggers.high.push('Abnormal MCA Doppler — Fetal Hypoxia');
        }
        if (s.biometrics && gaNum > 0) {
          const fgr = CONSTANTS.assessFGRRisk(s.biometrics, gaNum);
          fgr.filter(r=>r.severity==='severe').forEach(r => triggers.high.push(`FGR Risk: ${r.label}`));
          fgr.filter(r=>r.severity==='moderate').forEach(r => triggers.middle.push(`FGR Watch: ${r.label}`));
          // Check placenta from scan biometrics
          if (CONSTANTS.LOW_PLACENTA_VALUES.includes(s.biometrics.placentaLocation))
            triggers.high.push(`Placenta: ${s.biometrics.placentaLocation}`);
        }
      });
    }

    let suggested;
    if (triggers.high.length)        suggested = 'High Risk';
    else if (triggers.middle.length) suggested = 'Moderate Risk';
    else                             suggested = 'Low Risk';

    return { triggers, suggested };
  }

  /* ─── CHART DATA GENERATORS ─── */
  function buildGrowthChartData(measure, valuesMm, gaWeeks, chartType='intergrowth') {
    // Returns Chart.js dataset object
    const table = chartType === 'hadlock' ? CONSTANTS.HADLOCK : CONSTANTS.INTERGROWTH;
    const sd    = CONSTANTS.INTERGROWTH_SD[measure];
    const idx   = {BPD:0, HC:1, AC:2, FL:3}[measure];
    if (idx === undefined) return null;

    const gaRange = [];
    for (let g=20; g<=40; g++) gaRange.push(g);

    const p3   = gaRange.map(g => { const r=table[g]; return r ? +(r[idx]-1.88*sd).toFixed(1) : null; });
    const p10  = gaRange.map(g => { const r=table[g]; return r ? +(r[idx]-1.28*sd).toFixed(1) : null; });
    const p50  = gaRange.map(g => { const r=table[g]; return r ? r[idx] : null; });
    const p90  = gaRange.map(g => { const r=table[g]; return r ? +(r[idx]+1.28*sd).toFixed(1) : null; });
    const p97  = gaRange.map(g => { const r=table[g]; return r ? +(r[idx]+1.88*sd).toFixed(1) : null; });

    // Patient data points
    const patientData = (valuesMm||[]).map((v,i) => ({x: gaWeeks[i], y: parseFloat(v)}))
      .filter(pt => pt.x && pt.y);

    return {
      labels: gaRange,
      datasets:[
        {label:'3rd',  data:p3,  borderColor:'#ef9a9a',borderWidth:1,borderDash:[4,4],fill:false,pointRadius:0},
        {label:'10th', data:p10, borderColor:'#ff7043',borderWidth:1,borderDash:[4,4],fill:false,pointRadius:0},
        {label:'50th', data:p50, borderColor:'#1565c0',borderWidth:2,fill:false,pointRadius:0},
        {label:'90th', data:p90, borderColor:'#ff7043',borderWidth:1,borderDash:[4,4],fill:false,pointRadius:0},
        {label:'97th', data:p97, borderColor:'#ef9a9a',borderWidth:1,borderDash:[4,4],fill:false,pointRadius:0},
        {
          label:`${measure} (Patient)`,
          data: patientData,
          borderColor:'#0f2744', backgroundColor:'#c9a84c',
          borderWidth:2, pointRadius:6, pointHoverRadius:8,
          showLine:true, tension:0.3,
        },
      ],
    };
  }

  function buildAFIChartData(afiValues, gaWeeks) {
    const gaRange=[];
    for(let g=16;g<=42;g++) gaRange.push(g);
    const low  = gaRange.map(g => (CONSTANTS.AFI_RANGES[g]||{low:5}).low);
    const high = gaRange.map(g => (CONSTANTS.AFI_RANGES[g]||{high:24}).high);
    const patientData = (afiValues||[])
      .map((v,i)=>({x:gaWeeks[i], y:parseFloat(v)}))
      .filter(pt=>pt.x&&pt.y);

    return {
      labels: gaRange,
      datasets:[
        {label:'Normal Low',  data:low,  borderColor:'#ff7043',borderWidth:1,borderDash:[4,4],fill:false,pointRadius:0},
        {label:'Normal High', data:high, borderColor:'#ff7043',borderWidth:1,borderDash:[4,4],fill:false,pointRadius:0},
        {
          label:'AFI (Patient)',
          data: patientData,
          borderColor:'#0f2744', backgroundColor:'#2196f3',
          borderWidth:2, pointRadius:6, fill:false,
        },
      ],
    };
  }

  function buildDopplerChartData(vessel, piValues, gaWeeks) {
    const tables = {UA: CONSTANTS.UA_PI, MCA: CONSTANTS.MCA_PI, DV: CONSTANTS.DV_PI, UtA: CONSTANTS.UtA_PI};
    const table = tables[vessel];
    if (!table) return null;
    const gaRange = Object.keys(table).map(Number).sort((a,b)=>a-b);

    const p5   = gaRange.map(g => table[g]?.p5   || table[g]?.p50*0.7 || null);
    const p50  = gaRange.map(g => table[g]?.mean  || table[g]?.p50    || null);
    const p95  = gaRange.map(g => table[g]?.p95   || null);

    const patientData = (piValues||[])
      .map((v,i)=>({x:gaWeeks[i], y:parseFloat(v)}))
      .filter(pt=>pt.x&&pt.y);

    const colors = {UA:'#e53935', MCA:'#1565c0', DV:'#6a1b9a', UtA:'#e65100'};
    const c = colors[vessel] || '#333';

    return {
      labels: gaRange,
      datasets:[
        {label:'5th',  data:p5,  borderColor:'#ef9a9a',borderWidth:1,borderDash:[4,4],fill:false,pointRadius:0},
        {label:'Mean', data:p50, borderColor:c,borderWidth:2,fill:false,pointRadius:0},
        {label:'95th', data:p95, borderColor:'#ef9a9a',borderWidth:1,borderDash:[4,4],fill:false,pointRadius:0},
        {
          label:`${vessel} PI (Patient)`,
          data: patientData,
          borderColor:'#0f2744', backgroundColor:c,
          borderWidth:2, pointRadius:6, fill:false,
        },
      ],
    };
  }

  /* ─── FILE NAMING ─── */
  function buildFileName(fullName, gaWeeks) {
    const parts = (fullName||'').trim().split(/\s+/).filter(Boolean);
    return `${parts.join('_') || 'Patient'}_${gaWeeks||0}wks_v2`;
  }

  /* ─── DEBOUNCE ─── */
  function debounce(fn, delay) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(()=>fn(...args), delay); };
  }

  return {
    getGA, getGADecimal, getEDD, getTrimester,
    formatDate, toInputDate, todayISO,
    deriveDating,
    getMilestones, getLabIntelText,
    validateTPAL, assessRisk,
    buildGrowthChartData, buildAFIChartData, buildDopplerChartData,
    buildFileName, debounce,
  };
})();
