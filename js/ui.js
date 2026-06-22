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

  function localClinicalDate(value) {
    const text=String(value || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const date=new Date(text);
    if (Number.isNaN(date.getTime())) return '';
    const pad=number=>String(number).padStart(2,'0');
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
  }

  function sameDayLabItems(labs, visitDate) {
    const day=localClinicalDate(visitDate);if(!day)return [];
    const custom=new Map((labs?._layout?.customTests || []).map(def=>[def.testCode,def]));
    const chosen=new Map();
    const keep=candidate=>{
      const current=chosen.get(candidate.key);
      const nextStamp=String(candidate.updatedAt || '');
      const currentStamp=String(current?.updatedAt || '');
      if (!current || nextStamp>currentStamp || (nextStamp===currentStamp&&candidate.trimester>current.trimester)) {
        chosen.set(candidate.key,candidate);
      }
    };
    ['t1','t2','t3'].forEach((trimKey,index)=>{
      Object.entries(labs?.[trimKey] || {}).forEach(([code,entry])=>{
        if (!entry || typeof entry!=='object' || localClinicalDate(entry.resultDate)!==day) return;
        if (code==='CBC') {
          [['Hb','Hb'],['PLT','Platelets'],['WBC','WBC'],['HCT','HCT'],['MCV','MCV'],['MCH','MCH']].forEach(([field,label])=>{
            if (entry[field]===undefined || entry[field]==='') return;
            const flagged=CONSTANTS.flagLab(field,entry[field],index+1);
            const icon={high:'↑',low:'↓',normal:'✓',pending:'◷',unknown:'?'}[flagged.flag]||'?';
            keep({key:`CBC.${field}`,label,value:String(entry[field]),unit:CONSTANTS.LAB_REFS?.[field]?.unit||'',flag:flagged.flag,icon,updatedAt:entry.updatedAt,trimester:index});
          });
          return;
        }
        if (entry.value===undefined || entry.value==='') return;
        const definition=CONSTANTS.LAB_TEST_LIBRARY?.[code] || custom.get(code) || {testName:entry.testName||code.replace(/_/g,' '),unit:entry.unit||'',builtIn:false};
        const flagged=definition.builtIn ? CONSTANTS.flagLab(definition.testName,entry.value,index+1) : {flag:'unknown',icon:'?'};
        const icon={high:'↑',low:'↓',normal:'✓',pending:'◷',unknown:'?'}[flagged.flag]||'?';
        keep({key:code,label:definition.testName,value:String(entry.value),unit:definition.unit||entry.unit||'',flag:flagged.flag,icon,updatedAt:entry.updatedAt,trimester:index});
      });
    });
    const priority={high:0,low:0,abnormal:0,normal:1,unknown:2};
    return Array.from(chosen.values()).sort((a,b)=>(priority[a.flag]??2)-(priority[b.flag]??2)||a.label.localeCompare(b.label));
  }

  function sameDayProcedureItems(procedures, visitDate) {
    const day=localClinicalDate(visitDate);if(!day)return [];
    return (Array.isArray(procedures)?procedures:[])
      .filter(item=>localClinicalDate(item?.date)===day && (item.type||item.result))
      .map(item=>({label:item.type||'Procedure',result:item.result||''}));
  }

  function pregnancyOutcomeKind(outcome) {
    const value=String(outcome || '').toLowerCase();
    if (value.includes('ectopic')) return 'ectopic';
    if (value.includes('molar')) return 'molar';
    if (value.includes('loss') || value.includes('miscarriage') || value.includes('abortion')) return 'loss';
    if (value.includes('stillbirth') || value.includes('neonatal death') || value.includes('live birth')) return 'delivery';
    return value ? 'other' : 'empty';
  }

  function deliveryModeShort(value) {
    const mode=String(value || '').toLowerCase();
    if (!mode || mode==='unknown') return 'Unknown';
    if (mode.includes('cesarean') || mode.includes('caesarean')) return 'CS';
    if (mode.includes('instrumental') || mode.includes('assisted') || mode.includes('vacuum') || mode.includes('forceps')) return 'Instrumental VD';
    if (mode.includes('normal vaginal') || mode.includes('spontaneous vaginal') || mode.includes('vbac')) return 'NVD';
    return 'Other';
  }

  function obstetricHistorySummary(pregnancies=[], tpal={}) {
    const records=Array.isArray(pregnancies)?pregnancies:[];
    const deliveries=records.filter(item=>pregnancyOutcomeKind(item.outcome)==='delivery');
    const modes=deliveries.map(item=>deliveryModeShort(item.deliveryType));
    const counts=new Map();modes.filter(mode=>mode!=='Unknown').forEach(mode=>counts.set(mode,(counts.get(mode)||0)+1));
    let deliveryText='No previous delivery';
    if (deliveries.length) {
      deliveryText=modes.includes('Unknown')
        ? `Previous deliveries: ${deliveries.length} documented, mode incomplete`
        : `Previous deliveries: ${Array.from(counts.entries()).map(([mode,count])=>`${count} ${mode}`).join(', ')}`;
    }
    const complications=new Set();
    const lossCount=records.filter(item=>pregnancyOutcomeKind(item.outcome)==='loss').length;
    records.forEach(item=>{
      const kind=pregnancyOutcomeKind(item.outcome), mode=deliveryModeShort(item.deliveryType);
      if (mode==='CS') complications.add('Previous CS');
      if (mode==='Instrumental VD') complications.add('Operative vaginal delivery');
      if (kind==='delivery' && Number(item.gestationalAge)>0 && Number(item.gestationalAge)<37) complications.add('Preterm birth');
      if (String(item.outcome).toLowerCase().includes('stillbirth')) complications.add('Stillbirth');
      if (String(item.outcome).toLowerCase().includes('neonatal death') || String(item.livingStatus).toLowerCase().includes('neonatal')) complications.add('Neonatal death');
      if (kind==='ectopic') complications.add('Ectopic pregnancy');
      if (kind==='molar') complications.add('Molar pregnancy');
      if (item.congenitalAnomaly==='Yes') complications.add('Congenital anomaly');
      if (item.majorComplication && item.majorComplication!=='None') complications.add(String(item.majorComplication));
    });
    if (lossCount>=2) complications.add('Recurrent pregnancy loss');
    const ordered=records.map((item,index)=>({item,index})).sort((a,b)=>{
      const ay=Number(a.item.year),by=Number(b.item.year);
      if(ay&&by)return ay-by;if(ay)return -1;if(by)return 1;return a.index-b.index;
    });
    const rows=ordered.map(({item,index})=>{
      const year=item.year || `Pregnancy ${index+1}`,kind=pregnancyOutcomeKind(item.outcome);
      if (kind==='loss') return [year,item.lossTrimester||'Trimester not recorded','Pregnancy loss',item.lossManagement||'Management not recorded'].filter(Boolean);
      if (kind==='ectopic') return [year,'Ectopic pregnancy',item.ectopicManagement||'Management not recorded',item.ectopicSite||''].filter(Boolean);
      if (kind==='molar') return [year,'Molar pregnancy',item.molarManagement||'Management not recorded',item.molarFollowUpCompleted?`Follow-up: ${item.molarFollowUpCompleted}`:''].filter(Boolean);
      if (kind==='delivery') {
        const living=item.livingStatus || (String(item.outcome).toLowerCase().includes('stillbirth')?'Stillbirth':String(item.outcome).toLowerCase().includes('neonatal death')?'Neonatal death':'Living status not recorded');
        return [year,item.gestationalAge?`${item.gestationalAge} weeks`:'GA not recorded',deliveryModeShort(item.deliveryType),item.majorComplication||'',living].filter(Boolean);
      }
      return [year,item.outcome||'Outcome not recorded'].filter(Boolean);
    });
    return {
      tpalText:`T${tpal.t||0} P${tpal.p||0} A${tpal.a||0} L${tpal.l||0}`,
      deliveryText,complications:Array.from(complications),rows,
    };
  }

  function legacyVisitDetail(label,value) {
    return value ? `<details class="visit-legacy-detail"><summary>Legacy ${esc(label)}</summary><div>${esc(value)}</div></details>` : '';
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
      <td data-label="Procedures"><div class="visit-procedure-derived">${legacyVisitDetail('procedure note',visit.procSummary)}</div><input type="hidden" class="visit-proc-legacy" value="${esc(visit.procSummary)}"></td>
      <td data-label="Labs"><div class="visit-lab-derived">${legacyVisitDetail('lab note',visit.labSummary)}</div><input type="hidden" class="visit-lab-legacy" value="${esc(visit.labSummary)}"></td>
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

  /* ── LABS V2.1 ── */
  let _labSource = {t1:{},t2:{},t3:{}};
  let _labPatientLayout = null;
  let _labTemplateLayout = null;
  let _labEffectiveLayout = null;
  let _labLayoutDirty = false;
  let _labPendingActions = [];
  let _activeLabTrimester = 't1';

  function cloneValue(value, fallback={}) {
    try { return JSON.parse(JSON.stringify(value ?? fallback)); }
    catch { return JSON.parse(JSON.stringify(fallback)); }
  }

  function emptyLabLayout() {
    return {version:1,hiddenTestCodes:{t1:[],t2:[],t3:[]},restoredTestCodes:{t1:[],t2:[],t3:[]},customTests:[]};
  }

  function normalizeLabLayout(layout) {
    const normalized = emptyLabLayout();
    if (!layout || typeof layout !== 'object' || Array.isArray(layout)) return normalized;
    ['t1','t2','t3'].forEach(trim => {
      normalized.hiddenTestCodes[trim] = Array.from(new Set((layout.hiddenTestCodes?.[trim] || []).map(String)));
      normalized.restoredTestCodes[trim] = Array.from(new Set((layout.restoredTestCodes?.[trim] || []).map(String)));
    });
    const seen = new Set();
    normalized.customTests = (Array.isArray(layout.customTests) ? layout.customTests : []).filter(def => {
      const code = String(def?.testCode || '');
      if (!code || seen.has(code)) return false;
      seen.add(code); return true;
    }).map(def => ({
      testCode:String(def.testCode), testName:String(def.testName || def.testCode),
      panelCode:String(def.panelCode || 'custom'), valueType:String(def.valueType || 'text'),
      unit:String(def.unit || ''), referenceLow:String(def.referenceLow || ''),
      referenceHigh:String(def.referenceHigh || ''), notes:String(def.notes || ''), builtIn:false,
    }));
    return normalized;
  }

  function mergeLabLayouts(template, patient) {
    const base = normalizeLabLayout(template);
    const local = normalizeLabLayout(patient);
    const result = emptyLabLayout();
    ['t1','t2','t3'].forEach(trim => {
      const restored = new Set(local.restoredTestCodes[trim]);
      result.hiddenTestCodes[trim] = Array.from(new Set([
        ...base.hiddenTestCodes[trim], ...local.hiddenTestCodes[trim],
      ])).filter(code => !restored.has(code));
      result.restoredTestCodes[trim] = local.restoredTestCodes[trim].slice();
    });
    const custom = new Map(base.customTests.map(def => [def.testCode, def]));
    local.customTests.forEach(def => custom.set(def.testCode, def));
    result.customTests = Array.from(custom.values());
    return result;
  }

  function discoverLegacyCustomTests(labs) {
    const builtIns = new Set(Object.keys(CONSTANTS.LAB_TEST_LIBRARY || {}));
    const definitions = new Map();
    ['t1','t2','t3'].forEach(trim => {
      Object.keys(labs?.[trim] || {}).forEach(code => {
        if (code === 'CBC' || builtIns.has(code)) return;
        definitions.set(code, {
          testCode:code, testName:String(labs[trim][code]?.testName || code.replace(/_/g,' ')),
          panelCode:'custom', valueType:'text', unit:String(labs[trim][code]?.unit || ''),
          referenceLow:'', referenceHigh:'', notes:'', builtIn:false,
        });
      });
    });
    return Array.from(definitions.values());
  }

  function initializeLabsWorkspace(labData, clinicTemplate) {
    _labSource = cloneValue(labData || {t1:{},t2:{},t3:{}});
    ['t1','t2','t3'].forEach(trim => {
      if (!_labSource[trim] || typeof _labSource[trim] !== 'object' || Array.isArray(_labSource[trim])) _labSource[trim] = {};
    });
    _labPatientLayout = labData?._layout ? normalizeLabLayout(labData._layout) : null;
    _labTemplateLayout = normalizeLabLayout(clinicTemplate);
    _labEffectiveLayout = mergeLabLayouts(_labTemplateLayout, _labPatientLayout);
    const known = new Set(_labEffectiveLayout.customTests.map(def => def.testCode));
    discoverLegacyCustomTests(_labSource).forEach(def => {
      if (!known.has(def.testCode)) _labEffectiveLayout.customTests.push(def);
    });
    _labLayoutDirty = false;
    _labPendingActions = [];
    _activeLabTrimester = 't1';
  }

  function labFallbackDate(entry={}) {
    return entry.resultDate || entry.completedDate || entry.date || entry.ordered || '';
  }

  function labDefinition(code) {
    return CONSTANTS.LAB_TEST_LIBRARY?.[code]
      || _labEffectiveLayout?.customTests.find(def => def.testCode === code)
      || {testCode:code,testName:code.replace(/_/g,' '),panelCode:'custom',valueType:'text',unit:'',builtIn:false};
  }

  function labStatusInfo(def, entry, trimKey) {
    if (!entry?.value && entry?.status === 'pending') return {icon:'◷',label:'Pending',className:'pending'};
    if (!entry?.value) return {icon:'○',label:'Not entered',className:'empty'};
    if (!def.builtIn || !CONSTANTS.LAB_REFS?.[def.testName]) return {icon:'?',label:'Reference not configured',className:'unknown'};
    const flag = CONSTANTS.flagLab(def.testName, entry.value, {t1:1,t2:2,t3:3}[trimKey] || 1);
    if (flag.flag === 'high') return {icon:'↑',label:flag.label,className:'high'};
    if (flag.flag === 'low') return {icon:'↓',label:flag.label,className:'low'};
    if (flag.flag === 'normal') return {icon:'✓',label:flag.label,className:'normal'};
    return {icon:'?',label:'Reference not configured',className:'unknown'};
  }

  function labValueControl(def, entry, trimKey) {
    const attrs = `class="lab-v21-value" data-key="${esc(def.testCode)}" data-trim="${trimKey}"`;
    const options = Array.isArray(def.options) ? def.options : [];
    if (def.valueType === 'qualitative' && options.length) {
      const values = options.includes(entry.value) || !entry.value ? options : [entry.value, ...options];
      return `<select ${attrs}><option value="">Not entered</option>${values.map(value =>
        `<option value="${esc(value)}" ${entry.value===value?'selected':''}>${esc(value)}</option>`).join('')}</select>`;
    }
    return `<input ${attrs} type="text" value="${esc(entry.value || '')}" placeholder="Result">`;
  }

  function labTestRowHTML(def, trimKey) {
    const entry = _labSource?.[trimKey]?.[def.testCode] || {};
    const status = labStatusInfo(def, entry, trimKey);
    const shownDate = labFallbackDate(entry);
    const statusValue = entry.status || (entry.value ? 'completed' : '');
    return `<div class="lab-v21-row" data-test-code="${esc(def.testCode)}">
      <div class="lab-v21-status ${status.className}" title="${esc(status.label)}" aria-label="${esc(status.label)}">${status.icon}</div>
      <div class="lab-v21-name"><strong>${esc(def.testName)}</strong>${def.unit ? `<span>${esc(def.unit)}</span>` : ''}</div>
      <div class="lab-v21-result">${labValueControl(def, entry, trimKey)}</div>
      <input class="lab-v21-date" type="date" data-key="${esc(def.testCode)}" data-trim="${trimKey}"
        value="${esc(shownDate)}" data-original-result-date="${esc(entry.resultDate || '')}" data-fallback-date="${esc(shownDate)}" aria-label="Result date">
      <select class="lab-v21-result-status" data-key="${esc(def.testCode)}" data-trim="${trimKey}" data-original-status="${esc(entry.status || '')}" aria-label="Result status">
        <option value="" ${!statusValue?'selected':''}>Not entered</option>
        <option value="pending" ${statusValue==='pending'?'selected':''}>Pending</option>
        <option value="completed" ${statusValue==='completed'?'selected':''}>Completed</option>
      </select>
      <button type="button" class="lab-v21-hide" data-lab-action="hide" data-key="${esc(def.testCode)}" data-trim="${trimKey}" title="Remove this test from this patient" aria-label="Hide ${esc(def.testName)}">×</button>
      <details class="lab-v21-details"><summary>More</summary>
        <label>Notes<textarea class="lab-v21-notes" data-key="${esc(def.testCode)}" data-trim="${trimKey}">${esc(entry.notes || '')}</textarea></label>
        <input type="hidden" class="lab-v21-legacy-ordered" data-key="${esc(def.testCode)}" data-trim="${trimKey}" value="${esc(entry.ordered || '')}">
        ${def.builtIn ? '' : `<div class="lab-v21-custom-definition">
          <label>Name<input class="lab-v21-custom-name" data-code="${esc(def.testCode)}" value="${esc(def.testName)}"></label>
          <label>Panel<select class="lab-v21-custom-panel" data-code="${esc(def.testCode)}">${CONSTANTS.LAB_PANEL_DEFINITIONS.map(panel =>
            `<option value="${panel.code}" ${panel.code===def.panelCode?'selected':''}>${esc(panel.name)}</option>`).join('')}</select></label>
        </div>`}
      </details>
    </div>`;
  }

  function cbcBlockHTML(labData, trimKey) {
    const saved = _labSource?.[trimKey]?.CBC || labData?.[trimKey]?.CBC || {};
    const fields = [
      {key:'Hb',label:'Hb',unit:'g/dL'},{key:'HCT',label:'HCT',unit:'%'},{key:'WBC',label:'WBC',unit:'×10³/µL'},
      {key:'PLT',label:'PLT',unit:'×10³/µL'},{key:'MCV',label:'MCV',unit:'fL'},{key:'MCH',label:'MCH',unit:'pg'},
    ];
    const shownDate = labFallbackDate(saved);
    return `<div class="cbc-block lab-v21-cbc" data-test-code="CBC">
      <div class="lab-v21-cbc-heading"><strong>Complete Blood Count</strong>
        <button type="button" class="lab-v21-hide" data-lab-action="hide" data-key="CBC" data-trim="${trimKey}" aria-label="Hide CBC">×</button></div>
      <div class="cbc-grid">${fields.map(field => `<label class="cbc-field"><span>${field.label}</span><div class="cbc-input-wrap">
        <input class="cbc-sub" data-field="${field.key}" data-trim="${trimKey}" value="${esc(saved[field.key] || '')}" inputmode="decimal">
        <span class="cbc-unit">${field.unit}</span></div></label>`).join('')}</div>
      <div class="lab-v21-cbc-meta"><input type="date" class="cbc-date" data-trim="${trimKey}" value="${esc(shownDate)}"
        data-original-result-date="${esc(saved.resultDate || '')}" data-fallback-date="${esc(shownDate)}" aria-label="CBC result date">
        <select class="cbc-status" data-trim="${trimKey}" data-original-status="${esc(saved.status || '')}">
          <option value="" ${!saved.status?'selected':''}>Not entered</option><option value="pending" ${saved.status==='pending'?'selected':''}>Pending</option>
          <option value="completed" ${saved.status==='completed'?'selected':''}>Completed</option></select>
        <input type="hidden" class="cbc-legacy-ordered" data-trim="${trimKey}" value="${esc(saved.ordered || '')}"></div>
    </div>`;
  }

  function panelDefinitions(panelCode) {
    const builtIns = Object.values(CONSTANTS.LAB_TEST_LIBRARY || {}).filter(def => def.panelCode === panelCode);
    const custom = (_labEffectiveLayout?.customTests || []).filter(def => def.panelCode === panelCode);
    const seen = new Set();
    return [...builtIns,...custom].filter(def => !seen.has(def.testCode) && seen.add(def.testCode));
  }

  function labPanelHTML(panel, trimKey) {
    const hidden = new Set(_labEffectiveLayout?.hiddenTestCodes?.[trimKey] || []);
    const definitions = panelDefinitions(panel.code).filter(def => !hidden.has(def.testCode));
    if (!definitions.length && panel.code !== 'custom') return '';
    const open = CONSTANTS.LAB_DEFAULT_OPEN_PANELS?.[trimKey]?.includes(panel.code);
    return `<details class="lab-v21-panel" data-panel="${panel.code}" ${open?'open':''}>
      <summary><span>${esc(panel.name)}</span><small>${definitions.length} test${definitions.length===1?'':'s'}</small></summary>
      <div class="lab-v21-panel-body">${definitions.map(def => def.testCode === 'CBC'
        ? cbcBlockHTML(_labSource, trimKey)
        : labTestRowHTML(def, trimKey)).join('') || '<div class="lab-v21-empty">No tests in this panel.</div>'}</div>
    </details>`;
  }

  function renderLabTrimester(trimKey=_activeLabTrimester) {
    _activeLabTrimester = ['t1','t2','t3'].includes(trimKey) ? trimKey : 't1';
    return `<div class="lab-v21-panels" data-active-trim="${_activeLabTrimester}">${CONSTANTS.LAB_PANEL_DEFINITIONS
      .map(panel => labPanelHTML(panel,_activeLabTrimester)).join('')}</div>`;
  }

  function buildLabsWorkspace(labData, clinicTemplate) {
    if (!Array.isArray(CONSTANTS.LAB_PANEL_DEFINITIONS)
      || !CONSTANTS.LAB_PANEL_DEFINITIONS.length
      || !CONSTANTS.LAB_TEST_LIBRARY
      || !Object.keys(CONSTANTS.LAB_TEST_LIBRARY).length) {
      const error = new Error('Labs definitions are unavailable. Reload the application to update its clinical workspace files.');
      error.name = 'LabsConfigurationError';
      throw error;
    }
    initializeLabsWorkspace(labData, clinicTemplate);
    return `<div class="lab-v21-toolbar">
      <div class="lab-v21-tabs" role="tablist">${['t1','t2','t3'].map((trim,index) =>
        `<button type="button" role="tab" class="lab-v21-tab ${index===0?'active':''}" data-lab-trim="${trim}">${['First','Second','Third'][index]} trimester</button>`).join('')}</div>
      <button type="button" class="btn-add-clinical-row" data-lab-action="add">Add test</button>
    </div><div id="labTrimesterContent">${renderLabTrimester('t1')}</div>
      <div class="section-bottom-action"><button type="button" class="btn-add-clinical-row" data-lab-action="add">+ Add Test</button></div>`;
  }

  function captureLabInputs(root=document) {
    root.querySelectorAll('.lab-v21-row').forEach(row => {
      const valueEl=row.querySelector('.lab-v21-value');
      const code=valueEl?.dataset.key, trim=valueEl?.dataset.trim;
      if (!code || !trim) return;
      const existing={...(_labSource[trim]?.[code] || {})};
      const date=row.querySelector('.lab-v21-date');
      const status=row.querySelector('.lab-v21-result-status');
      const notes=row.querySelector('.lab-v21-notes');
      existing.value=valueEl.value || '';
      if (date?.value !== date?.dataset.fallbackDate || date?.dataset.originalResultDate) existing.resultDate=date?.value || '';
      else if (!date?.dataset.originalResultDate) delete existing.resultDate;
      if (status?.value !== (status?.dataset.originalStatus || (existing.value?'completed':'')) || status?.dataset.originalStatus) existing.status=status?.value || '';
      else if (!status?.dataset.originalStatus) delete existing.status;
      if (notes?.value || Object.prototype.hasOwnProperty.call(existing,'notes')) existing.notes=notes?.value || '';
      const legacy=row.querySelector('.lab-v21-legacy-ordered')?.value;
      if (legacy) existing.ordered=legacy;
      if (Object.values(existing).some(value => String(value || '').trim())) _labSource[trim][code]=existing;
      else delete _labSource[trim][code];
    });
    root.querySelectorAll('.lab-v21-cbc').forEach(block => {
      const trim=block.querySelector('.cbc-sub')?.dataset.trim;
      if (!trim) return;
      const existing={...(_labSource[trim]?.CBC || {})};
      block.querySelectorAll('.cbc-sub').forEach(input => { existing[input.dataset.field]=input.value || ''; });
      const date=block.querySelector('.cbc-date');
      if (date?.value !== date?.dataset.fallbackDate || date?.dataset.originalResultDate) existing.resultDate=date?.value || '';
      else if (!date?.dataset.originalResultDate) delete existing.resultDate;
      const status=block.querySelector('.cbc-status');
      if (status?.value || status?.dataset.originalStatus) existing.status=status?.value || '';
      const legacy=block.querySelector('.cbc-legacy-ordered')?.value;if(legacy)existing.ordered=legacy;
      if (Object.entries(existing).some(([key,value]) => key!=='status' && String(value || '').trim())) _labSource[trim].CBC=existing;
      else delete _labSource[trim].CBC;
    });
    return _labSource;
  }

  function effectivePatientLayout() {
    return normalizeLabLayout({
      ...(_labPatientLayout || {}),
      hiddenTestCodes:_labEffectiveLayout.hiddenTestCodes,
      restoredTestCodes:_labEffectiveLayout.restoredTestCodes,
      customTests:_labEffectiveLayout.customTests,
    });
  }

  function markLabLayoutAction(operation, trimKey, testCode, summary) {
    _labLayoutDirty = true;
    _labPendingActions.push({operation,trimKey,testCode,summary});
  }

  function hideLabTest(trimKey, testCode) {
    captureLabInputs(document.getElementById('labTrimesterContent') || document);
    const hidden=new Set(_labEffectiveLayout.hiddenTestCodes[trimKey]);hidden.add(testCode);
    _labEffectiveLayout.hiddenTestCodes[trimKey]=Array.from(hidden);
    _labEffectiveLayout.restoredTestCodes[trimKey]=_labEffectiveLayout.restoredTestCodes[trimKey].filter(code=>code!==testCode);
    markLabLayoutAction('lab.test.hide',trimKey,testCode,`Hid ${labDefinition(testCode).testName} from this patient`);
    return renderLabTrimester(trimKey);
  }

  function restoreLabTest(trimKey, testCode) {
    const root = document.getElementById?.('labTrimesterContent');
    if (root) captureLabInputs(root);
    const hidden=new Set(_labEffectiveLayout.hiddenTestCodes[trimKey]);hidden.delete(testCode);
    _labEffectiveLayout.hiddenTestCodes[trimKey]=Array.from(hidden);
    if ((_labTemplateLayout.hiddenTestCodes[trimKey] || []).includes(testCode)) {
      _labEffectiveLayout.restoredTestCodes[trimKey]=Array.from(new Set([..._labEffectiveLayout.restoredTestCodes[trimKey],testCode]));
    }
    markLabLayoutAction('lab.test.restore',trimKey,testCode,`Restored ${labDefinition(testCode).testName} for this patient`);
    return renderLabTrimester(trimKey);
  }

  function addCustomLabDefinition(definition) {
    const root = document.getElementById?.('labTrimesterContent');
    if (root) captureLabInputs(root);
    const code=String(definition?.testCode || '');
    const name=String(definition?.testName || '').trim();
    if (!code || !name) return {ok:false,message:'Test name is required.'};
    const all=[...Object.values(CONSTANTS.LAB_TEST_LIBRARY || {}),..._labEffectiveLayout.customTests];
    if (all.some(def=>def.testCode===code)) return {ok:false,message:`Test code ${code} already exists.`};
    if (all.some(def=>def.testName.toLowerCase()===name.toLowerCase())) return {ok:false,message:`A test named ${name} already exists.`};
    const normalized={testCode:code,testName:name,panelCode:definition.panelCode||'custom',valueType:definition.valueType||'text',unit:definition.unit||'',referenceLow:definition.referenceLow||'',referenceHigh:definition.referenceHigh||'',notes:definition.notes||'',builtIn:false};
    _labEffectiveLayout.customTests.push(normalized);
    markLabLayoutAction('lab.test.add',_activeLabTrimester,code,`Added custom lab test ${name}`);
    return {ok:true,definition:normalized,html:renderLabTrimester(_activeLabTrimester)};
  }

  function updateCustomLabDefinition(code, changes) {
    const def=_labEffectiveLayout.customTests.find(item=>item.testCode===code);if(!def)return {ok:false};
    const nextName=String(changes.testName ?? def.testName).trim();
    const duplicate=[...Object.values(CONSTANTS.LAB_TEST_LIBRARY || {}),..._labEffectiveLayout.customTests]
      .some(item=>item.testCode!==code&&item.testName.toLowerCase()===nextName.toLowerCase());
    if(duplicate)return {ok:false,message:`A custom test named ${nextName} already exists.`};
    const changed=nextName!==def.testName || (changes.panelCode&&changes.panelCode!==def.panelCode);
    def.testName=nextName||def.testName;if(changes.panelCode)def.panelCode=changes.panelCode;
    if(changed)markLabLayoutAction('lab.test.update',_activeLabTrimester,code,`Updated custom lab test ${def.testName}`);
    return {ok:true,html:changed?renderLabTrimester(_activeLabTrimester):''};
  }

  function hiddenLabTests(trimKey) {
    return (_labEffectiveLayout.hiddenTestCodes[trimKey] || []).map(code=>labDefinition(code));
  }

  function updateLabRowStatus(control) {
    const row=control?.closest?.('.lab-v21-row');if(!row)return;
    const value=row.querySelector('.lab-v21-value')?.value || '';
    const workflow=row.querySelector('.lab-v21-result-status')?.value || '';
    const code=row.dataset.testCode;
    const trim=row.querySelector('[data-trim]')?.dataset.trim || _activeLabTrimester;
    const status=labStatusInfo(labDefinition(code),{value,status:workflow},trim);
    const indicator=row.querySelector('.lab-v21-status');if(!indicator)return;
    indicator.className=`lab-v21-status ${status.className}`;indicator.textContent=status.icon;
    indicator.title=status.label;indicator.setAttribute('aria-label',status.label);
  }

  function labLayoutState() {
    return {dirty:_labLayoutDirty,layout:effectivePatientLayout(),template:normalizeLabLayout({hiddenTestCodes:_labEffectiveLayout.hiddenTestCodes,customTests:_labEffectiveLayout.customTests}),actions:_labPendingActions.slice(),activeTrimester:_activeLabTrimester};
  }

  function markLabActionsPersisted() { _labPendingActions=[]; }
  function markLabLayoutDecisionComplete() { _labLayoutDirty=false;_labPendingActions=[];_labPatientLayout=effectivePatientLayout(); }

  // Legacy aliases remain for direct callers and old focused tests.
  function labTestCellHTML(testName, trimKey, labData) {
    if (labData) _labSource=cloneValue(labData);
    const code=CONSTANTS.labTestCode(testName);return labTestRowHTML(labDefinition(code),trimKey);
  }
  function buildLabGrid(trimKey, tests, labData) {
    initializeLabsWorkspace(labData,null);return `<div class="lab-v21-panels">${(tests||[]).map(name=>name==='CBC'?cbcBlockHTML(labData,trimKey):labTestCellHTML(name,trimKey)).join('')}</div>`;
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
      procSummary: tr.querySelector('.visit-proc-legacy')?.value || '',
      labSummary:  tr.querySelector('.visit-lab-legacy')?.value  || '',
      notes:       tr.querySelector('.visit-notes')?.value    || '',
    })).filter(visit => Object.values(visit).some(value => String(value || '').trim()));
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
    captureLabInputs(document.getElementById('labTrimesterContent') || document);
    const labs = cloneValue(_labSource,{t1:{},t2:{},t3:{}});
    if (_labLayoutDirty || _labPatientLayout) labs._layout=effectivePatientLayout();
    else delete labs._layout;
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
    cbcBlockHTML, labTestCellHTML, buildLabGrid, buildLabsWorkspace, renderLabTrimester,
    captureLabInputs, hideLabTest, restoreLabTest, hiddenLabTests,
    updateLabRowStatus,
    addCustomLabDefinition, updateCustomLabDefinition, labLayoutState, markLabLayoutDecisionComplete,
    markLabActionsPersisted,
    normalizeLabLayout, labFallbackDate, localClinicalDate, sameDayLabItems, sameDayProcedureItems,
    pregnancyOutcomeKind, deliveryModeShort, obstetricHistorySummary,
    collectScans, collectProcs, collectVisits, collectProblems, collectMedications, collectLabs,
    renderDBTable, renderDashboard, updateStorageMeter, dopResultHTML, cprHTML,
    problemRowHTML, PROBLEM_TEMPLATES,
    medicationRowHTML, MEDICATION_TEMPLATES,
    STATUS_COLORS,
  };
})();
