/* ═══════════════════════════════════════════════════════════
   constants.js — Clinical Reference Data
   Egyptian MOH + ACOG + NICE + Intergrowth-21st + Hadlock
═══════════════════════════════════════════════════════════ */

const CONSTANTS = (() => {

  /* ─── LAB REFERENCE RANGES (Egyptian MOH + ACOG for pregnancy) ─── */
  const LAB_REFS = {
    // CBC
    'Hb': {
      unit:'g/dL', t1:{low:11.0,high:16.5}, t2:{low:10.5,high:16.5}, t3:{low:11.0,high:16.5},
      note:'Egyptian MOH: <10.5 = anemia in pregnancy'
    },
    'HCT': {
      unit:'%', t1:{low:33,high:50}, t2:{low:32,high:49}, t3:{low:33,high:50}, note:'Hematocrit'
    },
    'WBC': {
      unit:'×10³/µL', t1:{low:6,high:16}, t2:{low:6,high:16}, t3:{low:6,high:16},
      note:'Leukocytosis normal in pregnancy up to 16'
    },
    'PLT': {
      unit:'×10³/µL', t1:{low:150,high:400}, t2:{low:150,high:400}, t3:{low:100,high:400},
      note:'Gestational thrombocytopenia: 100-150 in T3 often benign'
    },
    'MCV': { unit:'fL', all:{low:80,high:100}, note:'Low MCV suggests IDA' },
    'MCH': { unit:'pg', all:{low:27,high:33}, note:'' },

    // Iron studies
    'Serum Ferritin': {
      unit:'ng/mL', t1:{low:13,high:150}, t2:{low:10,high:120}, t3:{low:10,high:100},
      note:'<13 = depleted iron stores'
    },
    'Serum Iron': { unit:'µg/dL', all:{low:60,high:170}, note:'' },
    'TIBC': { unit:'µg/dL', all:{low:250,high:400}, note:'Increases in IDA' },
    'Transferrin Sat': { unit:'%', all:{low:20,high:50}, note:'<20% suggests IDA' },

    // Thyroid
    'TSH': {
      unit:'mIU/L', t1:{low:0.1,high:2.5}, t2:{low:0.2,high:3.0}, t3:{low:0.3,high:3.0},
      note:'ATA 2017 trimester-specific ranges'
    },
    'Free T4': { unit:'ng/dL', all:{low:0.8,high:1.8}, note:'' },
    'Free T3': { unit:'pg/mL', all:{low:2.3,high:4.2}, note:'' },
    'Anti-TPO': { unit:'IU/mL', all:{low:0,high:34}, note:'>34 = positive' },

    // Glucose
    'Fasting Blood Glucose': {
      unit:'mg/dL', all:{low:70,high:92},
      note:'IADPSG: FBG ≥92 = GDM'
    },
    'OGTT 1h': { unit:'mg/dL', all:{low:0,high:180}, note:'IADPSG: ≥180 = GDM' },
    'OGTT 2h': { unit:'mg/dL', all:{low:0,high:153}, note:'IADPSG: ≥153 = GDM' },
    'PP Blood Glucose': { unit:'mg/dL', all:{low:0,high:120}, note:'2h postprandial <120' },
    'HbA1c': { unit:'%', all:{low:0,high:5.9}, note:'Pre-gestational DM monitoring' },
    'Random Blood Glucose': { unit:'mg/dL', all:{low:70,high:140}, note:'' },

    // Renal
    'Serum Creatinine': { unit:'mg/dL', all:{low:0.4,high:0.8}, note:'Lower in pregnancy due to increased GFR' },
    'Blood Urea Nitrogen': { unit:'mg/dL', all:{low:7,high:20}, note:'BUN' },
    'Uric Acid': { unit:'mg/dL', all:{low:2.0,high:5.5}, note:'>5.5 may indicate preeclampsia' },

    // Liver
    'ALT': { unit:'U/L', all:{low:0,high:35}, note:'' },
    'AST': { unit:'U/L', all:{low:0,high:35}, note:'' },
    'Alkaline Phosphatase': { unit:'U/L', all:{low:40,high:300}, note:'Elevated in pregnancy — placental isoform' },
    'Total Bilirubin': { unit:'mg/dL', all:{low:0.2,high:1.0}, note:'' },
    'Total Protein': { unit:'g/dL', all:{low:6.0,high:8.5}, note:'' },
    'Albumin': { unit:'g/dL', all:{low:3.0,high:4.5}, note:'Falls physiologically in pregnancy' },

    // Coagulation
    'PT': { unit:'seconds', all:{low:11,high:14}, note:'' },
    'PTT': { unit:'seconds', all:{low:25,high:38}, note:'' },
    'INR': { unit:'', all:{low:0.9,high:1.1}, note:'<1.0 in normal pregnancy (hypercoag state)' },
    'Fibrinogen': { unit:'mg/dL', all:{low:300,high:700}, note:'Rises in pregnancy; <200 in DIC' },
    'D-Dimer': { unit:'µg/mL FEU', all:{low:0,high:1.0}, note:'Rises trimester-by-trimester; interpret with caution' },

    // Infectious / screening
    'HBsAg': { unit:'', all:{low:null,high:null}, binary:true, positiveIsAbnormal:true, note:'Hepatitis B surface antigen' },
    'Anti-HCV': { unit:'', all:{low:null,high:null}, binary:true, positiveIsAbnormal:true, note:'Hepatitis C antibody' },
    'HIV': { unit:'', all:{low:null,high:null}, binary:true, positiveIsAbnormal:true, note:'HIV 1/2 Ag/Ab combo' },
    'VDRL/RPR': { unit:'', all:{low:null,high:null}, binary:true, positiveIsAbnormal:true, note:'Syphilis screening' },
    'Rubella IgG': { unit:'IU/mL', all:{low:10,high:9999}, note:'<10 = susceptible; offer vaccination postpartum' },
    'CMV IgM': { unit:'', all:{low:null,high:null}, binary:true, positiveIsAbnormal:true, note:'Active CMV infection' },
    'Toxoplasma IgM': { unit:'', all:{low:null,high:null}, binary:true, positiveIsAbnormal:true, note:'Active toxo' },

    // Urine
    'Urine Protein': { unit:'mg/dL', all:{low:0,high:30}, note:'>300mg/24h = preeclampsia threshold' },
    'Urine Glucose': { unit:'mg/dL', all:{low:0,high:25}, note:'Trace glycosuria common in pregnancy' },
    'Urine WBC': { unit:'/HPF', all:{low:0,high:5}, note:'>5 = pyuria/UTI' },
    'Urine RBC': { unit:'/HPF', all:{low:0,high:2}, note:'' },
    'Urine Culture': { unit:'', all:{low:null,high:null}, binary:true, positiveIsAbnormal:true, note:'Colony count >10⁵ = UTI' },

    // Serum markers
    'PAPP-A': { unit:'MoM', all:{low:0.4,high:2.5}, note:'<0.4 MoM at 11-13w → increased risk T21/FGR' },
    'Free β-hCG': { unit:'MoM', all:{low:0.4,high:2.5}, note:'Elevation T21; low T18/T13' },
    'AFP': { unit:'MoM', all:{low:0.5,high:2.5}, note:'Elevation → NTD/ventral wall; low → T21' },
    'Inhibin A': { unit:'MoM', all:{low:0.5,high:2.5}, note:'Elevated in T21' },
    'NT': { unit:'mm', all:{low:0,high:3.5}, note:'>3.5mm at 11-13w = increased aneuploidy risk' },

    // Vitamin / minerals
    'Vitamin D': { unit:'ng/mL', all:{low:30,high:100}, note:'<20 = deficient; 20-30 = insufficient' },
    'Calcium': { unit:'mg/dL', all:{low:8.5,high:10.2}, note:'Ionized calcium more reliable in pregnancy' },
    'Magnesium': { unit:'mg/dL', all:{low:1.8,high:2.5}, note:'' },
    'Folate': { unit:'ng/mL', all:{low:5.9,high:24}, note:'<5.9 = deficient' },
    'Vitamin B12': { unit:'pg/mL', all:{low:200,high:900}, note:'<200 = deficient' },

    // Blood group / antibodies
    'ABO Blood Group': { unit:'', all:{low:null,high:null}, binary:false, note:'Informational' },
    'Rh Factor': { unit:'', all:{low:null,high:null}, binary:false, note:'Rh-negative → Anti-D protocol' },
    'Indirect Coombs': { unit:'', all:{low:null,high:null}, binary:true, positiveIsAbnormal:true, note:'If positive → titer required' },
  };

  /* ─── HIGH-RISK TRIGGERS ─── */
  const HIGH_RISK_TRIGGERS = [
    { field:'pregnancyType', values:['Twin','Triplet','Higher Order Multiple'], label:'Multiple pregnancy' },
    { field:'placentaLocation', values:['Low-lying','Placenta Previa - Marginal','Placenta Previa - Partial','Placenta Previa - Complete'], label:'Placenta previa/low-lying' },
    { labKey:'FBG', threshold:{gte:92}, label:'Fasting glucose ≥92 mg/dL (GDM threshold)' },
    { labKey:'OGTT 2h', threshold:{gte:153}, label:'OGTT 2h ≥153 mg/dL (GDM)' },
    { labKey:'Urine Protein', threshold:{gte:300}, label:'Proteinuria ≥300 mg' },
    { labKey:'NT', threshold:{gte:3.5}, label:'NT ≥3.5mm — increased aneuploidy risk' },
  ];

  const MIDDLE_RISK_TRIGGERS = [
    { field:'age', threshold:{gte:35}, label:'Advanced maternal age ≥35' },
    { field:'age', threshold:{lte:18}, label:'Adolescent pregnancy ≤18' },
    { labKey:'Hb', threshold:{lte:9.0}, label:'Severe anemia (Hb ≤9.0)' },
    { labKey:'TSH', threshold:{gte:3.0}, label:'TSH ≥3.0 mIU/L' },
    { tpalAbortions: 2, label:'Recurrent pregnancy loss (≥2 abortions)' },
  ];

  /* ─── AMNIOTIC FLUID REFERENCE (ACOG/NICE) ─── */
  const AFI_RANGES = {
    // by GA week: [low_normal, high_normal] in cm
    16:{low:6,high:18}, 17:{low:7,high:19}, 18:{low:8,high:20}, 19:{low:9,high:22},
    20:{low:10,high:22}, 21:{low:11,high:22}, 22:{low:12,high:22}, 23:{low:12,high:22},
    24:{low:12,high:22}, 25:{low:12,high:22}, 26:{low:12,high:22}, 27:{low:12,high:22},
    28:{low:12,high:22}, 29:{low:12,high:22}, 30:{low:11,high:21}, 31:{low:11,high:20},
    32:{low:10,high:20}, 33:{low:9,high:19}, 34:{low:9,high:18}, 35:{low:7,high:17},
    36:{low:6,high:16}, 37:{low:6,high:15}, 38:{low:5,high:15}, 39:{low:5,high:14},
    40:{low:5,high:14}, 41:{low:5,high:13}, 42:{low:5,high:12},
  };
  // DVP normal: 2-8 cm (any GA per NICE)
  const DVP_NORMAL = {low:2, high:8};

  /* ─── INTERGROWTH-21st BIOMETRIC MEANS BY GA (mm) ─── */
  // GA in weeks (20-40), [mean_BPD, mean_HC, mean_AC, mean_FL]
  const INTERGROWTH = {
    20:[47.2,182,148,33.2], 21:[50.0,193,157,35.5], 22:[52.8,203,165,37.8],
    23:[55.5,213,173,40.0], 24:[58.0,223,181,42.2], 25:[60.4,232,189,44.3],
    26:[62.7,241,196,46.3], 27:[64.9,250,204,48.2], 28:[67.0,258,211,50.1],
    29:[69.0,266,218,51.9], 30:[70.9,274,226,53.6], 31:[72.7,281,233,55.3],
    32:[74.4,288,240,56.9], 33:[76.0,295,247,58.4], 34:[77.5,301,253,59.9],
    35:[78.9,307,260,61.3], 36:[80.2,312,266,62.6], 37:[81.4,317,272,63.9],
    38:[82.5,321,277,65.1], 39:[83.5,325,282,66.3], 40:[84.4,328,287,67.4],
  };
  // SD (approximate) for percentile calculations
  const INTERGROWTH_SD = {
    BPD:3.8, HC:14.0, AC:18.0, FL:3.2
  };

  /* ─── HADLOCK BIOMETRICS (original 1985 data) ─── */
  // Same structure: GA → [mean_BPD, mean_HC, mean_AC, mean_FL]
  const HADLOCK = {
    20:[46.7,178,145,31.0], 21:[49.5,188,154,33.5], 22:[52.3,198,163,36.0],
    23:[55.0,208,172,38.4], 24:[57.6,218,180,40.7], 25:[60.1,227,189,43.0],
    26:[62.6,236,198,45.2], 27:[65.0,245,207,47.4], 28:[67.3,254,215,49.5],
    29:[69.5,262,224,51.5], 30:[71.6,270,232,53.5], 31:[73.6,278,240,55.4],
    32:[75.5,286,249,57.2], 33:[77.3,293,257,59.0], 34:[79.0,300,265,60.7],
    35:[80.7,306,273,62.3], 36:[82.2,312,281,63.9], 37:[83.6,317,288,65.4],
    38:[84.9,322,295,66.8], 39:[86.1,326,302,68.2], 40:[87.2,330,308,69.5],
  };

  /* ─── DOPPLER REFERENCE RANGES ─── */
  // Umbilical Artery PI by GA (Arduini & Rizzo 1990 / ISUOG)
  const UA_PI = {
    20:{mean:1.42,p5:1.04,p95:1.80}, 22:{mean:1.30,p5:0.96,p95:1.68},
    24:{mean:1.20,p5:0.87,p95:1.55}, 26:{mean:1.11,p5:0.80,p95:1.45},
    28:{mean:1.04,p5:0.75,p95:1.35}, 30:{mean:0.96,p5:0.69,p95:1.26},
    32:{mean:0.90,p5:0.64,p95:1.17}, 34:{mean:0.84,p5:0.59,p95:1.09},
    36:{mean:0.79,p5:0.55,p95:1.03}, 38:{mean:0.74,p5:0.50,p95:0.98},
    40:{mean:0.70,p5:0.46,p95:0.94},
  };
  // MCA PI by GA
  const MCA_PI = {
    20:{mean:1.90,p5:1.35,p95:2.45}, 22:{mean:1.96,p5:1.42,p95:2.50},
    24:{mean:2.01,p5:1.47,p95:2.56}, 26:{mean:2.06,p5:1.51,p95:2.60},
    28:{mean:2.10,p5:1.55,p95:2.65}, 30:{mean:2.13,p5:1.58,p95:2.68},
    32:{mean:1.82,p5:1.32,p95:2.32}, 34:{mean:1.64,p5:1.18,p95:2.10},
    36:{mean:1.55,p5:1.10,p95:2.00}, 38:{mean:1.48,p5:1.04,p95:1.92},
    40:{mean:1.42,p5:0.99,p95:1.85},
  };
  // Ductus Venosus PI
  const DV_PI = {
    20:{mean:0.82,p5:0.55,p95:1.10}, 24:{mean:0.75,p5:0.50,p95:1.00},
    28:{mean:0.68,p5:0.44,p95:0.92}, 32:{mean:0.62,p5:0.39,p95:0.85},
    36:{mean:0.56,p5:0.35,p95:0.78}, 40:{mean:0.52,p5:0.32,p95:0.72},
  };
  // CPR (Cerebro-Placental Ratio = MCA PI / UA PI) — normal >1.0
  // Uterine Artery PI (bilateral mean) — elevated if >95th percentile
  const UtA_PI = {
    20:{p50:1.35,p95:2.35}, 22:{p50:1.22,p95:2.05}, 24:{p50:1.10,p95:1.80},
    28:{p50:0.98,p95:1.60}, 32:{p50:0.90,p95:1.45}, 36:{p50:0.85,p95:1.35},
  };

  /* ─── DROPDOWN LISTS ─── */
  const COMMON_LABS = Object.keys(LAB_REFS);

  const PLACENTA_LOCATIONS = [
    'Anterior','Posterior','Fundal','Lateral - Right','Lateral - Left',
    'Anterior Low-lying','Posterior Low-lying',
    'Placenta Previa - Marginal','Placenta Previa - Partial','Placenta Previa - Complete',
  ];
  const LOW_PLACENTA_VALUES = [
    'Anterior Low-lying','Posterior Low-lying',
    'Placenta Previa - Marginal','Placenta Previa - Partial','Placenta Previa - Complete',
  ];

  const SCAN_TYPES = [
    'Quick limited clinic scan',
    'Early viability scan',
    'NT scan',
    'Anomaly scan',
    'Growth scan',
    'Doppler scan',
    'BPP',
    'Cervical assessment',
    'Other',
  ];

  const LEGACY_SCAN_TYPE_MAP = {
    'Dating Scan': 'Early viability scan',
    'First Trimester Scan (11-13+6)': 'NT scan',
    'Second Trimester Anomaly Scan (18-22)': 'Anomaly scan',
    'Growth Scan': 'Growth scan',
    'Doppler Study': 'Doppler scan',
    'Fetal Wellbeing Scan': 'Quick limited clinic scan',
    'Third Trimester Scan': 'Growth scan',
    'Cervicometry': 'Cervical assessment',
    'Biophysical Profile': 'BPP',
  };

  const PROC_TYPES = [
    'Cervicometry','Double Test','Triple Test','Quadruple Test',
    'NIPT','CVS','Amniocentesis','Fetal Echocardiography',
    'Doppler Study','NST','CTG','Biophysical Profile',
    'OGTT','Anti-D Administration','Cerclage','Pessary','Other',
  ];

  /* ─── UTILITY: closest GA key ─── */
  function closestGA(table, ga) {
    const keys = Object.keys(table).map(Number).sort((a,b)=>a-b);
    if (ga <= keys[0]) return keys[0];
    if (ga >= keys[keys.length-1]) return keys[keys.length-1];
    return keys.reduce((prev,curr) => Math.abs(curr-ga)<Math.abs(prev-ga)?curr:prev);
  }

  /* ─── UTILITY: flag lab value ─── */
  function flagLab(testName, value, trimester) {
    const ref = LAB_REFS[testName];
    if (!ref) return {flag:'unknown', color:'#888', label:'Unknown'};
    const numVal = parseFloat(value);

    // Binary tests
    if (ref.binary) {
      const v = String(value).toLowerCase().trim();
      const isPositive = ['positive','reactive','detected','+','pos','yes'].includes(v);
      if (isPositive && ref.positiveIsAbnormal) return {flag:'high', color:'#c62828', label:'⚠ POSITIVE'};
      if (!isPositive && ['negative','non-reactive','not detected','-','neg','no'].includes(v))
        return {flag:'normal', color:'#2e7d32', label:'✓ NEGATIVE'};
      return {flag:'pending', color:'#888', label:'⏳ Pending'};
    }

    if (!value || isNaN(numVal)) return {flag:'pending', color:'#888', label:'⏳ Pending'};

    // Get range by trimester
    const trimKey = {1:'t1',2:'t2',3:'t3'}[trimester] || 'all';
    const range = ref[trimKey] || ref.all;
    if (!range) return {flag:'unknown', color:'#888', label:'—'};

    if (numVal < range.low)  return {flag:'low',  color:'#e65100', label:`▼ LOW (ref: ${range.low}–${range.high} ${ref.unit})`};
    if (numVal > range.high) return {flag:'high', color:'#c62828', label:`▲ HIGH (ref: ${range.low}–${range.high} ${ref.unit})`};
    return {flag:'normal', color:'#2e7d32', label:`✓ Normal (ref: ${range.low}–${range.high} ${ref.unit})`};
  }

  /* ─── UTILITY: AFI/DVP assessment ─── */
  function assessAFI(afi, ga) {
    if (!afi || !ga) return null;
    const val = parseFloat(afi);
    const ref = AFI_RANGES[Math.min(42, Math.max(16, Math.round(ga)))] || {low:5,high:24};
    if (val < ref.low) return {label:'Oligohydramnios', color:'#c62828', icon:'▼'};
    if (val > ref.high) return {label:'Polyhydramnios', color:'#e65100', icon:'▲'};
    return {label:'Normal', color:'#2e7d32', icon:'✓'};
  }
  function assessDVP(dvp) {
    if (!dvp) return null;
    const val = parseFloat(dvp);
    if (val < DVP_NORMAL.low) return {label:'Oligohydramnios', color:'#c62828', icon:'▼'};
    if (val > DVP_NORMAL.high) return {label:'Polyhydramnios', color:'#e65100', icon:'▲'};
    return {label:'Normal', color:'#2e7d32', icon:'✓'};
  }

  /* ─── UTILITY: biometric percentile (z-score → percentile) ─── */
  function zToPercentile(z) {
    // Approximation of standard normal CDF
    const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911;
    const sign = z < 0 ? -1 : 1;
    const x = Math.abs(z)/Math.SQRT2;
    const t = 1/(1+p*x);
    const y = 1 - (((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-x*x);
    return Math.round(((1+sign*y)/2)*100);
  }

  function getBiometricPercentile(measure, valueInMm, ga, chartType='intergrowth') {
    const table = chartType === 'hadlock' ? HADLOCK : INTERGROWTH;
    const gaKey = closestGA(table, ga);
    const row   = table[gaKey];
    if (!row) return null;

    const idx = {BPD:0, HC:1, AC:2, FL:3}[measure];
    if (idx === undefined) return null;
    const mean = row[idx];
    const sd   = INTERGROWTH_SD[measure];
    const z    = (valueInMm - mean) / sd;
    const pct  = zToPercentile(z);
    return {percentile: pct, z, mean, sd};
  }

  /* ─── UTILITY: Doppler assessment ─── */
  function assessDoppler(vessel, pi, ga) {
    const tables = {UA: UA_PI, MCA: MCA_PI, DV: DV_PI, UtA: UtA_PI};
    const table = tables[vessel];
    if (!table || !pi || !ga) return null;
    const val = parseFloat(pi);
    const key = closestGA(table, ga);
    const ref = table[key];
    if (!ref) return null;

    if (vessel === 'MCA') {
      if (val < ref.p5) return {label:'MCA PI Below 5th — Fetal Hypoxia/Centralization', color:'#c62828', severity:'high'};
      return {label:`MCA PI Normal (p5:${ref.p5} – p95:${ref.p95})`, color:'#2e7d32', severity:'normal'};
    }
    if (vessel === 'UtA') {
      const p95 = ref.p95 || ref.p95;
      if (val > p95) return {label:`Uterine Artery PI Elevated >95th — Uteroplacental Insufficiency Risk`, color:'#c62828', severity:'high'};
      return {label:`Uterine Artery PI Normal (<${p95})`, color:'#2e7d32', severity:'normal'};
    }
    // UA / DV: elevated is bad
    if (val > ref.p95) return {label:`${vessel} PI Elevated >95th percentile`, color:'#c62828', severity:'high'};
    if (val < ref.p5)  return {label:`${vessel} PI Below 5th — Abnormal`, color:'#e65100', severity:'medium'};
    return {label:`${vessel} PI Normal (${ref.p5}–${ref.p95})`, color:'#2e7d32', severity:'normal'};
  }

  /* ─── UTILITY: CPR ─── */
  function calcCPR(mca_pi, ua_pi) {
    if (!mca_pi || !ua_pi) return null;
    const cpr = parseFloat(mca_pi) / parseFloat(ua_pi);
    if (cpr < 1.0) return {value: cpr.toFixed(2), label:'CPR <1.0 — Cerebral Redistribution (FGR risk)', color:'#c62828'};
    return {value: cpr.toFixed(2), label:`CPR Normal (${cpr.toFixed(2)} ≥1.0)`, color:'#2e7d32'};
  }

  /* ─── FGR RISK ASSESSMENT ─── */
  function assessFGRRisk(biometrics, ga) {
    // biometrics: {BPD, HC, AC, FL} in mm
    const risks = [];
    ['BPD','HC','AC','FL'].forEach(m => {
      if (!biometrics[m]) return;
      const result = getBiometricPercentile(m, parseFloat(biometrics[m]), ga, 'intergrowth');
      if (!result) return;
      if (result.percentile < 3)  risks.push({label:`${m} <3rd percentile`, severity:'severe'});
      else if (result.percentile < 10) risks.push({label:`${m} <10th percentile`, severity:'moderate'});
    });
    if (biometrics.AC && biometrics.HC) {
      const ratio  = parseFloat(biometrics.HC) / parseFloat(biometrics.AC);
      const acResult = getBiometricPercentile('AC', parseFloat(biometrics.AC), ga, 'intergrowth');
      // HC/AC > 1.05 is only clinically significant if AC is also small (<25th pct)
      if (ga >= 28 && ratio > 1.05 && acResult && acResult.percentile < 25)
        risks.push({label:`HC/AC ratio ${ratio.toFixed(2)} > 1.05 with small AC (asymmetric FGR pattern)`, severity:'moderate'});
    }
    return risks;
  }

  return {
    LAB_REFS, COMMON_LABS,
    HIGH_RISK_TRIGGERS, MIDDLE_RISK_TRIGGERS,
    AFI_RANGES, DVP_NORMAL,
    INTERGROWTH, HADLOCK, INTERGROWTH_SD,
    UA_PI, MCA_PI, DV_PI, DV_PI, UtA_PI,
    PLACENTA_LOCATIONS, LOW_PLACENTA_VALUES,
    SCAN_TYPES, LEGACY_SCAN_TYPE_MAP, PROC_TYPES,
    closestGA, flagLab,
    assessAFI, assessDVP,
    getBiometricPercentile, zToPercentile,
    assessDoppler, calcCPR, assessFGRRisk,
  };
})();
