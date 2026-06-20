/* ═══════════════════════════════════════════════════════════
   app.js v2 — Main Application Controller
   ANC Follow-Up System — 2nd Edition
═══════════════════════════════════════════════════════════ */

const APP = (() => {

  /* ── STATE ── */
  let currentPatientID = null;
  let _lastHash        = null;
  let _autoSaveTimer   = null;
  let _chartModal      = null;
  let _currentScans    = [];
  let _labsCustom      = { t1:[], t2:[], t3:[] };
  let _chartTabSetter    = () => {};
  let _chartSourceSetter = () => {};
  let _appBooted         = false;
  let _phase2Runtime      = null;
  let _phase3AccessUI     = null;
  let _temporaryPermissions = null;
  let _recordMode = 'edit';
  let _previousPregnancies = [];
  let _archivedRecordMode = false;
  const _autosaveAuditAtByPatient = {};
  let _medicationHelperWatchTimer = null;
  let _medicationHelperSignature = '';
  const SAFETY_STATES = Object.freeze({
    NORMAL:'normal',
    IMPORT_APPLYING:'import-applying',
    IMPORT_RECOVERY:'import-recovery-required',
    TRANSITION_RECOVERY:'transition-recovery-required',
    RELOAD_RECOVERING:'reload-recovering',
  });
  const SAFETY_TRANSITIONS = Object.freeze({
    [SAFETY_STATES.NORMAL]:new Set([
      SAFETY_STATES.IMPORT_APPLYING,
      SAFETY_STATES.TRANSITION_RECOVERY,
      SAFETY_STATES.RELOAD_RECOVERING,
    ]),
    [SAFETY_STATES.IMPORT_APPLYING]:new Set([
      SAFETY_STATES.NORMAL,
      SAFETY_STATES.IMPORT_RECOVERY,
    ]),
    [SAFETY_STATES.IMPORT_RECOVERY]:new Set([SAFETY_STATES.RELOAD_RECOVERING]),
    [SAFETY_STATES.TRANSITION_RECOVERY]:new Set([SAFETY_STATES.RELOAD_RECOVERING]),
    [SAFETY_STATES.RELOAD_RECOVERING]:new Set([
      SAFETY_STATES.NORMAL,
      SAFETY_STATES.IMPORT_RECOVERY,
      SAFETY_STATES.TRANSITION_RECOVERY,
    ]),
  });
  const RECOVERY_MARKER_KEY = 'anc_safety_recovery_v1';
  let _safetyState = SAFETY_STATES.NORMAL;
  let _safetyContext = null;
  let _recoveryMarker = null;

  class SafetyStateTransitionError extends Error {
    constructor(from, to) {
      super(`Invalid clinical safety-state transition: ${from} -> ${to}`);
      this.name = 'SafetyStateTransitionError';
      this.from = from;
      this.to = to;
    }
  }

  function isRecoveryRequiredState(state=_safetyState) {
    return state === SAFETY_STATES.IMPORT_RECOVERY
      || state === SAFETY_STATES.TRANSITION_RECOVERY;
  }

  function setRecoveryControlsDisabled(disabled) {
    document.querySelectorAll(
      '#patientWorkspace input, #patientWorkspace select, #patientWorkspace textarea, '
      + '#patientWorkspace button, #btnSave, #btnQuickSave, #navNewPatient, '
      + '#btnNewPatient, #btnImport, #navImport, #navSyncPush, #navSyncPull'
    ).forEach(control => { control.disabled = Boolean(disabled); });
  }

  function transitionSafetyState(nextState, context=null) {
    const allowed = SAFETY_TRANSITIONS[_safetyState];
    if (!allowed?.has(nextState)) {
      const error = new SafetyStateTransitionError(_safetyState, nextState);
      const fallback = _safetyState === SAFETY_STATES.IMPORT_APPLYING
        ? SAFETY_STATES.IMPORT_RECOVERY
        : SAFETY_STATES.TRANSITION_RECOVERY;
      _safetyState = fallback;
      _safetyContext = { kind:'invalid-transition', error };
      setRecoveryControlsDisabled(true);
      throw error;
    }
    _safetyState = nextState;
    _safetyContext = context;
    if (isRecoveryRequiredState(nextState)) setRecoveryControlsDisabled(true);
    return _safetyState;
  }

  function parseRecoveryMarker(raw) {
    if (!raw) return null;
    let marker;
    try { marker = JSON.parse(raw); } catch { throw new Error('Recovery marker is not valid JSON'); }
    const valid = marker
      && typeof marker === 'object'
      && !Array.isArray(marker)
      && marker.version === 1
      && ['import','transition'].includes(marker.kind)
      && Object.keys(marker).every(key => ['version','kind'].includes(key));
    if (!valid) throw new Error('Recovery marker has an invalid structure');
    return marker;
  }

  function initializeRecoveryMarkerState() {
    let raw;
    try { raw = sessionStorage.getItem(RECOVERY_MARKER_KEY); }
    catch (error) {
      transitionSafetyState(SAFETY_STATES.TRANSITION_RECOVERY, {
        kind:'recovery-marker-storage-failure', error,
      });
      return true;
    }
    if (!raw) return false;
    try {
      _recoveryMarker = parseRecoveryMarker(raw);
      transitionSafetyState(SAFETY_STATES.RELOAD_RECOVERING, { kind:_recoveryMarker.kind });
    } catch (error) {
      transitionSafetyState(SAFETY_STATES.TRANSITION_RECOVERY, {
        kind:'invalid-recovery-marker', error,
      });
    }
    return true;
  }

  function phase2Enabled() {
    return SUPA.isPhase2RuntimeEnabled();
  }

  function clinicEncryptionUnlocked() {
    return phase2Enabled()
      ? Boolean(_phase2Runtime?.isPhase2Unlocked())
      : CRYPTO.isUnlocked();
  }

  function clinicEncryptionEnabled() {
    return phase2Enabled() || CRYPTO.isEnabled();
  }

  function lockClinicEncryption() {
    if (phase2Enabled()) _phase2Runtime?.lockPhase2Runtime();
    CRYPTO.lock();
  }

  /* ── INACTIVITY TIMER — module-level scope ── */
  let _inactivityTimer;
  function resetInactivityTimer() {
    clearTimeout(_inactivityTimer);
    if (!clinicEncryptionEnabled()) return;
    _inactivityTimer = setTimeout(async () => {
      const saved = await performAutoSave();
      if (!saved && DB.hasPendingChanges()) {
        UI.toast('Autosave failed. App remains unlocked so you can review unsaved changes.', 'error', 8000);
        return;
      }
      lockClinicEncryption();
      UI.toast('🔒 Auto-locked after inactivity', 'warning', 3000);
      setTimeout(() => location.reload(), 2000);
    }, 10 * 60 * 1000);
  }

  const LAB_PANELS = {
    t1: ['CBC','Serum Ferritin','TSH','Fasting Blood Glucose','Urine Protein','Urine WBC','HBsAg','Anti-HCV','HIV','Rubella IgG','ABO Blood Group','Rh Factor','Indirect Coombs','VDRL/RPR','Vitamin D','Folate','Vitamin B12'],
    t2: ['CBC','Serum Ferritin','Fasting Blood Glucose','OGTT 1h','OGTT 2h','Urine Protein','Urine WBC','AFP','PAPP-A','Free β-hCG'],
    t3: ['CBC','Serum Ferritin','Fasting Blood Glucose','PP Blood Glucose','Urine Protein','Urine WBC','PT','PTT','Fibrinogen','Platelet Count','Serum Creatinine','ALT','AST'],
  };

  /* ════════════════════════════════════
     INIT
  ════════════════════════════════════ */
  async function init() {
    document.getElementById('btnUnlock')?.addEventListener('click', handleUnlock);
    document.getElementById('lockInput')?.addEventListener('keydown', e => { if(e.key==='Enter') handleUnlock(); });
    document.getElementById('btnSetupEncrypt')?.addEventListener('click', handleSetupEncryption);
    document.getElementById('btnSkipEncrypt')?.addEventListener('click',  handleSkipEncryption);
    document.getElementById('btnRecoveryOK')?.addEventListener('click',   handleRecoveryConfirmed);
    document.getElementById('btnSkipLock')?.addEventListener('click',     handleSkipEncryption);

    try {
      await AUTH.requireAccess();
    } catch (e) {
      console.error('Secure access failed:', e);
      return;
    }

    initializeRecoveryMarkerState();

    if (AUTH.getSessionKind() === 'temporary') {
      try {
        _phase2Runtime ||= await import('./phase2_runtime.mjs?v=17');
        const context = AUTH.getTemporaryAccessContext();
        const adapter = await _phase2Runtime.unlockTemporaryPhase2Runtime({
          supabaseClient: AUTH.getClient(),
          password: context.password,
          bootstrap: context.bootstrap,
        });
        SUPA.configurePhase2Adapter(adapter);
        _temporaryPermissions = new Set(context.bootstrap.grant.permissions || []);
        if (_safetyState === SAFETY_STATES.NORMAL) await SUPA.reconcilePhase2Local();
      } catch (error) {
        console.error('Temporary encrypted access failed:', error);
        await AUTH.signOut();
        document.getElementById('authScreen').style.display = 'flex';
        document.getElementById('authLoginError').textContent =
          error.message || 'Temporary encrypted access could not start.';
        return;
      }
    }

    // Wire all UI handlers before the lock overlay is dismissed
    try {
      bootApp();
    } catch (e) {
      console.error('ANC boot failed:', e);
      if (e?.name === 'StorageReadError') {
        showStorageFailure(
          e,
          'Stored data could not be read',
          'Stored clinical data appears corrupted. Saving and importing are blocked to prevent data loss.'
        );
      } else {
        UI.toast('App failed to start — see browser console (F12)', 'error', 8000);
      }
    }

    if (AUTH.getSessionKind() === 'temporary') {
      document.getElementById('lockScreen').style.display = 'none';
    } else if (phase2Enabled()) {
      showPhase2LockScreen();
    } else if (CRYPTO.isSetup()) {
      showLockScreen();
    } else {
      showSetupChoice();
    }
  }

  function bootApp() {
    if (_appBooted) return;
    _appBooted = true;

    setTodayLabels();
    buildLabSections(null);
    initTableRows();
    bindEvents();
    initCollapsibles();
    startMedicationHelperWatcher();
    showPatientPlaceholder();
    renderNavActive('dashboard');
    updateStorageMeter();
    if (_safetyState === SAFETY_STATES.RELOAD_RECOVERING) resumeRecoveryAfterReload();
    else if (isRecoveryRequiredState()) showRecoveryRequiredModal();
    startAutoSave();
    if (AUTH.getSessionKind() === 'owner') {
      import('./phase3_access_control_ui.mjs?v=26')
        .then(module => {
          _phase3AccessUI = module;
          return module.initializeAccessControlPanel();
        })
        .catch(error => console.error('Phase 3 preview failed to initialize:', error));
    } else {
      applyTemporaryAccessMode();
    }

    // Start inactivity tracking
    ['click','keydown','touchstart','scroll'].forEach(evt =>
      document.addEventListener(evt, resetInactivityTimer, {passive:true}));
    resetInactivityTimer();

    // Sidebar patient search
    document.getElementById('patientSearch').addEventListener('input', CALC.debounce(e => {
      const q = e.target.value.toLowerCase().trim();
      if (!q) return;
      const found = Object.values(DB.getAllPatients()).filter(p => (p.fullName||'').toLowerCase().includes(q));
      if (found.length === 1) openPatient(found[0].patientID);
    }, 350));
    setTimeout(updateSyncStatus, 2000);
  }

  function applyTemporaryAccessMode() {
    document.body.classList.add('phase3-temporary-session');
    document.getElementById('phase3NavItem').hidden = true;
    const canCreatePatients = _temporaryPermissions.has('patients.create');
    const canUpdatePatients = _temporaryPermissions.has('patients.update');
    const canCreateRelated = _temporaryPermissions.has('related.create');
    const canUpdateRelated = _temporaryPermissions.has('related.update');
    const patientWrite = canCreatePatients || canUpdatePatients;
    const relatedWrite = canCreateRelated || canUpdateRelated;

    ['btnNewPatient', 'navNewPatient'].forEach(id => {
      const item = document.getElementById(id);
      if (item) item.hidden = !canCreatePatients;
    });
    ['btnSave', 'btnQuickSave'].forEach(id => {
      const item = document.getElementById(id);
      if (item) item.hidden = !patientWrite;
    });
    ['btnAddScan', 'btnAddProc', 'btnAddVisit'].forEach(id => {
      const item = document.getElementById(id);
      if (item) item.hidden = !relatedWrite;
    });
    [
      'btnPDF', 'btnPrint', 'btnBackup', 'btnRollbackBackup',
      'btnVerifyBackup', 'btnImport', 'navPrint', 'navExportPDF', 'navImport',
    ].forEach(id => {
      const item = document.getElementById(id);
      if (item) item.hidden = true;
    });
    if (!patientWrite) {
      document.getElementById('btnEditMode').hidden = true;
      document.querySelectorAll('.summary-actions, .summary-inline-action').forEach(item => {
        item.hidden = true;
      });
      document.querySelectorAll(
        '#view-patient input, #view-patient select, #view-patient textarea',
      ).forEach(control => {
        control.disabled = true;
      });
    }
  }

  /* ════════════════════════════════════
     LOCK SCREEN
  ════════════════════════════════════ */
  function showLockScreen() {
    document.getElementById('lockScreen').style.display = 'flex';
    document.getElementById('btnSkipLock').style.display = 'none';
    document.getElementById('lockInput').focus();
  }

  function showPhase2LockScreen() {
    const screen = document.getElementById('lockScreen');
    document.getElementById('lockSetupMode').style.display = 'none';
    document.getElementById('lockUnlockMode').style.display = 'block';
    document.getElementById('btnSkipLock').style.display = 'none';
    document.querySelector('#lockUnlockMode .lock-title').textContent =
      'Unlock Shared Clinic Encryption';
    document.querySelector('#lockUnlockMode .lock-sub').textContent =
      'Enter the same clinic passphrase used on your verified devices.';
    document.getElementById('lockInput').placeholder = 'Clinic passphrase';
    screen.style.display = 'flex';
    document.getElementById('lockInput').focus();
  }

  function showSetupChoice() {
    const box = document.getElementById('lockScreen');
    box.style.display = 'flex';
    document.getElementById('lockSetupMode').style.display = 'block';
    document.getElementById('lockUnlockMode').style.display = 'none';
  }

  async function handleUnlock() {
    const pw = document.getElementById('lockInput').value;
    const err = document.getElementById('lockError');
    err.textContent = '';
    if (!pw) { err.textContent = 'Enter password'; return; }
    try {
      if (phase2Enabled()) {
        _phase2Runtime ||= await import('./phase2_runtime.mjs?v=17');
        const adapter = await _phase2Runtime.unlockPhase2Runtime({
          supabaseClient: AUTH.getClient(),
          passphrase: pw,
        });
        SUPA.configurePhase2Adapter(adapter);
        const batchId = _phase2Runtime.getActiveBatchId();
        const reconciliationKey = 'anc_phase2_reconciled_batch';
        if (localStorage.getItem(reconciliationKey) !== batchId) {
          if (!ensureClinicalMutationAllowed('Cloud reconciliation')) return;
          err.textContent = 'Loading verified encrypted records...';
          await SUPA.reconcilePhase2Local();
          localStorage.setItem(reconciliationKey, batchId);
          clearForm();
        }
      } else {
        await CRYPTO.unlockSecure(pw);
      }
      document.getElementById('lockScreen').style.display = 'none';
    } catch(e) {
      err.textContent = e.message || 'Incorrect password';
      document.getElementById('lockInput').value = '';
      document.getElementById('lockInput').focus();
    }
  }

  async function handleSetupEncryption() {
    const pw  = document.getElementById('setupPassword').value;
    const pw2 = document.getElementById('setupPassword2').value;
    const err = document.getElementById('setupError');
    err.textContent = '';
    if (!pw || pw.length < 6) { err.textContent = 'Password must be at least 6 characters'; return; }
    if (pw !== pw2) { err.textContent = 'Passwords do not match'; return; }
    try {
      await CRYPTO.setupEncryption(pw);
      document.getElementById('setupStep1').style.display = 'none';
      document.getElementById('setupStep2').style.display = 'block';
    } catch(e) {
      err.textContent = e.message;
    }
  }

  function handleSkipEncryption() {
    if (CRYPTO.isSetup()) {
      UI.toast('Unlock is required because encryption is enabled', 'error', 5000);
      return;
    }
    document.getElementById('lockScreen').style.display = 'none';
  }

  function handleRecoveryConfirmed() {
    document.getElementById('lockScreen').style.display = 'none';
    UI.toast('🔒 Encryption enabled. Keep your clinic passphrase safe.', 'success', 5000);
  }

  /* ════════════════════════════════════
     AUTOSAVE ENGINE
  ════════════════════════════════════ */
  function startAutoSave() {
    setInterval(() => {
      if (!currentPatientID) return;
      if (!DB.hasPendingChanges()) return;
      performAutoSave();
    }, 5000);
  }

  function _hasMinimumData() {
    const name = (document.getElementById('fullName')?.value || '').trim();
    return name.split(/\s+/).filter(Boolean).length >= 3;
  }

  function _hashFormState() {
    const name = document.getElementById('fullName')?.value || '';
    const lmp  = document.getElementById('lmpDate')?.value  || '';
    const rows = document.querySelectorAll('#visitBody tr[data-idx]').length;
    return `${name}|${lmp}|${rows}|${Date.now().toString().slice(0,-4)}`;
  }

  function escapeStorageMessageHTML(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatStorageFailure(error, fallback='Save failed. Data was not fully stored on this device.') {
    const reason = error?.reason || error?.message || '';
    if (error?.name === 'StorageShapeError') {
      return `Clinical storage is structurally invalid and was not modified. Restore from a verified backup or use the recovery workflow.${reason ? ` Reason: ${reason}.` : ''}`;
    }
    return reason ? `${fallback} Reason: ${reason}.` : fallback;
  }

  function showStorageFailure(error, title='Save failed', fallback) {
    const message = formatStorageFailure(error, fallback);
    UI.modal(title, escapeStorageMessageHTML(message), null, true);
  }

  function recoveryMessageForState() {
    if (_safetyState === SAFETY_STATES.TRANSITION_RECOVERY) {
      return 'The patient switch failed and the previous selection could not be restored safely. Reload the application before continuing. No further clinical changes will be saved in this session.';
    }
    return 'Import failed. Data may not have been fully stored on this device. Autosave and clinical changes remain blocked until the application is safely reloaded from stored data.';
  }

  function showRecoveryRequiredModal(extraMessage='') {
    const title = _safetyState === SAFETY_STATES.TRANSITION_RECOVERY
      ? 'Patient selection recovery required'
      : 'Import recovery required';
    UI.modal(
      title,
      escapeStorageMessageHTML(`${extraMessage || recoveryMessageForState()} Reload application from stored data.`),
      recoverApplicationFromStoredData,
      true
    );
    const confirm = document.getElementById('modalConfirm');
    const cancel = document.getElementById('modalCancel');
    if (confirm) confirm.textContent = 'Reload application';
    if (cancel) cancel.style.display = 'none';
  }

  function ensureClinicalMutationAllowed(action='clinical change') {
    if (_safetyState === SAFETY_STATES.NORMAL) return true;
    if (isRecoveryRequiredState()) showRecoveryRequiredModal();
    else UI.toast(`${action} is blocked while clinical recovery is in progress.`, 'error', 6000);
    return false;
  }

  function beginImportOperation() {
    transitionSafetyState(SAFETY_STATES.IMPORT_APPLYING, { kind:'import' });
  }

  function completeImportOperation() {
    transitionSafetyState(SAFETY_STATES.NORMAL);
  }

  function failImportOperation(error) {
    transitionSafetyState(SAFETY_STATES.IMPORT_RECOVERY, { kind:'import', error });
    setAutoSaveStatus('changed');
    showRecoveryRequiredModal();
  }

  function enterTransitionRecovery(error) {
    transitionSafetyState(SAFETY_STATES.TRANSITION_RECOVERY, { kind:'transition', error });
    setAutoSaveStatus('changed');
    showRecoveryRequiredModal();
  }

  function recoverApplicationFromStoredData() {
    if (!isRecoveryRequiredState()) {
      const error = new SafetyStateTransitionError(_safetyState, SAFETY_STATES.RELOAD_RECOVERING);
      try { transitionSafetyState(SAFETY_STATES.TRANSITION_RECOVERY, { kind:'invalid-recovery-request', error }); }
      catch { /* transitionSafetyState already entered a safe state */ }
      showRecoveryRequiredModal('Recovery could not start because the application safety state was invalid.');
      return false;
    }
    const recoveryKind = _safetyState === SAFETY_STATES.IMPORT_RECOVERY ? 'import' : 'transition';
    try {
      DB.assertClinicalStorageReadable();
      const persistedID = DB.getCurrentPatient();
      if (persistedID && !DB.getPatient(persistedID)) {
        throw new Error('The stored current-patient selection does not reference a verified patient');
      }
      const marker = { version:1, kind:recoveryKind };
      parseRecoveryMarker(JSON.stringify(marker));
      sessionStorage.setItem(RECOVERY_MARKER_KEY, JSON.stringify(marker));
      transitionSafetyState(SAFETY_STATES.RELOAD_RECOVERING, { kind:recoveryKind });
      location.reload();
      return true;
    } catch (error) {
      console.error('Clinical recovery preflight failed:', error);
      setAutoSaveStatus('changed');
      showRecoveryRequiredModal(
        `Clinical storage could not be verified and was not modified. ${error?.reason || error?.message || 'Recovery preflight failed.'}`
      );
      return false;
    }
  }

  function resumeRecoveryAfterReload() {
    if (_safetyState !== SAFETY_STATES.RELOAD_RECOVERING || !_recoveryMarker) return false;
    const recoveryKind = _recoveryMarker.kind;
    try {
      DB.assertClinicalStorageReadable();
      const persistedID = DB.getCurrentPatient();
      const patient = persistedID ? DB.getPatient(persistedID) : null;
      if (persistedID && !patient) throw new Error('Stored current-patient selection could not be verified');

      transitionSafetyState(SAFETY_STATES.NORMAL);
      if (patient) {
        currentPatientID = persistedID;
        showPatientWorkspace();
        loadPatientIntoForm(patient);
        renderNavActive('patient');
      } else {
        currentPatientID = null;
        showPatientPlaceholder();
        renderNavActive('dashboard');
      }
      sessionStorage.removeItem(RECOVERY_MARKER_KEY);
      _recoveryMarker = null;
      DB.discardChanged();
      setAutoSaveStatus('saved');
      return true;
    } catch (error) {
      console.error('Clinical recovery reload failed:', error);
      const failedState = recoveryKind === 'import'
        ? SAFETY_STATES.IMPORT_RECOVERY
        : SAFETY_STATES.TRANSITION_RECOVERY;
      if (_safetyState === SAFETY_STATES.NORMAL) {
        transitionSafetyState(failedState, { kind:recoveryKind, error });
      } else {
        transitionSafetyState(failedState, { kind:recoveryKind, error });
      }
      showRecoveryRequiredModal(
        `Clinical storage recovery did not complete. ${error?.reason || error?.message || 'Stored data could not be verified.'}`
      );
      return false;
    }
  }

  function auditActorLabel() {
    try {
      return AUTH.getSessionKind?.() || 'clinic-user';
    } catch {
      return 'clinic-user';
    }
  }

  function resolveAuditPatientUuid(event) {
    if (event?.patientUuid) return event.patientUuid;
    const id = event?.patientID || currentPatientID;
    if (!id) return '';
    try {
      return DB.getPatient(id)?.patientUuid || '';
    } catch {
      return '';
    }
  }

  function recordAuditEvent(event, { warn=true } = {}) {
    try {
      DB.appendAuditEvent({
        actor: auditActorLabel(),
        ...event,
        patientUuid: resolveAuditPatientUuid(event),
      });
      return true;
    } catch (error) {
      console.error('Audit write failed:', error);
      if (warn) {
        UI.toast('Record saved, but audit event could not be stored on this device.', 'warning', 7000);
      }
      return false;
    }
  }

  function bestEffortAuditFailure(operation, patientID, error) {
    recordAuditEvent({
      operation: 'save.failure',
      patientID: patientID || currentPatientID || '',
      entityType: 'system',
      summary: `${operation} failed: ${error?.reason || error?.message || 'unknown error'}`,
      status: 'failure',
    }, { warn:false });
  }

  function recordAutosaveAudit(patientID) {
    if (!patientID) return;
    const now = Date.now();
    const lastAt = _autosaveAuditAtByPatient[patientID] || 0;
    if (now - lastAt < 15 * 60 * 1000) return;
    _autosaveAuditAtByPatient[patientID] = now;
    recordAuditEvent({
      operation: 'patient.autosave',
      patientID,
      entityType: 'patient',
      summary: 'Autosaved patient record and related collections',
      status: 'success',
    }, { warn:false });
  }

  function problemAuditFingerprint(problem={}) {
    return JSON.stringify({
      title: problem.title || '',
      category: problem.category || '',
      status: problem.status || '',
      severity: problem.severity || '',
      onsetDate: problem.onsetDate || '',
      resolutionDate: problem.resolutionDate || '',
      notes: problem.notes || '',
    });
  }

  function recordProblemAuditEvents(previousProblems=[], savedProblems=[], patientID='') {
    const beforeById = new Map((Array.isArray(previousProblems) ? previousProblems : [])
      .filter(problem => problem?.problemID)
      .map(problem => [problem.problemID, problem]));
    (Array.isArray(savedProblems) ? savedProblems : []).forEach(problem => {
      const previous = beforeById.get(problem.problemID);
      let operation = '';
      if (!previous) {
        operation = 'problem.create';
      } else if (previous.status !== 'Resolved' && problem.status === 'Resolved') {
        operation = 'problem.resolve';
      } else if (problemAuditFingerprint(previous) !== problemAuditFingerprint(problem)) {
        operation = 'problem.update';
      }
      if (!operation) return;
      recordAuditEvent({
        operation,
        patientID,
        entityType: 'problem',
        entityID: problem.problemID,
        summary: `${operation.replace('problem.', 'Problem ')}: ${problem.title || 'Untitled problem'}`,
        status: 'success',
      });
    });
  }

  function confirmContinueAfterAutosaveFailure() {
    return new Promise(resolve => {
      const overlay = document.getElementById('modalOverlay');
      let resolved = false;
      const finish = value => {
        if (resolved) return;
        resolved = true;
        overlay?.removeEventListener('click', onOverlay);
        if (overlay) overlay.style.display = 'none';
        resolve(value);
      };
      const onOverlay = event => {
        if (event.target === overlay) finish(false);
      };
      UI.modal(
        'Autosave failed',
        'Autosave failed. Unsaved changes may not be stored on this device. Continue anyway?',
        () => finish(true),
        true
      );
      document.getElementById('modalCancel').onclick = () => finish(false);
      overlay?.addEventListener('click', onOverlay);
    });
  }

  async function performAutoSave() {
    if (!currentPatientID) return false;
    if (_safetyState !== SAFETY_STATES.NORMAL) return false;
    if (_archivedRecordMode) return false;
    if (!_hasMinimumData()) return false;
    setAutoSaveStatus('saving');
    try {
      DB.assertClinicalStorageReadable();
      const data = collectFormData();
      if (!data.fullName || data.fullName.split(/\s+/).filter(Boolean).length < 3) return false;
      const id = DB.savePatient(data);
      currentPatientID = id;
      document.getElementById('patientID').value = id;
      DB.setCurrentPatient(id);
      DB.saveVisits(id,     UI.collectVisits());
      DB.saveScans(id,      UI.collectScans());
      DB.saveProcedures(id, UI.collectProcs());
      DB.saveLabs(id,       UI.collectLabs());
      DB.saveProblems(id,   UI.collectProblems());
      DB.saveMedications(id, UI.collectMedications());
      DB.clearChanged();
      setAutoSaveStatus('saved');
      updateStorageMeter();
      recordAutosaveAudit(id);
      return true;
    } catch(e) {
      console.error('Autosave error:', e);
      setAutoSaveStatus('changed');
      bestEffortAuditFailure('autosave', currentPatientID, e);
      UI.toast(formatStorageFailure(e, 'Autosave failed. Data was not fully stored on this device.'), 'error', 8000);
      return false;
    }
  }

  function setAutoSaveStatus(status) {
    const el  = document.getElementById('autoSaveStatus');
    const dot = document.getElementById('autoSaveDot');
    const lbl = document.getElementById('autoSaveLabel');
    if (!el) return;
    el.className = `autosave-status ${status}`;
    const labels = {saved:'Saved', saving:'Saving…', changed:'Unsaved changes'};
    if (lbl) lbl.textContent = labels[status] || '';
  }

  /* ════════════════════════════════════
     NAVIGATION
  ════════════════════════════════════ */
  function renderNavActive(viewKey) {
    document.querySelectorAll('[data-view]').forEach(a => a.classList.remove('active'));
    document.querySelector(`[data-view="${viewKey}"]`)?.classList.add('active');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(`view-${viewKey}`)?.classList.add('active');
    const labels = {
      patient:'Patient Record',
      database:'Patient Database',
      dashboard:'Dashboard',
      access:'Owner Access Control',
    };
    document.getElementById('breadcrumbText').textContent = labels[viewKey] || 'ANC System';
    if (viewKey === 'patient') {
      if (currentPatientID) showPatientWorkspace();
      else showPatientPlaceholder();
    }
    if (viewKey === 'database') refreshDBTable();
    if (viewKey === 'dashboard') refreshDashboard();
    if (viewKey === 'access') {
      const openPanel = _phase3AccessUI
        ? Promise.resolve(_phase3AccessUI)
        : import('./phase3_access_control_ui.mjs?v=26');
      openPanel
        .then(module => {
          _phase3AccessUI = module;
          return module.openAccessControlPanel();
        })
        .catch(error => {
          console.error('Phase 3 preview failed to open:', error);
          UI.toast('Access-control preview could not be opened', 'error', 5000);
        });
    }
  }


  async function updateSyncStatus() {
    const el = document.getElementById('syncStatus');
    if (!el) return;
    const online = await SUPA.isOnline().catch(() => false);
    el.textContent = online ? '☁ Cloud connected' : '○ Offline';
    el.style.color  = online ? 'rgba(100,220,100,.6)' : 'rgba(255,255,255,.3)';
    if (document.getElementById('view-dashboard')?.classList.contains('active')) refreshDashboard();
  }

  function getDashboardStats() {
    const allPatients = Object.values(DB.getAllPatients());
    const patients = allPatients.filter(patient => !DB.isArchived(patient));
    const archivedCount = allPatients.length - patients.length;
    const savedLastPatient = DB.getPatient(DB.getCurrentPatient());
    const lastPatient = savedLastPatient && !DB.isArchived(savedLastPatient) ? savedLastPatient : null;
    const sevenDaysAgo = Date.now() - 7 * 864e5;
    const alerts = [];
    let missingLMP = 0;
    let noVisit = 0;
    let noScan = 0;

    patients.forEach(patient => {
      const id = patient.patientID;
      const visits = id ? DB.getVisits(id) : [];
      const scans = id ? DB.getScans(id) : [];
      if (!patient.lmpDate) {
        missingLMP++;
        alerts.push({ patientID:id, name:patient.fullName, text:'Missing LMP / GA cannot be calculated' });
      }
      if (!patient.bloodGroup) {
        alerts.push({ patientID:id, name:patient.fullName, text:'Blood group not recorded' });
      }
      if (!patient.allergyHistory) {
        alerts.push({ patientID:id, name:patient.fullName, text:'Allergy history not recorded' });
      }
      if (!visits.length) {
        noVisit++;
        alerts.push({ patientID:id, name:patient.fullName, text:'No recorded visit' });
      }
      if (!scans.length) {
        noScan++;
        alerts.push({ patientID:id, name:patient.fullName, text:'No scan recorded' });
      }
    });

    const recentPatients = patients
      .filter(patient => patient.updatedAt)
      .sort((a,b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
      .slice(0, 8);

    return {
      total: patients.length,
      active: patients.filter(patient => patient.patientStatus === 'Active Follow-up').length,
      riskCount: patients.filter(patient => ['High Risk','Middle Risk'].includes(patient.riskLevel)).length,
      archivedCount,
      recentEdited: patients.filter(patient => patient.updatedAt && new Date(patient.updatedAt).getTime() >= sevenDaysAgo).length,
      missingLMP,
      noVisit,
      noScan,
      recentPatients,
      riskPatients: patients
        .filter(patient => ['High Risk','Middle Risk'].includes(patient.riskLevel))
        .sort((a,b) => ({'High Risk':0,'Middle Risk':1}[a.riskLevel] ?? 2) - ({'High Risk':0,'Middle Risk':1}[b.riskLevel] ?? 2))
        .slice(0, 8),
      alerts: alerts.filter(alert => alert.patientID).slice(0, 12),
      lastPatient,
      storage: DB.getStorageInfo(),
      syncText: document.getElementById('syncStatus')?.textContent || '',
    };
  }

  /* ════════════════════════════════════
     EVENT BINDING
  ════════════════════════════════════ */
  function bindEvents() {
    // Nav
    document.querySelectorAll('[data-view]').forEach(a => a.addEventListener('click', e => {
      e.preventDefault();
      renderNavActive(a.dataset.view);
    }));

    // Hamburger
    document.getElementById('hamburger').addEventListener('click', () =>
      document.getElementById('sidebar').classList.toggle('open'));

    // Close sidebar on outside click (mobile)
    document.addEventListener('click', e => {
      const sb = document.getElementById('sidebar');
      if (sb.classList.contains('open') && !sb.contains(e.target) && e.target.id !== 'hamburger')
        sb.classList.remove('open');
    });

    // Cloud sync
    document.getElementById('navSyncPush')?.addEventListener('click', async e => {
      e.preventDefault();
      if (!ensureClinicalMutationAllowed('Cloud synchronization')) return;
      try {
        if (!await SUPA.isOnline()) { UI.toast('No cloud connection', 'error'); return; }
        UI.toast('☁ Pushing to cloud…', 'info', 15000);
        const result = await SUPA.pushToCloud((done, total) => {
          document.getElementById('syncStatus').textContent = `Pushing ${done}/${total}…`;
        });
        const msg = result.errors.length
          ? `${result.synced}/${result.total} synced. `
            + `${result.errors.length} errors. ${result.errors[0]}`
          : `✅ ${result.synced} patients pushed`;
        UI.toast(msg, result.errors.length ? 'error' : 'success', 12000);
        updateSyncStatus();
      } catch (err) {
        console.error('Cloud push failed:', err);
        UI.toast(err.message || 'Cloud push failed', 'error', 8000);
        updateSyncStatus();
      }
    });

    document.getElementById('navSyncPull')?.addEventListener('click', async e => {
      e.preventDefault();
      if (!ensureClinicalMutationAllowed('Cloud reconciliation')) return;
      try {
        if (!await SUPA.isOnline()) { UI.toast('No cloud connection', 'error'); return; }
        UI.modal('Pull from Cloud',
          'Download all cloud data and merge with local? Cloud wins if newer.',
          async () => {
            if (!ensureClinicalMutationAllowed('Cloud reconciliation')) return;
            try {
              UI.toast('⬇ Pulling from cloud…', 'info', 15000);
              const result = await SUPA.pullFromCloud((done, total) => {
                document.getElementById('syncStatus').textContent = `Pulling ${done}/${total}…`;
              });
              UI.toast(`✅ ${result.synced} patients updated`, 'success');
              refreshDBTable();
              updateSyncStatus();
            } catch (err) {
              console.error('Cloud pull failed:', err);
              UI.toast(err.message || 'Cloud pull failed', 'error', 8000);
              updateSyncStatus();
            }
          });
      } catch (err) {
        console.error('Cloud pull failed:', err);
        UI.toast(err.message || 'Cloud pull failed', 'error', 8000);
        updateSyncStatus();
      }
    });

    // Action buttons
    document.getElementById('btnNewPatient').addEventListener('click', confirmNewPatient);
    document.getElementById('navNewPatient').addEventListener('click', e => { e.preventDefault(); confirmNewPatient(); });
    document.getElementById('btnPlaceholderNewPatient')?.addEventListener('click', confirmNewPatient);
    document.getElementById('btnPlaceholderDatabase')?.addEventListener('click', () => renderNavActive('database'));
    document.getElementById('btnPlaceholderDashboard')?.addEventListener('click', () => renderNavActive('dashboard'));
    document.getElementById('btnSave').addEventListener('click',  fullSave);
    document.getElementById('btnQuickSave').addEventListener('click', quickSave);
    document.getElementById('btnPDF').addEventListener('click',   exportPDF);
    document.getElementById('btnPrint').addEventListener('click', printRecord);
    document.getElementById('navPrint').addEventListener('click', e => { e.preventDefault(); printRecord(); });
    document.getElementById('navExportPDF').addEventListener('click', e => { e.preventDefault(); exportPDF(); });
    document.getElementById('btnBackup').addEventListener('click', downloadBackup);
    document.getElementById('btnRollbackBackup')?.addEventListener('click', downloadRollbackBackup);
    document.getElementById('btnVerifyBackup')?.addEventListener('click', () =>
      document.getElementById('verifyBackupFileInput').click());
    document.getElementById('verifyBackupFileInput')?.addEventListener('change', function() {
      if (this.files[0]) { verifyRollbackBackup(this.files[0]); this.value=''; }
    });

    // Import
    document.getElementById('btnImport')?.addEventListener('click', () =>
      ensureClinicalMutationAllowed('Import') && document.getElementById('importFileInput').click());
    document.getElementById('navImport')?.addEventListener('click', e => {
      e.preventDefault();
      if (ensureClinicalMutationAllowed('Import')) document.getElementById('importFileInput').click();
    });
    document.getElementById('importFileInput')?.addEventListener('change', function() {
      if (this.files[0]) { importBackup(this.files[0]); this.value=''; }
    });

    // Add rows
    document.getElementById('btnAddScan').addEventListener('click',  addScanRow);
    document.getElementById('btnAddProc').addEventListener('click',  addProcRow);
    document.getElementById('btnAddVisit').addEventListener('click', addVisitRow);
    document.getElementById('btnAddProblem')?.addEventListener('click', addProblemRow);
    document.getElementById('btnAddMedication')?.addEventListener('click', addMedicationRow);

    // Delete rows (event delegation)
    document.getElementById('ultraBody').addEventListener('click',  handleTableClick);
    document.getElementById('procBody').addEventListener('click',   handleTableClick);
    document.getElementById('visitBody').addEventListener('click',  handleTableClick);
    document.getElementById('visitBody').addEventListener('pointerdown', refreshVisitMedicationHelpersBeforeUse);
    document.getElementById('visitBody').addEventListener('focusin', refreshVisitMedicationHelpersBeforeUse);
    document.getElementById('problemList')?.addEventListener('click', handleProblemClick);
    document.getElementById('problemList')?.addEventListener('change', handleProblemChange);
    document.getElementById('medicationList')?.addEventListener('click', handleMedicationClick);
    document.getElementById('medicationList')?.addEventListener('change', handleMedicationChange);
    document.getElementById('medicationList')?.addEventListener('input', handleMedicationInput);
    document.getElementById('medicationList')?.addEventListener('input', handleMedicationStatusEvent);
    document.getElementById('medicationList')?.addEventListener('change', handleMedicationStatusEvent);

    // LMP / calc date
    document.getElementById('lmpDate').addEventListener('change',  updateCalculations);
    document.getElementById('calcDate').addEventListener('change', updateCalculations);

    // Visit date → GA
    document.getElementById('visitBody').addEventListener('change', e => {
      if (e.target.classList.contains('visit-med-insert')) {
        insertActiveMedicationIntoVisit(e.target);
      }
      if (e.target.classList.contains('visit-date')) updateVisitGAs();
      DB.markChanged();
    });

    // Scan date → GA + placenta logic
    document.getElementById('ultraBody').addEventListener('change', e => {
      if (e.target.classList.contains('scan-date'))    updateScanGAs();
      if (e.target.classList.contains('scan-type'))    rerenderScanRows(e.target.closest('.scan-row')?.dataset.idx);
      if (e.target.classList.contains('bio-placenta')) handlePlacentaChange(e.target);
      if (e.target.classList.contains('bio-afi') || e.target.classList.contains('bio-dvp'))
        updateFluidAssessment(e.target);
      if (e.target.classList.contains('dop-ua') || e.target.classList.contains('dop-mca') ||
          e.target.classList.contains('dop-dv') || e.target.classList.contains('dop-uta'))
        updateDopplerResults(e.target);
      DB.markChanged();
    });

    // Chart buttons (delegation)
    document.getElementById('ultraBody').addEventListener('click', e => {
      const chartBtn = e.target.closest('.btn-chart');
      if (!chartBtn) return;
      const idx = parseInt(chartBtn.dataset.idx);
      if (chartBtn.classList.contains('btn-doppler-chart'))
        openDopplerChartModal(idx);
      else
        openGrowthChartModal(idx);
    });

    // TPAL
    ['tpalT','tpalP','tpalA','tpalL'].forEach(id =>
      document.getElementById(id).addEventListener('input', updateTPAL));

    // Summary-first patient record
    document.getElementById('btnSummaryMode').addEventListener('click', () => {
      if (!currentPatientID) {
        UI.toast('Save the patient record before opening the summary.', 'info');
        return;
      }
      renderPatientSummary(collectFormData());
      setRecordMode('summary');
    });
    document.getElementById('btnEditMode').addEventListener('click', () => setRecordMode('edit'));
    document.getElementById('btnRestoreArchivedPatient')?.addEventListener('click', () => {
      if (currentPatientID) restoreArchivedPatient(currentPatientID);
    });
    document.getElementById('btnSummaryAddPregnancy').addEventListener('click', () => {
      openEditorAt('previousPregnancySection');
      addPreviousPregnancy();
    });
    document.querySelectorAll('[data-edit-target]').forEach(button => {
      button.addEventListener('click', () => openEditorAt(button.dataset.editTarget));
    });
    document.getElementById('btnAddPreviousPregnancy').addEventListener('click', addPreviousPregnancy);
    document.getElementById('previousPregnancyList').addEventListener('click', handlePreviousPregnancyClick);
    document.getElementById('previousPregnancyList').addEventListener('change', handlePreviousPregnancyChange);
    document.querySelectorAll('textarea[data-auto-grow]').forEach(textarea => {
      textarea.addEventListener('input', () => autoGrowTextarea(textarea));
      autoGrowTextarea(textarea);
    });

    // Patient status → hospital
    document.getElementById('patientStatus').addEventListener('change', function() {
      UI.applyStatusColor(this);
      const outcomes = ['Delivered by CS','Delivered by SVD','Abortion','IUFD'];
      document.getElementById('hospitalRow').style.display = outcomes.includes(this.value) ? 'grid':'none';
      DB.markChanged();
    });

    // Pregnancy type → chorionicity
    document.getElementById('pregnancyType').addEventListener('change', function() {
      const multi = ['Twin','Triplet','Higher Order Multiple'].includes(this.value);
      document.getElementById('multiPregFields').style.display = multi ? 'block':'none';
      DB.markChanged();
    });

    // Hospital custom
    document.getElementById('hospitalName2').addEventListener('change', function() {
      document.getElementById('hospitalCustomWrap').style.display =
        this.value === 'other-custom' ? 'flex':'none';
    });

    // Risk badge click
    document.getElementById('topbarRiskWrap').addEventListener('click', showRiskPanel);

    // Name validation + autosave trigger
    document.getElementById('fullName').addEventListener('input', function() {
      const parts = this.value.trim().split(/\s+/).filter(Boolean);
      const hint  = document.getElementById('nameHint');
      hint.textContent = (this.value && parts.length < 3) ? `${parts.length}/3 names entered` : '';
      if (parts.length >= 3) DB.markChanged();
    });

    // Generic change tracking on all inputs inside main form
    document.getElementById('view-patient').addEventListener('input',  () => DB.markChanged());
    document.getElementById('view-patient').addEventListener('change', () => DB.markChanged());

    // Lock button
    document.getElementById('btnLock')?.addEventListener('click', async () => {
      if (!clinicEncryptionEnabled()) { UI.toast('Encryption not enabled', 'info'); return; }
      const saved = await performAutoSave();
      if (!saved && DB.hasPendingChanges()) {
        const continueAnyway = await confirmContinueAfterAutosaveFailure();
        if (!continueAnyway) {
          setAutoSaveStatus('changed');
          return;
        }
      }
      lockClinicEncryption();
      location.reload();
    });

    document.getElementById('btnSignOut')?.addEventListener('click', async () => {
      try {
        const saved = await performAutoSave();
        if (!saved && DB.hasPendingChanges()) {
          const continueAnyway = await confirmContinueAfterAutosaveFailure();
          if (!continueAnyway) {
            setAutoSaveStatus('changed');
            return;
          }
        }
        lockClinicEncryption();
        await AUTH.signOut();
        location.reload();
      } catch (error) {
        console.error('Sign out failed:', error);
        UI.toast('Could not sign out safely', 'error');
      }
    });

    // Keyboard shortcut: Ctrl/Cmd+S = quick save
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); quickSave(); }
    });

    // DB search/filter
    document.getElementById('dbSearch').addEventListener('input',  refreshDBTable);
    document.getElementById('dbFilter').addEventListener('change', refreshDBTable);
    document.getElementById('dbShowArchived')?.addEventListener('change', refreshDBTable);

    // Drag & drop for attachments
    document.addEventListener('dragover', e => e.preventDefault());
    document.addEventListener('drop', handleGlobalDrop);

    // Modal close on overlay click
    document.getElementById('modalOverlay').addEventListener('click', e => {
      if (e.target === document.getElementById('modalOverlay'))
        document.getElementById('modalOverlay').style.display = 'none';
    });
  }

  /* ════════════════════════════════════
     COLLAPSIBLES
  ════════════════════════════════════ */
  function initCollapsibles() {
    document.querySelectorAll('[data-collapsible]').forEach(card => UI.initCollapsible(card));
  }

  /* ════════════════════════════════════
     CALCULATIONS
  ════════════════════════════════════ */
  function updateCalculations() {
    const lmp  = document.getElementById('lmpDate').value;
    const calc = document.getElementById('calcDate').value || CALC.todayISO();
    const ga   = CALC.getGA(lmp, calc);
    const edd  = CALC.getEDD(lmp);
    const trim = ga ? CALC.getTrimester(ga.weeks) : null;

    const gaEl = document.getElementById('calcGA');
    if (ga) {
      gaEl.textContent = ga.weeks;
      document.getElementById('calcGASub').textContent = `${ga.weeks} wks + ${ga.days} days`;
      document.getElementById('gaDisplay').textContent  = ga.weeks;
      document.getElementById('topbarGA').style.opacity = '1';
    } else {
      gaEl.textContent = '—';
      document.getElementById('calcGASub').textContent = 'Enter LMP to calculate';
      document.getElementById('gaDisplay').textContent  = '—';
    }

    if (edd) {
      document.getElementById('calcEDD').textContent    = CALC.formatDate(edd);
      const daysLeft = Math.max(0, Math.round((edd-new Date())/864e5));
      document.getElementById('calcEDDSub').textContent = `in ${daysLeft} days`;
    } else {
      document.getElementById('calcEDD').textContent    = '—';
      document.getElementById('calcEDDSub').textContent = 'Expected Delivery Date';
    }

    if (trim) {
      document.getElementById('calcTrimester').textContent  = `T${trim.num}`;
      document.getElementById('calcTrimSub').textContent    = `${trim.label} ${trim.sub}`;
      const box = document.getElementById('calcTrimester').closest('.calc-result-box');
      if (box) { box.style.background=trim.bg; box.style.borderColor=trim.color; box.style.color=trim.color; }
    } else {
      document.getElementById('calcTrimester').textContent = '—';
    }

    updateMilestoneBanner(ga?.weeks);
    const li = document.getElementById('labIntel');
    if (li) li.textContent = CALC.getLabIntelText(ga?.weeks);
    updateVisitGAs();
    updateScanGAs();
    if (_recordMode === 'summary' && currentPatientID) {
      renderPatientSummary(collectFormData());
    }
  }

  function updateVisitGAs() {
    const lmp = document.getElementById('lmpDate').value;
    document.querySelectorAll('#visitBody tr[data-idx]').forEach(tr => {
      const d   = tr.querySelector('.visit-date')?.value;
      const cel = tr.querySelector('.visit-ga-display');
      if (!cel) return;
      cel.textContent = (d && lmp)
        ? (() => { const g=CALC.getGA(lmp,d); return g?`${g.weeks}w+${g.days}d`:'—'; })()
        : '—';
    });
  }

  function updateScanGAs() {
    const lmp = document.getElementById('lmpDate').value;
    document.querySelectorAll('#ultraBody .scan-row').forEach(tr => {
      const d   = tr.querySelector('.scan-date')?.value;
      const cel = tr.querySelector('.scan-ga-display');
      if (!cel) return;
      cel.textContent = (d && lmp)
        ? (() => { const g=CALC.getGA(lmp,d); return g?`${g.weeks}w+${g.days}d`:'—'; })()
        : '—';
    });
    document.querySelectorAll('#procBody tr[data-idx]').forEach(tr => {
      const d   = tr.querySelector('.proc-date')?.value;
      const cel = tr.querySelector('.proc-ga-display');
      if (!cel) return;
      cel.textContent = (d && lmp)
        ? (() => { const g=CALC.getGA(lmp,d); return g?`${g.weeks}w+${g.days}d`:'—'; })()
        : '—';
    });
  }

  function updateMilestoneBanner(weeks) {
    const banner = document.getElementById('milestoneBanner');
    const items  = CALC.getMilestones(weeks);
    if (!items.length) { banner.classList.remove('visible'); return; }
    banner.classList.add('visible');
    banner.innerHTML = items.map(m =>
      `<span class="milestone-item">${m.icon} ${m.text}</span>`
    ).join('');
  }

  function updateTPAL() {
    const T=document.getElementById('tpalT').value||'?';
    const P=document.getElementById('tpalP').value||'?';
    const A=document.getElementById('tpalA').value||'?';
    const L=document.getElementById('tpalL').value||'?';
    document.getElementById('tpalSummary').textContent = `T${T}-P${P}-A${A}-L${L}`;
  }

  function handlePlacentaChange(selectEl) {
    const val = selectEl.value;
    const detailRow = selectEl.closest('tr.scan-detail-row');
    const osField = detailRow?.querySelector('.placenta-os-field');
    if (osField) osField.style.display = CONSTANTS.LOW_PLACENTA_VALUES.includes(val) ? 'flex':'none';
    if (CONSTANTS.LOW_PLACENTA_VALUES.includes(val)) {
      const curRisk = document.getElementById('riskLevelInput').value;
      if (curRisk !== 'High Risk') {
        UI.modal('⚠️ Risk Level Update',
          `Placenta "${val}" detected. This is a High Risk condition. Update risk level to High Risk?`,
          () => setRiskLevel('High Risk'));
      }
    }
  }

  function updateFluidAssessment(input) {
    const detailRow = input.closest('tr.scan-detail-row');
    const scanRow   = detailRow?.previousElementSibling;
    const ga = parseInt(scanRow?.querySelector('.scan-ga-display')?.textContent) ||
               (() => {
                 const lmp = document.getElementById('lmpDate').value;
                 const d   = scanRow?.querySelector('.scan-date')?.value;
                 if (!lmp || !d) return null;
                 const g = CALC.getGA(lmp, d);
                 return g?.weeks;
               })();
    if (input.classList.contains('bio-afi')) {
      const assess = CONSTANTS.assessAFI(input.value, ga);
      const existing = input.parentElement.querySelector('.fluid-assessment');
      if (existing) existing.remove();
      if (assess && input.value) {
        const span = document.createElement('span');
        span.className = 'fluid-assessment';
        span.style.cssText = `background:${assess.color}20;color:${assess.color};border:1px solid ${assess.color}40`;
        span.textContent = `${assess.icon} ${assess.label}`;
        input.parentElement.appendChild(span);
      }
    }
  }

  function updateDopplerResults(input) {
    const detailRow = input.closest('tr.scan-detail-row');
    const ua  = parseFloat(detailRow?.querySelector('.dop-ua')?.value);
    const mca = parseFloat(detailRow?.querySelector('.dop-mca')?.value);
    if (ua && mca) {
      const cprContainer = detailRow.querySelector('.cpr-display');
      if (cprContainer) cprContainer.innerHTML = UI.cprHTML(mca, ua);
    }
  }

  /* ════════════════════════════════════
     RISK MANAGEMENT
  ════════════════════════════════════ */
  function setRiskLevel(level) {
    document.getElementById('riskLevelInput').value = level;
    document.getElementById('topbarRiskWrap').innerHTML = UI.riskBadgeHTML(level);
    DB.markChanged();
  }

  function showRiskPanel() {
    const current = document.getElementById('riskLevelInput').value || 'Low Risk';
    UI.modal('Risk Level',
      `<div style="margin-bottom:12px">Current: <strong>${current}</strong></div>
       <div style="display:flex;flex-direction:column;gap:8px">
         <button onclick="APP.setRiskLevel('Low Risk');document.getElementById('modalOverlay').style.display='none'" style="padding:10px;background:#e8f5e9;color:#1b5e20;border:1px solid #a5d6a7;border-radius:6px;cursor:pointer;font-weight:700;font-family:var(--font)">🟢 Low Risk</button>
         <button onclick="APP.setRiskLevel('Middle Risk');document.getElementById('modalOverlay').style.display='none'" style="padding:10px;background:#fff3e0;color:#e65100;border:1px solid #ffcc80;border-radius:6px;cursor:pointer;font-weight:700;font-family:var(--font)">🟡 Middle Risk</button>
         <button onclick="APP.setRiskLevel('High Risk');document.getElementById('modalOverlay').style.display='none'" style="padding:10px;background:#ffebee;color:#b71c1c;border:1px solid #ef9a9a;border-radius:6px;cursor:pointer;font-weight:700;font-family:var(--font)">🔴 High Risk</button>
       </div>`,
      null);
    document.getElementById('modalConfirm').style.display = 'none';
  }

  function runRiskEngine() {
    const data  = collectFormData();
    const labs  = UI.collectLabs();
    const scans = UI.collectScans();
    const result = CALC.assessRisk(data, labs, scans);
    const current = data.riskLevel || 'Low Risk';
    if (result.suggested !== current && result.triggers[result.suggested==='High Risk'?'high':'middle'].length) {
      const triggers = [...result.triggers.high, ...result.triggers.middle];
      UI.modal('⚠️ Risk Assessment Update',
        `Based on recorded data, risk may be <strong>${result.suggested}</strong>.<br><br>
         Triggers detected:<br>• ${triggers.slice(0,5).join('<br>• ')}<br><br>
         Update risk level to <strong>${result.suggested}</strong>?`,
        () => setRiskLevel(result.suggested));
    }
  }

  /* ════════════════════════════════════
     TABLE MANAGEMENT
  ════════════════════════════════════ */
  function initTableRows() {
    const lmp = document.getElementById('lmpDate').value;
    document.getElementById('ultraBody').innerHTML  = '';
    document.getElementById('procBody').innerHTML   = [0,1,2].map(i => UI.procRowHTML({},i,lmp)).join('');
    document.getElementById('visitBody').innerHTML  = [0,1,2].map(i => UI.visitRowHTML({},i,lmp,[])).join('');
    renderProblemRows([]);
    renderMedicationRows([]);
    refreshVisitMedicationHelpers();
  }

  function normalizeMedicationHelperValue(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function normalizeMedicationHelperNumber(value) {
    const text = normalizeMedicationHelperValue(value);
    const match = text.match(/\d+(?:\.\d+)?/);
    return match ? match[0] : text;
  }

  function normalizeMedicationHelperKey(med={}) {
    const dose = med.doseAmount || med.dose || '';
    const frequency = normalizeMedicationHelperNumber(med.timesPerDay || med.frequency || '');
    const duration = normalizeMedicationHelperNumber(med.durationDays || med.duration || '');
    return [med.drugName, med.genericName, dose, med.unit, frequency, duration]
      .map(normalizeMedicationHelperValue)
      .join('|');
  }

  function getCurrentEditorActiveMedications() {
    const merged = [];
    const seen = new Set();
    const suppressed = new Set();
    const hasMedicationContent = (med) => Boolean(
      med && (med.drugName || med.genericName || med.doseAmount || med.dose || med.unit || med.timesPerDay || med.frequency || med.durationDays || med.duration)
    );
    const statusOf = (med) => med?.status || 'Active';
    const isActiveStatus = (med) => statusOf(med) === 'Active';
    const add = (med) => {
      if (!hasMedicationContent(med) || !isActiveStatus(med)) return;
      const key = normalizeMedicationHelperKey(med);
      if (suppressed.has(key)) return;
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(med);
    };

    try {
      const editorMedications = UI.collectMedications();
      editorMedications.forEach(med => {
        if (!hasMedicationContent(med) || isActiveStatus(med)) return;
        suppressed.add(normalizeMedicationHelperKey(med));
      });
      editorMedications.forEach(add);
    } catch (error) {
      console.warn('Unable to collect editor medications for visit helper:', error);
    }

    if (currentPatientID) {
      try {
        DB.getActiveMedications(currentPatientID).forEach(add);
      } catch (error) {
        console.warn('Unable to load saved medications for visit helper:', error);
      }
    }

    return merged;
  }

  function activeMedicationsForCurrentPatient() {
    return getCurrentEditorActiveMedications();
  }

  function refreshVisitMedicationHelpers() {
    const medications = getCurrentEditorActiveMedications();
    document.querySelectorAll('.visit-med-insert').forEach(select => {
      select.replaceChildren();
      select.innerHTML = UI.visitMedicationOptionsHTML(medications);
      select.disabled = medications.length === 0;
      select.value = '';
    });
  }

  function refreshVisitMedicationHelpersBeforeUse(event) {
    if (event.target.classList.contains('visit-med-insert')) refreshVisitMedicationHelpers();
  }

  function medicationHelperEditorSignature() {
    const medications = Array.from(document.querySelectorAll('#medicationList .medication-row')).map(row => [
      row.querySelector('.med-drug')?.value || '',
      row.querySelector('.med-generic')?.value || '',
      row.querySelector('.med-dose-amount')?.value || '',
      row.querySelector('.med-unit')?.value || '',
      row.querySelector('.med-times-per-day')?.value || '',
      row.querySelector('.med-duration-days')?.value || '',
      row.querySelector('.med-status')?.value || 'Active',
    ].join('|'));
    return JSON.stringify({
      medications,
      visitHelpers: document.querySelectorAll('.visit-med-insert').length,
    });
  }

  function refreshVisitMedicationHelpersIfEditorChanged() {
    processPendingVisitMedicationSelections();
    const signature = medicationHelperEditorSignature();
    if (signature === _medicationHelperSignature) return;
    _medicationHelperSignature = signature;
    refreshVisitMedicationHelpers();
  }

  function startMedicationHelperWatcher() {
    if (_medicationHelperWatchTimer) return;
    _medicationHelperWatchTimer = setInterval(refreshVisitMedicationHelpersIfEditorChanged, 500);
  }

  function scrollRowIntoView(row) {
    row?.scrollIntoView?.({ behavior:'smooth', block:'nearest', inline:'nearest' });
  }

  function rerenderScanRows(focusIdx=null) {
    const body = document.getElementById('ultraBody');
    const scans = UI.collectScans({ includeDrafts:true });
    const lmp = document.getElementById('lmpDate').value;
    body.innerHTML = scans.map((scan, index) => UI.scanRowHTML(scan, index, lmp)).join('');
    if (focusIdx !== null) {
      const row = body.querySelector(`.scan-row[data-idx="${focusIdx}"]`);
      row?.querySelector('.scan-type')?.focus();
      scrollRowIntoView(row);
    }
  }

  function addScanRow() {
    const body = document.getElementById('ultraBody');
    const idx  = body.querySelectorAll('.scan-row').length;
    const lmp  = document.getElementById('lmpDate').value;
    body.insertAdjacentHTML('beforeend', UI.scanRowHTML({ category:'Quick limited clinic scan' }, idx, lmp));
    const row = body.querySelector(`.scan-row[data-idx="${idx}"]`);
    row?.querySelector('.scan-type')?.focus();
    scrollRowIntoView(row);
    DB.markChanged();
  }

  function addProcRow() {
    const body = document.getElementById('procBody');
    const idx  = body.querySelectorAll('tr[data-idx]').length;
    const lmp  = document.getElementById('lmpDate').value;
    body.insertAdjacentHTML('beforeend', UI.procRowHTML({}, idx, lmp));
    const row = body.lastElementChild;
    row?.querySelector('select')?.focus();
    scrollRowIntoView(row);
    DB.markChanged();
  }

  function addVisitRow() {
    const body = document.getElementById('visitBody');
    const idx  = body.querySelectorAll('tr[data-idx]').length;
    const lmp  = document.getElementById('lmpDate').value;
    body.insertAdjacentHTML('beforeend', UI.visitRowHTML({}, idx, lmp, activeMedicationsForCurrentPatient()));
    const newRow    = body.lastElementChild;
    const dateInput = newRow.querySelector('.visit-date');
    if (dateInput && !dateInput.value) { dateInput.value = CALC.todayISO(); updateVisitGAs(); }
    dateInput?.focus();
    scrollRowIntoView(newRow);
    refreshVisitMedicationHelpers();
    DB.markChanged();
  }

  function openCollapsibleForList(list) {
    const card = list?.closest('[data-collapsible]');
    const body = card?.querySelector('.collapsible-body');
    const toggle = card?.querySelector('.btn-toggle');
    if (body?.classList.contains('collapsed')) {
      body.classList.remove('collapsed');
      body.style.maxHeight = 'none';
      toggle?.querySelector('.toggle-arrow')?.classList.add('open');
      const label = toggle?.querySelector('.toggle-label');
      if (label) label.textContent = 'Hide';
    }
    return body;
  }

  function renderProblemRows(problems=[]) {
    const list = document.getElementById('problemList');
    if (!list) return;
    list.innerHTML = (Array.isArray(problems) ? problems : [])
      .map((problem, index) => UI.problemRowHTML(problem, index))
      .join('');
  }

  function addProblemRow() {
    const list = document.getElementById('problemList');
    if (!list) return;
    const body = openCollapsibleForList(list);
    const idx = list.querySelectorAll('.problem-row').length;
    list.insertAdjacentHTML('beforeend', UI.problemRowHTML({}, idx));
    if (body) body.style.maxHeight = 'none';
    const row = list.querySelector(`.problem-row[data-idx="${idx}"]`);
    row?.querySelector('.problem-template')?.focus();
    scrollRowIntoView(row);
    DB.markChanged();
  }

  function problemRowHasContent(row) {
    if (!row) return false;
    return [
      '.problem-id','.problem-title','.problem-category','.problem-severity',
      '.problem-notes','.problem-onset','.problem-resolution',
    ].some(selector => Boolean(row.querySelector(selector)?.value?.trim()))
      || (row.querySelector('.problem-status')?.value || 'Active') !== 'Active';
  }

  function fillProblemRow(row, data={}) {
    const set = (selector, value) => {
      const field = row.querySelector(selector);
      if (field) field.value = value || '';
    };
    set('.problem-title', data.title);
    set('.problem-category', data.category);
    set('.problem-status', data.status || 'Active');
  }

  function handleProblemClick(event) {
    const row = event.target.closest('.problem-row');
    if (!row) return;
    const removeButton = event.target.closest('.btn-problem-remove');
    if (!removeButton) return;
    if (problemRowHasContent(row)) {
      UI.toast('Only empty unsaved problem rows can be removed. Change status to Resolved or Historical to preserve clinical history.', 'warning', 5000);
      return;
    }
    row.remove();
    DB.markChanged();
  }

  function handleProblemChange(event) {
    const row = event.target.closest('.problem-row');
    if (!row) return;
    if (event.target.classList.contains('problem-template')) {
      const template = UI.PROBLEM_TEMPLATES?.[event.target.value];
      if (template) fillProblemRow(row, template);
      event.target.value = '';
    }
    DB.markChanged();
  }

  function renderMedicationRows(medications=[]) {
    const list = document.getElementById('medicationList');
    if (!list) return;
    const memory = DB.getMedicationMemory?.() || [];
    list.innerHTML = (Array.isArray(medications) ? medications : [])
      .map((med, index) => UI.medicationRowHTML(med, index, memory))
      .join('');
  }

  function addMedicationRow() {
    const list = document.getElementById('medicationList');
    if (!list) return;
    const body = openCollapsibleForList(list);
    const idx = list.querySelectorAll('.medication-row').length;
    list.insertAdjacentHTML('beforeend', UI.medicationRowHTML({}, idx, DB.getMedicationMemory?.() || []));
    if (body) body.style.maxHeight = 'none';
    const row = list.querySelector(`.medication-row[data-idx="${idx}"]`);
    row?.querySelector('.med-template')?.focus();
    scrollRowIntoView(row);
    refreshVisitMedicationHelpers();
    DB.markChanged();
  }

  function insertActiveMedicationIntoVisit(select) {
    const value = select?.value || '';
    if (!value) return;
    const freshOptions = document.createElement('select');
    freshOptions.innerHTML = UI.visitMedicationOptionsHTML(getCurrentEditorActiveMedications());
    const allowed = new Set(Array.from(freshOptions.options).map(option => option.value).filter(Boolean));
    if (!allowed.has(value)) {
      refreshVisitMedicationHelpers();
      UI.toast('Medication helper refreshed. Select an active medication again.', 'warning', 3000);
      return;
    }
    const row = select.closest('tr');
    const textarea = row?.querySelector('.visit-meds');
    if (!textarea) return;
    const existing = textarea.value.trim();
    textarea.value = existing ? `${existing}\n${value}` : value;
    textarea.focus();
    select.value = '';
  }

  function processPendingVisitMedicationSelections() {
    document.querySelectorAll('.visit-med-insert').forEach(select => {
      if (select.value) insertActiveMedicationIntoVisit(select);
    });
  }

  function medicationRowHasContent(row) {
    if (!row) return false;
    return [
      '.med-id','.med-drug','.med-generic','.med-dose','.med-unit','.med-route',
      '.med-dose-amount','.med-times-per-day','.med-duration-days','.med-indication','.med-start','.med-stop',
      '.med-prescribed-by','.med-notes',
    ].some(selector => Boolean(row.querySelector(selector)?.value?.trim()))
      || (row.querySelector('.med-status')?.value || 'Active') !== 'Active';
  }

  function medicationPatternFromRow(row) {
    return {
      drugName: row.querySelector('.med-drug')?.value.trim() || '',
      genericName: row.querySelector('.med-generic')?.value.trim() || '',
      doseAmount: row.querySelector('.med-dose-amount')?.value.trim() || '',
      unit: row.querySelector('.med-unit')?.value.trim() || '',
      timesPerDay: row.querySelector('.med-times-per-day')?.value || '',
      durationDays: row.querySelector('.med-duration-days')?.value || '',
      route: row.querySelector('.med-route')?.value.trim() || '',
      indication: row.querySelector('.med-indication')?.value.trim() || '',
      notes: row.querySelector('.med-notes')?.value.trim() || '',
    };
  }

  function fillMedicationRow(row, data={}, options={}) {
    const set = (selector, value) => {
      const field = row.querySelector(selector);
      if (field) field.value = value || '';
    };
    const placeholder = (selector, value) => {
      const field = row.querySelector(selector);
      if (field && value) field.placeholder = value;
    };
    set('.med-drug', data.drugName);
    set('.med-generic', data.genericName);
    set('.med-dose-amount', data.doseAmount || data.dose);
    set('.med-unit', data.unit);
    set('.med-times-per-day', data.timesPerDay || '');
    set('.med-duration-days', data.durationDays || '');
    if (options.placeholdersOnly) {
      placeholder('.med-times-per-day', data.frequency);
      placeholder('.med-route', data.route);
      placeholder('.med-indication', data.indication);
    } else {
      set('.med-route', data.route);
      set('.med-indication', data.indication);
    }
    if (data.notes) set('.med-notes', data.notes);
  }

  function saveMedicationPatternFromRow(row, mode='save-new') {
    try {
      DB.saveMedicationPattern(medicationPatternFromRow(row), mode);
      UI.toast(mode === 'update-existing' ? 'Medication pattern updated' : 'Medication pattern saved', 'success', 2200);
      renderMedicationRows(UI.collectMedications());
      refreshVisitMedicationHelpers();
    } catch (error) {
      UI.toast(error.message || 'Medication pattern could not be saved', 'error', 5000);
    }
  }

  function confirmMedicationPatternSave(row) {
    const pattern = medicationPatternFromRow(row);
    if (!pattern.drugName) {
      UI.toast('Enter a medication name before saving a pattern.', 'error', 3500);
      return;
    }
    const similar = DB.findSimilarMedicationPattern?.(pattern);
    if (!similar) {
      saveMedicationPatternFromRow(row, 'save-new');
      return;
    }
    UI.modal(
      'Similar Medication Pattern',
      `<p>A similar medication pattern already exists. Update existing pattern or save as new?</p>
       <div class="modal-inline-actions">
         <button type="button" id="btnUpdateMedicationPattern" class="btn-modal-confirm">Update existing</button>
       </div>`,
      () => saveMedicationPatternFromRow(row, 'save-new'),
      true
    );
    const confirm = document.getElementById('modalConfirm');
    if (confirm) confirm.textContent = 'Save as new';
    const cancel = document.getElementById('modalCancel');
    if (cancel) cancel.textContent = 'Cancel';
    setTimeout(() => {
      document.getElementById('btnUpdateMedicationPattern')?.addEventListener('click', () => {
        document.getElementById('modalOverlay').style.display = 'none';
        saveMedicationPatternFromRow(row, 'update-existing');
      });
    }, 0);
  }

  function handleMedicationClick(event) {
    const row = event.target.closest('.medication-row');
    if (!row) return;
    const patternButton = event.target.closest('.btn-med-pattern');
    if (patternButton) {
      confirmMedicationPatternSave(row);
      return;
    }
    const statusButton = event.target.closest('.btn-med-status');
    if (statusButton) {
      const nextStatus = statusButton.dataset.status;
      const status = row.querySelector('.med-status');
      if (status && nextStatus) status.value = nextStatus;
      refreshVisitMedicationHelpers();
      DB.markChanged();
      return;
    }
    const removeButton = event.target.closest('.btn-med-remove');
    if (!removeButton) return;
    if (medicationRowHasContent(row)) {
      UI.toast('Only empty unsaved medication rows can be removed. Use Stop or Mark completed for medication history.', 'warning', 5000);
      return;
    }
    row.remove();
    refreshVisitMedicationHelpers();
    DB.markChanged();
  }

  function handleMedicationInput(event) {
    if (event.target.closest('.medication-row')) refreshVisitMedicationHelpers();
  }

  function handleMedicationStatusEvent(event) {
    if (!event.target.closest('.medication-row')) return;
    if (!event.target.classList.contains('med-status')) return;
    refreshVisitMedicationHelpers();
  }

  function handleMedicationChange(event) {
    const row = event.target.closest('.medication-row');
    if (!row) return;
    if (event.target.classList.contains('med-template')) {
      const value = event.target.value || '';
      if (value.startsWith('template:')) {
        const template = UI.MEDICATION_TEMPLATES?.[value.slice(9)];
        if (template) fillMedicationRow(row, template, { placeholdersOnly:true });
      } else if (value.startsWith('memory:')) {
        const pattern = (DB.getMedicationMemory?.() || []).find(item => item.patternID === value.slice(7));
        if (pattern) fillMedicationRow(row, pattern);
      }
      event.target.value = '';
    }
    refreshVisitMedicationHelpers();
    DB.markChanged();
  }

  function handleTableClick(e) {
    const btn = e.target.closest('.btn-delete-row');
    if (!btn) return;
    const tr = btn.closest('tr');
    if (!tr) return;
    if (btn.dataset.table === 'scan') {
      const next = tr.nextElementSibling;
      if (next?.classList.contains('scan-detail-row')) next.remove();
    }
    tr.remove();
    reindexVisits();
    DB.markChanged();
  }

  function reindexVisits() {
    document.querySelectorAll('#visitBody tr[data-idx]').forEach((tr,i) => {
      const cell = tr.firstElementChild;
      if (cell) cell.textContent = i+1;
    });
  }

  /* ════════════════════════════════════
     LAB SECTIONS
  ════════════════════════════════════ */
  function buildLabSections(labData) {
    ['t1','t2','t3'].forEach(trim => {
      const container = document.getElementById(`labSection_${trim}`);
      if (!container) return;
      const tests = LAB_PANELS[trim];
      container.innerHTML = UI.buildLabGrid(trim, tests, labData, trim==='t1');
    });
  }

  function addCustomLabTest(trimKey) {
    const allTests = CONSTANTS.COMMON_LABS;

    UI.modal('Add Lab Test',
      `<div style="margin-bottom:10px">
         <label style="font-size:11px;font-weight:700;color:var(--tx-mid);display:block;margin-bottom:4px">SELECT FROM COMMON TESTS</label>
         <select id="customLabSelect" style="width:100%">
           <option value="">— Pick a test —</option>
           ${allTests.map(t=>`<option value="${t}">${t}</option>`).join('')}
         </select>
       </div>
       <div style="text-align:center;color:var(--tx-light);font-size:11px;margin:8px 0">— OR —</div>
       <div>
         <label style="font-size:11px;font-weight:700;color:var(--tx-mid);display:block;margin-bottom:4px">CUSTOM TEST NAME</label>
         <input id="customLabName" type="text" placeholder="Enter test name (e.g. Prolactin)" style="width:100%">
       </div>`,
      () => {
        const sel    = document.getElementById('customLabSelect').value;
        const custom = document.getElementById('customLabName').value.trim();
        const testName = sel || custom;
        if (!testName) return;
        const grid = document.querySelector(`#labGrid_${trimKey}`);
        const addBtn = grid?.querySelector('.lab-add-btn');
        if (grid && addBtn) {
          const cell = document.createElement('div');
          cell.innerHTML = UI.labTestCellHTML(testName, trimKey, DB.getLabs(currentPatientID));
          grid.insertBefore(cell.firstElementChild, addBtn);
        }
      });
  }

  /* ════════════════════════════════════
     GROWTH & DOPPLER CHARTS
  ════════════════════════════════════ */
  function openGrowthChartModal(scanIdx) {
    const scans = UI.collectScans();
    const lmp   = document.getElementById('lmpDate').value;
    if (!lmp) { UI.toast('Enter LMP to view growth charts', 'error'); return; }

    const measures = ['BPD','HC','AC','FL'];
    const allData = {};
    measures.forEach(m => {
      allData[m] = { values:[], gas:[] };
      scans.forEach(s => {
        if (s.biometrics?.[m] && s.date) {
          const g = CALC.getGA(lmp, s.date);
          if (g) {
            allData[m].values.push(parseFloat(s.biometrics[m]));
            allData[m].gas.push(g.weeks + g.days/7);
          }
        }
      });
    });

    const curScan  = scans[scanIdx] || {};
    const curGA    = curScan.date ? CALC.getGA(lmp, curScan.date)?.weeks : null;
    const fgrRisks = curGA ? CONSTANTS.assessFGRRisk(curScan.biometrics||{}, curGA) : [];

    buildChartModal(allData, fgrRisks, curGA, 'growth');
  }

  function openDopplerChartModal(scanIdx) {
    const scans = UI.collectScans();
    const lmp   = document.getElementById('lmpDate').value;
    if (!lmp) { UI.toast('Enter LMP to view Doppler charts', 'error'); return; }

    const vessels = ['UA','MCA','DV','UtA'];
    const allData = {};
    const keyMap  = {UA:'UA_PI', MCA:'MCA_PI', DV:'DV_PI', UtA:'UtA_PI'};
    vessels.forEach(v => {
      allData[v] = { values:[], gas:[] };
      scans.forEach(s => {
        const val = s.doppler?.[keyMap[v]];
        if (val && s.date) {
          const g = CALC.getGA(lmp, s.date);
          if (g) { allData[v].values.push(parseFloat(val)); allData[v].gas.push(g.weeks + g.days/7); }
        }
      });
    });

    buildChartModal(allData, [], null, 'doppler');
  }

  function buildChartModal(allData, fgrRisks, curGA, mode) {
    const overlay = document.getElementById('chartModalOverlay');
    const content = document.getElementById('chartModalContent');
    if (!overlay || !content) return;

    const isGrowth = mode === 'growth';
    const tabs     = isGrowth ? ['BPD','HC','AC','FL','AFI'] : ['UA','MCA','DV','UtA'];
    let   activeTab = tabs[0];
    let   chartSource = 'intergrowth';
    let   chartInstance = null;

    function renderModal() {
      const fgrHtml = (fgrRisks.length && isGrowth) ? `
        <div class="fgr-warning">
          <div class="fgr-warning-title">⚠️ FGR Risk Indicators</div>
          ${fgrRisks.map(r=>`<div class="fgr-item">• ${r.label} (${r.severity})</div>`).join('')}
        </div>` : '';

      content.innerHTML = `
        <div class="chart-modal-header">
          <div class="chart-modal-title">${isGrowth ? '📈 Growth Charts' : '📊 Doppler Charts'}</div>
          <button class="btn-close-modal" onclick="document.getElementById('chartModalOverlay').style.display='none'">✕</button>
        </div>
        ${fgrHtml}
        ${isGrowth ? `<div class="chart-source-toggle">
          <label>Chart reference:</label>
          <button class="chart-tab ${chartSource==='intergrowth'?'active':''}" onclick="APP._setChartSource('intergrowth')">Intergrowth-21st</button>
          <button class="chart-tab ${chartSource==='hadlock'?'active':''}" onclick="APP._setChartSource('hadlock')">Hadlock</button>
        </div>` : ''}
        <div class="chart-tabs">
          ${tabs.map(t=>`<button class="chart-tab ${t===activeTab?'active':''}" onclick="APP._setChartTab('${t}')">${t}</button>`).join('')}
        </div>
        <canvas id="mainChartCanvas" style="width:100%;max-height:380px"></canvas>
        <div id="chartAnnotation" style="margin-top:10px;font-size:11px;color:var(--tx-light);text-align:center"></div>`;

      overlay.style.display = 'flex';
      requestAnimationFrame(() => renderChartTab());
    }

    function renderChartTab() {
      const canvas = document.getElementById('mainChartCanvas');
      if (!canvas) return;
      if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

      let chartData, yLabel;
      if (isGrowth) {
        if (activeTab === 'AFI') {
          const afiScans = UI.collectScans();
          const lmp = document.getElementById('lmpDate').value;
          const afiVals=[], afiGAs=[];
          afiScans.forEach(s => { if(s.biometrics?.AFI && s.date){ const g=CALC.getGA(lmp,s.date); if(g){afiVals.push(s.biometrics.AFI);afiGAs.push(g.weeks+g.days/7);}}});
          chartData = CALC.buildAFIChartData(afiVals, afiGAs);
          yLabel = 'AFI (cm)';
        } else {
          chartData = CALC.buildGrowthChartData(activeTab, allData[activeTab]?.values, allData[activeTab]?.gas, chartSource);
          yLabel = `${activeTab} (mm)`;
        }
      } else {
        chartData = CALC.buildDopplerChartData(activeTab, allData[activeTab]?.values, allData[activeTab]?.gas);
        yLabel = `${activeTab} PI`;
      }

      if (!chartData) { document.getElementById('chartAnnotation').textContent = 'No data available'; return; }

      chartInstance = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: chartData,
        options: {
          responsive:true, maintainAspectRatio:true,
          plugins:{
            legend:{ labels:{ font:{family:'DM Sans',size:11}, boxWidth:12 } },
            tooltip:{ bodyFont:{family:'DM Sans'}, titleFont:{family:'DM Sans'} }
          },
          scales:{
            x:{ title:{display:true,text:'Gestational Age (weeks)',font:{family:'DM Sans',size:11}},
                ticks:{font:{family:'DM Sans',size:10}} },
            y:{ title:{display:true,text:yLabel,font:{family:'DM Sans',size:11}},
                ticks:{font:{family:'DM Sans',size:10}} }
          }
        }
      });

      const ann = document.getElementById('chartAnnotation');
      if (isGrowth && activeTab !== 'AFI' && allData[activeTab]?.values.length && curGA) {
        const lastVal  = allData[activeTab].values.at(-1);
        const result   = CONSTANTS.getBiometricPercentile(activeTab, lastVal, curGA, chartSource);
        if (result)
          ann.innerHTML = `Latest ${activeTab}: <strong>${lastVal} mm</strong> at ${curGA} wks = <strong>${result.percentile}th percentile</strong> (${chartSource==='intergrowth'?'Intergrowth-21st':'Hadlock'})`;
      } else ann.textContent = '';
    }

    _chartTabSetter    = t => { activeTab   = t; renderModal(); };
    _chartSourceSetter = s => { chartSource = s; renderModal(); };

    renderModal();
  }

  /* ════════════════════════════════════
     FILE ATTACHMENTS
  ════════════════════════════════════ */
  function handleFileUpload(input, section, idx) {
    const files = Array.from(input.files);
    if (!files.length) return;
    files.forEach(file => {
      if (file.size > 5 * 1024 * 1024) { UI.toast(`⚠ ${file.name} exceeds 5MB limit`, 'error'); return; }
      const reader = new FileReader();
      reader.onload = e => {
        const att = {
          name: file.name,
          type: file.type,
          size: `${(file.size/1024).toFixed(1)} KB`,
          data: e.target.result,
          section, idx,
        };
        if (currentPatientID) {
          DB.addAttachment(currentPatientID, att);
          const listEl = document.getElementById(`attList_${section}_${idx}`);
          if (listEl) listEl.insertAdjacentHTML('beforeend', UI.attachmentItemHTML(att, section, idx));
          UI.toast(`📎 Attached: ${file.name}`, 'success', 2000);
        } else {
          UI.toast('Save patient first before attaching files', 'error');
        }
      };
      reader.readAsDataURL(file);
    });
    input.value = '';
  }

  function removeAttachment(attId, section, idx) {
    if (!currentPatientID) return;
    DB.removeAttachment(currentPatientID, attId);
    document.getElementById(`attItem_${attId}`)?.remove();
    UI.toast('Attachment removed', 'info', 1500);
  }

  function previewAttachment(id, data, type, name) {
    const overlay = document.getElementById('chartModalOverlay');
    const content = document.getElementById('chartModalContent');
    const isPDF   = type === 'application/pdf';
    const isImg   = type.startsWith('image/');
    content.innerHTML = `
      <div class="chart-modal-header">
        <div class="chart-modal-title">📎 ${name||'Attachment'}</div>
        <button class="btn-close-modal" onclick="document.getElementById('chartModalOverlay').style.display='none'">✕</button>
      </div>
      ${isImg ? `<img src="${data}" style="max-width:100%;border-radius:6px;margin-top:8px">` : ''}
      ${isPDF ? `<iframe src="${data}" style="width:100%;height:500px;border:none;margin-top:8px"></iframe>` : ''}
      ${!isImg && !isPDF ? `<div style="padding:20px;text-align:center;color:var(--tx-light)">Preview not available for this file type.</div>` : ''}`;
    overlay.style.display = 'flex';
  }

  function ocrAttachment(id, data) {
    if (typeof Tesseract === 'undefined') {
      UI.modal('OCR Not Loaded',
        'OCR requires Tesseract.js which loads from CDN. Please check your internet connection and reload the app. Once loaded, OCR will work offline too.',
        null);
      return;
    }
    const overlay = document.getElementById('chartModalOverlay');
    const content = document.getElementById('chartModalContent');
    content.innerHTML = `
      <div class="chart-modal-header">
        <div class="chart-modal-title">🔍 OCR — Extracting Text</div>
        <button class="btn-close-modal" onclick="document.getElementById('chartModalOverlay').style.display='none'">✕</button>
      </div>
      <div style="padding:20px;text-align:center">
        <div style="font-size:24px;margin-bottom:12px">⏳</div>
        <div id="ocrProgress" style="font-size:13px;color:var(--tx-mid)">Processing image...</div>
        <div style="margin-top:12px;height:4px;background:var(--border);border-radius:2px">
          <div id="ocrProgressBar" style="height:100%;background:var(--navy-light);border-radius:2px;width:0%;transition:width .3s ease"></div>
        </div>
      </div>`;
    overlay.style.display = 'flex';

    Tesseract.recognize(data, 'eng+ara', {
      logger: m => {
        const pct = Math.round((m.progress||0)*100);
        const bar = document.getElementById('ocrProgressBar');
        const lbl = document.getElementById('ocrProgress');
        if (bar) bar.style.width = `${pct}%`;
        if (lbl) lbl.textContent = `${m.status||'Processing'} (${pct}%)`;
      }
    }).then(({ data: { text } }) => {
      content.innerHTML = `
        <div class="chart-modal-header">
          <div class="chart-modal-title">🔍 OCR Result — Review & Copy</div>
          <button class="btn-close-modal" onclick="document.getElementById('chartModalOverlay').style.display='none'">✕</button>
        </div>
        <div style="font-size:11px;color:var(--tx-light);margin-bottom:8px">
          Review the extracted text below. You can copy values into the relevant fields manually.
        </div>
        <textarea style="width:100%;min-height:300px;font-family:var(--mono);font-size:12px;padding:12px;border:1px solid var(--border);border-radius:6px" id="ocrResult">${text}</textarea>
        <div style="margin-top:10px;display:flex;gap:8px">
          <button onclick="navigator.clipboard.writeText(document.getElementById('ocrResult').value).then(()=>APP._showToast('Copied','success'))" style="background:var(--navy);color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-family:var(--font);font-weight:600">Copy All</button>
          <button onclick="document.getElementById('chartModalOverlay').style.display='none'" style="background:#f0f4f8;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-family:var(--font)">Close</button>
        </div>`;
    }).catch(err => {
      content.innerHTML = `<div style="padding:20px;color:var(--red)">OCR failed: ${err.message}</div>`;
    });
  }

  function _showToast(msg, type) { UI.toast(msg, type); }

  function handleGlobalDrop(e) {
    e.preventDefault();
    const zone = e.target.closest('.attachment-zone');
    if (!zone || !currentPatientID) return;
    const section = zone.dataset.section;
    const idx     = parseInt(zone.dataset.idx);
    const files   = Array.from(e.dataTransfer.files);
    files.forEach(file => {
      const fakeInput = { files:[file] };
      handleFileUpload(fakeInput, section, idx);
    });
  }

  /* ════════════════════════════════════
     SUMMARY + STRUCTURED OBSTETRIC HISTORY
  ════════════════════════════════════ */
  function escapeHTML(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setText(id, value, fallback='—') {
    const element = document.getElementById(id);
    if (element) element.textContent = value || fallback;
  }

  function canEditPatientRecord() {
    if (_archivedRecordMode) return false;
    if (AUTH.getSessionKind() !== 'temporary') return true;
    return _temporaryPermissions?.has('patients.create')
      || _temporaryPermissions?.has('patients.update');
  }

  function archiveActorLabel() {
    return auditActorLabel();
  }

  function setArchivedRecordMode(patient=null) {
    const archived = Boolean(patient && DB.isArchived(patient));
    _archivedRecordMode = archived;
    const workspace = document.getElementById('patientWorkspace');
    const banner = document.getElementById('archivedRecordBanner');
    workspace?.classList.toggle('archived-record-mode', archived);
    if (banner) banner.hidden = !archived;

    document.querySelectorAll('[data-archive-disabled="true"]').forEach(control => {
      control.disabled = false;
      delete control.dataset.archiveDisabled;
    });

    if (!archived) return;

    setText(
      'archivedRecordMeta',
      `Archived on ${patient.archivedAt ? CALC.formatDate(patient.archivedAt) : 'date not recorded'} by ${patient.archivedBy || 'clinic-user'}`,
      'Archived date not recorded.'
    );
    setText('archivedRecordReason', patient.archiveReason || 'Reason not recorded.', 'Reason not recorded.');

    document.querySelectorAll(
      '#patientEditor input, #patientEditor select, #patientEditor textarea, #patientEditor button, '
      + '#btnSave, #btnQuickSave, #btnEditMode, .summary-actions button, .summary-inline-action'
    ).forEach(control => {
      if (control.id === 'btnRestoreArchivedPatient' || control.disabled) return;
      control.disabled = true;
      control.dataset.archiveDisabled = 'true';
    });
  }

  function setRecordMode(mode) {
    const hasPatient = Boolean(currentPatientID);
    _recordMode = (_archivedRecordMode || (mode === 'summary' && hasPatient)) ? 'summary' : 'edit';
    const summary = document.getElementById('patientSummaryView');
    const editor = document.getElementById('patientEditor');
    const summaryButton = document.getElementById('btnSummaryMode');
    const editButton = document.getElementById('btnEditMode');
    const quickSave = document.getElementById('btnQuickSave');
    const isSummary = _recordMode === 'summary';

    if (summary) summary.hidden = !isSummary;
    if (editor) editor.hidden = isSummary;
    summaryButton?.classList.toggle('active', isSummary);
    editButton?.classList.toggle('active', !isSummary);
    if (summaryButton) summaryButton.disabled = !hasPatient;
    if (editButton && _archivedRecordMode) editButton.disabled = true;
    if (quickSave) quickSave.hidden = isSummary || !canEditPatientRecord();

    const patient = hasPatient ? DB.getPatient(currentPatientID) : null;
    setText('recordModeTitle', patient?.fullName || 'New patient', 'New patient');
    setText(
      'recordModeSubtitle',
      isSummary
        ? `${patient?.patientID || currentPatientID} · Read-only clinical overview`
        : hasPatient
          ? 'Edit clinical information, then save the record.'
          : 'Enter the patient details to create a record.',
      '',
    );
  }

  function openEditorAt(targetId) {
    if (!canEditPatientRecord()) return;
    setRecordMode('edit');
    requestAnimationFrame(() => {
      const target = document.getElementById(targetId);
      target?.scrollIntoView({ behavior:'smooth', block:'start' });
      target?.querySelector('input, select, textarea, button')?.focus({ preventScroll:true });
    });
  }

  function autoGrowTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 76), 260)}px`;
    textarea.style.overflowY = textarea.scrollHeight > 260 ? 'auto' : 'hidden';
  }

  const PREGNANCY_OUTCOMES = [
    'Live birth', 'Stillbirth', 'Miscarriage / abortion', 'Ectopic pregnancy',
    'Molar pregnancy', 'Other',
  ];
  const DELIVERY_TYPES = [
    'Spontaneous vaginal delivery', 'Assisted vaginal - vacuum',
    'Assisted vaginal - forceps', 'Planned cesarean', 'Emergency cesarean',
    'VBAC', 'Breech vaginal delivery', 'Other',
  ];
  const ANOMALY_TYPES = [
    'Neural tube defect', 'Congenital heart defect', 'Cleft lip / palate',
    'Down syndrome / Trisomy 21', 'Other chromosomal anomaly', 'Limb anomaly',
    'Renal / urinary anomaly', 'Abdominal wall defect', 'Other',
  ];

  function optionList(items, selected, placeholder) {
    return `<option value="">${escapeHTML(placeholder)}</option>`
      + items.map(item => (
        `<option value="${escapeHTML(item)}" ${item === selected ? 'selected' : ''}>`
        + `${escapeHTML(item)}</option>`
      )).join('');
  }

  function previousPregnancyRowHTML(pregnancy={}, index=0) {
    const anomalyPresent = pregnancy.congenitalAnomaly === 'Yes';
    const customAnomaly = pregnancy.anomalyType === 'Other';
    return `
      <article class="previous-pregnancy-row" data-pregnancy-index="${index}">
        <div class="previous-pregnancy-header">
          <strong>Pregnancy ${index + 1}</strong>
          <button type="button" class="btn-remove-pregnancy" aria-label="Remove pregnancy ${index + 1}">Remove</button>
        </div>
        <div class="previous-pregnancy-grid">
          <div class="field-group"><label>Year</label>
            <input class="preg-year" type="number" min="1950" max="2100" value="${escapeHTML(pregnancy.year)}" placeholder="2022"></div>
          <div class="field-group"><label>Gestation at outcome (weeks)</label>
            <input class="preg-ga" type="number" min="4" max="44" step="0.1" value="${escapeHTML(pregnancy.gestationalAge)}" placeholder="39"></div>
          <div class="field-group"><label>Outcome</label>
            <select class="preg-outcome">${optionList(PREGNANCY_OUTCOMES, pregnancy.outcome, 'Select outcome')}</select></div>
          <div class="field-group"><label>Delivery type</label>
            <select class="preg-delivery">${optionList(DELIVERY_TYPES, pregnancy.deliveryType, 'Select delivery type')}</select></div>
          <div class="field-group"><label>Cesarean / assisted indication</label>
            <input class="preg-indication" value="${escapeHTML(pregnancy.indication)}" placeholder="If applicable"></div>
          <div class="field-group"><label>Birth weight (kg)</label>
            <input class="preg-weight" type="number" min="0.2" max="8" step="0.01" value="${escapeHTML(pregnancy.birthWeight)}" placeholder="3.2"></div>
          <div class="field-group"><label>Neonatal outcome</label>
            <input class="preg-neonatal" value="${escapeHTML(pregnancy.neonatalOutcome)}" placeholder="Well, NICU, neonatal loss"></div>
          <div class="field-group"><label>Maternal complications</label>
            <input class="preg-maternal" value="${escapeHTML(pregnancy.maternalComplications)}" placeholder="PET, PPH, GDM, none"></div>
          <div class="field-group"><label>Congenital anomaly</label>
            <select class="preg-anomaly">
              <option value="">Select</option>
              <option ${pregnancy.congenitalAnomaly === 'No' ? 'selected' : ''}>No</option>
              <option ${anomalyPresent ? 'selected' : ''}>Yes</option>
              <option ${pregnancy.congenitalAnomaly === 'Unknown' ? 'selected' : ''}>Unknown</option>
            </select>
          </div>
          <div class="field-group preg-anomaly-type-wrap" ${anomalyPresent ? '' : 'hidden'}><label>Anomaly type</label>
            <select class="preg-anomaly-type">${optionList(ANOMALY_TYPES, pregnancy.anomalyType, 'Select anomaly')}</select></div>
          <div class="field-group preg-anomaly-custom-wrap" ${anomalyPresent && customAnomaly ? '' : 'hidden'}><label>Describe anomaly</label>
            <input class="preg-anomaly-custom" value="${escapeHTML(pregnancy.anomalyDetails)}" placeholder="Manual description"></div>
        </div>
      </article>`;
  }

  function renderPreviousPregnancies(pregnancies=[]) {
    _previousPregnancies = Array.isArray(pregnancies) ? pregnancies : [];
    const list = document.getElementById('previousPregnancyList');
    if (!list) return;
    list.innerHTML = _previousPregnancies.length
      ? _previousPregnancies.map(previousPregnancyRowHTML).join('')
      : '<div class="previous-pregnancy-empty">No previous pregnancies recorded.</div>';
  }

  function collectPreviousPregnancies() {
    return Array.from(document.querySelectorAll('.previous-pregnancy-row')).map(row => ({
      year: row.querySelector('.preg-year')?.value || '',
      gestationalAge: row.querySelector('.preg-ga')?.value || '',
      outcome: row.querySelector('.preg-outcome')?.value || '',
      deliveryType: row.querySelector('.preg-delivery')?.value || '',
      indication: row.querySelector('.preg-indication')?.value.trim() || '',
      birthWeight: row.querySelector('.preg-weight')?.value || '',
      neonatalOutcome: row.querySelector('.preg-neonatal')?.value.trim() || '',
      maternalComplications: row.querySelector('.preg-maternal')?.value.trim() || '',
      congenitalAnomaly: row.querySelector('.preg-anomaly')?.value || '',
      anomalyType: row.querySelector('.preg-anomaly-type')?.value || '',
      anomalyDetails: row.querySelector('.preg-anomaly-custom')?.value.trim() || '',
    })).filter(item => Object.values(item).some(Boolean));
  }

  function addPreviousPregnancy() {
    _previousPregnancies = collectPreviousPregnancies();
    _previousPregnancies.push({});
    renderPreviousPregnancies(_previousPregnancies);
    DB.markChanged();
    requestAnimationFrame(() => {
      document.querySelector('.previous-pregnancy-row:last-child .preg-year')?.focus();
    });
  }

  function handlePreviousPregnancyClick(event) {
    const removeButton = event.target.closest('.btn-remove-pregnancy');
    if (!removeButton) return;
    const row = removeButton.closest('.previous-pregnancy-row');
    row?.remove();
    renderPreviousPregnancies(collectPreviousPregnancies());
    DB.markChanged();
  }

  function handlePreviousPregnancyChange(event) {
    const row = event.target.closest('.previous-pregnancy-row');
    if (!row) return;
    if (event.target.classList.contains('preg-anomaly')) {
      const show = event.target.value === 'Yes';
      row.querySelector('.preg-anomaly-type-wrap').hidden = !show;
      row.querySelector('.preg-anomaly-custom-wrap').hidden =
        !show || row.querySelector('.preg-anomaly-type').value !== 'Other';
    }
    if (event.target.classList.contains('preg-anomaly-type')) {
      row.querySelector('.preg-anomaly-custom-wrap').hidden =
        event.target.value !== 'Other';
    }
  }

  function renderPregnancyHistorySummary(pregnancies) {
    const target = document.getElementById('summaryPregnancyHistory');
    if (!target) return;
    if (!pregnancies.length) {
      target.className = 'summary-empty';
      target.textContent = 'No previous pregnancy details recorded.';
      return;
    }
    target.className = 'summary-pregnancy-list';
    target.innerHTML = pregnancies.map((item, index) => {
      const anomaly = item.congenitalAnomaly === 'Yes'
        ? ` · Anomaly: ${escapeHTML(item.anomalyDetails || item.anomalyType || 'recorded')}`
        : '';
      return `<div>
        <strong>${escapeHTML(item.year || `Pregnancy ${index + 1}`)}</strong>
        <span>${escapeHTML(item.outcome || 'Outcome not recorded')}
          ${item.gestationalAge ? ` · ${escapeHTML(item.gestationalAge)} weeks` : ''}
          ${item.deliveryType ? ` · ${escapeHTML(item.deliveryType)}` : ''}
          ${item.birthWeight ? ` · ${escapeHTML(item.birthWeight)} kg` : ''}${anomaly}</span>
      </div>`;
    }).join('');
  }

  function renderRecentVisit(patientId) {
    const visits = patientId ? DB.getVisits(patientId) : [];
    const completed = visits.filter(visit => visit.date || visit.findings || visit.notes);
    const visit = completed.sort((a,b) => String(b.date).localeCompare(String(a.date)))[0];
    const target = document.getElementById('summaryRecentVisit');
    if (!target) return;
    if (!visit) {
      target.className = 'summary-empty';
      target.textContent = 'No follow-up visit recorded.';
      return;
    }
    target.className = 'summary-recent-visit';
    target.innerHTML = `
      <div><span>Date</span><strong>${escapeHTML(visit.date ? CALC.formatDate(new Date(`${visit.date}T12:00:00`)) : 'Not dated')}</strong></div>
      <div><span>Blood pressure</span><strong>${escapeHTML(visit.bp || 'Not recorded')}</strong></div>
      <div><span>Weight</span><strong>${escapeHTML(visit.weight ? `${visit.weight} kg` : 'Not recorded')}</strong></div>
      <p>${escapeHTML(visit.findings || visit.notes || 'No clinical note recorded.')}</p>`;
  }

  function renderActiveProblemsSummary(patientId) {
    const target = document.getElementById('summaryActiveProblems');
    if (!target) return;
    const problems = patientId ? DB.getActiveProblems(patientId) : [];
    if (!problems.length) {
      target.className = 'summary-empty';
      target.textContent = 'No active problems recorded.';
      return;
    }
    target.className = 'summary-problem-list';
    target.innerHTML = problems.map(problem => {
      const details = [
        problem.status,
        problem.category,
        problem.severity ? `${problem.severity} severity` : '',
      ].filter(Boolean).join(' · ');
      return `<div class="summary-problem-item">
        <strong>${escapeHTML(problem.title || 'Untitled problem')}</strong>
        <span>${escapeHTML(details || 'Active problem')}</span>
        ${problem.notes ? `<span>${escapeHTML(problem.notes)}</span>` : ''}
      </div>`;
    }).join('');
  }

  function renderPatientSummary(data) {
    if (!data) return;
    const ga = CALC.getGA(data.lmpDate, data.calcDate || CALC.todayISO());
    const edd = CALC.getEDD(data.lmpDate);
    setText('summaryGA', ga ? `${ga.weeks} weeks + ${ga.days} days` : 'Not calculated');
    setText('summaryEDD', edd ? CALC.formatDate(edd) : 'Not calculated');
    setText('summaryTPAL', `T${data.tpalT || 0}-P${data.tpalP || 0}-A${data.tpalA || 0}-L${data.tpalL || 0}`);
    setText('summaryBloodGroup', data.bloodGroup, 'Not recorded');
    setText('summaryPregnancyType', data.pregnancyType, 'Not recorded');
    setText('summaryMedicalHistory', data.medicalHistory, 'Not recorded');
    setText('summarySurgicalHistory', data.surgicalHistory, 'Not recorded');
    setText('summaryFamilyHistory', data.familyHistory, 'Not recorded');
    setText('summaryAllergies', data.allergyHistory, 'Not recorded');

    renderPregnancyHistorySummary(data.previousPregnancies || []);
    renderActiveProblemsSummary(data.patientID || currentPatientID);
    renderRecentVisit(data.patientID || currentPatientID);

    const alerts = [];
    if (data.riskLevel && data.riskLevel !== 'Low Risk') {
      alerts.push({ level:'attention', text:`Risk classification: ${data.riskLevel}` });
    }
    if (!data.allergyHistory) {
      alerts.push({ level:'missing', text:'Allergy status has not been recorded.' });
    }
    if (!data.lmpDate) {
      alerts.push({ level:'missing', text:'LMP is missing; gestational age and EDD cannot be calculated.' });
    }
    if (!alerts.length) {
      alerts.push({ level:'clear', text:'No active documentation alerts.' });
    }
    const summaryAlerts = document.getElementById('summaryAlerts');
    if (summaryAlerts) summaryAlerts.innerHTML = alerts.map(alert =>
      `<div class="summary-alert ${alert.level}">${escapeHTML(alert.text)}</div>`
    ).join('');
  }

  /* ════════════════════════════════════
     COLLECT FORM DATA
  ════════════════════════════════════ */
  function collectFormData() {
    return {
      fullName:      document.getElementById('fullName').value.trim(),
      age:           document.getElementById('age').value,
      phone:         document.getElementById('phone').value.trim(),
      address:       document.getElementById('address').value.trim(),
      patientID:     document.getElementById('patientID').value || currentPatientID,
      patientStatus: document.getElementById('patientStatus').value,
      riskLevel:     document.getElementById('riskLevelInput').value || 'Low Risk',
      bloodGroup:    document.getElementById('bloodGroup').value,
      basalWeight:   document.getElementById('basalWeight').value,
      pregnancyType: document.getElementById('pregnancyType').value,
      chorionicity:  document.getElementById('chorionicity').value,
      amnionicity:   document.getElementById('amnionicity').value,
      medicalHistory: document.getElementById('medicalHistory').value.trim(),
      surgicalHistory: document.getElementById('surgicalHistory').value.trim(),
      familyHistory: document.getElementById('familyHistory').value.trim(),
      allergyHistory: document.getElementById('allergyHistory').value.trim(),
      previousPregnancies: collectPreviousPregnancies(),
      hospitalName:  document.getElementById('hospitalName2').value === 'other-custom'
                     ? document.getElementById('hospitalCustom').value
                     : document.getElementById('hospitalName2').value,
      tpalT: document.getElementById('tpalT').value,
      tpalP: document.getElementById('tpalP').value,
      tpalA: document.getElementById('tpalA').value,
      tpalL: document.getElementById('tpalL').value,
      lmpDate:  document.getElementById('lmpDate').value,
      calcDate: document.getElementById('calcDate').value,
    };
  }

  function validate(data) {
    const errors = [];
    if (!data.fullName || data.fullName.split(/\s+/).filter(Boolean).length < 3)
      errors.push('Full name requires at least 3 names.');
    const tpalErrs = CALC.validateTPAL(data.tpalT, data.tpalP, data.tpalA, data.tpalL);
    errors.push(...tpalErrs);
    return errors;
  }

  /* ════════════════════════════════════
     SAVE
  ════════════════════════════════════ */
  async function syncTemporaryRecord(id, data) {
    if (AUTH.getSessionKind() !== 'temporary') return;
    await SUPA.savePatient(data);
    if (
      _temporaryPermissions.has('related.create')
      || _temporaryPermissions.has('related.update')
    ) {
      await SUPA.saveRelated('visits', id, DB.getVisits(id));
      await SUPA.saveRelated('scans', id, DB.getScans(id));
      await SUPA.saveRelated('procedures', id, DB.getProcedures(id));
      await SUPA.saveRelated('labs', id, DB.getLabs(id));
    }
  }

  async function fullSave(options={}) {
    const forTransition = options?.forTransition === true;
    if (!ensureClinicalMutationAllowed('Save')) return { localSaved:false, cloudSynced:false };
    if (_archivedRecordMode) {
      UI.toast('Restore this archived patient before editing or saving.', 'warning', 5000);
      return { localSaved:false, cloudSynced:false };
    }
    try {
      DB.assertClinicalStorageReadable();
    } catch (error) {
      setAutoSaveStatus('changed');
      showStorageFailure(
        error,
        'Stored data could not be read',
        'Stored clinical data appears corrupted. Save was blocked to prevent data loss.'
      );
      return { localSaved:false, cloudSynced:false };
    }
    const data   = collectFormData();
    const errors = validate(data);
    if (errors.length) {
      UI.toast('⚠ ' + errors[0], 'error', 4000);
      return { localSaved:false, cloudSynced:false };
    }
    const existingPatientID = data.patientID || currentPatientID;
    const wasExisting = Boolean(existingPatientID && DB.getPatient(existingPatientID));
    const previousProblems = wasExisting ? DB.getProblems(existingPatientID) : [];
    let savedProblems = [];
    let id;
    try {
      id = DB.savePatient(data);
      currentPatientID = id;
      document.getElementById('patientID').value = id;
      DB.setCurrentPatient(id);
      DB.saveVisits(id,     UI.collectVisits());
      DB.saveScans(id,      UI.collectScans());
      DB.saveProcedures(id, UI.collectProcs());
      DB.saveLabs(id,       UI.collectLabs());
      DB.saveProblems(id,   UI.collectProblems());
      savedProblems = DB.getProblems(id);
      DB.saveMedications(id, UI.collectMedications());
      DB.clearChanged();
      recordAuditEvent({
        operation: wasExisting ? 'patient.update' : 'patient.create',
        patientID: id,
        entityType: 'patient',
        summary: wasExisting
          ? 'Manual save updated patient record and related collections'
          : 'Manual save created patient record and related collections',
        status: 'success',
      });
      recordProblemAuditEvents(previousProblems, savedProblems, id);
    } catch (error) {
      console.error('Save failed:', error);
      setAutoSaveStatus('changed');
      bestEffortAuditFailure('manual save', existingPatientID, error);
      showStorageFailure(error);
      return { localSaved:false, cloudSynced:false };
    }
    document.getElementById('breadcrumbText').textContent = data.fullName;
    setAutoSaveStatus('saved');
    updateStorageMeter();
    runRiskEngine();
    try {
      await syncTemporaryRecord(id, { ...data, patientID: id });
      UI.toast(`✅ Saved: ${data.fullName} (${id})`, 'success');
      renderPatientSummary({ ...data, patientID: id });
      setRecordMode('summary');
      return { localSaved:true, cloudSynced:true };
    } catch (error) {
      console.error('Temporary cloud save failed:', error);
      if (!forTransition) {
        UI.toast(
          'Saved on this device, but cloud sync failed. The record may not be available on other devices yet.',
          'warning',
          8000,
        );
      }
      return { localSaved:true, cloudSynced:false };
    }
  }

  async function quickSave() {
    if (!ensureClinicalMutationAllowed('Quick Save')) return false;
    if (_archivedRecordMode) {
      UI.toast('Restore this archived patient before editing or saving.', 'warning', 5000);
      return;
    }
    if (!_hasMinimumData()) { UI.toast('Enter at least 3-word name to save', 'error'); return; }
    if (!currentPatientID) {
      await fullSave();
      return;
    }
    const saved = await performAutoSave();
    if (!saved) return;
    const data = collectFormData();
    try {
      await syncTemporaryRecord(currentPatientID, {
        ...data,
        patientID: currentPatientID,
      });
      UI.toast('⚡ Saved', 'success', 1800);
    } catch (error) {
      UI.toast(`Cloud save failed: ${error.message}`, 'error', 7000);
    }
  }

  /* ════════════════════════════════════
     LOAD PATIENT
  ════════════════════════════════════ */
  function loadPatientIntoForm(p) {
    startMedicationHelperWatcher();
    const set = (id,v) => { const el=document.getElementById(id); if(el) el.value=v||''; };
    set('fullName',p.fullName); set('age',p.age); set('phone',p.phone);
    set('address',p.address);  set('patientID',p.patientID);
    set('bloodGroup',p.bloodGroup); set('basalWeight',p.basalWeight);
    set('pregnancyType',p.pregnancyType); set('chorionicity',p.chorionicity);
    set('amnionicity',p.amnionicity);
    set('medicalHistory',p.medicalHistory); set('surgicalHistory',p.surgicalHistory);
    set('familyHistory',p.familyHistory); set('allergyHistory',p.allergyHistory);
    set('tpalT',p.tpalT); set('tpalP',p.tpalP); set('tpalA',p.tpalA); set('tpalL',p.tpalL);
    set('lmpDate',p.lmpDate); set('calcDate',p.calcDate||CALC.todayISO());
    set('riskLevelInput',p.riskLevel||'Low Risk');

    const statusEl = document.getElementById('patientStatus');
    statusEl.value = p.patientStatus||'';
    UI.applyStatusColor(statusEl);

    const outcomes = ['Delivered by CS','Delivered by SVD','Abortion','IUFD'];
    document.getElementById('hospitalRow').style.display = outcomes.includes(p.patientStatus)?'grid':'none';
    set('hospitalName2', p.hospitalName);
    document.getElementById('multiPregFields').style.display =
      ['Twin','Triplet','Higher Order Multiple'].includes(p.pregnancyType) ? 'block':'none';

    document.getElementById('topbarRiskWrap').innerHTML = UI.riskBadgeHTML(p.riskLevel||'Low Risk');

    const lmp    = p.lmpDate;
    const visits = DB.getVisits(p.patientID);
    const scans  = DB.getScans(p.patientID);
    const procs  = DB.getProcedures(p.patientID);
    const labs   = DB.getLabs(p.patientID);
    const problems = DB.getProblems(p.patientID);
    const medications = DB.getMedications(p.patientID);

    document.getElementById('ultraBody').innerHTML =
      scans.map((s,i)=>UI.scanRowHTML(s,i,lmp)).join('');
    document.getElementById('procBody').innerHTML  =
      (procs.length?procs:[{},{},{}]).map((s,i)=>UI.procRowHTML(s,i,lmp)).join('');
    document.getElementById('visitBody').innerHTML =
      (visits.length?visits:[{},{},{}]).map((v,i)=>UI.visitRowHTML(v,i,lmp,medications.filter(med => med.status === 'Active'))).join('');
    renderProblemRows(problems);
    renderMedicationRows(medications);
    refreshVisitMedicationHelpers();

    renderPreviousPregnancies(p.previousPregnancies || []);
    buildLabSections(labs);
    updateTPAL();
    updateCalculations();
    document.getElementById('breadcrumbText').textContent = p.fullName||'Patient Record';
    document.querySelectorAll('textarea[data-auto-grow]').forEach(autoGrowTextarea);
    renderPatientSummary(p);
    setArchivedRecordMode(p);
    setRecordMode('summary');
    showPatientWorkspace();
  }

  function setPatientWorkspaceState(state) {
    const placeholder = document.getElementById('noPatientPlaceholder');
    const workspace = document.getElementById('patientWorkspace');
    const showPlaceholder = state === 'placeholder';
    if (placeholder) {
      placeholder.hidden = !showPlaceholder;
      placeholder.style.display = showPlaceholder ? '' : 'none';
      placeholder.classList.toggle('is-hidden', !showPlaceholder);
    }
    if (workspace) {
      workspace.hidden = showPlaceholder;
      workspace.style.display = showPlaceholder ? 'none' : '';
      workspace.classList.toggle('is-hidden', showPlaceholder);
    }
  }

  function showPatientWorkspace() {
    setPatientWorkspaceState('workspace');
  }

  function showPatientPlaceholder() {
    setArchivedRecordMode(null);
    setPatientWorkspaceState('placeholder');
    setText('recordModeTitle', 'No patient selected', 'No patient selected');
    setText('recordModeSubtitle', 'Choose a patient or start a new registration.', '');
  }

  const TRANSITION_DYNAMIC_CONTAINERS = [
    'previousPregnancyList', 'problemList', 'medicationList', 'ultraBody',
    'procBody', 'visitBody', 'labSection_t1', 'labSection_t2', 'labSection_t3',
  ];
  const TRANSITION_SUMMARY_TARGETS = [
    'summaryGA', 'summaryEDD', 'summaryTPAL', 'summaryBloodGroup',
    'summaryPregnancyType', 'summaryMedicalHistory', 'summarySurgicalHistory',
    'summaryFamilyHistory', 'summaryAllergies', 'summaryPregnancyHistory',
    'summaryActiveProblems', 'summaryRecentVisit', 'summaryAlerts',
  ];
  const TRANSITION_STATE_TARGETS = [
    'patientSummaryView', 'patientEditor', 'archivedRecordBanner',
    'noPatientPlaceholder', 'patientWorkspace', 'hospitalRow', 'multiPregFields',
  ];

  function captureControlStates(root) {
    return Array.from(root?.querySelectorAll('input, select, textarea, button') || []).map(control => ({
      value: 'value' in control ? control.value : undefined,
      checked: 'checked' in control ? control.checked : undefined,
      disabled: control.disabled,
    }));
  }

  function restoreControlStates(root, states=[]) {
    Array.from(root?.querySelectorAll('input, select, textarea, button') || []).forEach((control, index) => {
      const state = states[index];
      if (!state) return;
      if (state.value !== undefined && 'value' in control) control.value = state.value;
      if (state.checked !== undefined && 'checked' in control) control.checked = state.checked;
      control.disabled = Boolean(state.disabled);
    });
  }

  function capturePatientWorkspaceSnapshot() {
    const dynamic = {};
    TRANSITION_DYNAMIC_CONTAINERS.forEach(id => {
      const element = document.getElementById(id);
      if (!element) return;
      dynamic[id] = { html:element.innerHTML, controls:captureControlStates(element) };
    });
    const staticControls = {};
    document.querySelectorAll('#patientWorkspace input[id], #patientWorkspace select[id], #patientWorkspace textarea[id]')
      .forEach(control => {
        if (TRANSITION_DYNAMIC_CONTAINERS.some(id => document.getElementById(id)?.contains(control))) return;
        staticControls[control.id] = {
          value:control.value,
          checked:'checked' in control ? control.checked : undefined,
          disabled:control.disabled,
        };
      });
    const content = {};
    [...TRANSITION_SUMMARY_TARGETS, 'breadcrumbText', 'recordModeTitle', 'recordModeSubtitle',
      'archivedRecordMeta', 'archivedRecordReason', 'topbarRiskWrap'].forEach(id => {
      const element = document.getElementById(id);
      if (element) content[id] = { html:element.innerHTML, className:element.className };
    });
    const elementState = {};
    TRANSITION_STATE_TARGETS.forEach(id => {
      const element = document.getElementById(id);
      if (!element) return;
      elementState[id] = {
        hidden:element.hidden,
        className:element.className,
        style:element.getAttribute('style'),
      };
    });
    return {
      dynamic,
      staticControls,
      content,
      elementState,
      previousPregnancies:collectPreviousPregnancies(),
      recordMode:_recordMode,
      archivedRecordMode:_archivedRecordMode,
      autoSaveStatus:document.getElementById('autoSaveStatus')?.className || '',
      autoSaveLabel:document.getElementById('autoSaveLabel')?.textContent || '',
    };
  }

  function restorePatientWorkspaceSnapshot(snapshot) {
    Object.entries(snapshot.dynamic).forEach(([id, state]) => {
      const element = document.getElementById(id);
      if (!element) return;
      element.innerHTML = state.html;
      restoreControlStates(element, state.controls);
    });
    Object.entries(snapshot.staticControls).forEach(([id, state]) => {
      const control = document.getElementById(id);
      if (!control) return;
      control.value = state.value;
      if (state.checked !== undefined && 'checked' in control) control.checked = state.checked;
      control.disabled = Boolean(state.disabled);
    });
    Object.entries(snapshot.content).forEach(([id, state]) => {
      const element = document.getElementById(id);
      if (!element) return;
      element.innerHTML = state.html;
      element.className = state.className;
    });
    Object.entries(snapshot.elementState).forEach(([id, state]) => {
      const element = document.getElementById(id);
      if (!element) return;
      element.hidden = state.hidden;
      element.className = state.className;
      if (state.style === null) element.removeAttribute('style');
      else element.setAttribute('style', state.style);
    });
    _previousPregnancies = snapshot.previousPregnancies;
    _recordMode = snapshot.recordMode;
    _archivedRecordMode = snapshot.archivedRecordMode;
    const status = document.getElementById('autoSaveStatus');
    const label = document.getElementById('autoSaveLabel');
    if (status) status.className = snapshot.autoSaveStatus;
    if (label) label.textContent = snapshot.autoSaveLabel;
    refreshVisitMedicationHelpers();
  }

  async function commitPatientTransition(targetPatient=null, { newPatient=false } = {}) {
    const previousPatientID = currentPatientID;
    const previousStoredID = DB.getCurrentPatient();
    const previousWorkspace = capturePatientWorkspaceSnapshot();
    const targetID = newPatient ? null : targetPatient?.patientID;

    try {
      DB.setCurrentPatient(targetID);
      if (newPatient) {
        clearForm({ persistCurrentPatient:false, clearPending:false });
      } else {
        if (!targetPatient) throw new Error('Target patient record was not found');
        currentPatientID = targetID;
        startMedicationHelperWatcher();
        showPatientWorkspace();
        loadPatientIntoForm(targetPatient);
        renderNavActive('patient');
        showPatientWorkspace();
        refreshVisitMedicationHelpers();
        window.scrollTo(0,0);
        UI.toast(`📂 ${targetPatient.fullName}`, 'info', 2000);
      }
      DB.discardChanged();
      setAutoSaveStatus('saved');
      return { transitioned:true };
    } catch (error) {
      currentPatientID = previousPatientID;
      let rollbackError = null;
      try { DB.setCurrentPatient(previousStoredID); } catch (caught) { rollbackError = caught; }
      try { restorePatientWorkspaceSnapshot(previousWorkspace); }
      catch (caught) { error.workspaceRestoreError = caught; }
      if (rollbackError) error.rollbackError = rollbackError;
      throw error;
    }
  }

  function promptUnsavedTransition() {
    return new Promise(resolve => {
      const overlay = document.getElementById('modalOverlay');
      const cancel = document.getElementById('modalCancel');
      const finish = choice => {
        if (overlay) overlay.style.display = 'none';
        resolve(choice);
      };
      UI.modal(
        'Unsaved changes',
        `<p>You have unsaved changes. Save before switching patients?</p>
         <div class="modal-inline-actions">
           <button type="button" id="btnSaveAndSwitch" class="btn-modal-confirm">Save and switch</button>
         </div>`,
        () => finish('discard'),
        true
      );
      const discard = document.getElementById('modalConfirm');
      if (discard) discard.textContent = 'Switch without saving';
      if (cancel) {
        cancel.textContent = 'Cancel';
        cancel.onclick = () => finish('cancel');
        setTimeout(() => cancel.focus(), 0);
      }
      document.getElementById('btnSaveAndSwitch')?.addEventListener('click', () => finish('save'));
    });
  }

  async function guardPatientTransition() {
    if (!DB.hasPendingChanges()) return { proceed:true, cloudSynced:true, decision:'none' };
    const choice = await promptUnsavedTransition();
    if (choice === 'cancel') return { proceed:false, cloudSynced:true, decision:'cancel' };
    if (choice === 'discard') return { proceed:true, cloudSynced:true, decision:'discard' };
    const result = await fullSave({ forTransition:true });
    return {
      proceed: Boolean(result?.localSaved),
      cloudSynced: result?.cloudSynced !== false,
      decision:'save',
    };
  }

  function showPatientTransitionFailure(error) {
    console.error('Patient transition failed:', error);
    if (DB.hasPendingChanges()) setAutoSaveStatus('changed');
    if (error?.rollbackError) {
      try { enterTransitionRecovery(error); }
      catch (stateError) {
        console.error('Could not enter transition recovery state:', stateError);
        showRecoveryRequiredModal();
      }
      return;
    }
    showStorageFailure(
      error,
      'Patient transition failed',
      'The previous patient remains open and unsaved changes were preserved.'
    );
  }

  async function openPatientInternal(id) {
    if (!ensureClinicalMutationAllowed('Patient switching')) return false;
    if (id === currentPatientID) {
      renderNavActive('patient');
      showPatientWorkspace();
      return true;
    }
    DB.assertClinicalStorageReadable();
    const patient = DB.getPatient(id);
    if (!patient) return false;
    const transition = await guardPatientTransition();
    if (!transition.proceed) return false;
    await commitPatientTransition(patient);
    if (!transition.cloudSynced) {
      UI.toast(
        'Saved on this device, but cloud sync failed. The record may not be available on other devices yet.',
        'warning',
        8000
      );
    }
    return true;
  }

  async function openPatient(id) {
    try {
      const opened = await openPatientInternal(id);
      return { opened:Boolean(opened) };
    } catch (error) {
      showPatientTransitionFailure(error);
      return { opened:false, error };
    }
  }

  /* ════════════════════════════════════
     NEW PATIENT
  ════════════════════════════════════ */
  async function confirmNewPatientInternal() {
    if (!ensureClinicalMutationAllowed('New Patient')) return false;
    const transition = await guardPatientTransition();
    if (!transition.proceed) return false;
    await commitPatientTransition(null, { newPatient:true });
    if (!transition.cloudSynced) {
      UI.toast(
        'Saved on this device, but cloud sync failed. The record may not be available on other devices yet.',
        'warning',
        8000
      );
    }
    return true;
  }

  async function confirmNewPatient() {
    try {
      const opened = await confirmNewPatientInternal();
      return { opened:Boolean(opened) };
    } catch (error) {
      showPatientTransitionFailure(error);
      return { opened:false, error };
    }
  }

  function clearForm({ persistCurrentPatient=true, clearPending=true } = {}) {
    currentPatientID = null;
    if (persistCurrentPatient) DB.setCurrentPatient(null);
    showPatientWorkspace();
    setArchivedRecordMode(null);
    ['fullName','age','phone','address','patientID','bloodGroup','basalWeight',
     'pregnancyType','chorionicity','amnionicity','tpalT','tpalP','tpalA','tpalL',
     'lmpDate','hospitalName2','hospitalCustom','riskLevelInput','medicalHistory',
     'surgicalHistory','familyHistory','allergyHistory'].forEach(id => {
      const el = document.getElementById(id); if(el) el.value='';
    });
    const s = document.getElementById('patientStatus');
    s.value=''; UI.applyStatusColor(s);
    document.getElementById('calcDate').value = CALC.todayISO();
    document.getElementById('hospitalRow').style.display       = 'none';
    document.getElementById('multiPregFields').style.display   = 'none';
    document.getElementById('topbarRiskWrap').innerHTML        = UI.riskBadgeHTML('Low Risk');
    initTableRows();
    renderPreviousPregnancies([]);
    buildLabSections(null);
    updateTPAL(); updateCalculations();
    document.getElementById('breadcrumbText').textContent = 'New Patient';
    setRecordMode('edit');
    renderNavActive('patient');
    showPatientWorkspace();
    setText('recordModeTitle', 'New patient registration', 'New patient registration');
    setText('recordModeSubtitle', 'Enter patient details, then save to create a record.', '');
    refreshVisitMedicationHelpers();
    document.getElementById('fullName').focus();
    if (clearPending) DB.discardChanged();
    setAutoSaveStatus('saved');
    UI.toast('🆕 New patient form ready', 'info');
  }

  function confirmArchivePatient(id) {
    if (!ensureClinicalMutationAllowed('Archive')) return false;
    const p = DB.getPatient(id); if(!p) return;
    UI.modal(
      'Archive Patient',
      `<p>Archive <strong>${escapeHTML(p.fullName || p.patientID)}</strong>? The record will be hidden from active lists but can be restored.</p>
       <label class="modal-field-label" for="archiveReasonInput">Archive reason required</label>
       <textarea id="archiveReasonInput" class="modal-textarea" rows="3" placeholder="Enter the reason for archiving this record"></textarea>`,
      () => {
        if (!ensureClinicalMutationAllowed('Archive')) return;
        const reason = document.getElementById('archiveReasonInput')?.value.trim() || '';
        if (!reason) {
          UI.toast('Archive reason is required', 'error', 4000);
          setTimeout(() => confirmArchivePatient(id), 250);
          return;
        }
        try {
          const archived = DB.archivePatient(id, reason, archiveActorLabel());
          recordAuditEvent({
            operation: 'archive',
            patientID: id,
            entityType: 'patient',
            reason,
            summary: 'Archived patient record',
            status: 'success',
          });
          refreshDBTable();
          refreshDashboard();
          if (currentPatientID === id) loadPatientIntoForm(archived);
          UI.toast('Patient archived', 'warning', 3000);
        } catch (error) {
          console.error('Archive failed:', error);
          UI.toast(error.message || 'Archive failed', 'error', 5000);
        }
      },
      true
    );
    setTimeout(() => document.getElementById('archiveReasonInput')?.focus(), 50);
  }

  function restoreArchivedPatient(id) {
    if (!ensureClinicalMutationAllowed('Restore')) return false;
    const p = DB.getPatient(id); if(!p) return;
    try {
      const restored = DB.restorePatient(id, archiveActorLabel());
      recordAuditEvent({
        operation: 'restore',
        patientID: id,
        entityType: 'patient',
        summary: 'Restored archived patient record',
        status: 'success',
      });
      refreshDBTable();
      refreshDashboard();
      if (currentPatientID === id) {
        loadPatientIntoForm(restored);
        setArchivedRecordMode(null);
        setRecordMode('summary');
        showPatientWorkspace();
      }
      UI.toast('Patient restored', 'success', 3000);
    } catch (error) {
      console.error('Restore failed:', error);
      UI.toast(error.message || 'Restore failed', 'error', 5000);
    }
  }

  function confirmDeletePatient(id) {
    confirmArchivePatient(id);
  }

  /* ════════════════════════════════════
     DB + DASHBOARD
  ════════════════════════════════════ */
  function refreshDBTable() {
    UI.renderDBTable(DB.getAllPatients(),
      document.getElementById('dbSearch')?.value||'',
      document.getElementById('dbFilter')?.value||'',
      Boolean(document.getElementById('dbShowArchived')?.checked));
  }

  function refreshDashboard() { UI.renderDashboard(getDashboardStats()); }

  function updateStorageMeter() { UI.updateStorageMeter(); }

  /* ════════════════════════════════════
     PDF EXPORT
  ════════════════════════════════════ */
  function exportPDF() {
    const storedPatient = currentPatientID ? DB.getPatient(currentPatientID) : null;
    const data = {
      ...collectFormData(),
      isArchived: storedPatient?.isArchived,
      archivedAt: storedPatient?.archivedAt,
      archivedBy: storedPatient?.archivedBy,
      archiveReason: storedPatient?.archiveReason,
    };
    if (!data.fullName || data.fullName.split(/\s+/).filter(Boolean).length < 3) {
      UI.toast('⚠ Enter patient name before export', 'error'); return;
    }
    const ga   = CALC.getGA(data.lmpDate, data.calcDate||CALC.todayISO());
    const edd  = CALC.getEDD(data.lmpDate);
    const trim = ga ? CALC.getTrimester(ga.weeks) : null;
    const visits = UI.collectVisits().filter(v=>v.date||v.findings);
    const scans  = UI.collectScans().filter(s=>s.type||s.date);
    const procs  = UI.collectProcs().filter(p=>p.type||p.date);
    const labs   = UI.collectLabs();
    const milestones = ga ? CALC.getMilestones(ga.weeks) : [];

    const html = buildPDFHTML(data, ga, edd, trim, visits, scans, procs, labs, milestones);
    const win  = window.open('','_blank','width=960,height=750');
    win.document.write(html); win.document.close();
    setTimeout(() => { win.focus(); win.print(); }, 700);
    UI.toast('📄 PDF ready', 'success');
  }

  function printRecord() { exportPDF(); }

  function buildPDFHTML(data, ga, edd, trim, visits, scans, procs, labs, milestones) {
    const normalizedScans = scans.map(scan => UI.normalizeScan ? UI.normalizeScan(scan) : scan);
    const hasBiometryDetails = normalizedScans.some(s =>
      ['BPD','HC','AC','FL','AFI','DVP','EFW'].some(key => s.biometrics?.[key])
    );
    const hasDopplerDetails = normalizedScans.some(s =>
      s.doppler?.UA_PI || s.doppler?.MCA_PI || s.doppler?.DV_PI || s.doppler?.UtA_PI
    );
    const abnormalLabs = [];
    ['t1','t2','t3'].forEach(t => {
      const tr = {t1:1,t2:2,t3:3}[t];
      Object.entries(labs[t]||{}).forEach(([key,entry]) => {
        if (!entry?.value) return;
        const testName = key.replace(/_/g,' ');
        const flag = CONSTANTS.flagLab(testName, entry.value, tr);
        if (flag.flag === 'high' || flag.flag === 'low')
          abnormalLabs.push({name:testName, value:entry.value, flag:flag.label, color:flag.color, trim:t.toUpperCase()});
      });
    });

    const flagStyle = (flag) => {
      if (flag==='high') return 'background:#ffebee;color:#c62828;padding:2px 5px;border-radius:3px;font-weight:700';
      if (flag==='low')  return 'background:#fff3e0;color:#e65100;padding:2px 5px;border-radius:3px;font-weight:700';
      return 'background:#e8f5e9;color:#2e7d32;padding:2px 5px;border-radius:3px;font-weight:700';
    };

    const riskColor = {'High Risk':'#c62828','Middle Risk':'#e65100','Low Risk':'#2e7d32'}[data.riskLevel]||'#2e7d32';
    const riskBg    = {'High Risk':'#ffebee','Middle Risk':'#fff3e0','Low Risk':'#e8f5e9'}[data.riskLevel]||'#e8f5e9';

    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>ANC Record — ${data.fullName}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#1a1a2e;background:#fff;padding:0}
.page{padding:18px 22px}
.hdr{background:#0f2744;color:#fff;padding:13px 17px;border-radius:6px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.hdr-title{font-size:15px;font-weight:700} .hdr-sub{font-size:9px;opacity:.6;margin-top:2px}
.ga-badge{background:#c9a84c;color:#0f2744;padding:5px 13px;border-radius:18px;font-weight:700;font-size:17px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.risk-pill{padding:4px 12px;border-radius:18px;font-weight:700;font-size:11px;background:${riskBg};color:${riskColor};border:1px solid ${riskColor};-webkit-print-color-adjust:exact;print-color-adjust:exact}
.sec{margin-bottom:12px;break-inside:avoid}
.sec-title{padding:5px 11px;font-size:9px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;border-radius:4px 4px 0 0;color:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.sec-body{border:1px solid #d4dde8;border-top:none;padding:9px 11px;border-radius:0 0 4px 4px}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:7px} .g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px} .g4{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}
.f label{font-size:8px;font-weight:700;color:#7a8fa6;text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:2px}
.f span{font-size:11px;font-weight:600;color:#0f2744}
.tpal-val{font-size:20px;font-weight:700;color:#c9a84c;font-family:monospace;letter-spacing:2px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.ga-big{font-size:26px;font-weight:700;color:#c9a84c;font-family:monospace;-webkit-print-color-adjust:exact;print-color-adjust:exact}
table{width:100%;border-collapse:collapse;font-size:10px}
th{background:#f0f4f8;padding:4px 7px;text-align:left;font-size:9px;font-weight:700;border:1px solid #d4dde8;color:#3d5166;text-transform:uppercase}
td{padding:4px 7px;border:1px solid #d4dde8;vertical-align:top}
tr:nth-child(even) td{background:#fafcff}
.ms{background:#e8f4fd;border-left:3px solid #2e6da4;padding:5px 9px;margin-bottom:5px;border-radius:0 4px 4px 0;font-size:10px}
.abnormal-banner{background:#ffebee;border:1px solid #ef9a9a;border-radius:5px;padding:9px 12px;margin-bottom:10px}
.abnormal-title{font-size:10px;font-weight:700;color:#c62828;text-transform:uppercase;margin-bottom:5px}
.archived-banner{background:#fff3e0;border:1px solid #ffcc80;border-left:4px solid #e65100;border-radius:5px;padding:9px 12px;margin-bottom:10px;color:#5f3200}
.archived-title{font-size:10px;font-weight:700;color:#8b3d00;text-transform:uppercase;margin-bottom:5px}
.footer{margin-top:14px;padding-top:8px;border-top:1px solid #d4dde8;display:flex;justify-content:space-between;font-size:9px;color:#aaa}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head>
<body><div class="page">
<div class="hdr">
  <div>
    <div class="hdr-title">🏥 ANTENATAL CARE FOLLOW-UP RECORD</div>
    <div class="hdr-sub">Private Obstetrics Clinic · ANC EMR v2 · Patient ID: ${data.patientID||'—'} · ${CALC.formatDate(new Date())}</div>
  </div>
  <div style="display:flex;align-items:center;gap:10px">
    <span class="risk-pill">${data.riskLevel||'Low Risk'}</span>
    <span class="ga-badge">${ga?ga.weeks:'—'} wks</span>
  </div>
</div>
${abnormalLabs.length ? `
<div class="abnormal-banner">
  <div class="abnormal-title">⚠️ Abnormal Laboratory Results — Requires Attention</div>
  <div style="display:flex;flex-wrap:wrap;gap:6px">
    ${abnormalLabs.map(l=>`<span style="${flagStyle(l.flag.includes('HIGH')||l.flag.includes('▲')?'high':'low')}">${l.name}: ${l.value} — ${l.flag}</span>`).join('')}
  </div>
</div>` : ''}
${data.isArchived ? `
<div class="archived-banner">
  <div class="archived-title">ARCHIVED RECORD</div>
  <div><strong>Archived on:</strong> ${data.archivedAt ? CALC.formatDate(data.archivedAt) : 'Not recorded'}</div>
  <div><strong>Reason:</strong> ${data.archiveReason || 'Not recorded'}</div>
</div>` : ''}
<div class="sec">
  <div class="sec-title" style="background:#0f2744">◈ Patient Information</div>
  <div class="sec-body">
    <div class="g3" style="margin-bottom:7px">
      <div class="f" style="grid-column:span 2"><label>Full Name</label><span>${data.fullName||'—'}</span></div>
      <div class="f"><label>Status</label><span>${data.patientStatus||'—'}</span></div>
    </div>
    <div class="g4">
      <div class="f"><label>Age</label><span>${data.age||'—'} yrs</span></div>
      <div class="f"><label>Phone</label><span>${data.phone||'—'}</span></div>
      <div class="f"><label>Blood Group</label><span>${data.bloodGroup||'—'}</span></div>
      <div class="f"><label>Basal Weight</label><span>${data.basalWeight||'—'} kg</span></div>
    </div>
    <div class="g2" style="margin-top:7px">
      <div class="f"><label>Address</label><span>${data.address||'—'}</span></div>
      <div class="f"><label>Pregnancy Type</label><span>${data.pregnancyType||'—'}${data.chorionicity?` · ${data.chorionicity}`:''}</span></div>
    </div>
  </div>
</div>
<div class="g2">
<div class="sec">
  <div class="sec-title" style="background:#2c5f8a">◈ Obstetric History (TPAL)</div>
  <div class="sec-body">
    <div class="tpal-val">T${data.tpalT||'?'}-P${data.tpalP||'?'}-A${data.tpalA||'?'}-L${data.tpalL||'?'}</div>
    <div style="font-size:10px;color:#7a8fa6;margin-top:5px">Term:${data.tpalT||0} Preterm:${data.tpalP||0} Abortion:${data.tpalA||0} Living:${data.tpalL||0}</div>
  </div>
</div>
<div class="sec">
  <div class="sec-title" style="background:#2c5f8a">◈ Obstetric Calculations</div>
  <div class="sec-body">
    <div class="g2"><div class="f"><label>LMP</label><span>${CALC.formatDate(data.lmpDate)}</span></div><div class="f"><label>EDD</label><span>${CALC.formatDate(edd)}</span></div></div>
    <div style="margin-top:6px"><span class="ga-big">${ga?ga.weeks:'—'}</span><span style="font-size:11px;color:#7a8fa6;margin-left:4px">wks + ${ga?ga.days:'—'} days</span></div>
    <div style="font-size:10px;color:#2e6da4;font-weight:600;margin-top:3px">${trim?trim.label+' '+trim.sub:'—'}</div>
  </div>
</div>
</div>
${normalizedScans.length?`
<div class="sec">
  <div class="sec-title" style="background:#1e6091">◈ Ultrasound / Scans</div>
  <div class="sec-body">
    <table><thead><tr><th>Category</th><th>Date</th><th>GA</th><th>Limited clinic scan note</th><th>Fetal cardiac activity</th><th>Placenta / Liquor / Presentation</th><th>Doppler status</th></tr></thead>
    <tbody>${normalizedScans.map(s=>`<tr>
      <td>${s.category||s.type||'—'}</td><td>${CALC.formatDate(s.date)}</td>
      <td>${s.ga||'—'}</td>
      <td>${s.category==='Quick limited clinic scan'
        ? `<strong>Limited clinic scan — not a detailed anomaly/growth/Doppler scan.</strong><br>${s.limitedScan?.note||s.findings||'—'}`
        : (s.findings||s.limitedScan?.note||'—')}</td>
      <td>${s.limitedScan?.fetalCardiacActivity||'—'}</td>
      <td>${s.biometrics?.placentaLocation||'—'}${s.biometrics?.placentaOS?` (${s.biometrics.placentaOS}mm from OS)`:''}
        / ${s.limitedScan?.liquor||'—'} / ${s.limitedScan?.presentation||'—'}</td>
      <td>${s.limitedScan?.dopplerStatus||'Not performed / not indicated'}</td>
    </tr>`).join('')}</tbody></table>
    ${hasBiometryDetails?`
    <div style="margin-top:8px;font-weight:700;font-size:9px;color:#7a8fa6;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Biometry / Fluid Details</div>
    <table><thead><tr><th>Date</th><th>BPD</th><th>HC</th><th>AC</th><th>FL</th><th>EFW</th><th>AFI / DVP</th></tr></thead>
    <tbody>${normalizedScans.filter(s => ['BPD','HC','AC','FL','AFI','DVP','EFW'].some(key => s.biometrics?.[key])).map(s=>`<tr>
      <td>${CALC.formatDate(s.date)}</td>
      <td>${s.biometrics?.BPD||'—'}</td><td>${s.biometrics?.HC||'—'}</td>
      <td>${s.biometrics?.AC||'—'}</td><td>${s.biometrics?.FL||'—'}</td>
      <td>${s.biometrics?.EFW||'—'}</td>
      <td>${s.biometrics?.AFI||s.biometrics?.DVP?`AFI:${s.biometrics.AFI||'—'} DVP:${s.biometrics.DVP||'—'}`:'—'}</td>
    </tr>`).join('')}</tbody></table>`:''}
    ${hasDopplerDetails?`
    <div style="margin-top:8px;font-weight:700;font-size:9px;color:#7a8fa6;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Doppler Results</div>
    <table><thead><tr><th>Date</th><th>UA PI</th><th>MCA PI</th><th>DV PI</th><th>UtA PI</th><th>CPR</th></tr></thead>
    <tbody>${normalizedScans.filter(s=>s.doppler?.UA_PI||s.doppler?.MCA_PI||s.doppler?.DV_PI||s.doppler?.UtA_PI).map(s=>{
      const cpr=CONSTANTS.calcCPR(s.doppler?.MCA_PI, s.doppler?.UA_PI);
      return `<tr><td>${CALC.formatDate(s.date)}</td>
        <td>${s.doppler?.UA_PI||'—'}</td><td>${s.doppler?.MCA_PI||'—'}</td>
        <td>${s.doppler?.DV_PI||'—'}</td><td>${s.doppler?.UtA_PI||'—'}</td>
        <td>${cpr?`<span style="color:${cpr.value<1?'#c62828':'#2e7d32'};font-weight:700">${cpr.value}</span>`:'—'}</td>
      </tr>`;
    }).join('')}</tbody></table>`:''}
  </div>
</div>`:''}
${abnormalLabs.length?`
<div class="sec">
  <div class="sec-title" style="background:#c62828">◈ Abnormal Laboratory Findings</div>
  <div class="sec-body">
    <table><thead><tr><th>Test</th><th>Trimester</th><th>Value</th><th>Status</th></tr></thead>
    <tbody>${abnormalLabs.map(l=>`<tr>
      <td style="font-weight:700">${l.name}</td><td>${l.trim}</td>
      <td><strong>${l.value}</strong></td>
      <td><span style="${flagStyle(l.flag.includes('▲')||l.flag.includes('HIGH')?'high':'low')}">${l.flag}</span></td>
    </tr>`).join('')}</tbody></table>
  </div>
</div>`:''}
${visits.length?`
<div class="sec">
  <div class="sec-title" style="background:#0f2744">◈ ANC Follow-Up Visits</div>
  <div class="sec-body">
    <table><thead><tr><th>#</th><th>Date</th><th>GA</th><th>Exam / Ultrasound</th><th>BP</th><th>Wt</th><th>Medications</th><th>Notes</th></tr></thead>
    <tbody>${visits.map((v,i)=>{
      const vga=v.date&&data.lmpDate?CALC.getGA(data.lmpDate,v.date):null;
      return `<tr><td>${i+1}</td><td>${CALC.formatDate(v.date)}</td>
        <td>${vga?vga.weeks+'w+'+vga.days+'d':'—'}</td>
        <td>${v.findings||'—'}</td><td>${v.bp||'—'}</td>
        <td>${v.weight||'—'}kg</td><td>${v.meds||'—'}</td><td>${v.notes||'—'}</td>
      </tr>`;
    }).join('')}</tbody></table>
  </div>
</div>`:''}
${milestones.length?`
<div class="sec">
  <div class="sec-title" style="background:#0d5c63">◈ Clinical Milestones (GA: ${ga?.weeks} wks)</div>
  <div class="sec-body">${milestones.map(m=>`<div class="ms">${m.icon} ${m.text}</div>`).join('')}</div>
</div>`:''}
<div class="footer">
  <span>CONFIDENTIAL — Antenatal Care Record</span>
  <span>${data.fullName||''} · ${data.patientID||''} · Risk: ${data.riskLevel||'Low Risk'}</span>
  <span>Printed: ${CALC.formatDate(new Date())}</span>
</div>
</div></body></html>`;
  }

  /* ════════════════════════════════════
     BACKUP / IMPORT
  ════════════════════════════════════ */
  async function downloadBackup() {
    const json = DB.exportAll();
    if (phase2Enabled()) {
      if (!clinicEncryptionUnlocked()) {
        UI.toast('Unlock shared clinic encryption before creating a backup', 'error', 5000);
        return;
      }
      try {
        const encrypted = await _phase2Runtime.encryptPhase2Backup(json);
        const payload = JSON.stringify({
          __ancBackup: true,
          encrypted: true,
          formatVersion: 3,
          encryptionScheme: 'phase2-shared-key',
          backupId: encrypted.backupId,
          keyVersion: encrypted.keyVersion,
          createdAt: new Date().toISOString(),
          plaintextSha256: await sha256(json),
          data: encrypted.data,
        });
        _downloadJSON(payload, 'ANC_Backup_Shared_Key');
        recordAuditEvent({
          operation: 'export',
          entityType: 'backup',
          summary: 'Exported encrypted shared-key backup',
          status: 'success',
        });
        UI.toast('Encrypted shared-key backup downloaded', 'success');
      } catch (error) {
        UI.toast(error.message || 'Could not create encrypted backup', 'error', 6000);
      }
      return;
    }
    if (CRYPTO.isEnabled() && CRYPTO.isUnlocked()) {
      CRYPTO.encrypt(json).then(encrypted => {
        const payload = JSON.stringify({ __ancBackup: true, encrypted: true, data: encrypted });
        _downloadJSON(payload, 'ANC_Backup_Encrypted');
        recordAuditEvent({
          operation: 'export',
          entityType: 'backup',
          summary: 'Exported encrypted backup',
          status: 'success',
        });
        UI.toast('💾 Encrypted backup downloaded', 'success');
      });
    } else {
      _downloadJSON(json, 'ANC_Backup');
      recordAuditEvent({
        operation: 'export',
        entityType: 'backup',
        summary: 'Exported unencrypted backup',
        status: 'warning',
      });
      UI.toast('💾 Backup downloaded (unencrypted — enable encryption for security)', 'warning', 5000);
    }
  }

  async function sha256(text) {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  async function downloadRollbackBackup() {
    if (phase2Enabled()) {
      UI.toast('Use the verified Phase 1 rollback file created before activation', 'info', 6000);
      return;
    }
    if (!CRYPTO.isUnlocked()) {
      UI.toast('Unlock clinic encryption before creating a rollback backup', 'error', 5000);
      return;
    }

    try {
      const json = DB.exportAll();
      const parsed = JSON.parse(json);
      const encrypted = await CRYPTO.encrypt(json);
      const patientCount = Object.keys(parsed.patients || {}).length;
      const payload = {
        __ancBackup: true,
        encrypted: true,
        formatVersion: 2,
        backupType: 'phase2-pre-migration',
        rollbackTag: 'phase1-stable-2026-06-11',
        createdAt: new Date().toISOString(),
        patientCount,
        plaintextSha256: await sha256(json),
        data: encrypted,
      };

      _downloadJSON(JSON.stringify(payload, null, 2), 'ANC_Phase2_Rollback');
      recordAuditEvent({
        operation: 'export',
        entityType: 'backup',
        summary: `Exported rollback backup for ${patientCount} patient record${patientCount===1?'':'s'}`,
        status: 'success',
      });
      UI.toast(`Rollback backup created for ${patientCount} patient record${patientCount===1?'':'s'}`, 'success', 6000);
    } catch (error) {
      console.error('Rollback backup failed:', error);
      UI.toast('Could not create the rollback backup', 'error', 6000);
    }
  }

  function _downloadJSON(content, prefix) {
    const blob = new Blob([content], {type:'application/json'});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${prefix}_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function showImportWarnings() {
    const warnings = DB.getLastImportWarnings?.() || [];
    if (!warnings.length) return;
    UI.toast(`Import completed with warning: ${warnings[0]}`, 'warning', 10000);
  }

  function promptUnsavedImportDecision() {
    return new Promise(resolve => {
      const overlay = document.getElementById('modalOverlay');
      const cancel = document.getElementById('modalCancel');
      const finish = choice => {
        if (overlay) overlay.style.display = 'none';
        resolve(choice);
      };
      UI.modal(
        'Unsaved changes before import',
        `<p>You have unsaved changes. Importing may replace the currently open record.</p>
         <div class="modal-inline-actions">
           <button type="button" id="btnSaveThenImport" class="btn-modal-confirm">Save, then import</button>
         </div>`,
        () => finish('discard'),
        true
      );
      const discard = document.getElementById('modalConfirm');
      if (discard) discard.textContent = 'Import without saving';
      if (cancel) {
        cancel.textContent = 'Cancel';
        cancel.onclick = () => finish('cancel');
        setTimeout(() => cancel.focus(), 0);
      }
      document.getElementById('btnSaveThenImport')?.addEventListener('click', () => finish('save'));
    });
  }

  async function prepareImportApplication() {
    if (!DB.hasPendingChanges()) return { proceed:true, cloudSynced:true };
    const choice = await promptUnsavedImportDecision();
    if (choice === 'cancel') return { proceed:false, cloudSynced:true };
    if (choice === 'discard') return { proceed:true, cloudSynced:true };
    const result = await fullSave({ forTransition:true });
    return {
      proceed: Boolean(result?.localSaved),
      cloudSynced: result?.cloudSynced !== false,
    };
  }

  async function applyImportPayload(json, { summary, successMessage, auditStatus='success' }) {
    if (!ensureClinicalMutationAllowed('Import')) return false;
    const preparation = await prepareImportApplication();
    if (!preparation.proceed) return false;

    beginImportOperation();
    try {
      const ok = DB.importAll(json);
      if (!ok) {
        UI.toast('Import failed - invalid backup file', 'error');
        completeImportOperation();
        return false;
      }

      const result = DB.getLastImportResult?.() || {};
      const currentWasUpdated = Boolean(
        currentPatientID
        && Array.isArray(result.updatedPatientIDs)
        && result.updatedPatientIDs.includes(currentPatientID)
      );
      if (currentWasUpdated) {
        const importedCurrentPatient = DB.getPatient(currentPatientID);
        if (!importedCurrentPatient) throw new Error('Imported current patient could not be reloaded');
        loadPatientIntoForm(importedCurrentPatient);
        showPatientWorkspace();
      }

      DB.discardChanged();
      setAutoSaveStatus('saved');
      completeImportOperation();
      recordAuditEvent({
        operation: 'import',
        entityType: 'backup',
        summary,
        status: auditStatus,
      });
      refreshDBTable();
      refreshDashboard();
      showImportWarnings();
      UI.toast(
        currentWasUpdated
          ? 'The currently open patient was updated from the imported backup and has been reloaded.'
          : successMessage,
        currentWasUpdated ? 'info' : 'success',
        currentWasUpdated ? 8000 : 4000
      );
      if (!preparation.cloudSynced) {
        UI.toast(
          'Saved on this device, but cloud sync failed. The record may not be available on other devices yet.',
          'warning',
          8000
        );
      }
      return true;
    } catch (error) {
      console.error('Import failed:', error);
      bestEffortAuditFailure('import', '', error);
      if (_safetyState === SAFETY_STATES.IMPORT_APPLYING) failImportOperation(error);
      else if (isRecoveryRequiredState()) showRecoveryRequiredModal();
      return false;
    }
  }

  async function verifyRollbackBackup(file) {
    if (!file) return;
    if (!CRYPTO.isUnlocked()) {
      UI.toast('Unlock clinic encryption before verifying the backup', 'error', 5000);
      return;
    }

    try {
      const raw = JSON.parse(await file.text());
      if (raw.backupType !== 'phase2-pre-migration' || !raw.encrypted || !raw.data) {
        throw new Error('This is not a Phase 2 rollback backup');
      }
      if (!raw.plaintextSha256) {
        throw new Error('Backup integrity hash is missing');
      }

      const decrypted = await CRYPTO.decrypt(raw.data);
      const decryptedJson = typeof decrypted === 'string' ? decrypted : JSON.stringify(decrypted);
      const actualHash = await sha256(decryptedJson);
      if (actualHash !== raw.plaintextSha256) {
        throw new Error('Backup integrity check failed');
      }

      const parsed = JSON.parse(decryptedJson);
      const actualPatientCount = Object.keys(parsed.patients || {}).length;
      if (actualPatientCount !== raw.patientCount) {
        throw new Error('Patient count does not match the backup metadata');
      }

      UI.modal(
        'Rollback Backup Verified',
        `<strong>Integrity check passed.</strong><br><br>
         Patient records: ${actualPatientCount}<br>
         Created: ${CALC.formatDate(raw.createdAt)}<br>
         Rollback version: ${raw.rollbackTag || 'Unknown'}<br><br>
         No data was imported or changed.`,
        null
      );
    } catch (error) {
      console.error('Rollback backup verification failed:', error);
      UI.toast(error.message || 'Backup verification failed', 'error', 7000);
    }
  }

  function importBackup(file) {
    if (!file) return;
    if (!ensureClinicalMutationAllowed('Import')) return;
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const raw = JSON.parse(e.target.result);
        if (raw.__ancBackup && raw.encrypted) {
          if (raw.encryptionScheme === 'phase2-shared-key') {
            if (!phase2Enabled() || !clinicEncryptionUnlocked()) {
              UI.toast('Unlock shared clinic encryption before importing this backup', 'error', 5000);
              return;
            }
            const decrypted = await _phase2Runtime.decryptPhase2Backup(raw);
            const decryptedJson =
              typeof decrypted === 'string' ? decrypted : JSON.stringify(decrypted);
            if (raw.plaintextSha256) {
              const actualHash = await sha256(decryptedJson);
              if (actualHash !== raw.plaintextSha256) {
                throw new Error('Backup integrity check failed');
              }
            }
            await applyImportPayload(decryptedJson, {
              summary:'Imported encrypted shared-key backup',
              successMessage:'Shared-key backup imported successfully',
            });
          } else if (!CRYPTO.isUnlocked()) {
            UI.toast('⚠ Unlock the app first to import an encrypted backup', 'error', 5000);
            return;
          } else {
            const decrypted = await CRYPTO.decrypt(raw.data);
            const decryptedJson = typeof decrypted === 'string' ? decrypted : JSON.stringify(decrypted);
            if (raw.plaintextSha256) {
              const actualHash = await sha256(decryptedJson);
              if (actualHash !== raw.plaintextSha256) {
                throw new Error('Backup integrity check failed');
              }
            }
            await applyImportPayload(decryptedJson, {
              summary:'Imported encrypted backup',
              successMessage:'Encrypted backup imported successfully',
            });
          }
        } else {
          UI.modal('Import Unencrypted Backup',
            '⚠️ This backup is <strong>unencrypted</strong>. Import anyway? Existing data will be merged.',
            () => applyImportPayload(e.target.result, {
              summary:'Imported unencrypted backup',
              successMessage:'Backup imported',
              auditStatus:'warning',
            }));
        }
      } catch(err) {
        if (err?.name === 'StorageWriteError') {
          console.error('Import storage write failed:', err);
          bestEffortAuditFailure('import', '', err);
          showStorageFailure(
            err,
            'Import failed',
            'Import failed. Data was not fully stored on this device.'
          );
          return;
        }
        UI.toast('❌ Could not read backup file: ' + err.message, 'error', 5000);
      }
    };
    reader.readAsText(file);
  }

  /* ════════════════════════════════════
     HELPERS
  ════════════════════════════════════ */
  function setTodayLabels() {
    const now = new Date();
    const fmt = now.toLocaleDateString('en-GB',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
    ['todayDate','dashDate'].forEach(id => { const el=document.getElementById(id); if(el) el.textContent=fmt; });
    document.getElementById('calcDate').value = CALC.todayISO();
  }

  /* ── PUBLIC API ── */
  return {
    init, openPatient, confirmDeletePatient, confirmArchivePatient, restoreArchivedPatient,
    addScanRow, addProcRow, addVisitRow,
    handleFileUpload, removeAttachment, previewAttachment, ocrAttachment,
    addCustomLabTest, setRiskLevel, showRiskPanel,
    openGrowthChartModal, openDopplerChartModal,
    fullSave, quickSave, importBackup, downloadRollbackBackup, verifyRollbackBackup,
    _setChartTab:    (t) => _chartTabSetter(t),
    _setChartSource: (s) => _chartSourceSetter(s),
    _showToast:      (m,t) => UI.toast(m,t),
  };
})();

function startANC() { APP.init(); }
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startANC);
} else {
  startANC();
}
