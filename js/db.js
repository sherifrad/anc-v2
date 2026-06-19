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
    problems:   'anc_problems',
    medications:'anc_medications',
    attachments:'anc_attachments',
    currentID:  'anc_current_id',
    counter:    'anc_id_counter',
    settings:   'anc_settings',
    lastChange: 'anc_last_change',
    lastSave:   'anc_last_save',
    auditEvents:'anc_audit_events_v1',
    medicationMemory:'anc_medication_memory_v1',
  };

  /* ─── LOW-LEVEL ─── */
  function _read(key) {
    try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : null; } catch { return null; }
  }

  class StorageWriteError extends Error {
    constructor(key, operation, cause) {
      const reason = storageWriteReason(cause, operation);
      super(`Local storage write failed for ${key}: ${reason}`);
      this.name = 'StorageWriteError';
      this.key = key;
      this.operation = operation;
      this.reason = reason;
      this.cause = cause;
    }
  }

  class AuditWriteError extends Error {
    constructor(cause) {
      const reason = cause?.reason || cause?.message || 'audit storage failed';
      super(`Audit event could not be stored: ${reason}`);
      this.name = 'AuditWriteError';
      this.reason = reason;
      this.cause = cause;
    }
  }

  function storageWriteReason(error, operation) {
    if (operation === 'serialize') return 'data could not be serialized';
    if (!error) return 'browser storage failed';
    if (
      error.name === 'QuotaExceededError'
      || error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
      || error.code === 22
      || error.code === 1014
    ) {
      return 'storage quota exceeded';
    }
    if (error.name === 'SecurityError') return 'browser storage is blocked';
    return error.message || error.name || 'browser storage failed';
  }

  function _write(key, data) {
    let serialized;
    try {
      serialized = JSON.stringify(data);
    } catch (error) {
      throw new StorageWriteError(key, 'serialize', error);
    }
    try {
      localStorage.setItem(key, serialized);
      return true;
    } catch (error) {
      throw new StorageWriteError(key, 'write', error);
    }
  }

  function auditID() {
    const random = Math.random().toString(36).slice(2, 9);
    return `audit_${Date.now()}_${random}`;
  }

  function normalizeAuditEvent(event) {
    return {
      eventID: event?.eventID || auditID(),
      timestamp: event?.timestamp || new Date().toISOString(),
      actor: event?.actor || 'clinic-user',
      operation: event?.operation || 'unknown',
      patientID: event?.patientID || '',
      patientUuid: event?.patientUuid || '',
      entityType: event?.entityType || 'system',
      entityID: event?.entityID || '',
      reason: event?.reason || '',
      summary: event?.summary || '',
      status: event?.status || 'success',
      beforeHash: event?.beforeHash || '',
      afterHash: event?.afterHash || '',
    };
  }

  function appendAuditEvent(event) {
    const events = getAuditEvents();
    events.push(normalizeAuditEvent(event));
    try {
      _write(KEYS.auditEvents, events);
    } catch (error) {
      throw new AuditWriteError(error);
    }
    return events[events.length - 1];
  }

  function getAuditEvents(filter=null) {
    const events = _read(KEYS.auditEvents) || [];
    if (!filter) return Array.isArray(events) ? events : [];
    return (Array.isArray(events) ? events : []).filter(event =>
      (!filter.patientID || event.patientID === filter.patientID)
      && (!filter.operation || event.operation === filter.operation)
      && (!filter.entityType || event.entityType === filter.entityType)
    );
  }

  function exportAuditEvents() {
    return getAuditEvents();
  }

  function mergeAuditEvents(importedEvents) {
    if (!Array.isArray(importedEvents) || !importedEvents.length) return;
    const existing = getAuditEvents();
    const seen = new Set(existing.map(event => event.eventID).filter(Boolean));
    const merged = existing.slice();
    importedEvents.forEach(event => {
      const normalized = normalizeAuditEvent(event);
      if (seen.has(normalized.eventID)) return;
      seen.add(normalized.eventID);
      merged.push(normalized);
    });
    try {
      _write(KEYS.auditEvents, merged);
    } catch (error) {
      throw new AuditWriteError(error);
    }
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

  function generatePatientUuid() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    const random = Math.random().toString(36).slice(2, 12);
    return `local-${Date.now()}-${random}`;
  }

  function ensurePatientUuid(patient) {
    if (!patient || typeof patient !== 'object') return patient;
    if (patient.patientUuid) return patient;
    return { ...patient, patientUuid: generatePatientUuid() };
  }

  function normalizePatientMap(map, { persist=false } = {}) {
    const source = map && typeof map === 'object' ? map : {};
    let changed = false;
    const normalized = {};
    Object.entries(source).forEach(([key, patient]) => {
      if (!patient || typeof patient !== 'object') return;
      const withId = { ...patient, patientID: patient.patientID || key };
      const withUuid = ensurePatientUuid(withId);
      if (withUuid !== patient || withUuid.patientID !== patient.patientID) changed = true;
      normalized[key] = withUuid;
    });
    if (persist && changed) _write(KEYS.patients, normalized);
    return normalized;
  }

  let _lastImportWarnings = [];

  /* ─── PATIENTS ─── */
  function getAllPatients() { return normalizePatientMap(_read(KEYS.patients), { persist:true }); }
  function getPatient(id)  { return (getAllPatients())[id] || null; }

  function savePatient(data) {
    const all = getAllPatients();
    let id = data.patientID;
    if (!id || !all[id]) {
      id = nextID();
      data.patientID  = id;
      data.createdAt  = new Date().toISOString();
    } else if (all[id]?.archiveAudit && !data.archiveAudit) {
      data.archiveAudit = all[id].archiveAudit;
    }
    data = ensurePatientUuid(data);
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
    [KEYS.visits, KEYS.scans, KEYS.procedures, KEYS.labs, KEYS.problems, KEYS.medications, KEYS.attachments].forEach(k => {
      const obj = _read(k) || {};
      delete obj[id];
      _write(k, obj);
    });
    markChanged();
  }

  function isArchived(patient) {
    return Boolean(patient?.isArchived);
  }

  function archiveEvent(operation, patientID, actor, reason='') {
    const event = {
      operation,
      patientID,
      timestamp: new Date().toISOString(),
      actor: actor || 'clinic-user',
    };
    if (reason) event.reason = reason;
    return event;
  }

  function archivePatient(id, reason, actor='clinic-user') {
    const trimmedReason = String(reason || '').trim();
    if (!trimmedReason) throw new Error('Archive reason is required');
    const all = getAllPatients();
    const patient = all[id];
    if (!patient) throw new Error('Patient record not found');
    const timestamp = new Date().toISOString();
    all[id] = {
      ...patient,
      isArchived: true,
      archivedAt: timestamp,
      archivedBy: actor || 'clinic-user',
      archiveReason: trimmedReason,
      archiveAudit: [
        ...(Array.isArray(patient.archiveAudit) ? patient.archiveAudit : []),
        archiveEvent('archive', id, actor, trimmedReason),
      ],
      updatedAt: timestamp,
    };
    _write(KEYS.patients, all);
    markChanged();
    return all[id];
  }

  function restorePatient(id, actor='clinic-user') {
    const all = getAllPatients();
    const patient = all[id];
    if (!patient) throw new Error('Patient record not found');
    const timestamp = new Date().toISOString();
    all[id] = {
      ...patient,
      isArchived: false,
      archivedAt: '',
      archivedBy: '',
      archiveReason: '',
      archiveAudit: [
        ...(Array.isArray(patient.archiveAudit) ? patient.archiveAudit : []),
        archiveEvent('restore', id, actor),
      ],
      updatedAt: timestamp,
    };
    _write(KEYS.patients, all);
    markChanged();
    return all[id];
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

  /* ─── PROBLEM LIST ─── */
  const PROBLEM_STATUSES = ['Active','Monitoring','Resolved','Historical'];
  const PROBLEM_SEVERITIES = ['','Low','Moderate','High'];

  function problemID() {
    const random = Math.random().toString(36).slice(2, 8);
    return `prob_${Date.now()}_${random}`;
  }

  function normalizeProblem(record, patient={}) {
    const timestamp = new Date().toISOString();
    const status = PROBLEM_STATUSES.includes(record?.status)
      ? record.status
      : 'Active';
    const severity = PROBLEM_SEVERITIES.includes(record?.severity)
      ? record.severity
      : '';
    return {
      problemID: record?.problemID || problemID(),
      patientID: patient?.patientID || record?.patientID || '',
      patientUuid: patient?.patientUuid || record?.patientUuid || '',
      title: record?.title || record?.problem || '',
      category: record?.category || '',
      status,
      severity,
      onsetDate: record?.onsetDate || '',
      resolutionDate: record?.resolutionDate || '',
      notes: record?.notes || '',
      createdAt: record?.createdAt || timestamp,
      updatedAt: timestamp,
    };
  }

  function getProblems(pid) {
    const patient = getPatient(pid) || { patientID: pid };
    return ((_read(KEYS.problems)||{})[pid] || []).map(record =>
      normalizeProblem(record, patient)
    );
  }

  function saveProblems(pid, problems) {
    const patient = getPatient(pid) || { patientID: pid };
    const normalized = (Array.isArray(problems) ? problems : [])
      .map(record => normalizeProblem(record, patient));
    const o = _read(KEYS.problems) || {};
    o[pid] = normalized;
    _write(KEYS.problems, o);
    markChanged();
  }

  function getActiveProblems(pid) {
    return getProblems(pid).filter(record =>
      record.status === 'Active' || record.status === 'Monitoring'
    );
  }

  /* ─── MEDICATIONS ─── */
  function medicationID() {
    const random = Math.random().toString(36).slice(2, 8);
    return `med_${Date.now()}_${random}`;
  }

  function normalizeMedication(record, patient={}) {
    const timestamp = new Date().toISOString();
    const status = ['Active','Completed','Stopped','Suspended'].includes(record?.status)
      ? record.status
      : 'Active';
    return {
      medicationID: record?.medicationID || medicationID(),
      patientID: patient?.patientID || record?.patientID || '',
      patientUuid: patient?.patientUuid || record?.patientUuid || '',
      drugName: record?.drugName || '',
      genericName: record?.genericName || '',
      dose: record?.dose || '',
      unit: record?.unit || '',
      route: record?.route || '',
      frequency: record?.frequency || '',
      indication: record?.indication || '',
      startDate: record?.startDate || '',
      stopDate: record?.stopDate || '',
      duration: record?.duration || '',
      prescribedBy: record?.prescribedBy || '',
      status,
      notes: record?.notes || '',
      createdAt: record?.createdAt || timestamp,
      updatedAt: timestamp,
    };
  }

  function getMedications(pid) {
    const patient = getPatient(pid) || { patientID: pid };
    return ((_read(KEYS.medications)||{})[pid] || []).map(record =>
      normalizeMedication(record, patient)
    );
  }

  function saveMedications(pid, medications) {
    const patient = getPatient(pid) || { patientID: pid };
    const normalized = (Array.isArray(medications) ? medications : [])
      .map(record => normalizeMedication(record, patient));
    const o = _read(KEYS.medications) || {};
    o[pid] = normalized;
    _write(KEYS.medications, o);
    markChanged();
  }

  function getActiveMedications(pid) {
    return getMedications(pid).filter(record => record.status === 'Active');
  }

  function normalizeMedicationName(value) {
    return String(value || '').toLowerCase().trim().replace(/\s+/g, ' ');
  }

  function medicationPatternKey(pattern={}) {
    return [
      normalizeMedicationName(pattern.drugName),
      normalizeMedicationName(pattern.genericName),
      normalizeMedicationName(pattern.doseAmount),
      normalizeMedicationName(pattern.unit),
      normalizeMedicationName(pattern.timesPerDay),
      normalizeMedicationName(pattern.durationDays),
    ].join('|');
  }

  function normalizeMedicationPattern(pattern={}) {
    return {
      patternID: pattern.patternID || `medpat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      drugName: pattern.drugName || '',
      genericName: pattern.genericName || '',
      doseAmount: pattern.doseAmount || '',
      unit: pattern.unit || '',
      timesPerDay: pattern.timesPerDay || '',
      durationDays: pattern.durationDays || '',
      route: pattern.route || '',
      indication: pattern.indication || '',
      notes: pattern.notes || '',
      createdAt: pattern.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  function getMedicationMemory() {
    const memory = _read(KEYS.medicationMemory) || [];
    return Array.isArray(memory) ? memory.map(normalizeMedicationPattern) : [];
  }

  function findSimilarMedicationPattern(pattern) {
    const normalized = normalizeMedicationPattern(pattern);
    const key = medicationPatternKey(normalized);
    return getMedicationMemory().find(item =>
      medicationPatternKey(item) === key
      || (
        normalizeMedicationName(item.drugName) === normalizeMedicationName(normalized.drugName)
        && normalizeMedicationName(item.genericName) === normalizeMedicationName(normalized.genericName)
      )
    ) || null;
  }

  function saveMedicationPattern(pattern, mode='save-new') {
    const normalized = normalizeMedicationPattern(pattern);
    if (!normalizeMedicationName(normalized.drugName)) {
      throw new Error('Medication pattern requires a drug name');
    }
    const memory = getMedicationMemory();
    const similar = findSimilarMedicationPattern(normalized);
    let next;
    if (mode === 'update-existing' && similar) {
      next = memory.map(item =>
        item.patternID === similar.patternID
          ? { ...normalized, patternID: similar.patternID, createdAt: similar.createdAt }
          : item
      );
    } else {
      next = [...memory, normalized];
    }
    // TODO: Add a medication pattern manager for editing, deleting wrong spellings, and merging duplicate patterns.
    _write(KEYS.medicationMemory, next);
    return mode === 'update-existing' && similar
      ? next.find(item => item.patternID === similar.patternID)
      : normalized;
  }

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
      problems:    _read(KEYS.problems)    || {},
      medications: _read(KEYS.medications) || {},
      attachments: _read(KEYS.attachments) || {},
      settings:    getSettings(),
      auditEvents: exportAuditEvents(),
    };
    return JSON.stringify(payload, null, 2);
  }

  function getLastImportWarnings() {
    return _lastImportWarnings.slice();
  }

  function withoutPatientKeys(collection, patientIDs) {
    const source = collection && typeof collection === 'object' ? collection : {};
    const filtered = { ...source };
    patientIDs.forEach(id => delete filtered[id]);
    return filtered;
  }

  function preserveConflictingLocalCollection(importedCollection, existingCollection, conflictIDs) {
    return {
      ...withoutPatientKeys(importedCollection, conflictIDs),
      ...Object.fromEntries(
        conflictIDs
          .filter(id => existingCollection && Object.prototype.hasOwnProperty.call(existingCollection, id))
          .map(id => [id, existingCollection[id]])
      ),
    };
  }

  function importAll(jsonStr) {
    _lastImportWarnings = [];
    let d;
    try {
      d = JSON.parse(jsonStr);
    } catch(e) {
      console.error('Import error',e);
      return false;
    }
    if (!d.patients) return false;
    const existingPatients = getAllPatients();
    const importedPatients = normalizePatientMap(d.patients);
    const conflictIDs = Object.keys(importedPatients).filter(id => {
      const existing = existingPatients[id];
      const incoming = importedPatients[id];
      const rawIncomingUuid = d.patients?.[id]?.patientUuid || '';
      return Boolean(
        existing?.patientUuid
        && incoming?.patientUuid
        && (!rawIncomingUuid || existing.patientUuid !== rawIncomingUuid)
      );
    });
    if (conflictIDs.length) {
      _lastImportWarnings = conflictIDs.map(id =>
        `Skipped imported patient ${id}: same visible MRN exists locally with a different internal UUID.`
      );
      console.warn('Import skipped patient MRN conflicts:', conflictIDs);
    }

    const conflictSet = new Set(conflictIDs);
    const patientsToWrite = {
      ...withoutPatientKeys(importedPatients, conflictSet),
      ...Object.fromEntries(conflictIDs.map(id => [id, existingPatients[id]])),
    };

    _write(KEYS.patients, patientsToWrite);
    const existingVisits = _read(KEYS.visits) || {};
    const existingScans = _read(KEYS.scans) || {};
    const existingProcedures = _read(KEYS.procedures) || {};
    const existingLabs = _read(KEYS.labs) || {};
    const existingProblems = _read(KEYS.problems) || {};
    const existingMedications = _read(KEYS.medications) || {};
    const existingAttachments = _read(KEYS.attachments) || {};
    if (d.visits)      _write(KEYS.visits,      preserveConflictingLocalCollection(d.visits, existingVisits, conflictIDs));
    if (d.scans)       _write(KEYS.scans,       preserveConflictingLocalCollection(d.scans, existingScans, conflictIDs));
    if (d.procedures)  _write(KEYS.procedures,  preserveConflictingLocalCollection(d.procedures, existingProcedures, conflictIDs));
    if (d.labs)        _write(KEYS.labs,        preserveConflictingLocalCollection(d.labs, existingLabs, conflictIDs));
    if (d.problems)    _write(KEYS.problems,    preserveConflictingLocalCollection(d.problems, existingProblems, conflictIDs));
    if (d.medications) _write(KEYS.medications, preserveConflictingLocalCollection(d.medications, existingMedications, conflictIDs));
    if (d.attachments) _write(KEYS.attachments, preserveConflictingLocalCollection(d.attachments, existingAttachments, conflictIDs));
    if (d.settings)    _write(KEYS.settings,      d.settings);
    markChanged();
    if (d.auditEvents) {
      try {
        mergeAuditEvents(d.auditEvents);
      } catch (error) {
        console.warn('Imported audit events could not be merged', error);
      }
    }
    return true;
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
    _write(KEYS.problems, keepKnownPatients(snapshot.problems));
    _write(KEYS.medications, keepKnownPatients(snapshot.medications));
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
    getAllPatients, getPatient, savePatient, deletePatient, isArchived, archivePatient, restorePatient,
    getVisits, saveVisits,
    getScans, saveScans,
    getProcedures, saveProcedures,
    getLabs, saveLabs,
    getProblems, saveProblems, getActiveProblems, normalizeProblem,
    getMedications, saveMedications, getActiveMedications, normalizeMedication,
    getMedicationMemory, saveMedicationPattern, findSimilarMedicationPattern,
    getAttachments, saveAttachments, addAttachment, removeAttachment,
    getSettings, saveSetting,
    setCurrentPatient, getCurrentPatient,
    exportAll, importAll, replaceClinicalData, getStats, getStorageInfo,
    generatePatientUuid, ensurePatientUuid, getLastImportWarnings,
    appendAuditEvent, getAuditEvents, exportAuditEvents,
    markChanged, clearChanged, hasPendingChanges,
    StorageWriteError, AuditWriteError,
  };
})();
