/* ═══════════════════════════════════════════════════════════
   ui.js v2 — UI Rendering Engine
═══════════════════════════════════════════════════════════ */

const UI = (() => {

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
    ok.className = danger ? 'btn-modal-confirm danger':'btn-modal-confirm';
    ok.onclick = () => { document.getElementById('modalOverlay').style.display='none'; onConfirm?.(); };
    document.getElementById('modalCancel').onclick = () => { document.getElementById('modalOverlay').style.display='none'; };
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

  /* ── COLLAPSIBLE TOGGLE ── */
  function initCollapsible(cardEl) {
    const btn  = cardEl.querySelector('.btn-toggle');
    const body = cardEl.querySelector('.collapsible-body');
    if (!btn || !body) return;
    body.style.maxHeight = body.scrollHeight + 'px';
    btn.addEventListener('click', () => {
      const open = !body.classList.contains('collapsed');
      body.classList.toggle('collapsed', open);
      const arrow = btn.querySelector('.toggle-arrow');
      if (arrow) arrow.classList.toggle('open', !open);
      btn.querySelector('.toggle-label').textContent = open ? 'Show' : 'Hide';
    });
  }

  /* ── SCAN ROW ── */
  function scanRowHTML(scan={}, idx, lmpDate) {
    const gaStr = (scan.date && lmpDate) ? (() => { const g=CALC.getGA(lmpDate,scan.date); return g?`${g.weeks}w+${g.days}d`:'—'; })() : '';
    const placOptions = CONSTANTS.PLACENTA_LOCATIONS.map(p =>
      `<option value="${p}" ${scan.biometrics?.placentaLocation===p?'selected':''}>${p}</option>`
    ).join('');
    const scanOptions = CONSTANTS.SCAN_TYPES.map(t =>
      `<option value="${t}" ${scan.type===t?'selected':''}>${t}</option>`
    ).join('');
    const isLowPlacenta = CONSTANTS.LOW_PLACENTA_VALUES.includes(scan.biometrics?.placentaLocation);
    const b = scan.biometrics||{};
    const d = scan.doppler||{};

    const afiAssess = b.AFI && scan.ga ? CONSTANTS.assessAFI(b.AFI, parseInt(scan.ga)) : null;
    const dvpAssess = b.DVP ? CONSTANTS.assessDVP(b.DVP) : null;

    const canChart = b.BPD && b.HC && b.AC && b.FL;
    const hasDoppler = d.UA_PI || d.MCA_PI || d.DV_PI || d.UtA_PI;

    return `
    <tr data-idx="${idx}" class="scan-row">
      <td><select class="scan-type" style="min-width:160px"><option value="">— Type —</option>${scanOptions}</select></td>
      <td><input type="date" class="scan-date" value="${scan.date||''}" style="min-width:120px"></td>
      <td class="ga-cell scan-ga-display">${gaStr||'—'}</td>
      <td><input type="text" class="scan-operator" placeholder="Operator" value="${scan.operator||''}" style="min-width:100px"></td>
      <td>
        <textarea class="scan-findings" placeholder="General findings / impression..." style="min-height:40px;width:100%">${scan.findings||''}</textarea>
      </td>
      <td><button class="btn-delete-row" data-table="scan" data-idx="${idx}">✕</button></td>
    </tr>
    <tr class="scan-detail-row" data-parent="${idx}">
      <td colspan="6" style="padding:0 8px 10px 12px;background:#f8fbff">
        <div class="us-subfields" style="margin-top:6px">
          <div style="font-size:10px;font-weight:700;color:var(--tx-mid);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">📐 Biometry</div>
          <div class="us-biometry-grid">
            <div class="us-field"><label>BPD (mm)</label>
              <input type="number" class="bio-bpd" placeholder="e.g. 55" value="${b.BPD||''}" step="0.1"></div>
            <div class="us-field"><label>HC (mm)</label>
              <input type="number" class="bio-hc"  placeholder="e.g. 210" value="${b.HC||''}" step="0.1"></div>
            <div class="us-field"><label>AC (mm)</label>
              <input type="number" class="bio-ac"  placeholder="e.g. 185" value="${b.AC||''}" step="0.1"></div>
            <div class="us-field"><label>FL (mm)</label>
              <input type="number" class="bio-fl"  placeholder="e.g. 40" value="${b.FL||''}" step="0.1"></div>
          </div>
          <div class="us-fluid-grid">
            <div class="us-field"><label>AFI (cm)</label>
              <input type="number" class="bio-afi" placeholder="e.g. 14" value="${b.AFI||''}" step="0.1">
              ${afiAssess?`<span class="fluid-assessment" style="background:${afiAssess.color}20;color:${afiAssess.color};border:1px solid ${afiAssess.color}40">${afiAssess.icon} ${afiAssess.label}</span>`:''}
            </div>
            <div class="us-field"><label>DVP (cm)</label>
              <input type="number" class="bio-dvp" placeholder="e.g. 4.5" value="${b.DVP||''}" step="0.1">
              ${dvpAssess?`<span class="fluid-assessment" style="background:${dvpAssess.color}20;color:${dvpAssess.color};border:1px solid ${dvpAssess.color}40">${dvpAssess.icon} ${dvpAssess.label}</span>`:''}
            </div>
            <div class="us-field"><label>EFW (g)</label>
              <input type="number" class="bio-efw" placeholder="Estimated fetal wt" value="${b.EFW||''}"></div>
          </div>
          <div class="us-placenta-row">
            <div class="us-field"><label>Placental Location</label>
              <select class="bio-placenta"><option value="">— Location —</option>${placOptions}</select></div>
            <div class="us-field placenta-os-field" style="display:${isLowPlacenta?'flex':'none'}">
              <label>Distance from Internal OS (mm)</label>
              <input type="number" class="bio-placenta-os" placeholder="mm" value="${b.placentaOS||''}"></div>
          </div>
          <div class="us-field" style="margin-bottom:6px"><label>Recommendations</label>
            <textarea class="scan-recs" placeholder="Scan recommendations..." style="min-height:36px">${scan.recs||''}</textarea></div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">
            <button class="btn-chart ${canChart?'':'btn-chart-disabled'}" data-idx="${idx}" ${canChart?'':'disabled'}>
              📈 Growth Charts${canChart?'':' (need biometry)'}
            </button>
            ${hasDoppler?`<button class="btn-chart btn-doppler-chart" data-idx="${idx}">📊 Doppler Charts</button>`:''}
          </div>
          <div class="doppler-grid">
            <div class="us-field"><label>UA PI (Umbilical Artery)</label>
              <input type="number" class="dop-ua" placeholder="e.g. 0.95" value="${d.UA_PI||''}" step="0.01">
              ${d.UA_PI && scan.ga ? dopResultHTML('UA', d.UA_PI, scan.ga) : ''}
            </div>
            <div class="us-field"><label>MCA PI (Mid Cerebral A.)</label>
              <input type="number" class="dop-mca" placeholder="e.g. 1.85" value="${d.MCA_PI||''}" step="0.01">
              ${d.MCA_PI && scan.ga ? dopResultHTML('MCA', d.MCA_PI, scan.ga) : ''}
            </div>
            <div class="us-field"><label>DV PI (Ductus Venosus)</label>
              <input type="number" class="dop-dv" placeholder="e.g. 0.68" value="${d.DV_PI||''}" step="0.01">
              ${d.DV_PI && scan.ga ? dopResultHTML('DV', d.DV_PI, scan.ga) : ''}
            </div>
            <div class="us-field"><label>UtA PI (Uterine Artery)</label>
              <input type="number" class="dop-uta" placeholder="e.g. 1.10" value="${d.UtA_PI||''}" step="0.01">
              ${d.UtA_PI && scan.ga ? dopResultHTML('UtA', d.UtA_PI, scan.ga) : ''}
            </div>
            ${(d.UA_PI && d.MCA_PI) ? `<div class="us-field"><label>CPR</label>
              ${cprHTML(d.MCA_PI, d.UA_PI)}</div>` : ''}
          </div>
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

  /* ── PROC ROW ── */
  function procRowHTML(proc={}, idx, lmpDate) {
    const gaStr = (proc.date && lmpDate) ? (() => { const g=CALC.getGA(lmpDate,proc.date); return g?`${g.weeks}w+${g.days}d`:'—'; })() : '';
    const procOptions = CONSTANTS.PROC_TYPES.map(t =>
      `<option value="${t}" ${proc.type===t?'selected':''}>${t}</option>`
    ).join('');
    return `
    <tr data-idx="${idx}">
      <td><select class="proc-type" style="min-width:160px"><option value="">— Select —</option>${procOptions}</select></td>
      <td><input type="date" class="proc-date" value="${proc.date||''}" style="min-width:120px"></td>
      <td class="ga-cell proc-ga-display">${gaStr||'—'}</td>
      <td><input type="text" class="proc-operator" placeholder="Operator" value="${proc.operator||''}"></td>
      <td><textarea class="proc-result" placeholder="Result summary...">${proc.result||''}</textarea></td>
      <td><textarea class="proc-notes"  placeholder="Notes...">${proc.notes||''}</textarea></td>
      <td><button class="btn-delete-row" data-table="proc" data-idx="${idx}">✕</button></td>
    </tr>`;
  }

  /* ── VISIT ROW ── */
  function visitRowHTML(visit={}, idx, lmpDate) {
    const gaStr = (visit.date && lmpDate) ? (() => { const g=CALC.getGA(lmpDate,visit.date); return g?`${g.weeks}w+${g.days}d`:'—'; })() : '—';
    return `
    <tr data-idx="${idx}">
      <td style="text-align:center;font-size:11px;color:#aaa;padding:7px 4px">${idx+1}</td>
      <td><input type="date" class="visit-date" value="${visit.date||''}"></td>
      <td class="ga-cell visit-ga-display">${gaStr}</td>
      <td><textarea class="visit-findings" placeholder="Clinical exam / Ultrasound...">${visit.findings||''}</textarea></td>
      <td><input type="text" class="visit-bp" placeholder="120/80" value="${visit.bp||''}" style="min-width:80px"></td>
      <td><input type="number" class="visit-weight" placeholder="kg" step="0.1" value="${visit.weight||''}" style="min-width:60px"></td>
      <td><textarea class="visit-meds" placeholder="Medications...">${visit.meds||''}</textarea></td>
      <td><textarea class="visit-proc" placeholder="Procedures...">${visit.procSummary||''}</textarea></td>
      <td><textarea class="visit-lab"  placeholder="Lab results...">${visit.labSummary||''}</textarea></td>
      <td><textarea class="visit-notes" placeholder="Notes...">${visit.notes||''}</textarea></td>
      <td><button class="btn-delete-row" data-table="visit" data-idx="${idx}">✕</button></td>
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
        <div class="attachment-name">${att.name||'Attachment'}</div>
        <div class="attachment-meta">${att.size||''} · ${CALC.formatDate(att.addedAt)}</div>
      </div>
      <button class="btn-att-preview" onclick="APP.previewAttachment('${att.id}','${att.data}','${att.type}','${att.name}')">View</button>
      <button class="ocr-btn" onclick="APP.ocrAttachment('${att.id}','${att.data}')" title="OCR: Extract text from image" ${isImage?'':'disabled style="opacity:.4"'}>OCR</button>
      <button class="btn-att-remove" onclick="APP.removeAttachment('${att.id}','${section}',${idx})">✕</button>
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
  function collectScans() {
    return Array.from(document.querySelectorAll('#ultraBody .scan-row')).map(tr => {
      const detailRow = tr.nextElementSibling;
      return {
        type:     tr.querySelector('.scan-type')?.value   || '',
        date:     tr.querySelector('.scan-date')?.value   || '',
        ga:       tr.querySelector('.scan-ga-display')?.textContent?.replace(/[^0-9+w d]/g,'') || '',
        operator: tr.querySelector('.scan-operator')?.value || '',
        findings: tr.querySelector('.scan-findings')?.value || detailRow?.querySelector('.scan-findings')?.value || '',
        recs:     detailRow?.querySelector('.scan-recs')?.value     || '',
        biometrics:{
          BPD:              detailRow?.querySelector('.bio-bpd')?.value       || '',
          HC:               detailRow?.querySelector('.bio-hc')?.value        || '',
          AC:               detailRow?.querySelector('.bio-ac')?.value        || '',
          FL:               detailRow?.querySelector('.bio-fl')?.value        || '',
          AFI:              detailRow?.querySelector('.bio-afi')?.value       || '',
          DVP:              detailRow?.querySelector('.bio-dvp')?.value       || '',
          EFW:              detailRow?.querySelector('.bio-efw')?.value       || '',
          placentaLocation: detailRow?.querySelector('.bio-placenta')?.value  || '',
          placentaOS:       detailRow?.querySelector('.bio-placenta-os')?.value || '',
        },
        doppler:{
          UA_PI:  detailRow?.querySelector('.dop-ua')?.value  || '',
          MCA_PI: detailRow?.querySelector('.dop-mca')?.value || '',
          DV_PI:  detailRow?.querySelector('.dop-dv')?.value  || '',
          UtA_PI: detailRow?.querySelector('.dop-uta')?.value || '',
        },
      };
    }).filter(s => s.type || s.date || s.findings);
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
  function renderDBTable(patients, search='', status='') {
    const tbody  = document.getElementById('dbTableBody');
    const empty  = document.getElementById('dbEmpty');
    const today  = new Date();
    let entries = Object.values(patients);
    if (search) { const q=search.toLowerCase(); entries=entries.filter(p=>(p.fullName||'').toLowerCase().includes(q)||(p.patientID||'').toLowerCase().includes(q)||(p.phone||'').includes(q)); }
    if (status) entries = entries.filter(p => p.patientStatus===status);
    if (!entries.length) { tbody.innerHTML=''; empty.style.display='block'; return; }
    empty.style.display='none';
    tbody.innerHTML = entries.sort((a,b)=>new Date(b.updatedAt||0)-new Date(a.updatedAt||0)).map(p => {
      const ga  = p.lmpDate ? CALC.getGA(p.lmpDate, CALC.todayISO()) : null;
      const edd = p.lmpDate ? CALC.formatDate(CALC.getEDD(p.lmpDate)) : '—';
      const riskMap = {'Low Risk':'risk-low','Middle Risk':'risk-middle','High Risk':'risk-high'};
      const riskCls = riskMap[p.riskLevel] || 'risk-low';
      return `<tr onclick="APP.openPatient('${p.patientID}')">
        <td><code style="font-size:10px">${p.patientID||''}</code></td>
        <td style="font-weight:600">${p.fullName||'—'}</td>
        <td>${p.age||'—'}</td>
        <td>${p.bloodGroup||'—'}</td>
        <td>${CALC.formatDate(p.lmpDate)}</td>
        <td>${edd}</td>
        <td style="font-family:var(--mono);font-size:11px;font-weight:600;color:var(--navy-light)">${ga?`${ga.weeks}w+${ga.days}d`:'—'}</td>
        <td>${p.pregnancyType||'—'}</td>
        <td><span class="risk-badge ${riskCls}" style="font-size:10px">${p.riskLevel||'Low Risk'}</span></td>
        <td>${statusBadge(p.patientStatus)}</td>
        <td onclick="event.stopPropagation()">
          <button class="btn-open-record" onclick="APP.openPatient('${p.patientID}')">Open</button>
          <button class="btn-delete-record" onclick="APP.confirmDeletePatient('${p.patientID}')">✕</button>
        </td>
      </tr>`;
    }).join('');
  }

  /* ── DASHBOARD ── */
  function renderDashboard(stats) {
    document.getElementById('statTotal').textContent     = stats.total;
    document.getElementById('statActive').textContent    = stats.active;
    document.getElementById('statDelivered').textContent = stats.delivered;
    document.getElementById('statIUFD').textContent      = stats.iufd;
    const total = Math.max(stats.active,1);
    [['barT1','countT1',stats.t1],['barT2','countT2',stats.t2],['barT3','countT3',stats.t3]].forEach(([bid,cid,count])=>{
      document.getElementById(bid).style.width=`${Math.round((count/total)*100)}%`;
      document.getElementById(cid).textContent=count;
    });
    const recentEl = document.getElementById('recentList');
    recentEl.innerHTML = stats.recentPatients.length
      ? stats.recentPatients.map(p=>{
          const ga=p.lmpDate?CALC.getGA(p.lmpDate):null;
          const riskCls={'Low Risk':'risk-low','Middle Risk':'risk-middle','High Risk':'risk-high'}[p.riskLevel]||'risk-low';
          return `<div class="recent-item" onclick="APP.openPatient('${p.patientID}')">
            <div><div style="font-size:12.5px;font-weight:600;color:var(--navy)">${p.fullName||'—'}</div>
              <div style="font-size:10px;color:#aaa">${p.patientID||''}</div></div>
            <div style="text-align:right">
              <div style="font-family:var(--mono);font-size:11px;color:var(--navy-light)">${ga?ga.weeks+'w':''}</div>
              <span class="risk-badge ${riskCls}" style="font-size:10px">${p.riskLevel||'Low Risk'}</span>
            </div>
          </div>`;
        }).join('')
      : '<div style="color:#aaa;font-size:12px;padding:8px">No patients yet</div>';
    const bgEl = document.getElementById('bgDistribution');
    bgEl.innerHTML = Object.entries(stats.bgCounts).sort((a,b)=>b[1]-a[1])
      .map(([bg,n])=>`<div class="bg-pill"><span class="bg-pill-type">${bg}</span><span class="bg-pill-count">${n}</span></div>`).join('')
      || '<div style="color:#aaa;font-size:12px">No data yet</div>';
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
    initCollapsible, scanRowHTML, procRowHTML, visitRowHTML,
    attachmentZoneHTML, attachmentItemHTML,
    cbcBlockHTML, labTestCellHTML, buildLabGrid,
    collectScans, collectProcs, collectVisits, collectLabs,
    renderDBTable, renderDashboard, updateStorageMeter, dopResultHTML, cprHTML,
    STATUS_COLORS,
  };
})();
