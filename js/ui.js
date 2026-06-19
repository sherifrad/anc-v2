/* ═══════════════════════════════════════════════════════════
   ui.js v2 — UI Rendering Engine
═══════════════════════════════════════════════════════════ */

const UI = (() => {

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function jsArg(value) {
    return esc(JSON.stringify(String(value ?? '')));
  }

  /* ── TOAST ── */
  let _toastTimer;
  function toast(msg, type='info', ms=3200) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = `toast show ${type}`;
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.className='toast', ms);
  }

  /* ── MODAL ── */
  function modal(title, body, onConfirm, danger=false) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML  = body;
    document.getElementById('modalOverlay').style.display = 'flex';
    const ok = document.getElementById('modalConfirm');
    ok.style.display = '';
    ok.textContent = 'Confirm';
    ok.className = danger ? 'btn-modal-confirm danger':'btn-modal-confirm';
    ok.onclick = () => { document.getElementById('modalOverlay').style.display='none'; onConfirm?.(); };
    const cancel = document.getElementById('modalCancel');
    cancel.textContent = 'Cancel';
    cancel.onclick = () => { document.getElementById('modalOverlay').style.display='none'; };
  }

  /* ── STATUS COLORS ── */
  const STATUS_COLORS = {
    'Active Follow-up':         {bg:'#e8f5e9',color:'#1b5e20',border:'#a5d6a7'},
    'Delivered by CS':          {bg:'#e3f2fd',color:'#0d47a1',border:'#90caf9'},
    'Delivered by SVD':         {bg:'#f3e5f5',color:'#4a148c',border:'#ce93d8'},
    'Abortion':                 {bg:'#fff8e1',color:'#e65100',border:'#ffcc80'},
    'IUFD':                     {bg:'#ffebee',color:'#b71c1c',border:'#ef9a9a'},
    'Irregular Follow-up':      {bg:'#fff3e0',color:'#bf360c',border:'#ffcc80'},
    'Permanently Discontinued': {bg:'#eceff1',color:'#37474f',border:'#cfd8dc'},
  };

  function statusBadge(s) {
    const c = STATUS_COLORS[s] || {bg:'#f5f5f5',color:'#555',border:'#ddd'};
    return `<span class="status-badge" style="background:${c.bg};color:${c.color};border:1px solid ${c.border}">${s||'—'}</span>`;
  }
  function applyStatusColor(el) {
    const c = STATUS_COLORS[el.value];
    if (c) { el.style.background=c.bg; el.style.color=c.color; el.style.borderColor=c.border; el.style.fontWeight='600'; }
    else   { el.style.background=el.style.color=el.style.borderColor=el.style.fontWeight=''; }
  }

  /* ── RISK BADGE ── */
  function riskBadgeHTML(level) {
    const map = {'Low Risk':'risk-low','Middle Risk':'risk-middle','High Risk':'risk-high'};
    const icons = {'Low Risk':'🟢','Middle Risk':'🟡','High Risk':'🔴'};
    const cls = map[level] || 'risk-low';
    return `<span class="risk-badge ${cls}" id="riskBadge" title="Click to change">${icons[level]||'🟢'} ${level||'Low Risk'}</span>`;
  }

  /* ── FLAG CELL ── */
  function flagCell(flag, label) {
    const cls = {high:'flag-high',low:'flag-low',normal:'flag-normal',pending:'flag-pending'}[flag]||'flag-pending';
    return `<span class="flag-cell ${cls}">${label||'—'}</span>`;
  }

  const MEDICATION_TEMPLATES = {
    'Folic acid': { drugName:'Folic acid', genericName:'Folic acid', route:'Review route', frequency:'Review frequency', indication:'Antenatal supplementation' },
    Iron: { drugName:'Iron', genericName:'Iron preparation', route:'Review route', frequency:'Review frequency', indication:'Antenatal supplementation / anemia prevention or treatment' },
    Calcium: { drugName:'Calcium', genericName:'Calcium supplement', route:'Review route', frequency:'Review frequency', indication:'Antenatal supplementation' },
    Aspirin: { drugName:'Aspirin', genericName:'Acetylsalicylic acid', route:'Review route', frequency:'Review frequency', indication:'Preeclampsia prophylaxis when clinically indicated' },
    'Vitamin D': { drugName:'Vitamin D', genericName:'Cholecalciferol', route:'Review route', frequency:'Review frequency', indication:'Vitamin D supplementation when clinically indicated' },
    LMWH: { drugName:'LMWH', genericName:'Low molecular weight heparin', route:'Review route', frequency:'Review frequency', indication:'Anticoagulation when clinically indicated' },
    Insulin: { drugName:'Insulin', genericName:'Insulin', route:'Review route', frequency:'Review frequency', indication:'Diabetes management' },
    Metformin: { drugName:'Metformin', genericName:'Metformin', route:'Review route', frequency:'Review frequency', indication:'Diabetes management when clinically indicated' },
    Progesterone: { drugName:'Progesterone', genericName:'Progesterone', route:'Review route', frequency:'Review frequency', indication:'Progesterone support when clinically indicated' },
    Antihypertensive: { drugName:'Antihypertensive', genericName:'', route:'Review route', frequency:'Review frequency', indication:'Hypertension management' },
    'Thyroid medication': { drugName:'Thyroid medication', genericName:'', route:'Review route', frequency:'Review frequency', indication:'Thyroid disease management' },
    'Rh prophylaxis': { drugName:'Rh prophylaxis', genericName:'Anti-D immunoglobulin', route:'Review route', frequency:'Review frequency', indication:'Rh prophylaxis documentation' },
  };

  const MEDICATION_STATUSES = ['Active','Completed','Stopped','Suspended'];

  const PROBLEM_STATUSES = ['Active','Monitoring','Resolved','Historical'];
  const PROBLEM_SEVERITIES = ['','Low','Moderate','High'];
  const PROBLEM_CATEGORIES = [
    'Chronic Medical Disease',
    'Current Pregnancy Complication',
    'Previous Obstetric History',
    'Fetal Problem',
    'Gynecologic Problem',
    'Monitoring / Follow-up',
    'Other',
  ];
  const PROBLEM_TEMPLATES = {
    'Chronic Hypertension': { title:'Chronic Hypertension', category:'Chronic Medical Disease', status:'Active' },
    'Gestational Hypertension': { title:'Gestational Hypertension', category:'Current Pregnancy Complication', status:'Active' },
    Preeclampsia: { title:'Preeclampsia', category:'Current Pregnancy Complication', status:'Active' },
    GDM: { title:'GDM', category:'Current Pregnancy Complication', status:'Active' },
    'Pre-existing Diabetes': { title:'Pre-existing Diabetes', category:'Chronic Medical Disease', status:'Active' },
    Hypothyroidism: { title:'Hypothyroidism', category:'Chronic Medical Disease', status:'Active' },
    Hyperthyroidism: { title:'Hyperthyroidism', category:'Chronic Medical Disease', status:'Active' },
    Asthma: { title:'Asthma', category:'Chronic Medical Disease', status:'Active' },
    Epilepsy: { title:'Epilepsy', category:'Chronic Medical Disease', status:'Active' },
    'Previous Cesarean Section': { title:'Previous Cesarean Section', category:'Previous Obstetric History', status:'Monitoring' },
    'Previous Preterm Birth': { title:'Previous Preterm Birth', category:'Previous Obstetric History', status:'Monitoring' },
    'Previous PPH': { title:'Previous PPH', category:'Previous Obstetric History', status:'Monitoring' },
    'Rh Negative': { title:'Rh Negative', category:'Monitoring / Follow-up', status:'Monitoring' },
    'IVF Pregnancy': { title:'IVF Pregnancy', category:'Current Pregnancy Complication', status:'Monitoring' },
    'Multiple Pregnancy': { title:'Multiple Pregnancy', category:'Current Pregnancy Complication', status:'Monitoring' },
    'Placenta Previa': { title:'Placenta Previa', category:'Current Pregnancy Complication', status:'Active' },
    FGR: { title:'FGR', category:'Fetal Problem', status:'Active' },
    Polyhydramnios: { title:'Polyhydramnios', category:'Fetal Problem', status:'Active' },
    Oligohydramnios: { title:'Oligohydramnios', category:'Fetal Problem', status:'Active' },
  };

  /* ── COLLAPSIBLE TOGGLE ── */
  function initCollapsible(cardEl) {
    const btn  = cardEl.querySelector('.btn-toggle');
    const body = cardEl.querySelector('.collapsible-body');
    if (!btn || !body) return;
    const initiallyCollapsed = body.classList.contains('collapsed');
    body.style.maxHeight = initiallyCollapsed ? '0' : 'none';
    btn.querySelector('.toggle-arrow')?.classList.toggle('open', !initiallyCollapsed);
    const initialLabel = btn.querySelector('.toggle-label');
    if (initialLabel) initialLabel.textContent = initiallyCollapsed ? 'Show' : 'Hide';
    btn.addEventListener('click', () => {
      const open = !body.classList.contains('collapsed');
      if (open) {
        body.style.maxHeight = body.scrollHeight + 'px';
        requestAnimationFrame(() => {
          body.classList.add('collapsed');
          body.style.maxHeight = '0';
        });
      } else {
        body.classList.remove('collapsed');
        body.style.maxHeight = 'none';
      }
      const arrow = btn.querySelector('.toggle-arrow');
      if (arrow) arrow.classList.toggle('open', !open);
      btn.querySelector('.toggle-label').textContent = open ? 'Show' : 'Hide';
    });
  }

  /* ── SCAN ROW ── */
  const LIMITED_SCAN_DISCLAIMER = 'Limited clinic scan — not a detailed anomaly/growth/Doppler scan.';
  const DOPPLER_STATUS_OPTIONS = [
    'Not performed / not indicated',
    'Performed — reassuring',
    'Performed — abnormal',
  ];

  function normalizeScan(scan={}) {
    const b = scan.biometrics || {};
    const d = scan.doppler || {};
    const category = scan.category
      || CONSTANTS.LEGACY_SCAN_TYPE_MAP?.[scan.type]
      || (CONSTANTS.SCAN_TYPES.includes(scan.type) ? scan.type : '')
      || '';
    const limitedScan = {
      disclaimer: LIMITED_SCAN_DISCLAIMER,
      fetalCardiacActivity: scan.limitedScan?.fetalCardiacActivity
        || scan.limitedScan?.viability
        || scan.routine?.fetalCardiacActivity
        || scan.routine?.viability
        || '',
      fetalMovement: scan.limitedScan?.fetalMovement || scan.routine?.fetalMovement || '',
      fhr: scan.limitedScan?.fhr || scan.routine?.fhr || '',
      placenta: scan.limitedScan?.placenta || b.placentaLocation || '',
      placentaOS: scan.limitedScan?.placentaOS || b.placentaOS || '',
      liquor: scan.limitedScan?.liquor || scan.routine?.liquor || '',
      presentation: scan.limitedScan?.presentation || scan.routine?.presentation || '',
      dopplerStatus: scan.limitedScan?.dopplerStatus || scan.routine?.dopplerStatus || 'Not performed / not indicated',
      note: scan.limitedScan?.note || scan.routine?.note || '',
      bppScore: scan.limitedScan?.bppScore || scan.routine?.bppScore || '',
      cervicalLength: scan.limitedScan?.cervicalLength || scan.routine?.cervicalLength || '',
    };
    return {
      ...scan,
      normalizedSchemaVersion: 2,
      category,
      type: scan.type || category,
      findings: scan.findings || limitedScan.note || '',
      limitedScan,
      biometrics: {
        ...b,
        placentaLocation: b.placentaLocation || limitedScan.placenta || '',
        placentaOS: b.placentaOS || limitedScan.placentaOS || '',
      },
      doppler: { ...d },
    };
  }

  function optionHTML(items, selected, placeholder='— Select —') {
    return `<option value="">${esc(placeholder)}</option>` + items.map(item =>
      `<option value="${esc(item)}" ${item===selected?'selected':''}>${esc(item)}</option>`
    ).join('');
  }

  function yesNoOptions(selected, placeholder='— Select —') {
    return optionHTML(['Present','Absent','Not assessed'], selected, placeholder);
  }

  function scanRowHTML(scan={}, idx, lmpDate) {
    scan = normalizeScan(scan);
    const gaStr = (scan.date && lmpDate) ? (() => { const g=CALC.getGA(lmpDate,scan.date); return g?`${g.weeks}w+${g.days}d`:'—'; })() : '';
    const placOptions = CONSTANTS.PLACENTA_LOCATIONS.map(p =>
      `<option value="${p}" ${scan.biometrics?.placentaLocation===p?'selected':''}>${p}</option>`
    ).join('');
    const scanOptions = CONSTANTS.SCAN_TYPES.map(t =>
      `<option value="${t}" ${scan.category===t?'selected':''}>${t}</option>`
    ).join('');
    const isLowPlacenta = CONSTANTS.LOW_PLACENTA_VALUES.includes(scan.biometrics?.placentaLocation);
    const b = scan.biometrics||{};
    const d = scan.doppler||{};
    const limited = scan.limitedScan || {};
    const category = scan.category || '';
    const showBiometry = ['Anomaly scan','Growth scan'].includes(category) || b.BPD || b.HC || b.AC || b.FL || b.AFI || b.DVP || b.EFW;
    const showDoppler = category === 'Doppler scan' || d.UA_PI || d.MCA_PI || d.DV_PI || d.UtA_PI;

    const afiAssess = b.AFI && scan.ga ? CONSTANTS.assessAFI(b.AFI, parseInt(scan.ga)) : null;
    const dvpAssess = b.DVP ? CONSTANTS.assessDVP(b.DVP) : null;

    const canChart = b.BPD && b.HC && b.AC && b.FL;
    const hasDoppler = d.UA_PI || d.MCA_PI || d.DV_PI || d.UtA_PI;

    return `
    <tr data-idx="${idx}" class="scan-row">
      <td data-label="Type"><select class="scan-type"><option value="">— Type —</option>${scanOptions}</select></td>
      <td data-label="Date"><input type="date" class="scan-date" value="${esc(scan.date)}"></td>
      <td data-label="GA" class="ga-cell scan-ga-display">${esc(gaStr)||'—'}</td>
      <td data-label="Operator"><input type="text" class="scan-operator" placeholder="Operator" value="${esc(scan.operator)}"></td>
      <td data-label="Findings">
        <textarea class="scan-findings" placeholder="General findings / impression...">${esc(scan.findings)}</textarea>
      </td>
      <td data-label="Actions"><button class="btn-delete-row" data-table="scan" data-idx="${idx}">✕</button></td>
    </tr>
    <tr class="scan-detail-row" data-parent="${idx}">
      <td colspan="6" style="padding:0 8px 10px 12px;background:#f8fbff">
        <div class="us-subfields scan-category-panel" style="margin-top:6px">
          ${category === 'Quick limited clinic scan' ? `<div class="limited-scan-warning">${LIMITED_SCAN_DISCLAIMER}</div>` : ''}
          <div class="scan-quick-grid">
            <div class="us-field"><label>Fetal cardiac activity</label>
              <select class="limited-fetal-cardiac-activity">${optionHTML(['Present','Absent','Not assessed'], limited.fetalCardiacActivity, '— Cardiac activity —')}</select></div>
            <div class="us-field"><label>Fetal movement</label>
              <select class="limited-movement">${optionHTML(['Seen','Not seen','Not assessed'], limited.fetalMovement, '— Movement —')}</select></div>
            <div class="us-field"><label>FHR (bpm)</label>
              <input type="number" class="limited-fhr" placeholder="e.g. 145" value="${esc(limited.fhr)}"></div>
            <div class="us-field"><label>Placenta</label>
              <select class="limited-placenta bio-placenta"><option value="">— Location —</option>${placOptions}</select></div>
            <div class="us-field placenta-os-field" style="display:${isLowPlacenta?'flex':'none'}">
              <label>Distance from Internal OS (mm)</label>
              <input type="number" class="limited-placenta-os bio-placenta-os" placeholder="mm" value="${esc(b.placentaOS)}"></div>
            <div class="us-field"><label>Liquor</label>
              <select class="limited-liquor">${optionHTML(['Normal','Reduced','Increased','Not assessed'], limited.liquor, '— Liquor —')}</select></div>
            <div class="us-field"><label>Presentation</label>
              <select class="limited-presentation">${optionHTML(['Cephalic','Breech','Transverse','Oblique','Variable','Not assessed'], limited.presentation, '— Presentation —')}</select></div>
            <div class="us-field"><label>Doppler status</label>
              <select class="limited-doppler-status">${optionHTML(DOPPLER_STATUS_OPTIONS, limited.dopplerStatus || 'Not performed / not indicated', '— Doppler —')}</select></div>
          </div>
          <div class="us-field" style="margin-bottom:8px"><label>Concise findings</label>
            <textarea class="limited-note" placeholder="Concise limited clinic scan note..." style="min-height:44px">${esc(limited.note)}</textarea></div>

          <details class="scan-detail-block" ${showBiometry?'open':''}>
            <summary>Biometry, fluid and placenta detail</summary>
            <div style="font-size:10px;font-weight:700;color:var(--tx-mid);text-transform:uppercase;letter-spacing:.5px;margin:8px 0">📐 Biometry</div>
            <div class="us-biometry-grid">
              <div class="us-field"><label>BPD (mm)</label>
                <input type="number" class="bio-bpd" placeholder="e.g. 55" value="${esc(b.BPD)}" step="0.1"></div>
              <div class="us-field"><label>HC (mm)</label>
                <input type="number" class="bio-hc"  placeholder="e.g. 210" value="${esc(b.HC)}" step="0.1"></div>
              <div class="us-field"><label>AC (mm)</label>
                <input type="number" class="bio-ac"  placeholder="e.g. 185" value="${esc(b.AC)}" step="0.1"></div>
              <div class="us-field"><label>FL (mm)</label>
                <input type="number" class="bio-fl"  placeholder="e.g. 40" value="${esc(b.FL)}" step="0.1"></div>
            </div>
            <div class="us-fluid-grid">
              <div class="us-field"><label>AFI (cm)</label>
                <input type="number" class="bio-afi" placeholder="e.g. 14" value="${esc(b.AFI)}" step="0.1">
                ${afiAssess?`<span class="fluid-assessment" style="background:${afiAssess.color}20;color:${afiAssess.color};border:1px solid ${afiAssess.color}40">${afiAssess.icon} ${afiAssess.label}</span>`:''}
              </div>
              <div class="us-field"><label>DVP (cm)</label>
                <input type="number" class="bio-dvp" placeholder="e.g. 4.5" value="${esc(b.DVP)}" step="0.1">
                ${dvpAssess?`<span class="fluid-assessment" style="background:${dvpAssess.color}20;color:${dvpAssess.color};border:1px solid ${dvpAssess.color}40">${dvpAssess.icon} ${dvpAssess.label}</span>`:''}
              </div>
              <div class="us-field"><label>EFW (g)</label>
                <input type="number" class="bio-efw" placeholder="Estimated fetal wt" value="${esc(b.EFW)}"></div>
            </div>
          </details>
          <div class="us-field" style="margin:8px 0 6px"><label>Recommendations</label>
            <textarea class="scan-recs" placeholder="Scan recommendations..." style="min-height:36px">${esc(scan.recs)}</textarea></div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">
            <button class="btn-chart ${canChart?'':'btn-chart-disabled'}" data-idx="${idx}" ${canChart?'':'disabled'}>
              📈 Growth Charts${canChart?'':' (need biometry)'}
            </button>
            ${hasDoppler?`<button class="btn-chart btn-doppler-chart" data-idx="${idx}">📊 Doppler Charts</button>`:''}
          </div>
          <details class="scan-detail-block" ${showDoppler?'open':''}>
            <summary>Numeric Doppler detail</summary>
            <div class="doppler-grid">
              <div class="us-field"><label>UA PI (Umbilical Artery)</label>
                <input type="number" class="dop-ua" placeholder="e.g. 0.95" value="${esc(d.UA_PI)}" step="0.01">
                ${d.UA_PI && scan.ga ? dopResultHTML('UA', d.UA_PI, scan.ga) : ''}
              </div>
              <div class="us-field"><label>MCA PI (Mid Cerebral A.)</label>
                <input type="number" class="dop-mca" placeholder="e.g. 1.85" value="${esc(d.MCA_PI)}" step="0.01">
                ${d.MCA_PI && scan.ga ? dopResultHTML('MCA', d.MCA_PI, scan.ga) : ''}
              </div>
              <div class="us-field"><label>DV PI (Ductus Venosus)</label>
                <input type="number" class="dop-dv" placeholder="e.g. 0.68" value="${esc(d.DV_PI)}" step="0.01">
                ${d.DV_PI && scan.ga ? dopResultHTML('DV', d.DV_PI, scan.ga) : ''}
              </div>
              <div class="us-field"><label>UtA PI (Uterine Artery)</label>
                <input type="number" class="dop-uta" placeholder="e.g. 1.10" value="${esc(d.UtA_PI)}" step="0.01">
                ${d.UtA_PI && scan.ga ? dopResultHTML('UtA', d.UtA_PI, scan.ga) : ''}
              </div>
              ${(d.UA_PI && d.MCA_PI) ? `<div class="us-field"><label>CPR</label>
                ${cprHTML(d.MCA_PI, d.UA_PI)}</div>` : ''}
            </div>
          </details>
          ${category === 'BPP' ? `
          <div class="scan-quick-grid">
            <div class="us-field"><label>BPP score</label><input type="text" class="limited-bpp" placeholder="e.g. 8/8" value="${esc(limited.bppScore)}"></div>
          </div>` : ''}
          ${category === 'Cervical assessment' ? `
          <div class="scan-quick-grid">
            <div class="us-field"><label>Cervical length (mm)</label><input type="number" class="limited-cervix" placeholder="e.g. 35" value="${esc(limited.cervicalLength)}"></div>
          </div>` : ''}
        </div>
        ${attachmentZoneHTML('scan', idx, scan.attachments||[])}
      </td>
    </tr>`;
  }

  function dopResultHTML(vessel, pi, ga) {
    const res = CONSTANTS.assessDoppler(vessel, pi, parseInt(ga));
    if (!res) return '';
    return `<div class="doppler-result" style="background:${res.color}18;color:${res.color};border:1px solid ${res.color}40">${res.label}</div>`;
  }

  function cprHTML(mca, ua) {
    const r = CONSTANTS.calcCPR(mca, ua);
    if (!r) return '—';
    return `<div style="font-family:var(--mono);font-size:16px;font-weight:700;color:${r.color}">${r.value}</div>
            <div style="font-size:10px;color:${r.color};margin-top:2px">${r.label}</div>`;
  }

  /* ── MEDICATION ROW ── */
  function parseMedicationFrequency(value='') {
    const match = String(value).match(/(\d+(?:\.\d+)?)/);
    return match ? match[1] : '';
  }

  function parseMedicationDuration(value='') {
    const match = String(value).match(/(\d+(?:\.\d+)?)/);
    return match ? match[1] : '';
  }

  function medicationRowHTML(med={}, idx=0, memory=[]) {
    const status = MEDICATION_STATUSES.includes(med.status) ? med.status : 'Active';
    const memoryOptions = (Array.isArray(memory) ? memory : []).map(pattern =>
      `<option value="memory:${esc(pattern.patternID)}">${esc(pattern.drugName)}${pattern.genericName ? ` / ${esc(pattern.genericName)}` : ''}</option>`
    ).join('');
    const templateOptions = Object.keys(MEDICATION_TEMPLATES).map(name =>
      `<option value="template:${esc(name)}">${esc(name)}</option>`
    ).join('');
    const statusOptions = MEDICATION_STATUSES.map(item =>
      `<option value="${item}" ${status===item?'selected':''}>${item}</option>`
    ).join('');
    const doseAmount = med.doseAmount || med.dose || '';
    const timesPerDay = med.timesPerDay || parseMedicationFrequency(med.frequency);
    const durationDays = med.durationDays || parseMedicationDuration(med.duration);
    return `
    <article class="medication-row" data-idx="${idx}">
      <input type="hidden" class="med-id" value="${esc(med.medicationID)}">
      <input type="hidden" class="med-created-at" value="${esc(med.createdAt)}">
      <div class="medication-row-head">
        <div class="field-group med-template-wrap">
          <label>Drug / template</label>
          <select class="med-template">
            <option value="">Manual entry</option>
            ${memoryOptions ? `<optgroup label="Remembered patterns">${memoryOptions}</optgroup>` : ''}
            <optgroup label="Built-in templates">${templateOptions}</optgroup>
          </select>
        </div>
        <div class="medication-row-actions">
          <button type="button" class="btn-med-status" data-status="Stopped">Stop</button>
          <button type="button" class="btn-med-status" data-status="Active">Resume</button>
          <button type="button" class="btn-med-status" data-status="Completed">Completed</button>
          <button type="button" class="btn-med-pattern">Save as pattern</button>
          <button type="button" class="btn-med-remove">Remove</button>
        </div>
      </div>
      <div class="medication-compact-grid">
        <div class="field-group span-2"><label>Drug name</label><input class="med-drug" value="${esc(med.drugName)}" placeholder="Medication name"></div>
        <div class="field-group med-dose-group"><label>Dose | Unit | ×/day | Days</label>
          <div class="med-dose-strip">
            <input class="med-dose-amount" value="${esc(doseAmount)}" placeholder="1" aria-label="Dose amount">
            <input class="med-unit" value="${esc(med.unit)}" placeholder="tab" aria-label="Unit or form">
            <input class="med-times-per-day" type="number" min="0" step="0.5" value="${esc(timesPerDay)}" placeholder="3" aria-label="Times per day">
            <input class="med-duration-days" type="number" min="0" step="1" value="${esc(durationDays)}" placeholder="5" aria-label="Duration days">
          </div>
        </div>
        <div class="field-group"><label>Stop date</label><input type="date" class="med-stop" value="${esc(med.stopDate)}"></div>
        <div class="field-group"><label>Status</label><select class="med-status">${statusOptions}</select></div>
        <div class="field-group span-2"><label>Notes</label><input class="med-notes" value="${esc(med.notes)}" placeholder="Short note"></div>
      </div>
      <details class="med-more-details">
        <summary>More details</summary>
        <div class="medication-advanced-grid">
          <div class="field-group"><label>Generic name</label><input class="med-generic" value="${esc(med.genericName)}" placeholder="Generic"></div>
          <div class="field-group"><label>Route</label><input class="med-route" value="${esc(med.route)}" placeholder="Oral, SC, IM"></div>
          <div class="field-group span-2"><label>Indication</label><input class="med-indication" value="${esc(med.indication)}" placeholder="Reason / clinical indication"></div>
          <div class="field-group"><label>Start date</label><input type="date" class="med-start" value="${esc(med.startDate)}"></div>
          <div class="field-group"><label>Prescribed by</label><input class="med-prescribed-by" value="${esc(med.prescribedBy)}" placeholder="Clinician"></div>
        </div>
      </details>
    </article>`;
  }

  /* ── PROBLEM ROW ── */
  function problemRowHTML(problem={}, idx=0) {
    const status = PROBLEM_STATUSES.includes(problem.status) ? problem.status : 'Active';
    const severity = PROBLEM_SEVERITIES.includes(problem.severity) ? problem.severity : '';
    const displayCategory = PROBLEM_CATEGORIES.includes(problem.category) ? problem.category : (problem.category ? 'Other' : '');
    const templateOptions = Object.keys(PROBLEM_TEMPLATES).map(name =>
      `<option value="${esc(name)}">${esc(name)}</option>`
    ).join('');
    const categoryOptions = PROBLEM_CATEGORIES.map(item =>
      `<option value="${esc(item)}" ${displayCategory===item?'selected':''}>${esc(item)}</option>`
    ).join('');
    const statusOptions = PROBLEM_STATUSES.map(item =>
      `<option value="${esc(item)}" ${status===item?'selected':''}>${esc(item)}</option>`
    ).join('');
    const severityOptions = PROBLEM_SEVERITIES.map(item =>
      `<option value="${esc(item)}" ${severity===item?'selected':''}>${item ? esc(item) : '— Severity —'}</option>`
    ).join('');
    return `
    <article class="problem-row" data-idx="${idx}">
      <input type="hidden" class="problem-id" value="${esc(problem.problemID)}">
      <input type="hidden" class="problem-created-at" value="${esc(problem.createdAt)}">
      <div class="problem-row-head">
        <div class="field-group problem-template-wrap">
          <label>Problem / template</label>
          <select class="problem-template">
            <option value="">Manual entry</option>
            ${templateOptions}
          </select>
        </div>
        <div class="problem-row-actions">
          <button type="button" class="btn-problem-remove">Remove empty row</button>
        </div>
      </div>
      <div class="problem-compact-grid">
        <div class="field-group span-2"><label>Problem</label><input class="problem-title" value="${esc(problem.title || problem.problem)}" placeholder="Problem / diagnosis / issue"></div>
        <div class="field-group"><label>Category</label><select class="problem-category"><option value="">— Category —</option>${categoryOptions}</select></div>
        <div class="field-group"><label>Status</label><select class="problem-status">${statusOptions}</select></div>
        <div class="field-group"><label>Severity</label><select class="problem-severity">${severityOptions}</select></div>
        <div class="field-group span-2"><label>Notes</label><input class="problem-notes" value="${esc(problem.notes)}" placeholder="Short note"></div>
      </div>
      <details class="problem-more-details">
        <summary>More details</summary>
        <div class="problem-advanced-grid">
          <div class="field-group"><label>Onset date</label><input type="date" class="problem-onset" value="${esc(problem.onsetDate)}"></div>
          <div class="field-group"><label>Resolution date</label><input type="date" class="problem-resolution" value="${esc(problem.resolutionDate)}"></div>
        </div>
      </details>
    </article>`;
  }

  /* ── PROC ROW ── */
  function procRowHTML(proc={}, idx, lmpDate) {
    const gaStr = (proc.date && lmpDate) ? (() => { const g=CALC.getGA(lmpDate,proc.date); return g?`${g.weeks}w+${g.days}d`:'—'; })() : '';
    const procOptions = CONSTANTS.PROC_TYPES.map(t =>
      `<option value="${t}" ${proc.type===t?'selected':''}>${t}</option>`
    ).join('');
    return `
    <tr data-idx="${idx}">
      <td data-label="Procedure"><select class="proc-type"><option value="">— Select —</option>${procOptions}</select></td>
      <td data-label="Date"><input type="date" class="proc-date" value="${esc(proc.date)}"></td>
      <td data-label="GA" class="ga-cell proc-ga-display">${esc(gaStr)||'—'}</td>
      <td data-label="Operator"><input type="text" class="proc-operator" placeholder="Operator" value="${esc(proc.operator)}"></td>
      <td data-label="Result"><textarea class="proc-result" placeholder="Result summary...">${esc(proc.result)}</textarea></td>
      <td data-label="Notes"><textarea class="proc-notes"  placeholder="Notes...">${esc(proc.notes)}</textarea></td>
      <td data-label="Actions"><button class="btn-delete-row" data-table="proc" data-idx="${idx}">✕</button></td>
    </tr>`;
  }

  /* ── VISIT ROW ── */
  function medicationVisitText(med={}) {
    const parts = [];
    const drug = med.drugName || med.genericName || 'Medication';
    const dose = [med.dose, med.unit].filter(Boolean).join(' ');
    parts.push(drug);
    if (dose) parts.push(dose);
    if (med.frequency) {
      const times = parseMedicationFrequency(med.frequency);
      parts.push(times ? `×${times}/day` : med.frequency);
    }
    if (med.duration) {
      const days = parseMedicationDuration(med.duration);
      parts.push(days ? `for ${days} days` : med.duration);
    }
    return parts.join(' ');
  }

  function visitMedicationHelperHTML(activeMedications=[]) {
    return `
      <div class="visit-med-helper">
        <select class="visit-med-insert" ${(Array.isArray(activeMedications) && activeMedications.length) ? '' : 'disabled'}>
          ${visitMedicationOptionsHTML(activeMedications)}
        </select>
      </div>`;
  }

  function visitMedicationOptionsHTML(activeMedications=[]) {
    const options = (Array.isArray(activeMedications) ? activeMedications : [])
      .map(med => {
        const text = medicationVisitText(med);
        return `<option value="${esc(text)}">${esc(text)}</option>`;
      }).join('');
    return `<option value="">Insert active medication</option>${options}`;
  }

  function visitRowHTML(visit={}, idx, lmpDate, activeMedications=[]) {
    const gaStr = (visit.date && lmpDate) ? (() => { const g=CALC.getGA(lmpDate,visit.date); return g?`${g.weeks}w+${g.days}d`:'—'; })() : '—';
    return `
    <tr data-idx="${idx}">
      <td data-label="Visit" class="visit-index">${idx+1}</td>
      <td data-label="Date"><input type="date" class="visit-date" value="${esc(visit.date)}"></td>
      <td data-label="GA" class="ga-cell visit-ga-display">${esc(gaStr)}</td>
      <td data-label="Exam"><textarea class="visit-findings" placeholder="Clinical exam / Ultrasound...">${esc(visit.findings)}</textarea></td>
      <td data-label="BP"><input type="text" class="visit-bp" placeholder="120/80" value="${esc(visit.bp)}"></td>
      <td data-label="Weight"><input type="number" class="visit-weight" placeholder="kg" step="0.1" value="${esc(visit.weight)}"></td>
      <td data-label="Medications">${visitMedicationHelperHTML(activeMedications)}<textarea class="visit-meds" placeholder="Medications...">${esc(visit.meds)}</textarea></td>
      <td data-label="Procedures"><textarea class="visit-proc" placeholder="Procedures...">${esc(visit.procSummary)}</textarea></td>
      <td data-label="Labs"><textarea class="visit-lab"  placeholder="Lab results...">${esc(visit.labSummary)}</textarea></td>
      <td data-label="Notes"><textarea class="visit-notes" placeholder="Notes...">${esc(visit.notes)}</textarea></td>
      <td data-label="Actions"><button class="btn-delete-row" data-table="visit" data-idx="${idx}">✕</button></td>
    </tr>`;
  }

  /* ── ATTACHMENT ZONE ── */
  function attachmentZoneHTML(section, idx, attachments=[]) {
    const attListHTML = attachments.map(a => attachmentItemHTML(a, section, idx)).join('');
    return `
    <div class="attachment-section" data-section="${section}" data-idx="${idx}">
      <div class="attachment-zone" data-section="${section}" data-idx="${idx}" onclick="document.getElementById('fileInput_${section}_${idx}').click()">
        <input type="file" id="fileInput_${section}_${idx}" style="display:none" accept="image/*,.pdf" multiple
               onchange="APP.handleFileUpload(this,'${section}',${idx})">
        <div class="attachment-zone-icon">📎</div>
        <div class="attachment-zone-text">Click to attach images or PDF reports<br><small>Drag & drop supported</small></div>
      </div>
      <div class="attachment-list" id="attList_${section}_${idx}">${attListHTML}</div>
    </div>`;
  }

  function attachmentItemHTML(att, section, idx) {
    const isImage = att.type && att.type.startsWith('image/');
    const icon = isImage
      ? `<img class="attachment-thumb" src="${att.data}" alt="">`
      : `<div class="attachment-icon">${att.type==='application/pdf' ? '📄' : '📎'}</div>`;
    return `
    <div class="attachment-item" id="attItem_${att.id}">
      ${icon}
      <div style="flex:1;min-width:0">
        <div class="attachment-name">${esc(att.name)||'Attachment'}</div>
        <div class="attachment-meta">${esc(att.size)} · ${esc(CALC.formatDate(att.addedAt))}</div>
      </div>
      <button class="btn-att-preview" onclick="APP.previewAttachment(${jsArg(att.id)},${jsArg(att.data)},${jsArg(att.type)},${jsArg(att.name)})">View</button>
      <button class="ocr-btn" onclick="APP.ocrAttachment(${jsArg(att.id)},${jsArg(att.data)})" title="OCR: Extract text from image" ${isImage?'':'disabled style="opacity:.4"'}>OCR</button>
      <button class="btn-att-remove" onclick="APP.removeAttachment(${jsArg(att.id)},${jsArg(section)},${idx})">✕</button>
    </div>`;
  }

  /* ── CBC BLOCK ── */
  function cbcBlockHTML(labData, trimKey) {
    const saved = labData?.[trimKey]?.['CBC'] || {};
    const fields = [
      {key:'Hb',     label:'Hb',     unit:'g/dL',     placeholder:'e.g. 11.5'},
      {key:'HCT',    label:'HCT',    unit:'%',         placeholder:'e.g. 34'},
      {key:'WBC',    label:'WBC',    unit:'×10³/µL',  placeholder:'e.g. 8.5'},
      {key:'PLT',    label:'PLT',    unit:'×10³/µL',  placeholder:'e.g. 220'},
      {key:'MCV',    label:'MCV',    unit:'fL',        placeholder:'e.g. 85'},
      {key:'MCH',    label:'MCH',    unit:'pg',        placeholder:'e.g. 29'},
    ];
    const trim = {t1:1,t2:2,t3:3}[trimKey]||1;
    const fieldHtml = fields.map(f => {
      const val = saved[f.key]||'';
      const flag = val ? CONSTANTS.flagLab(f.key, val, trim) : null;
      return `
      <div class="cbc-field">
        <label>${f.label}</label>
        <div class="cbc-input-wrap">
          <input type="number" step="0.1" class="cbc-sub" data-field="${f.key}" data-trim="${trimKey}"
                 placeholder="${f.placeholder}" value="${val}"
                 style="${flag&&flag.flag!=='normal'&&flag.flag!=='pending'?`background:${flag.flag==='high'?'#ffebee':'#fff3e0'};color:${flag.flag==='high'?'#c62828':'#e65100'}`:''}">
          <span class="cbc-unit">${f.unit}</span>
        </div>
        <div class="flag-cell ${flag?'flag-'+flag.flag:'flag-pending'}" style="font-size:9px;margin-top:2px">${flag?flag.label:''}</div>
      </div>`;
    }).join('');
    return `
    <div class="cbc-block">
      <div class="cbc-title">🩸 CBC — Complete Blood Count</div>
      <div class="cbc-grid">${fieldHtml}</div>
      <div style="margin-top:8px">
        <label style="font-size:10px;font-weight:700;color:var(--tx-light);text-transform:uppercase">Result Date</label>
        <input type="date" class="cbc-date" data-trim="${trimKey}" value="${saved.resultDate||''}" style="max-width:160px;margin-top:3px">
      </div>
    </div>`;
  }

  /* ── SINGLE LAB TEST CELL ── */
  function labTestCellHTML(testName, trimKey, labData) {
    const trim = {t1:1,t2:2,t3:3}[trimKey]||1;
    const saved = labData?.[trimKey]?.[testName.replace(/[^a-zA-Z0-9]/g,'_')] || {};
    const flag = saved.value ? CONSTANTS.flagLab(testName, saved.value, trim) : null;
    const ref = CONSTANTS.LAB_REFS[testName];
    const isBinary = ref?.binary;
    return `
    <div class="lab-test-cell" data-testname="${testName}">
      <div class="lab-test-name">${testName}</div>
      ${ref?.unit ? `<div style="font-size:9px;color:var(--tx-light)">${ref.unit}</div>` : ''}
      <div class="lab-test-inputs">
        ${isBinary
          ? `<select class="lab-value" data-key="${testName.replace(/[^a-zA-Z0-9]/g,'_')}" data-trim="${trimKey}">
               <option value="" ${!saved.value?'selected':''}>— Select —</option>
               <option value="Negative" ${saved.value==='Negative'?'selected':''}>Negative</option>
               <option value="Positive" ${saved.value==='Positive'?'selected':''}>Positive</option>
             </select>`
          : `<input type="text" class="lab-value" data-key="${testName.replace(/[^a-zA-Z0-9]/g,'_')}" data-trim="${trimKey}"
               placeholder="Result" value="${saved.value||''}"
               style="${flag&&flag.flag!=='normal'&&flag.flag!=='pending'?`background:${flag.flag==='high'?'#ffebee':'#fff3e0'};color:${flag.flag==='high'?'#c62828':'#e65100'}`:''}">` }
        <input type="date" class="lab-ordered" data-key="${testName.replace(/[^a-zA-Z0-9]/g,'_')}" data-trim="${trimKey}" data-field="ordered" value="${saved.ordered||''}" title="Date ordered">
        <input type="date" class="lab-result-date" data-key="${testName.replace(/[^a-zA-Z0-9]/g,'_')}" data-trim="${trimKey}" data-field="resultDate" value="${saved.resultDate||''}" title="Result date">
      </div>
      <div class="lab-flag-text flag-${flag?.flag||'pending'}">${flag?flag.label:'⏳ Pending'}</div>
      ${ref?.note ? `<div style="font-size:9px;color:var(--tx-light);margin-top:2px;line-height:1.3">${ref.note}</div>` : ''}
    </div>`;
  }

  /* ── BUILD FULL LAB GRID ── */
  function buildLabGrid(trimKey, tests, labData, isFirst=false) {
    const containerId = `labGrid_${trimKey}`;
    const hdrClass = {t1:'t1-hdr',t2:'t2-hdr',t3:'t3-hdr'}[trimKey];
    const hdrLabel = {t1:'First Trimester Investigations',t2:'Second Trimester Investigations',t3:'Third Trimester Investigations'}[trimKey];

    const testsHtml = tests.map((t,i) => {
      if (i===0 && t==='CBC') return cbcBlockHTML(labData, trimKey);
      return labTestCellHTML(t, trimKey, labData);
    }).join('');

    return `
    <div class="lab-trimester-block" id="labBlock_${trimKey}">
      <div class="lab-trim-header ${hdrClass}">${hdrLabel}</div>
      <div class="lab-tests-grid" id="${containerId}">
        ${testsHtml}
        <div class="lab-add-btn" onclick="APP.addCustomLabTest('${trimKey}')" style="grid-column:1/-1">
          ＋ Add Custom Lab Test
        </div>
      </div>
    </div>`;
  }

  /* ── COLLECT FORM DATA ── */
  function collectScans(options={}) {
    const includeDrafts = Boolean(options?.includeDrafts);
    return Array.from(document.querySelectorAll('#ultraBody .scan-row')).map(tr => {
      const detailRow = tr.nextElementSibling;
      const category = tr.querySelector('.scan-type')?.value || '';
      const limitedScan = {
        disclaimer: LIMITED_SCAN_DISCLAIMER,
        fetalCardiacActivity: detailRow?.querySelector('.limited-fetal-cardiac-activity')?.value || '',
        fetalMovement: detailRow?.querySelector('.limited-movement')?.value || '',
        fhr: detailRow?.querySelector('.limited-fhr')?.value || '',
        placenta: detailRow?.querySelector('.limited-placenta')?.value || '',
        placentaOS: detailRow?.querySelector('.limited-placenta-os')?.value || '',
        liquor: detailRow?.querySelector('.limited-liquor')?.value || '',
        presentation: detailRow?.querySelector('.limited-presentation')?.value || '',
        dopplerStatus: detailRow?.querySelector('.limited-doppler-status')?.value || 'Not performed / not indicated',
        note: detailRow?.querySelector('.limited-note')?.value || '',
        bppScore: detailRow?.querySelector('.limited-bpp')?.value || '',
        cervicalLength: detailRow?.querySelector('.limited-cervix')?.value || '',
      };
      const biometrics = {
        BPD:              detailRow?.querySelector('.bio-bpd')?.value       || '',
        HC:               detailRow?.querySelector('.bio-hc')?.value        || '',
        AC:               detailRow?.querySelector('.bio-ac')?.value        || '',
        FL:               detailRow?.querySelector('.bio-fl')?.value        || '',
        AFI:              detailRow?.querySelector('.bio-afi')?.value       || '',
        DVP:              detailRow?.querySelector('.bio-dvp')?.value       || '',
        EFW:              detailRow?.querySelector('.bio-efw')?.value       || '',
        placentaLocation: limitedScan.placenta,
        placentaOS:       limitedScan.placentaOS,
      };
      const doppler = {
        UA_PI:  detailRow?.querySelector('.dop-ua')?.value  || '',
        MCA_PI: detailRow?.querySelector('.dop-mca')?.value || '',
        DV_PI:  detailRow?.querySelector('.dop-dv')?.value  || '',
        UtA_PI: detailRow?.querySelector('.dop-uta')?.value || '',
      };
      return {
        schemaVersion: 2,
        category,
        type:     category,
        date:     tr.querySelector('.scan-date')?.value   || '',
        ga:       tr.querySelector('.scan-ga-display')?.textContent?.replace(/[^0-9+w d]/g,'') || '',
        operator: tr.querySelector('.scan-operator')?.value || '',
        findings: tr.querySelector('.scan-findings')?.value || limitedScan.note || '',
        recs:     detailRow?.querySelector('.scan-recs')?.value     || '',
        limitedScan,
        biometrics,
        doppler,
      };
    }).filter(s => {
      const limitedValues = Object.entries(s.limitedScan || {})
        .filter(([key, value]) => {
          if (key === 'disclaimer') return false;
          if (key === 'dopplerStatus' && value === 'Not performed / not indicated') return false;
          return true;
        })
        .map(([, value]) => value);
      return includeDrafts && s.category
        || s.date || s.findings || s.recs || limitedValues.some(Boolean)
        || Object.values(s.biometrics || {}).some(Boolean)
        || Object.values(s.doppler || {}).some(Boolean)
        || Boolean(s.attachments?.length);
    });
  }

  function collectProcs() {
    return Array.from(document.querySelectorAll('#procBody tr[data-idx]')).map(tr => ({
      type:     tr.querySelector('.proc-type')?.value     || '',
      date:     tr.querySelector('.proc-date')?.value     || '',
      operator: tr.querySelector('.proc-operator')?.value || '',
      result:   tr.querySelector('.proc-result')?.value   || '',
      notes:    tr.querySelector('.proc-notes')?.value    || '',
    })).filter(p => p.type || p.date || p.result);
  }

  function collectVisits() {
    return Array.from(document.querySelectorAll('#visitBody tr[data-idx]')).map(tr => ({
      date:        tr.querySelector('.visit-date')?.value     || '',
      findings:    tr.querySelector('.visit-findings')?.value || '',
      bp:          tr.querySelector('.visit-bp')?.value       || '',
      weight:      tr.querySelector('.visit-weight')?.value   || '',
      meds:        tr.querySelector('.visit-meds')?.value     || '',
      procSummary: tr.querySelector('.visit-proc')?.value     || '',
      labSummary:  tr.querySelector('.visit-lab')?.value      || '',
      notes:       tr.querySelector('.visit-notes')?.value    || '',
    })).filter(v => v.date || v.findings);
  }

  function collectMedications() {
    return Array.from(document.querySelectorAll('#medicationList .medication-row')).map(row => {
      const doseAmount = row.querySelector('.med-dose-amount')?.value.trim() || '';
      const unit = row.querySelector('.med-unit')?.value.trim() || '';
      const timesPerDay = row.querySelector('.med-times-per-day')?.value || '';
      const durationDays = row.querySelector('.med-duration-days')?.value || '';
      const record = {
        medicationID: row.querySelector('.med-id')?.value || '',
        createdAt: row.querySelector('.med-created-at')?.value || '',
        drugName: row.querySelector('.med-drug')?.value.trim() || '',
        genericName: row.querySelector('.med-generic')?.value.trim() || '',
        dose: doseAmount,
        unit,
        route: row.querySelector('.med-route')?.value.trim() || '',
        frequency: timesPerDay ? `${timesPerDay} times daily` : '',
        indication: row.querySelector('.med-indication')?.value.trim() || '',
        startDate: row.querySelector('.med-start')?.value || '',
        stopDate: row.querySelector('.med-stop')?.value || '',
        duration: durationDays ? `${durationDays} days` : '',
        prescribedBy: row.querySelector('.med-prescribed-by')?.value.trim() || '',
        status: row.querySelector('.med-status')?.value || 'Active',
        notes: row.querySelector('.med-notes')?.value.trim() || '',
      };
      const meaningful = [
        'medicationID','drugName','genericName','dose','unit','route','frequency',
        'indication','startDate','stopDate','duration','prescribedBy','notes',
      ].some(key => Boolean(record[key])) || record.status !== 'Active';
      return meaningful ? record : null;
    }).filter(Boolean);
  }

  function collectProblems() {
    return Array.from(document.querySelectorAll('#problemList .problem-row')).map(row => {
      const record = {
        problemID: row.querySelector('.problem-id')?.value || '',
        createdAt: row.querySelector('.problem-created-at')?.value || '',
        title: row.querySelector('.problem-title')?.value.trim() || '',
        category: row.querySelector('.problem-category')?.value || '',
        status: row.querySelector('.problem-status')?.value || 'Active',
        severity: row.querySelector('.problem-severity')?.value || '',
        onsetDate: row.querySelector('.problem-onset')?.value || '',
        resolutionDate: row.querySelector('.problem-resolution')?.value || '',
        notes: row.querySelector('.problem-notes')?.value.trim() || '',
      };
      const meaningful = [
        'problemID','title','category','severity','onsetDate','resolutionDate','notes',
      ].some(key => Boolean(record[key])) || record.status !== 'Active';
      return meaningful ? record : null;
    }).filter(Boolean);
  }

  function collectLabs() {
    const labs = {t1:{}, t2:{}, t3:{}};
    // CBC sub-fields
    document.querySelectorAll('.cbc-sub').forEach(el => {
      const trim = el.dataset.trim, field = el.dataset.field;
      if (!labs[trim]['CBC']) labs[trim]['CBC'] = {};
      labs[trim]['CBC'][field] = el.value;
    });
    document.querySelectorAll('.cbc-date').forEach(el => {
      const trim = el.dataset.trim;
      if (!labs[trim]['CBC']) labs[trim]['CBC'] = {};
      labs[trim]['CBC']['resultDate'] = el.value;
    });
    // Other lab values
    document.querySelectorAll('.lab-value[data-trim]').forEach(el => {
      const trim = el.dataset.trim, key = el.dataset.key;
      if (!labs[trim][key]) labs[trim][key] = {};
      labs[trim][key]['value'] = el.value;
    });
    document.querySelectorAll('.lab-ordered[data-trim]').forEach(el => {
      const trim = el.dataset.trim, key = el.dataset.key;
      if (!labs[trim][key]) labs[trim][key] = {};
      labs[trim][key]['ordered'] = el.value;
    });
    document.querySelectorAll('.lab-result-date[data-trim]').forEach(el => {
      const trim = el.dataset.trim, key = el.dataset.key;
      if (!labs[trim][key]) labs[trim][key] = {};
      labs[trim][key]['resultDate'] = el.value;
    });
    return labs;
  }

  /* ── DB TABLE ── */
  function renderDBTable(patients, search='', status='', showArchived=false) {
    const tbody  = document.getElementById('dbTableBody');
    const empty  = document.getElementById('dbEmpty');
    const today  = new Date();
    let entries = Object.values(patients);
    entries = entries.filter(p => showArchived || !DB.isArchived(p));
    if (search) { const q=search.toLowerCase(); entries=entries.filter(p=>(p.fullName||'').toLowerCase().includes(q)||(p.patientID||'').toLowerCase().includes(q)||(p.phone||'').includes(q)); }
    if (status) entries = entries.filter(p => p.patientStatus===status);
    if (!entries.length) { tbody.innerHTML=''; empty.style.display='block'; return; }
    empty.style.display='none';
    tbody.innerHTML = entries.sort((a,b)=>new Date(b.updatedAt||0)-new Date(a.updatedAt||0)).map(p => {
      const ga  = p.lmpDate ? CALC.getGA(p.lmpDate, CALC.todayISO()) : null;
      const edd = p.lmpDate ? CALC.formatDate(CALC.getEDD(p.lmpDate)) : '—';
      const riskMap = {'Low Risk':'risk-low','Middle Risk':'risk-middle','High Risk':'risk-high'};
      const riskCls = riskMap[p.riskLevel] || 'risk-low';
      const archived = DB.isArchived(p);
      return `<tr class="${archived ? 'db-row-archived' : ''}" onclick="APP.openPatient(${jsArg(p.patientID)})">
        <td data-label="ID"><code style="font-size:10px">${esc(p.patientID)}</code></td>
        <td data-label="Name" style="font-weight:600">${esc(p.fullName)||'—'}${archived ? ' <span class="archive-badge">Archived</span>' : ''}</td>
        <td data-label="Age">${esc(p.age)||'—'}</td>
        <td data-label="Blood Group">${esc(p.bloodGroup)||'—'}</td>
        <td data-label="LMP">${esc(CALC.formatDate(p.lmpDate))}</td>
        <td data-label="EDD">${esc(edd)}</td>
        <td data-label="GA" style="font-family:var(--mono);font-size:11px;font-weight:600;color:var(--navy-light)">${ga?`${ga.weeks}w+${ga.days}d`:'—'}</td>
        <td data-label="Pregnancy">${esc(p.pregnancyType)||'—'}</td>
        <td data-label="Risk"><span class="risk-badge ${riskCls}" style="font-size:10px">${esc(p.riskLevel)||'Low Risk'}</span></td>
        <td data-label="Status">${statusBadge(p.patientStatus)}</td>
        <td data-label="Actions" onclick="event.stopPropagation()">
          <button class="btn-open-record" onclick="APP.openPatient(${jsArg(p.patientID)})">Open</button>
          ${archived
            ? `<button class="btn-restore-record" onclick="APP.restoreArchivedPatient(${jsArg(p.patientID)})">Restore</button>`
            : `<button class="btn-archive-record" onclick="APP.confirmArchivePatient(${jsArg(p.patientID)})">Archive</button>`}
        </td>
      </tr>`;
    }).join('');
  }

  /* ── DASHBOARD ── */
  function renderDashboard(stats) {
    document.getElementById('statTotal').textContent  = stats.total;
    document.getElementById('statActive').textContent = stats.active;
    document.getElementById('statRisk').textContent   = stats.riskCount;
    document.getElementById('statMissing').textContent = stats.alerts.length;
    const archivedStat = document.getElementById('statArchived');
    if (archivedStat) archivedStat.textContent = stats.archivedCount || 0;

    const resumeEl = document.getElementById('dashResume');
    resumeEl.innerHTML = stats.lastPatient ? `
      <div class="resume-card">
        <div>
          <div class="resume-eyebrow">Resume last patient</div>
          <strong>${esc(stats.lastPatient.fullName)||'Unnamed patient'}</strong>
          <span>${esc(stats.lastPatient.patientID)||''}</span>
        </div>
        <button type="button" onclick="APP.openPatient(${jsArg(stats.lastPatient.patientID)})">Open</button>
      </div>` : '';

    const overviewEl = document.getElementById('dashOverview');
    overviewEl.innerHTML = [
      ['Recently edited', stats.recentEdited, 'Updated in the last 7 days'],
      ['Missing LMP / GA', stats.missingLMP, 'Records without LMP'],
      ['No recorded visit', stats.noVisit, 'Patients without visit rows'],
      ['No scan recorded', stats.noScan, 'Patients without scan rows'],
    ].map(([label,value,hint]) => `
      <div class="overview-pill">
        <span>${esc(label)}</span>
        <strong>${value}</strong>
        <small>${esc(hint)}</small>
      </div>`).join('');

    const recentEl = document.getElementById('recentList');
    recentEl.innerHTML = stats.recentPatients.length
      ? stats.recentPatients.map(p=>{
          const ga=p.lmpDate?CALC.getGA(p.lmpDate):null;
          const riskCls={'Low Risk':'risk-low','Middle Risk':'risk-middle','High Risk':'risk-high'}[p.riskLevel]||'risk-low';
          return `<div class="recent-item">
            <div><div style="font-size:12.5px;font-weight:600;color:var(--navy)">${p.fullName||'—'}</div>
              <div style="font-size:10px;color:#aaa">${p.patientID||''} · ${p.updatedAt?CALC.formatDate(p.updatedAt):'Not dated'}</div></div>
            <div style="text-align:right">
              <div style="font-family:var(--mono);font-size:11px;color:var(--navy-light)">${ga?ga.weeks+'w+'+ga.days+'d':'GA —'}</div>
              <span class="risk-badge ${riskCls}" style="font-size:10px">${p.riskLevel||'Low Risk'}</span>
              <button type="button" class="dash-open-btn" onclick="APP.openPatient(${jsArg(p.patientID)})">Open</button>
            </div>
          </div>`;
        }).join('')
      : '<div style="color:#aaa;font-size:12px;padding:8px">No patients yet</div>';

    const riskEl = document.getElementById('riskWatchList');
    riskEl.innerHTML = stats.riskPatients.length ? stats.riskPatients.map(p => {
      const ga = p.lmpDate ? CALC.getGA(p.lmpDate) : null;
      const riskCls = {'Middle Risk':'risk-middle','High Risk':'risk-high'}[p.riskLevel] || 'risk-middle';
      return `<div class="recent-item">
        <div><div style="font-size:12.5px;font-weight:600;color:var(--navy)">${esc(p.fullName)||'—'}</div>
          <div style="font-size:10px;color:#aaa">${ga?ga.weeks+'w+'+ga.days+'d':'GA —'}</div></div>
        <div style="text-align:right">
          <span class="risk-badge ${riskCls}" style="font-size:10px">${esc(p.riskLevel)}</span>
          <button type="button" class="dash-open-btn" onclick="APP.openPatient(${jsArg(p.patientID)})">Open</button>
        </div>
      </div>`;
    }).join('') : '<div style="color:#aaa;font-size:12px;padding:8px">No high-risk watchlist patients.</div>';

    const alertsEl = document.getElementById('dashAlerts');
    alertsEl.innerHTML = stats.alerts.length ? stats.alerts.map(alert => `
      <button type="button" class="dash-alert-row" onclick="APP.openPatient(${jsArg(alert.patientID)})">
        <span>${esc(alert.text)}</span>
        <strong>${esc(alert.name)||'Unnamed patient'}</strong>
      </button>`).join('') : '<div style="color:#aaa;font-size:12px;padding:8px">No missing-data alerts from existing fields.</div>';

    const systemEl = document.getElementById('dashSystemStatus');
    systemEl.innerHTML = `
      <div class="system-row"><span>Cloud</span><strong>${esc(stats.syncText || 'Checking sync…')}</strong></div>
      <div class="system-row"><span>Local patients</span><strong>${stats.total}</strong></div>
      <div class="system-row"><span>Storage</span><strong>${stats.storage.usedKB} KB used</strong></div>
      <div class="system-note">Local/offline-capable shell. Cloud status depends on the current session and network.</div>`;
  }

  /* ── STORAGE METER ── */
  function updateStorageMeter() {
    const info = DB.getStorageInfo();
    const fill = document.getElementById('storageFill');
    const label = document.getElementById('storageLabel');
    if (fill) {
      fill.style.width = `${info.pct}%`;
      fill.className = `storage-fill${info.pct>80?' danger':info.pct>60?' warn':''}`;
    }
    if (label) label.textContent = `${info.usedKB} KB used`;
  }

  return {
    toast, modal, statusBadge, applyStatusColor, riskBadgeHTML, flagCell,
    initCollapsible, scanRowHTML, normalizeScan, procRowHTML, visitRowHTML, visitMedicationOptionsHTML,
    attachmentZoneHTML, attachmentItemHTML,
    cbcBlockHTML, labTestCellHTML, buildLabGrid,
    collectScans, collectProcs, collectVisits, collectProblems, collectMedications, collectLabs,
    renderDBTable, renderDashboard, updateStorageMeter, dopResultHTML, cprHTML,
    problemRowHTML, PROBLEM_TEMPLATES,
    medicationRowHTML, MEDICATION_TEMPLATES,
    STATUS_COLORS,
  };
})();
