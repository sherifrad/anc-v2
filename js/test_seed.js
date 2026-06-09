/**
 * ═══════════════════════════════════════════════════════════
 *  ANC Follow-Up System v2 — Test Seed Data
 *  10 Cases covering every major function
 *
 *  HOW TO LOAD IN BROWSER CONSOLE:
 *    1. Open the app in browser  (http://localhost:3000)
 *    2. Skip/unlock encryption screen
 *    3. Open DevTools → Console (F12)
 *    4. Paste this entire file and press Enter
 *    5. Reload the page — all 10 patients appear in Database view
 *
 *  HOW TO CLEAR:
 *    ANC_TEST.clear()   ← removes only test patients (IDs start with ANC-T)
 *    ANC_TEST.load()    ← re-loads all 10 cases fresh
 *
 *  CASES:
 *    ANC-T001  Sara Ahmed Hassan          T1 8w   Low Risk    — baseline T1 normal
 *    ANC-T002  Nour Mohamed Khaled        T1 12w  High Risk   — NT 4.1mm + PAPP-A low
 *    ANC-T003  Rana Ibrahim Mostafa       T2 20w  Low Risk    — anomaly scan normal
 *    ANC-T004  Heba Tarek Sayed           T2 26w  High Risk   — GDM (FBG 98, OGTT 165)
 *    ANC-T005  Dina Youssef Omar          T2 22w  High Risk   — DCDA twins
 *    ANC-T006  Mona Ashraf Nabil          T3 32w  High Risk   — FGR (AC <3rd %ile, UA PI↑)
 *    ANC-T007  Amal Samir Fouad           T3 34w  High Risk   — Placenta Previa Complete
 *    ANC-T008  Rania Mahmoud Zaki         T3 39w  Delivered   — Delivered by CS (normal)
 *    ANC-T009  Layla Hassan Badawi        T3 41w  High Risk   — Postdates + Anemia (Hb 8.2)
 *    ANC-T010  Samira Kamal Farouk        T1 10w  Middle Risk — Recurrent loss (A=3), Age 37
 *
 * ═══════════════════════════════════════════════════════════
 */

const ANC_TEST = (() => {

  /* ── helpers ── */
  const _w = (key, val) => localStorage.setItem(key, JSON.stringify(val));
  const _r = (key)      => { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } };

  /* ══════════════════════════════════════════════════
     PATIENT MASTER RECORDS
     Fields match collectFormData() in app.js exactly
  ══════════════════════════════════════════════════ */
  const PATIENTS = {

    /* ── CASE 1 ─ T1, 8w, Low Risk, Normal ── */
    'ANC-T001': {
      patientID:     'ANC-T001',
      fullName:      'Sara Ahmed Hassan',
      age:           '28',
      phone:         '0101-2345-678',
      address:       '14 El-Nasr Street, Mansoura',
      bloodGroup:    'A+',
      basalWeight:   '62',
      pregnancyType: 'Singleton',
      chorionicity:  '',
      amnionicity:   '',
      tpalT: '1', tpalP: '0', tpalA: '0', tpalL: '1',
      lmpDate:       '2026-04-11',
      calcDate:      '2026-06-06',
      patientStatus: 'Active Follow-up',
      riskLevel:     'Low Risk',
      hospitalName:  '',
      createdAt:     '2026-04-15T09:00:00.000Z',
      updatedAt:     '2026-06-06T08:00:00.000Z',
    },

    /* ── CASE 2 ─ T1, 12w, High Risk, NT 4.1mm ── */
    'ANC-T002': {
      patientID:     'ANC-T002',
      fullName:      'Nour Mohamed Khaled',
      age:           '32',
      phone:         '0112-3456-789',
      address:       '7 Galaa Street, Mansoura',
      bloodGroup:    'O+',
      basalWeight:   '70',
      pregnancyType: 'Singleton',
      chorionicity:  '',
      amnionicity:   '',
      tpalT: '1', tpalP: '0', tpalA: '1', tpalL: '1',
      lmpDate:       '2026-03-14',
      calcDate:      '2026-06-06',
      patientStatus: 'Active Follow-up',
      riskLevel:     'High Risk',
      hospitalName:  '',
      createdAt:     '2026-03-20T10:00:00.000Z',
      updatedAt:     '2026-06-06T08:00:00.000Z',
    },

    /* ── CASE 3 ─ T2, 20w, Low Risk, Anomaly Scan Normal ── */
    'ANC-T003': {
      patientID:     'ANC-T003',
      fullName:      'Rana Ibrahim Mostafa',
      age:           '26',
      phone:         '0123-4567-890',
      address:       '3 Kornish El-Nil, Mansoura',
      bloodGroup:    'B+',
      basalWeight:   '58',
      pregnancyType: 'Singleton',
      chorionicity:  '',
      amnionicity:   '',
      tpalT: '0', tpalP: '0', tpalA: '0', tpalL: '0',
      lmpDate:       '2026-01-17',
      calcDate:      '2026-06-06',
      patientStatus: 'Active Follow-up',
      riskLevel:     'Low Risk',
      hospitalName:  '',
      createdAt:     '2026-01-20T09:00:00.000Z',
      updatedAt:     '2026-06-06T08:00:00.000Z',
    },

    /* ── CASE 4 ─ T2, 26w, High Risk, GDM ── */
    'ANC-T004': {
      patientID:     'ANC-T004',
      fullName:      'Heba Tarek Sayed',
      age:           '33',
      phone:         '0101-9876-543',
      address:       '22 El-Azhar Street, Mansoura',
      bloodGroup:    'AB+',
      basalWeight:   '82',
      pregnancyType: 'Singleton',
      chorionicity:  '',
      amnionicity:   '',
      tpalT: '1', tpalP: '0', tpalA: '0', tpalL: '1',
      lmpDate:       '2025-12-06',
      calcDate:      '2026-06-06',
      patientStatus: 'Active Follow-up',
      riskLevel:     'High Risk',
      hospitalName:  '',
      createdAt:     '2025-12-10T09:00:00.000Z',
      updatedAt:     '2026-06-06T08:00:00.000Z',
    },

    /* ── CASE 5 ─ T2, 22w, High Risk, DCDA Twins ── */
    'ANC-T005': {
      patientID:     'ANC-T005',
      fullName:      'Dina Youssef Omar',
      age:           '29',
      phone:         '0112-5678-901',
      address:       '9 Port Said Street, Mansoura',
      bloodGroup:    'O-',
      basalWeight:   '65',
      pregnancyType: 'Twin',
      chorionicity:  'Dichorionic',
      amnionicity:   'Diamniotic',
      tpalT: '0', tpalP: '0', tpalA: '0', tpalL: '0',
      lmpDate:       '2026-01-03',
      calcDate:      '2026-06-06',
      patientStatus: 'Active Follow-up',
      riskLevel:     'High Risk',
      hospitalName:  '',
      createdAt:     '2026-01-08T09:00:00.000Z',
      updatedAt:     '2026-06-06T08:00:00.000Z',
    },

    /* ── CASE 6 ─ T3, 32w, High Risk, FGR + Abnormal Doppler ── */
    'ANC-T006': {
      patientID:     'ANC-T006',
      fullName:      'Mona Ashraf Nabil',
      age:           '31',
      phone:         '0101-1111-222',
      address:       '5 Sherif Street, Mansoura',
      bloodGroup:    'A-',
      basalWeight:   '55',
      pregnancyType: 'Singleton',
      chorionicity:  '',
      amnionicity:   '',
      tpalT: '1', tpalP: '0', tpalA: '0', tpalL: '1',
      lmpDate:       '2025-10-25',
      calcDate:      '2026-06-06',
      patientStatus: 'Active Follow-up',
      riskLevel:     'High Risk',
      hospitalName:  '',
      createdAt:     '2025-10-28T09:00:00.000Z',
      updatedAt:     '2026-06-06T08:00:00.000Z',
    },

    /* ── CASE 7 ─ T3, 34w, High Risk, Placenta Previa Complete ── */
    'ANC-T007': {
      patientID:     'ANC-T007',
      fullName:      'Amal Samir Fouad',
      age:           '30',
      phone:         '0123-3333-444',
      address:       '18 El-Gomhoria Street, Mansoura',
      bloodGroup:    'B-',
      basalWeight:   '68',
      pregnancyType: 'Singleton',
      chorionicity:  '',
      amnionicity:   '',
      tpalT: '1', tpalP: '0', tpalA: '0', tpalL: '1',
      lmpDate:       '2025-10-11',
      calcDate:      '2026-06-06',
      patientStatus: 'Active Follow-up',
      riskLevel:     'High Risk',
      hospitalName:  '',
      createdAt:     '2025-10-15T09:00:00.000Z',
      updatedAt:     '2026-06-06T08:00:00.000Z',
    },

    /* ── CASE 8 ─ T3, 39w, Delivered by CS ── */
    'ANC-T008': {
      patientID:     'ANC-T008',
      fullName:      'Rania Mahmoud Zaki',
      age:           '27',
      phone:         '0112-4444-555',
      address:       '11 El-Seka El-Hadid, Mansoura',
      bloodGroup:    'O+',
      basalWeight:   '72',
      pregnancyType: 'Singleton',
      chorionicity:  '',
      amnionicity:   '',
      tpalT: '1', tpalP: '0', tpalA: '0', tpalL: '1',
      lmpDate:       '2025-09-06',
      calcDate:      '2026-06-06',
      patientStatus: 'Delivered by CS',
      riskLevel:     'Low Risk',
      hospitalName:  'Royal',
      createdAt:     '2025-09-10T09:00:00.000Z',
      updatedAt:     '2026-06-06T08:00:00.000Z',
    },

    /* ── CASE 9 ─ T3, 41w, High Risk, Post-dates + Severe Anemia ── */
    'ANC-T009': {
      patientID:     'ANC-T009',
      fullName:      'Layla Hassan Badawi',
      age:           '25',
      phone:         '0101-6666-777',
      address:       '2 El-Bahr Street, Mansoura',
      bloodGroup:    'A+',
      basalWeight:   '60',
      pregnancyType: 'Singleton',
      chorionicity:  '',
      amnionicity:   '',
      tpalT: '0', tpalP: '0', tpalA: '0', tpalL: '0',
      lmpDate:       '2025-08-23',
      calcDate:      '2026-06-06',
      patientStatus: 'Active Follow-up',
      riskLevel:     'High Risk',
      hospitalName:  '',
      createdAt:     '2025-08-26T09:00:00.000Z',
      updatedAt:     '2026-06-06T08:00:00.000Z',
    },

    /* ── CASE 10 ─ T1, 10w, Middle Risk, Recurrent Loss + AMA ── */
    'ANC-T010': {
      patientID:     'ANC-T010',
      fullName:      'Samira Kamal Farouk',
      age:           '37',
      phone:         '0112-8888-999',
      address:       '6 El-Mokhtar Street, Mansoura',
      bloodGroup:    'AB-',
      basalWeight:   '75',
      pregnancyType: 'Singleton',
      chorionicity:  '',
      amnionicity:   '',
      tpalT: '1', tpalP: '0', tpalA: '3', tpalL: '1',
      lmpDate:       '2026-03-28',
      calcDate:      '2026-06-06',
      patientStatus: 'Active Follow-up',
      riskLevel:     'Middle Risk',
      hospitalName:  '',
      createdAt:     '2026-04-01T09:00:00.000Z',
      updatedAt:     '2026-06-06T08:00:00.000Z',
    },
  };

  /* ══════════════════════════════════════════════════
     VISITS  (key: patientID → array)
     Fields match visitRowHTML / collectVisits()
  ══════════════════════════════════════════════════ */
  const VISITS = {

    'ANC-T001': [
      { date:'2026-04-15', findings:'Uterus 8w size, FHR detected by Doppler 158 bpm', bp:'110/70', weight:'62.5', meds:'Folic acid 5mg/day, Vitamin D 1000 IU/day', procSummary:'', labSummary:'CBC pending, Thyroid screen ordered', notes:'First visit. Booking bloods taken. EDD confirmed.' },
    ],

    'ANC-T002': [
      { date:'2026-03-20', findings:'CRL 51mm, NT 4.1mm — URGENT referral for fetal medicine', bp:'120/78', weight:'70.5', meds:'Folic acid 5mg/day', procSummary:'NT scan performed — 4.1mm', labSummary:'PAPP-A 0.28 MoM (low), Free β-hCG 2.8 MoM (high)', notes:'Double test high-risk result. Counselling re amniocentesis offered.' },
      { date:'2026-04-10', findings:'Follow-up post-counselling. Amniocentesis booked.', bp:'118/76', weight:'71.0', meds:'Folic acid 5mg/day, Aspirin 75mg/day', procSummary:'Amniocentesis scheduled', labSummary:'', notes:'Patient anxious. Support provided. NIPT also discussed as alternative.' },
    ],

    'ANC-T003': [
      { date:'2026-01-20', findings:'Dating scan: CRL 8w+3d, FHR 172 bpm', bp:'108/68', weight:'58.2', meds:'Folic acid 5mg, Iron 65mg OD', procSummary:'', labSummary:'CBC: Hb 12.1 g/dL, TSH 1.8 mIU/L — all normal', notes:'Booking visit. All routine bloods normal.' },
      { date:'2026-03-28', findings:'Anomaly scan 20w: Normal fetal anatomy, 4-chamber heart normal, spine normal, lips normal, kidneys normal', bp:'110/70', weight:'61.5', meds:'Folic acid 5mg, Iron 65mg OD', procSummary:'Level II anomaly scan — no anomalies detected', labSummary:'', notes:'Detailed anatomy survey complete. No structural anomalies. Patient reassured.' },
    ],

    'ANC-T004': [
      { date:'2025-12-10', findings:'Booking visit 4w, uterus normal size', bp:'118/76', weight:'82.5', meds:'Folic acid 5mg, Metformin 500mg BD (pre-existing prediabetes)', procSummary:'', labSummary:'FBG 98 mg/dL — GDM threshold met. OGTT ordered.', notes:'Pre-existing prediabetes known. High BMI 31. Dietitian referral.' },
      { date:'2026-02-15', findings:'FH 25cm, FHR 144 bpm, presentation cephalic', bp:'122/80', weight:'87.0', meds:'Metformin 1000mg BD, Insulin Glargine 10 units nocte', procSummary:'OGTT 75g: FBG 98, 1h 192 (ABNORMAL), 2h 165 (ABNORMAL)', labSummary:'OGTT confirms GDM. HbA1c 6.2%', notes:'GDM confirmed. Diabetic diet counselling. Started insulin. Weekly monitoring.' },
      { date:'2026-04-18', findings:'FH 28cm, FHR 150 bpm, cephalic', bp:'128/84', weight:'90.0', meds:'Metformin 1000mg BD, Insulin Glargine 14 units nocte', procSummary:'Growth scan: EFW 950g (50th %ile)', labSummary:'FBG 88, PP 112 — improving control', notes:'Good glycaemic control on current regime. Continue weekly fasting and PP glucose monitoring.' },
    ],

    'ANC-T005': [
      { date:'2026-01-08', findings:'Twin gestation confirmed. Twin A: FHR 168, Twin B: FHR 155. DCDA morphology confirmed.', bp:'112/72', weight:'65.3', meds:'Folic acid 5mg BD, Iron 65mg OD, Aspirin 150mg OD', procSummary:'Early twin scan confirming chorionicity', labSummary:'Hb 11.8 g/dL, Blood group O- confirmed — Anti-D arranged', notes:'DCDA twins. No TTTS features. Serial scans every 4 weeks planned.' },
      { date:'2026-03-22', findings:'Twin A: cephalic, FHR 148. Twin B: breech, FHR 152. No TTTS features.', bp:'118/76', weight:'71.0', meds:'Folic acid 5mg BD, Iron 200mg OD, Aspirin 150mg OD', procSummary:'Growth scan: Twin A EFW 480g (48th %ile), Twin B EFW 455g (42nd %ile)', labSummary:'CBC: Hb 10.9 g/dL (mild anaemia, treated)', notes:'Discordance <10%. No TTTS. Anaemia improving on higher dose iron. Next scan 4 weeks.' },
    ],

    'ANC-T006': [
      { date:'2025-10-28', findings:'Booking visit 3w, normal', bp:'110/70', weight:'55.2', meds:'Folic acid 5mg, Iron 65mg OD', procSummary:'', labSummary:'', notes:'Booking visit. No concerns.' },
      { date:'2026-03-14', findings:'FH 28cm (smaller than dates), FHR 138 bpm, cephalic', bp:'115/75', weight:'58.0', meds:'Folic acid, Iron, Aspirin 75mg added', procSummary:'Growth scan: AC 240mm (2nd %ile), EFW 1220g (<3rd %ile) — FGR suspected', labSummary:'UA PI 1.28 (elevated >95th at 32w). CPR 0.88 (<1.0)', notes:'FGR confirmed. UA Doppler abnormal. Referred to MFM. Twice-weekly CTG started. Corticosteroids given.' },
    ],

    'ANC-T007': [
      { date:'2025-10-15', findings:'Booking visit. Low-lying placenta noted on early scan.', bp:'116/74', weight:'68.2', meds:'Folic acid 5mg, Progesterone 400mg PV', procSummary:'', labSummary:'Blood group B-, Anti-D arranged', notes:'Low-lying posterior placenta at booking. Rescan at 32w advised.' },
      { date:'2026-04-05', findings:'No bleeding. FHR 142 bpm, cephalic. Placenta previa confirmed — NO VE performed.', bp:'120/78', weight:'74.0', meds:'Folic acid, Progesterone, Iron 200mg OD', procSummary:'MRI pelvis: Complete placenta previa confirmed, no accreta features', labSummary:'CBC: Hb 10.8, PLT 198', notes:'Placenta previa complete. Admitted for monitoring. CS planned at 36-37w. Cross-match arranged.' },
    ],

    'ANC-T008': [
      { date:'2025-09-10', findings:'Booking 4w. Normal', bp:'112/70', weight:'72.2', meds:'Folic acid 5mg', procSummary:'', labSummary:'All booking bloods normal', notes:'Booking visit.' },
      { date:'2026-02-22', findings:'FH 36cm, cephalic, engaged', bp:'118/76', weight:'79.5', meds:'Folic acid, Iron', procSummary:'', labSummary:'Pre-delivery labs: CBC Hb 11.8, PLT 210, INR 0.98', notes:'Pre-delivery review. Elective CS booked 39w for previous CS.' },
      { date:'2026-06-01', findings:'DELIVERED — CS performed under spinal. Healthy female infant 3.2kg, Apgar 9/10/10. No complications.', bp:'120/78', weight:'79.5', meds:'Post-op analgesia, Clexane 40mg SC', procSummary:'Lower segment CS — uneventful', labSummary:'', notes:'Post-op recovery satisfactory. Breastfeeding initiated. Discharged Day 3.' },
    ],

    'ANC-T009': [
      { date:'2025-08-26', findings:'Booking 3w', bp:'108/68', weight:'60.1', meds:'Folic acid 5mg', procSummary:'', labSummary:'Hb 10.2 g/dL (mild anaemia)', notes:'Booking. Iron started.' },
      { date:'2026-06-05', findings:'FH 40cm, cephalic, 3/5 palpable above pelvis. FHR 148 bpm. CTG reactive.', bp:'114/72', weight:'67.0', meds:'Iron 200mg OD, Aspirin 75mg', procSummary:'CTG: Reactive. BPP 8/8. AFI 7cm.', labSummary:'Hb 8.2 g/dL (severe anaemia). IV iron infusion arranged.', notes:'41 weeks gestation. IOL discussed. Cervix favourable — Bishop 8. IOL booked for tomorrow. IV iron given.' },
    ],

    'ANC-T010': [
      { date:'2026-04-01', findings:'Early pregnancy 10w. Uterus size 10w. FHR 162 bpm.', bp:'125/82', weight:'75.4', meds:'Folic acid 5mg, Aspirin 75mg, Progesterone 400mg PV', procSummary:'', labSummary:'TSH 1.9 mIU/L (T1 normal), Thyroid antibodies ordered', notes:'3 previous miscarriages — full recurrent miscarriage screen ordered. AMA counselled. NT scan 12-13w.' },
    ],
  };

  /* ══════════════════════════════════════════════════
     SCANS  (key: patientID → array)
     Fields match scanRowHTML / collectScans()
  ══════════════════════════════════════════════════ */
  const SCANS = {

    /* Case 1 — T1 dating scan, no biometry */
    'ANC-T001': [
      {
        type: 'Dating Scan',
        date: '2026-04-15',
        ga:   '8w+0d',
        operator: 'Dr. Hassan',
        findings: 'Single intrauterine pregnancy. CRL 16mm. FHR 158 bpm. Yolk sac present. No subchorionic haematoma.',
        recs: 'Repeat NT scan at 12-13w.',
        biometrics: { BPD:'', HC:'', AC:'', FL:'', AFI:'', DVP:'', EFW:'', placentaLocation:'Posterior', placentaOS:'' },
        doppler:    { UA_PI:'', MCA_PI:'', DV_PI:'', UtA_PI:'' },
        attachments: [],
      },
    ],

    /* Case 2 — NT scan with abnormal NT */
    'ANC-T002': [
      {
        type: 'First Trimester Scan (11-13+6)',
        date: '2026-03-20',
        ga:   '12w+0d',
        operator: 'Dr. Fetal Medicine',
        findings: 'CRL 51mm. NT 4.1mm (INCREASED — >95th percentile). Nasal bone present. Ductus venosus: reversed A-wave. URGENT referral recommended.',
        recs: 'URGENT MFM referral. Amniocentesis or NIPT. Parents counselled.',
        biometrics: { BPD:'22', HC:'88', AC:'78', FL:'9', AFI:'', DVP:'', EFW:'', placentaLocation:'Anterior', placentaOS:'' },
        doppler:    { UA_PI:'', MCA_PI:'', DV_PI:'0.95', UtA_PI:'' },
        attachments: [],
      },
    ],

    /* Case 3 — Anomaly scan 20w, fully normal */
    'ANC-T003': [
      {
        type: 'Dating Scan',
        date: '2026-01-20',
        ga:   '7w+4d',
        operator: 'Dr. Ibrahim',
        findings: 'Single intrauterine pregnancy. CRL 14mm. FHR 172 bpm.',
        recs: 'Anomaly scan at 18-22w.',
        biometrics: { BPD:'', HC:'', AC:'', FL:'', AFI:'', DVP:'', EFW:'', placentaLocation:'Fundal', placentaOS:'' },
        doppler:    { UA_PI:'', MCA_PI:'', DV_PI:'', UtA_PI:'' },
        attachments: [],
      },
      {
        type: 'Second Trimester Anomaly Scan (18-22)',
        date: '2026-03-28',
        ga:   '20w+0d',
        operator: 'Dr. Ibrahim',
        findings: 'Single fetus. Normal anatomy survey complete. 4-chamber heart: normal. Outflow tracts: normal. Spine: normal. Lips/palate: normal. Kidneys: normal echogenicity, no pelviectasis. Stomach: visible. Bladder: visible. Limbs: all 4 limbs visualised, no club foot. Cerebellum: normal. NT data not applicable.',
        recs: 'Growth scan at 28-30w.',
        biometrics: { BPD:'47', HC:'183', AC:'149', FL:'33', AFI:'14', DVP:'4.2', EFW:'320', placentaLocation:'Posterior', placentaOS:'' },
        doppler:    { UA_PI:'1.20', MCA_PI:'2.00', DV_PI:'', UtA_PI:'1.05' },
        attachments: [],
      },
    ],

    /* Case 4 — GDM growth scan showing macrosomia */
    'ANC-T004': [
      {
        type: 'Growth Scan',
        date: '2026-04-18',
        ga:   '26w+0d',
        operator: 'Dr. Tarek',
        findings: 'Single fetus, cephalic. Macrosomic trend — AC crossing centiles. Liquor normal. Placenta posterior, grade I.',
        recs: 'Serial growth scan every 3 weeks. Tight glycaemic control essential.',
        biometrics: { BPD:'65', HC:'245', AC:'220', FL:'47', AFI:'16', DVP:'4.8', EFW:'950', placentaLocation:'Posterior', placentaOS:'' },
        doppler:    { UA_PI:'0.95', MCA_PI:'1.98', DV_PI:'', UtA_PI:'' },
        attachments: [],
      },
    ],

    /* Case 5 — DCDA twins, two scans */
    'ANC-T005': [
      {
        type: 'Dating Scan',
        date: '2026-01-08',
        ga:   '5w+0d',
        operator: 'Dr. Youssef',
        findings: 'DCDA twin gestation confirmed. Two separate gestational sacs, two yolk sacs, dichorionic dividing membrane noted. Twin A: FHR 168 bpm. Twin B: FHR 155 bpm. No TTTS features.',
        recs: 'Serial twin scans every 4 weeks. OGTT at 24-28w.',
        biometrics: { BPD:'', HC:'', AC:'', FL:'', AFI:'', DVP:'', EFW:'', placentaLocation:'Anterior', placentaOS:'' },
        doppler:    { UA_PI:'', MCA_PI:'', DV_PI:'', UtA_PI:'' },
        attachments: [],
      },
      {
        type: 'Growth Scan',
        date: '2026-03-22',
        ga:   '22w+0d',
        operator: 'Dr. Youssef',
        findings: 'Twin A (cephalic): BPD 55mm, AC 195mm, EFW 480g (48th %ile). Twin B (breech): BPD 53mm, AC 185mm, EFW 455g (42nd %ile). Discordance 5.2%. No TTTS. Normal liquor both sacs.',
        recs: 'Repeat growth scan in 4 weeks.',
        biometrics: { BPD:'55', HC:'213', AC:'195', FL:'40', AFI:'13', DVP:'3.9', EFW:'480', placentaLocation:'Anterior', placentaOS:'' },
        doppler:    { UA_PI:'1.12', MCA_PI:'2.06', DV_PI:'', UtA_PI:'' },
        attachments: [],
      },
    ],

    /* Case 6 — FGR + abnormal Doppler */
    'ANC-T006': [
      {
        type: 'Second Trimester Anomaly Scan (18-22)',
        date: '2026-01-18',
        ga:   '20w+3d',
        operator: 'Dr. Samir',
        findings: 'Normal anatomy. No structural anomalies. AC on 20th %ile — already small at this gestation.',
        recs: 'Serial growth scans 4-weekly.',
        biometrics: { BPD:'47', HC:'182', AC:'141', FL:'33', AFI:'13', DVP:'3.8', EFW:'305', placentaLocation:'Anterior', placentaOS:'' },
        doppler:    { UA_PI:'1.18', MCA_PI:'1.99', DV_PI:'', UtA_PI:'1.40' },
        attachments: [],
      },
      {
        type: 'Growth Scan',
        date: '2026-03-14',
        ga:   '32w+0d',
        operator: 'Dr. MFM',
        findings: 'FGR confirmed. AC severely small. EFW <3rd %ile. UA Doppler elevated. CPR <1.0 — cerebral redistribution. Admitted for monitoring.',
        recs: 'Twice-weekly CTG. Corticosteroids (Betamethasone 12mg IM x2). Delivery planning at 34w if deterioration.',
        biometrics: { BPD:'74', HC:'285', AC:'240', FL:'57', AFI:'5.8', DVP:'1.9', EFW:'1220', placentaLocation:'Anterior', placentaOS:'' },
        doppler:    { UA_PI:'1.28', MCA_PI:'1.13', DV_PI:'0.80', UtA_PI:'1.62' },
        attachments: [],
      },
    ],

    /* Case 7 — Placenta Previa Complete */
    'ANC-T007': [
      {
        type: 'Second Trimester Anomaly Scan (18-22)',
        date: '2026-01-04',
        ga:   '20w+0d',
        operator: 'Dr. Fouad',
        findings: 'Normal anatomy survey. Low-lying posterior placenta — covering os at this gestation.',
        recs: 'Repeat at 32w to assess placental migration.',
        biometrics: { BPD:'47', HC:'182', AC:'148', FL:'33', AFI:'14', DVP:'4.1', EFW:'318', placentaLocation:'Placenta Previa - Complete', placentaOS:'0' },
        doppler:    { UA_PI:'1.22', MCA_PI:'2.02', DV_PI:'', UtA_PI:'' },
        attachments: [],
      },
      {
        type: 'Growth Scan',
        date: '2026-04-05',
        ga:   '34w+0d',
        operator: 'Dr. Fouad',
        findings: 'Complete placenta previa persists — no migration. No sinuses. Cervical length 38mm. Normal fetal growth. FHR 142 bpm.',
        recs: 'Elective CS 36-37w. No vaginal examination. Cross-match arranged. Admit at 36w.',
        biometrics: { BPD:'84', HC:'308', AC:'266', FL:'63', AFI:'12', DVP:'3.9', EFW:'2240', placentaLocation:'Placenta Previa - Complete', placentaOS:'0' },
        doppler:    { UA_PI:'0.88', MCA_PI:'1.64', DV_PI:'', UtA_PI:'' },
        attachments: [],
      },
    ],

    /* Case 8 — Delivered, last scan 38w */
    'ANC-T008': [
      {
        type: 'Growth Scan',
        date: '2026-02-22',
        ga:   '38w+0d',
        operator: 'Dr. Mahmoud',
        findings: 'Single fetus, cephalic, engaged. Normal growth. AFI normal. Placenta posterior, grade III.',
        recs: 'Elective CS 39w.',
        biometrics: { BPD:'93', HC:'333', AC:'334', FL:'72', AFI:'11', DVP:'3.4', EFW:'3050', placentaLocation:'Posterior', placentaOS:'' },
        doppler:    { UA_PI:'0.72', MCA_PI:'1.49', DV_PI:'', UtA_PI:'' },
        attachments: [],
      },
    ],

    /* Case 9 — Post-dates, Biophysical profile */
    'ANC-T009': [
      {
        type: 'Biophysical Profile',
        date: '2026-06-05',
        ga:   '41w+0d',
        operator: 'Dr. Hassan',
        findings: 'BPP 8/8. Fetal breathing: present. Fetal movement: present. Tone: present. AFI 7cm (lower limit normal — borderline). FHR reactive on NST.',
        recs: 'IOL today given postdates + borderline AFI. Admit for induction.',
        biometrics: { BPD:'95', HC:'338', AC:'345', FL:'74', AFI:'7', DVP:'2.2', EFW:'3450', placentaLocation:'Fundal', placentaOS:'' },
        doppler:    { UA_PI:'0.74', MCA_PI:'1.41', DV_PI:'', UtA_PI:'' },
        attachments: [],
      },
    ],

    /* Case 10 — T1, dating scan only */
    'ANC-T010': [
      {
        type: 'Dating Scan',
        date: '2026-04-01',
        ga:   '10w+0d',
        operator: 'Dr. Kamal',
        findings: 'Single intrauterine pregnancy. CRL 33mm. FHR 162 bpm. Yolk sac normal. No haematoma. NT assessment deferred — too early.',
        recs: 'NT scan and double test at 12-13 weeks. Recurrent miscarriage full screen.',
        biometrics: { BPD:'', HC:'', AC:'', FL:'', AFI:'', DVP:'', EFW:'', placentaLocation:'Posterior', placentaOS:'' },
        doppler:    { UA_PI:'', MCA_PI:'', DV_PI:'', UtA_PI:'' },
        attachments: [],
      },
    ],
  };

  /* ══════════════════════════════════════════════════
     PROCEDURES  (key: patientID → array)
     Fields match procRowHTML / collectProcs()
  ══════════════════════════════════════════════════ */
  const PROCEDURES = {

    /* Case 2 — NT + planned amniocentesis */
    'ANC-T002': [
      { type:'Double Test',   date:'2026-03-20', operator:'Dr. Lab', result:'PAPP-A 0.28 MoM (LOW), Free β-hCG 2.8 MoM (HIGH)', notes:'High-risk result. Risk ratio 1:35 for T21.' },
      { type:'Amniocentesis', date:'2026-04-10', operator:'Dr. MFM', result:'Pending — result expected 10 days', notes:'20mL AF obtained. No immediate complications. Result awaited.' },
    ],

    /* Case 4 — OGTT */
    'ANC-T004': [
      { type:'OGTT', date:'2026-02-15', operator:'Dr. Lab', result:'FBG 98 mg/dL, 1h 192 mg/dL, 2h 165 mg/dL — GDM confirmed (IADPSG criteria)', notes:'2 of 3 values met/exceeded. GDM diagnosis. Dietitian referral. Insulin initiated.' },
    ],

    /* Case 5 — Anti-D */
    'ANC-T005': [
      { type:'Anti-D Administration', date:'2026-01-08', operator:'Nurse Station', result:'Anti-D 500 IU IM given. Antibody screen negative.', notes:'Rh-negative patient. Prophylactic Anti-D at booking. Repeat at 28w and post-delivery.' },
      { type:'Anti-D Administration', date:'2026-04-18', operator:'Nurse Station', result:'Anti-D 500 IU IM given at 28w.', notes:'28-week prophylactic dose. Next dose after delivery.' },
    ],

    /* Case 6 — Corticosteroids */
    'ANC-T006': [
      { type:'Other', date:'2026-03-14', operator:'Dr. MFM', result:'Betamethasone 12mg IM — Dose 1 of 2. Dose 2 given 2026-03-15.', notes:'Fetal lung maturity. FGR, anticipated delivery before 34w.' },
      { type:'CTG',   date:'2026-03-16', operator:'Midwife', result:'CTG: Baseline 145, Variability 12, Accelerations present. No decelerations. REACTIVE.', notes:'Twice-weekly CTG commenced. Next CTG 2026-03-19.' },
    ],

    /* Case 7 — Cervicometry */
    'ANC-T007': [
      { type:'Cervicometry', date:'2026-04-05', operator:'Dr. Fouad', result:'Cervical length 38mm. Internal os closed. No funnelling.', notes:'Reassuring. CS planned 36-37w.' },
    ],

    /* Case 9 — NST + CTG */
    'ANC-T009': [
      { type:'NST', date:'2026-06-05', operator:'Midwife', result:'NST reactive. Baseline 148, variability 15bpm, 3 accelerations in 20 min.', notes:'Monitoring at 41 weeks. IOL planned.' },
      { type:'CTG', date:'2026-06-05', operator:'Midwife', result:'Pre-induction CTG: Normal. Syntocinon infusion commenced.', notes:'Induction of labour commenced. Progress reviewed 4-hourly.' },
    ],
  };

  /* ══════════════════════════════════════════════════
     LABS  (key: patientID → { t1:{}, t2:{}, t3:{} })
     Keys must match LAB_PANELS + collectLabs() logic.
     CBC stored as labs.t1.CBC = { Hb, HCT, WBC, PLT, MCV, MCH, resultDate }
     Other tests stored as labs.t1['Test_Name'] = { value, ordered, resultDate }
  ══════════════════════════════════════════════════ */
  const LABS = {

    /* Case 1 — T1 normal booking bloods */
    'ANC-T001': {
      t1: {
        CBC:              { Hb:'12.4', HCT:'37', WBC:'8.2', PLT:'245', MCV:'86', MCH:'29', resultDate:'2026-04-20' },
        TSH:              { value:'1.8',  ordered:'2026-04-15', resultDate:'2026-04-20' },
        Fasting_Blood_Glucose: { value:'82', ordered:'2026-04-15', resultDate:'2026-04-20' },
        HBsAg:            { value:'Negative', ordered:'2026-04-15', resultDate:'2026-04-20' },
        HIV:              { value:'Negative', ordered:'2026-04-15', resultDate:'2026-04-20' },
        Rubella_IgG:      { value:'45',  ordered:'2026-04-15', resultDate:'2026-04-20' },
        Vitamin_D:        { value:'28',  ordered:'2026-04-15', resultDate:'2026-04-20' },
      },
      t2: {},
      t3: {},
    },

    /* Case 2 — T1 with abnormal serum markers */
    'ANC-T002': {
      t1: {
        CBC:              { Hb:'12.1', HCT:'36', WBC:'9.0', PLT:'230', MCV:'84', MCH:'28', resultDate:'2026-03-22' },
        PAPP_A:           { value:'0.28', ordered:'2026-03-20', resultDate:'2026-03-23' },
        Free_HCG:         { value:'2.8',  ordered:'2026-03-20', resultDate:'2026-03-23' },
        NT:               { value:'4.1',  ordered:'2026-03-20', resultDate:'2026-03-20' },
        TSH:              { value:'1.5',  ordered:'2026-03-20', resultDate:'2026-03-23' },
      },
      t2: {},
      t3: {},
    },

    /* Case 3 — T1 + T2 both normal */
    'ANC-T003': {
      t1: {
        CBC:              { Hb:'12.1', HCT:'36', WBC:'7.8', PLT:'220', MCV:'85', MCH:'29', resultDate:'2026-01-25' },
        TSH:              { value:'1.9',  ordered:'2026-01-20', resultDate:'2026-01-25' },
        Rubella_IgG:      { value:'22',  ordered:'2026-01-20', resultDate:'2026-01-25' },
        HBsAg:            { value:'Negative', ordered:'2026-01-20', resultDate:'2026-01-25' },
        HIV:              { value:'Negative', ordered:'2026-01-20', resultDate:'2026-01-25' },
      },
      t2: {
        CBC:              { Hb:'11.5', HCT:'34', WBC:'9.2', PLT:'215', MCV:'84', MCH:'28', resultDate:'2026-04-02' },
        AFP:              { value:'1.2', ordered:'2026-03-28', resultDate:'2026-04-04' },
        Urine_Protein:    { value:'15',  ordered:'2026-03-28', resultDate:'2026-04-01' },
      },
      t3: {},
    },

    /* Case 4 — GDM: all abnormal glucose values */
    'ANC-T004': {
      t1: {
        CBC:              { Hb:'11.8', HCT:'35', WBC:'9.5', PLT:'210', MCV:'83', MCH:'27', resultDate:'2025-12-15' },
        Fasting_Blood_Glucose: { value:'98', ordered:'2025-12-10', resultDate:'2025-12-14' },
        HbA1c:            { value:'6.2', ordered:'2025-12-10', resultDate:'2025-12-14' },
        TSH:              { value:'2.1', ordered:'2025-12-10', resultDate:'2025-12-14' },
      },
      t2: {
        CBC:              { Hb:'11.2', HCT:'33', WBC:'10.0', PLT:'198', MCV:'82', MCH:'27', resultDate:'2026-02-20' },
        OGTT_1h:          { value:'192', ordered:'2026-02-15', resultDate:'2026-02-15' },
        OGTT_2h:          { value:'165', ordered:'2026-02-15', resultDate:'2026-02-15' },
        PP_Blood_Glucose: { value:'118', ordered:'2026-04-18', resultDate:'2026-04-18' },
      },
      t3: {
        CBC:              { Hb:'10.9', HCT:'33', WBC:'10.5', PLT:'195', MCV:'82', MCH:'27', resultDate:'2026-05-10' },
        Fasting_Blood_Glucose: { value:'88', ordered:'2026-05-10', resultDate:'2026-05-10' },
      },
    },

    /* Case 5 — Twin: anaemia */
    'ANC-T005': {
      t1: {
        CBC:              { Hb:'11.8', HCT:'35', WBC:'9.0', PLT:'228', MCV:'85', MCH:'29', resultDate:'2026-01-12' },
        HBsAg:            { value:'Negative', ordered:'2026-01-08', resultDate:'2026-01-12' },
        HIV:              { value:'Negative', ordered:'2026-01-08', resultDate:'2026-01-12' },
        Indirect_Coombs:  { value:'Negative', ordered:'2026-01-08', resultDate:'2026-01-12' },
      },
      t2: {
        CBC:              { Hb:'10.9', HCT:'33', WBC:'10.0', PLT:'210', MCV:'80', MCH:'26', resultDate:'2026-03-25' },
        Serum_Ferritin:   { value:'9',   ordered:'2026-03-22', resultDate:'2026-03-25' },
      },
      t3: {},
    },

    /* Case 6 — FGR: normal labs but adds context */
    'ANC-T006': {
      t1: {
        CBC:              { Hb:'12.0', HCT:'36', WBC:'8.0', PLT:'235', MCV:'85', MCH:'29', resultDate:'2025-11-01' },
        TSH:              { value:'1.6', ordered:'2025-10-28', resultDate:'2025-11-01' },
        Uric_Acid:        { value:'4.2', ordered:'2025-10-28', resultDate:'2025-11-01' },
      },
      t2: {
        CBC:              { Hb:'11.4', HCT:'34', WBC:'9.5', PLT:'220', MCV:'83', MCH:'28', resultDate:'2026-02-01' },
      },
      t3: {
        CBC:              { Hb:'11.0', HCT:'33', WBC:'11.0', PLT:'215', MCV:'82', MCH:'27', resultDate:'2026-03-16' },
        Serum_Creatinine: { value:'0.6', ordered:'2026-03-14', resultDate:'2026-03-16' },
        Urine_Protein:    { value:'28',  ordered:'2026-03-14', resultDate:'2026-03-16' },
      },
    },

    /* Case 7 — Placenta Previa: pre-op labs */
    'ANC-T007': {
      t1: {
        CBC:              { Hb:'11.5', HCT:'34', WBC:'8.8', PLT:'240', MCV:'84', MCH:'28', resultDate:'2025-10-20' },
        HBsAg:            { value:'Negative', ordered:'2025-10-15', resultDate:'2025-10-20' },
      },
      t2: {
        CBC:              { Hb:'10.8', HCT:'32', WBC:'9.5', PLT:'198', MCV:'81', MCH:'27', resultDate:'2026-02-08' },
      },
      t3: {
        CBC:              { Hb:'10.5', HCT:'31', WBC:'10.0', PLT:'188', MCV:'80', MCH:'26', resultDate:'2026-04-08' },
        PT:               { value:'12.5', ordered:'2026-04-05', resultDate:'2026-04-08' },
        PTT:              { value:'28',   ordered:'2026-04-05', resultDate:'2026-04-08' },
        INR:              { value:'1.0',  ordered:'2026-04-05', resultDate:'2026-04-08' },
        Fibrinogen:       { value:'420',  ordered:'2026-04-05', resultDate:'2026-04-08' },
      },
    },

    /* Case 8 — Delivered: pre-delivery labs */
    'ANC-T008': {
      t1: {
        CBC:              { Hb:'12.5', HCT:'37', WBC:'8.2', PLT:'248', MCV:'87', MCH:'30', resultDate:'2025-09-15' },
        HBsAg:            { value:'Negative', ordered:'2025-09-10', resultDate:'2025-09-15' },
        HIV:              { value:'Negative', ordered:'2025-09-10', resultDate:'2025-09-15' },
      },
      t2: {},
      t3: {
        CBC:              { Hb:'11.8', HCT:'35', WBC:'9.8', PLT:'210', MCV:'85', MCH:'29', resultDate:'2026-02-25' },
        PT:               { value:'11.8', ordered:'2026-02-22', resultDate:'2026-02-25' },
        INR:              { value:'0.98', ordered:'2026-02-22', resultDate:'2026-02-25' },
      },
    },

    /* Case 9 — Post-dates + SEVERE ANAEMIA */
    'ANC-T009': {
      t1: {
        CBC:              { Hb:'10.2', HCT:'30', WBC:'7.5', PLT:'218', MCV:'76', MCH:'25', resultDate:'2025-09-01' },
        Serum_Ferritin:   { value:'8',  ordered:'2025-08-26', resultDate:'2025-09-01' },
        TSH:              { value:'2.0', ordered:'2025-08-26', resultDate:'2025-09-01' },
      },
      t2: {
        CBC:              { Hb:'9.5', HCT:'28', WBC:'9.0', PLT:'210', MCV:'74', MCH:'24', resultDate:'2025-11-15' },
      },
      t3: {
        CBC:              { Hb:'8.2', HCT:'25', WBC:'10.5', PLT:'205', MCV:'72', MCH:'23', resultDate:'2026-06-05' },
        Serum_Ferritin:   { value:'5',   ordered:'2026-06-05', resultDate:'2026-06-05' },
        Urine_Protein:    { value:'18',  ordered:'2026-06-05', resultDate:'2026-06-05' },
      },
    },

    /* Case 10 — Recurrent loss: thyroid + immune screen */
    'ANC-T010': {
      t1: {
        CBC:              { Hb:'12.8', HCT:'38', WBC:'7.2', PLT:'265', MCV:'88', MCH:'30', resultDate:'2026-04-05' },
        TSH:              { value:'1.9', ordered:'2026-04-01', resultDate:'2026-04-05' },
        Anti_TPO:         { value:'12',  ordered:'2026-04-01', resultDate:'2026-04-05' },
        Rubella_IgG:      { value:'18',  ordered:'2026-04-01', resultDate:'2026-04-05' },
        VDRL_RPR:         { value:'Negative', ordered:'2026-04-01', resultDate:'2026-04-05' },
        HBsAg:            { value:'Negative', ordered:'2026-04-01', resultDate:'2026-04-05' },
        HIV:              { value:'Negative', ordered:'2026-04-01', resultDate:'2026-04-05' },
        Vitamin_D:        { value:'18',  ordered:'2026-04-01', resultDate:'2026-04-05' },
        Folate:           { value:'4.8', ordered:'2026-04-01', resultDate:'2026-04-05' },
      },
      t2: {},
      t3: {},
    },
  };

  /* ══════════════════════════════════════════════════
     LOAD — writes all data into localStorage
  ══════════════════════════════════════════════════ */
  function load() {
    const existing = _r('anc_patients');

    // Merge — don't overwrite production patients
    Object.assign(existing, PATIENTS);
    _w('anc_patients', existing);

    // Merge visits, scans, procedures, labs
    const visits = _r('anc_visits');
    Object.assign(visits, VISITS);
    _w('anc_visits', visits);

    const scans = _r('anc_scans');
    Object.assign(scans, SCANS);
    _w('anc_scans', scans);

    const procs = _r('anc_procedures');
    Object.assign(procs, PROCEDURES);
    _w('anc_procedures', procs);

    const labs = _r('anc_labs');
    Object.assign(labs, LABS);
    _w('anc_labs', labs);

    console.log('%c✅ ANC Test Seed Loaded — 10 patients', 'color:#2e7d32;font-weight:700;font-size:14px');
    console.table(Object.values(PATIENTS).map(p => ({
      ID: p.patientID,
      Name: p.fullName,
      GA: p.lmpDate,
      Risk: p.riskLevel,
      Status: p.patientStatus,
    })));
    console.log('Reload the page to see patients in the Database view.');
  }

  /* ══════════════════════════════════════════════════
     CLEAR — removes only ANC-T* test patients
  ══════════════════════════════════════════════════ */
  function clear() {
    ['anc_patients','anc_visits','anc_scans','anc_procedures','anc_labs','anc_attachments'].forEach(key => {
      const obj = _r(key);
      Object.keys(obj).filter(k => k.startsWith('ANC-T')).forEach(k => delete obj[k]);
      _w(key, obj);
    });
    console.log('%c🗑 ANC Test Seed Cleared', 'color:#c62828;font-weight:700');
  }

  /* ══════════════════════════════════════════════════
     VERIFY — quick sanity check in console
  ══════════════════════════════════════════════════ */
  function verify() {
    const patients  = _r('anc_patients');
    const testCases = Object.keys(patients).filter(k => k.startsWith('ANC-T'));
    console.log(`%c🔍 Test Patients Found: ${testCases.length}/10`, 'color:#1565c0;font-weight:700');
    testCases.forEach(id => {
      const p   = patients[id];
      const v   = (_r('anc_visits')[id]   || []).length;
      const s   = (_r('anc_scans')[id]    || []).length;
      const pr  = (_r('anc_procedures')[id]||[]).length;
      const lab = _r('anc_labs')[id]      || {};
      const labCount = Object.keys(lab.t1||{}).length + Object.keys(lab.t2||{}).length + Object.keys(lab.t3||{}).length;
      console.log(`  ${id} | ${p.fullName.padEnd(25)} | ${p.riskLevel.padEnd(14)} | Visits:${v} Scans:${s} Procs:${pr} Labs:${labCount}`);
    });
  }

  return { load, clear, verify };
})();

// ANC_TEST is now a global — call ANC_TEST.load() from the sidebar button
// or from the browser console at any time.
