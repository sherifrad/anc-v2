/* ═══════════════════════════════════════════════════════
   supabase.js — Zero-Knowledge Cloud Sync
   Data encrypted client-side BEFORE leaving device
   Project: anc-emr | Region: eu-west-1
═══════════════════════════════════════════════════════ */
const SUPA = (() => {

  const SUPA_URL = 'https://tfplewrzjlbugdgiuoum.supabase.co';
  const SUPA_KEY = 'sb_publishable_rnm4S-EW9KwMidxD1aTxww_UVUOlhFI';
  const RELATED_TABLES = new Set(['visits', 'scans', 'procedures', 'labs']);
  const PHASE2_RUNTIME_ENABLED = true;
  let phase2Adapter = null;

  function requirePhase2Adapter() {
    if (!PHASE2_RUNTIME_ENABLED || !phase2Adapter) {
      throw new Error('Phase 2 cloud runtime is not active');
    }
    return phase2Adapter;
  }

  function configurePhase2Adapter(adapter) {
    if (!PHASE2_RUNTIME_ENABLED) {
      throw new Error('Phase 2 cloud runtime is disabled');
    }
    phase2Adapter = adapter;
  }

  function requireRelatedTable(table) {
    if (!RELATED_TABLES.has(table)) {
      throw new Error('Unsupported related-data table');
    }
    return table;
  }

  /* ── DEVICE ID ── */
  function getDeviceID() {
    let id = localStorage.getItem('anc_device_id');
    if (!id) { id = 'dev_' + crypto.randomUUID(); localStorage.setItem('anc_device_id', id); }
    return id;
  }

  /* ── BASE API ── */
  function friendlyError(status, err) {
    const detail = err.message || err.msg || err.details || err.hint || '';
    if (status === 401) {
      return `Your secure Supabase session was rejected (401). Sign in again and complete authenticator verification. ${detail}`.trim();
    }
    if (status === 403) {
      return `Supabase blocked this action (403). Check Row Level Security policies for this table. ${detail}`.trim();
    }
    if (status === 404) {
      return `Supabase table or endpoint not found (404). Check that the required tables exist. ${detail}`.trim();
    }
    return detail || `API error ${status}`;
  }

  async function api(method, path, body=null, prefer='return=representation') {
    const accessToken = await AUTH.getAccessToken();
    const headers = {
      'Content-Type': 'application/json',
      'apikey': SUPA_KEY,
      'Authorization': `Bearer ${accessToken}`,
      'Prefer': prefer,
    };

    const opts = {
      method,
      headers,
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(friendlyError(res.status, err));
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  /* ── ENCRYPT / DECRYPT ── */
  async function enc(data) {
    const json = typeof data === 'string' ? data : JSON.stringify(data);
    const encrypted = await CRYPTO.encrypt(json);
    return JSON.stringify(encrypted);
  }

  async function dec(str) {
    if (!str) return null;
    const parsed = typeof str === 'string' ? JSON.parse(str) : str;
    const result = await CRYPTO.decrypt(parsed);
    return typeof result === 'string' ? JSON.parse(result) : result;
  }

  /* ── AUDIT LOG ── */
  async function log(type, code=null) {
    try {
      await api('POST', 'audit_log', {
        event_type:   type,
        patient_code: code,
        device_hint:  navigator.userAgent.substring(0, 100),
      });
    } catch(e) { console.warn('Audit log failed (non-critical):', e.message); }
  }

  /* ── GET SUPABASE UUID FOR PATIENT ── */
  async function getPatientUUID(code) {
    const rows = await api('GET', `patients?patient_code=eq.${encodeURIComponent(code)}&select=id`);
    return rows?.[0]?.id || null;
  }

  /* ════════════════════
     PATIENTS
  ════════════════════ */
  async function savePatient(data) {
    if (PHASE2_RUNTIME_ENABLED) {
      await requirePhase2Adapter().savePatient(data);
      await log('write', data.patientID);
      return;
    }
    if (!CRYPTO.isUnlocked()) throw new Error('App must be unlocked to sync');
    const payload = {
      patient_code:   data.patientID,
      encrypted_data: await enc(data),
      schema_version: '2.0',
    };
    await api('POST', 'patients?on_conflict=patient_code', payload, 'resolution=merge-duplicates,return=representation');
    await log('write', data.patientID);
  }

  async function getAllPatients() {
    if (PHASE2_RUNTIME_ENABLED) {
      const result = await requirePhase2Adapter().getAllPatients();
      await log('read');
      return result;
    }
    if (!CRYPTO.isUnlocked()) throw new Error('App must be unlocked to sync');
    const rows = await api('GET', 'patients?select=patient_code,encrypted_data&order=updated_at.desc');
    if (!rows?.length) return {};
    const result = {};
    for (const row of rows) {
      try {
        const d = await dec(row.encrypted_data);
        if (d) result[d.patientID] = d;
      } catch(e) { console.error('Decrypt failed for patient:', row.patient_code, e.message); }
    }
    await log('read');
    return result;
  }

  async function getPatient(patientCode) {
    if (PHASE2_RUNTIME_ENABLED) {
      const adapter = requirePhase2Adapter();
      const patient = adapter.getPatient
        ? await adapter.getPatient(patientCode)
        : (await adapter.getAllPatients())[patientCode] || null;
      await log('read', patientCode);
      return patient;
    }
    if (!CRYPTO.isUnlocked()) throw new Error('App must be unlocked to sync');
    const rows = await api(
      'GET',
      `patients?patient_code=eq.${encodeURIComponent(patientCode)}&select=patient_code,encrypted_data`,
    );
    if (!rows?.length) return null;
    const patient = await dec(rows[0].encrypted_data);
    await log('read', patientCode);
    return patient;
  }

  async function deletePatientCloud(code) {
    if (PHASE2_RUNTIME_ENABLED) {
      await requirePhase2Adapter().deletePatient(code);
    } else {
      await api('DELETE', `patients?patient_code=eq.${encodeURIComponent(code)}`);
    }
    await log('delete', code);
  }

  /* ════════════════════
     RELATED DATA
  ════════════════════ */
  async function saveRelated(table, patientCode, dataPayload) {
    table = requireRelatedTable(table);
    if (PHASE2_RUNTIME_ENABLED) {
      return requirePhase2Adapter().saveRelated(table, patientCode, dataPayload);
    }
    const pid = await getPatientUUID(patientCode);
    if (!pid) throw new Error(`Patient ${patientCode} not found in cloud — push patient first`);
    // Delete existing then insert fresh
    await api('DELETE', `${table}?patient_id=eq.${pid}`);
    if (dataPayload !== null && dataPayload !== undefined) {
      await api('POST', table, {
        patient_id:     pid,
        encrypted_data: await enc(dataPayload),
      });
    }
  }

  async function getRelated(table, patientCode) {
    table = requireRelatedTable(table);
    if (PHASE2_RUNTIME_ENABLED) {
      return requirePhase2Adapter().getRelated(table, patientCode);
    }
    const pid = await getPatientUUID(patientCode);
    if (!pid) return null;
    const rows = await api('GET', `${table}?patient_id=eq.${pid}&select=encrypted_data`);
    if (!rows?.length) return null;
    return await dec(rows[0].encrypted_data);
  }

  /* ════════════════════
     FULL SYNC — PUSH
  ════════════════════ */
  async function pushToCloud(onProgress=null) {
    if (!PHASE2_RUNTIME_ENABLED && !CRYPTO.isUnlocked()) {
      throw new Error('App must be unlocked to sync');
    }
    const all  = DB.getAllPatients();
    const ids  = Object.keys(all);
    let done   = 0;
    const errors = [];

    for (const id of ids) {
      try {
        await savePatient(all[id]);
        await saveRelated('visits',     id, DB.getVisits(id));
        await saveRelated('scans',      id, DB.getScans(id));
        await saveRelated('procedures', id, DB.getProcedures(id));
        await saveRelated('labs',       id, DB.getLabs(id));
        done++;
        onProgress?.(done, ids.length);
      } catch(e) {
        errors.push(`${id}: ${e.message}`);
        console.error('Push failed for', id, e);
        if (PHASE2_RUNTIME_ENABLED) break;
      }
    }
    return { total: ids.length, synced: done, errors };
  }

  /* ════════════════════
     FULL SYNC — PULL
  ════════════════════ */
  async function pullFromCloud(onProgress=null) {
    if (!PHASE2_RUNTIME_ENABLED && !CRYPTO.isUnlocked()) {
      throw new Error('App must be unlocked to sync');
    }
    const cloud = await getAllPatients();
    const ids   = Object.keys(cloud);
    let done    = 0;

    for (const id of ids) {
      try {
        const local     = DB.getPatient(id);
        const cloudDate = new Date(cloud[id].updatedAt || 0);
        const localDate = new Date(local?.updatedAt    || 0);

        if (!local || cloudDate > localDate) {
          DB.savePatient(cloud[id]);
          const visits = await getRelated('visits',     id);
          const scans  = await getRelated('scans',      id);
          const procs  = await getRelated('procedures', id);
          const labs   = await getRelated('labs',       id);
          if (visits) DB.saveVisits(id, visits);
          if (scans)  DB.saveScans(id,  scans);
          if (procs)  DB.saveProcedures(id, procs);
          if (labs)   DB.saveLabs(id,   labs);
        }
        done++;
        onProgress?.(done, ids.length);
      } catch(e) { console.error('Pull failed for', id, e); }
    }
    return { total: ids.length, synced: done };
  }

  async function reconcilePhase2Local(onProgress=null) {
    if (!PHASE2_RUNTIME_ENABLED) {
      throw new Error('Phase 2 reconciliation is unavailable');
    }
    const patients = await getAllPatients();
    const ids = Object.keys(patients);
    const snapshot = {
      patients,
      visits: {},
      scans: {},
      procedures: {},
      labs: {},
    };
    let done = 0;

    for (const id of ids) {
      const visits = await getRelated('visits', id);
      const scans = await getRelated('scans', id);
      const procedures = await getRelated('procedures', id);
      const labs = await getRelated('labs', id);
      if (visits != null) snapshot.visits[id] = visits;
      if (scans != null) snapshot.scans[id] = scans;
      if (procedures != null) snapshot.procedures[id] = procedures;
      if (labs != null) snapshot.labs[id] = labs;
      done++;
      onProgress?.(done, ids.length);
    }

    DB.replaceClinicalData(snapshot);
    return { total: ids.length, synced: done };
  }

  /* ── CONNECTIVITY CHECK ── */
  async function isOnline() {
    try {
      if (AUTH.getSessionKind?.() === 'temporary') {
        const { data, error } = await AUTH.getClient().functions.invoke(
          'phase3-delegated-gateway',
          { body: { operation: 'bootstrap' } },
        );
        return !error && data?.status === 'success';
      }
      const accessToken = await AUTH.getAccessToken();
      const table = PHASE2_RUNTIME_ENABLED
        ? 'phase2_patient_records'
        : 'patients';
      const res = await fetch(`${SUPA_URL}/rest/v1/${table}?select=id&limit=1`, {
        headers: {
          'apikey': SUPA_KEY,
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch { return false; }
  }

  return {
    savePatient, getPatient, getAllPatients, deletePatientCloud,
    saveRelated, getRelated,
    pushToCloud, pullFromCloud, reconcilePhase2Local,
    isOnline, log, getDeviceID,
    configurePhase2Adapter,
    isPhase2RuntimeEnabled: () => PHASE2_RUNTIME_ENABLED,
  };
})();
