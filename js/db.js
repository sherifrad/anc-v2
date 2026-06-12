/* ═══════════════════════════════════════════════════════════
   db.js v2 — Encrypted Local Storage Database
   Autosave, backup/restore, migration-ready API layer
═══════════════════════════════════════════════════════════ */

const DB = (() => {

  const KEYS = {
    patients:   'anc_patients',
    visits:     'anc_visits',
    scans:      'anc_scans',
    procedures: 'anc_procedures',
    labs:       'anc_labs',
    attachments:'anc_attachments',
    currentID:  'anc_current_id',
    counter:    'anc_id_counter',
    settings:   'anc_settings',
    lastChange: 'anc_last_change',
    lastSave:   'anc_last_save',
  };

  /* ─── LOW-LEVEL ─── */
  function _read(key) {
    try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : null; } catch { return null; }
  }
  function _write(key, data) {
    try { localStorage.setItem(key, JSON.stringify(data)); return true; } catch { return false; }
  }

  /* ─── CHANGE TRACKING ─── */
  let _pendingChanges = false;
  function markChanged() {
    _pendingChanges = true;
    _write(KEYS.lastChange, Date.now());
  }
  function clearChanged() {
    _pendingChanges = false;
    _write(KEYS.lastSave, Date.now());
  }
  function hasPendingChanges() { return _pendingChanges; }

  /* ─── ID GENERATION ─── */
  function nextID() {
    const n = (_read(KEYS.counter) || 0) + 1;
    _write(KEYS.counter, n);
    return `ANC-${String(n).padStart(4,'0')}`;
  }

  /* ─── PATIENTS ─── */
  function getAllPatients() { return _read(KEYS.patients) || {}; }
  function getPatient(id)  { return (getAllPatients())[id] || null; }

  function savePatient(data) {
    const all = getAllPatients();
    let id = data.patientID;
    if (!id || !all[id]) {
      id = nextID();
      data.patientID  = id;
      data.createdAt  = new Date().toISOString();
    }
    data.updatedAt = new Date().toISOString();
    all[id] = data;
    _write(KEYS.patients, all);
    markChanged();
    return id;
  }

  function deletePatient(id) {
    const all = getAllPatients();
    delete all[id];
    _write(KEYS.patients, all);
    [KEYS.visits, KEYS.scans, KEYS.procedures, KEYS.labs, KEYS.attachments].forEach(k => {
      const obj = _read(k) || {};
      delete obj[id];
      _write(k, obj);
    });
    markChanged();
  }

  /* ─── VISITS ─── */
  function getVisits(pid)           { return (_read(KEYS.visits)||{})[pid] || []; }
  function saveVisits(pid, arr)     { const o=_read(KEYS.visits)||{}; o[pid]=arr; _write(KEYS.visits,o); markChanged(); }

  /* ─── SCANS ─── */
  function getScans(pid)            { return (_read(KEYS.scans)||{})[pid] || []; }
  function saveScans(pid, arr)      { const o=_read(KEYS.scans)||{}; o[pid]=arr; _write(KEYS.scans,o); markChanged(); }

  /* ─── PROCEDURES ─── */
  function getProcedures(pid)       { return (_read(KEYS.procedures)||{})[pid] || []; }
  function saveProcedures(pid, arr) { const o=_read(KEYS.procedures)||{}; o[pid]=arr; _write(KEYS.procedures,o); markChanged(); }

  /* ─── LABS ─── */
  function getLabs(pid)             { return (_read(KEYS.labs)||{})[pid] || null; }
  function saveLabs(pid, data)      { const o=_read(KEYS.labs)||{}; o[pid]=data; _write(KEYS.labs,o); markChanged(); }

  /* ─── ATTACHMENTS (base64 files) ─── */
  function getAttachments(pid)      { return (_read(KEYS.attachments)||{})[pid] || []; }
  function saveAttachments(pid, arr){ const o=_read(KEYS.attachments)||{}; o[pid]=arr; _write(KEYS.attachments,o); markChanged(); }
  function addAttachment(pid, attachment) {
    const arr = getAttachments(pid);
    attachment.id  = `att_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
    attachment.addedAt = new Date().toISOString();
    arr.push(attachment);
    saveAttachments(pid, arr);
    return attachment.id;
  }
  function removeAttachment(pid, attId) {
    const arr = getAttachments(pid).filter(a => a.id !== attId);
    saveAttachments(pid, arr);
  }

  /* ─── SETTINGS ─── */
  function getSettings()         { return _read(KEYS.settings) || {}; }
  function saveSetting(k, v)     { const s=getSettings(); s[k]=v; _write(KEYS.settings,s); }

  /* ─── CURRENT SESSION ─── */
  function setCurrentPatient(id) { _write(KEYS.currentID, id); }
  function getCurrentPatient()   { return _read(KEYS.currentID); }

  /* ─── EXPORT FULL BACKUP ─── */
  function exportAll() {
    const payload = {
      exportedAt: new Date().toISOString(),
      version: '2.0',
      patients:    getAllPatients(),
      visits:      _read(KEYS.visits)      || {},
      scans:       _read(KEYS.scans)       || {},
      procedures:  _read(KEYS.procedures)  || {},
      labs:        _read(KEYS.labs)        || {},
      attachments: _read(KEYS.attachments) || {},
      settings:    getSettings(),
    };
    return JSON.stringify(payload, null, 2);
  }

  function importAll(jsonStr) {
    try {
      const d = JSON.parse(jsonStr);
      if (!d.patients) throw new Error('Invalid backup');
      _write(KEYS.patients,    d.patients);
      if (d.visits)      _write(KEYS.visits,      d.visits);
      if (d.scans)       _write(KEYS.scans,        d.scans);
      if (d.procedures)  _write(KEYS.procedures,   d.procedures);
      if (d.labs)        _write(KEYS.labs,          d.labs);
      if (d.attachments) _write(KEYS.attachments,  d.attachments);
      if (d.settings)    _write(KEYS.settings,      d.settings);
      markChanged();
      return true;
    } catch(e) { console.error('Import error',e); return false; }
  }

  function replaceClinicalData(snapshot) {
    if (!snapshot?.patients || typeof snapshot.patients !== 'object') {
      throw new Error('A complete clinical snapshot is required');
    }
    const patientIds = new Set(Object.keys(snapshot.patients));
    const keepKnownPatients = collection => Object.fromEntries(
      Object.entries(collection || {}).filter(([patientId]) =>
        patientIds.has(patientId)
      )
    );

    _write(KEYS.patients, snapshot.patients);
    _write(KEYS.visits, keepKnownPatients(snapshot.visits));
    _write(KEYS.scans, keepKnownPatients(snapshot.scans));
    _write(KEYS.procedures, keepKnownPatients(snapshot.procedures));
    _write(KEYS.labs, keepKnownPatients(snapshot.labs));
    _write(KEYS.attachments, keepKnownPatients(_read(KEYS.attachments) || {}));

    const currentId = getCurrentPatient();
    if (currentId && !patientIds.has(currentId)) {
      localStorage.removeItem(KEYS.currentID);
    }
    clearChanged();
  }

  /* ─── STATS ─── */
  function getStats() {
    const patients = Object.values(getAllPatients());
    const today    = new Date();
    let t1=0,t2=0,t3=0;
    const statusCounts={}, bgCounts={};

    patients.forEach(p => {
      const s = p.patientStatus || 'Unknown';
      statusCounts[s] = (statusCounts[s]||0)+1;
      const bg = p.bloodGroup || 'Unknown';
      bgCounts[bg] = (bgCounts[bg]||0)+1;
      if (p.lmpDate && p.patientStatus === 'Active Follow-up') {
        const ga = Math.floor((today - new Date(p.lmpDate))/(7*864e5));
        if (ga<14) t1++; else if (ga<28) t2++; else t3++;
      }
    });

    const delivered = (statusCounts['Delivered by CS']||0)+(statusCounts['Delivered by SVD']||0);
    const iufd      = (statusCounts['IUFD']||0)+(statusCounts['Abortion']||0);

    return {
      total: patients.length,
      active: statusCounts['Active Follow-up']||0,
      delivered, iufd, t1, t2, t3,
      statusCounts, bgCounts,
      recentPatients: patients
        .filter(p=>p.updatedAt)
        .sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt))
        .slice(0,8),
    };
  }

  /* ─── STORAGE USAGE ─── */
  function getStorageInfo() {
    let total = 0;
    Object.values(KEYS).forEach(k => {
      const v = localStorage.getItem(k);
      if (v) total += v.length * 2; // approx bytes (UTF-16)
    });
    const used = (total / 1024).toFixed(1);
    const avail = '5,120'; // ~5MB typical localStorage limit
    return { usedKB: used, availKB: avail, pct: Math.round((total/1024/5120)*100) };
  }

  return {
    getAllPatients, getPatient, savePatient, deletePatient,
    getVisits, saveVisits,
    getScans, saveScans,
    getProcedures, saveProcedures,
    getLabs, saveLabs,
    getAttachments, saveAttachments, addAttachment, removeAttachment,
    getSettings, saveSetting,
    setCurrentPatient, getCurrentPatient,
    exportAll, importAll, replaceClinicalData, getStats, getStorageInfo,
    markChanged, clearChanged, hasPendingChanges,
  };
})();
