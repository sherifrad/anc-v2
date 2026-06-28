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
  const _lastRepeatableAddAt = {};
  const _autosaveAuditAtByPatient = {};
  let _medicationHelperWatchTimer = null;
  let _medicationHelperSignature = '';
  let _incrementalSyncTimer = null;
  let _incrementalSyncRunning = false;
  let _cloudRefreshRunning = false;
  let _lastCloudRefreshAt = 0;
  let _datingMethodBeforeChange = 'lmp';
  let _datingChangeConfirming = false;
  const INCREMENTAL_SYNC_DEBOUNCE_MS = 1200;
  // Basic release: these historical features are intentionally paused and excluded from save/sync scope.
  const BASIC_RELEASE_PAUSED_FEATURES = Object.freeze({
    authGate:true,
    attachments:true,
    ocr:true,
    charts:true,
    accessControl:true,
    temporaryStaff:true,
  });
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
    return SUPA.isPhase2RuntimeEnabled?.() === true;
  }

  function clinicEncryptionUnlocked() {
    return phase2Enabled()
      ? Boolean(_phase2Runtime?.isPhase2Unlocked())
      : Boolean(CRYPTO.isUnlocked?.());
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

    if (BASIC_RELEASE_PAUSED_FEATURES.authGate) {
      const authScreen = document.getElementById('authScreen');
      if (authScreen) authScreen.style.display = 'none';
    } else {
      try {
        await AUTH.requireAccess();
      } catch (e) {
        console.error('Secure access failed:', e);
        return;
      }
    }

    initializeRecoveryMarkerState();

    if (!BASIC_RELEASE_PAUSED_FEATURES.authGate && AUTH.getSessionKind() === 'temporary' && BASIC_RELEASE_PAUSED_FEATURES.temporaryStaff) {
      await AUTH.signOut();
      document.getElementById('authScreen').style.display = 'flex';
      document.getElementById('authLoginError').textContent =
        'Temporary staff access is paused for the basic release.';
      return;
    }

    if (!BASIC_RELEASE_PAUSED_FEATURES.authGate && AUTH.getSessionKind() === 'temporary') {
      try {
        _phase2Runtime ||= await import('./phase2_runtime.mjs?v=18');
        const context = AUTH.getTemporaryAccessContext();
        const adapter = await _phase2Runtime.unlockTemporaryPhase2Runtime({
          supabaseClient: AUTH.getClient(),
          password: context.password,
          bootstrap: context.bootstrap,
        });
        SUPA.configurePhase2Adapter(adapter);
        _temporaryPermissions = new Set(context.bootstrap.grant.permissions || []);
        // Legacy full reconciliation is quarantined with manual Push/Pull during the incremental-sync POC.
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

    if (BASIC_RELEASE_PAUSED_FEATURES.authGate) {
      const lockScreen = document.getElementById('lockScreen');
      if (lockScreen) lockScreen.style.display = 'none';
    } else if (AUTH.getSessionKind() === 'temporary') {
      document.getElementById('lockScreen').style.display = 'none';
    } else if (phase2Enabled()) {
      showPhase2LockScreen();
    } else if (CRYPTO.isSetup()) {
      showLockScreen();
    } else {
      handleSkipEncryption();
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
    bindAutomaticCloudEvents();
    applyBasicReleaseFeatureScope();

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

  function applyBasicReleaseFeatureScope() {
    document.body.classList.add('basic-release');
    ['phase3NavItem','view-access','phase3GrantDialog','phase3StateDialog','chartModalOverlay']
      .forEach(id => {
        const element = document.getElementById(id);
        if (!element) return;
        element.hidden = true;
        element.setAttribute('aria-hidden', 'true');
      });
    document.querySelectorAll('.attachment-section,.btn-chart,.ocr-btn').forEach(element => {
      element.hidden = true;
      element.setAttribute('aria-hidden', 'true');
    });
  }

  function pausedBasicReleaseFeature(label) {
    UI.toast(`${label} is paused for the basic release.`, 'info', 4000);
    return false;
  }

  function bindAutomaticCloudEvents() {
    window.addEventListener?.('online', () => resumeAutomaticCloudActivity('online'));
    window.addEventListener?.('focus', () => resumeAutomaticCloudActivity('focus'));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') resumeAutomaticCloudActivity('resume');
    });
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
        _phase2Runtime ||= await import('./phase2_runtime.mjs?v=18');
        const adapter = await _phase2Runtime.unlockPhase2Runtime({
          supabaseClient: AUTH.getClient(),
          passphrase: pw,
        });
        SUPA.configurePhase2Adapter(adapter);
        // Legacy full reconciliation remains available internally but is not an automatic startup path.
      } else {
        await CRYPTO.unlockSecure(pw);
      }
      document.getElementById('lockScreen').style.display = 'none';
      resumeAutomaticCloudActivity('unlock');
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
    setAutoSaveStatus('saving');
    try {
      const persisted = persistCurrentRecordLocal({ allowCreate:false, auditMode:'autosave' });
      setAutoSaveStatus('local-saved');
      updateStorageMeter();
      return persisted;
    } catch(e) {
      console.error('Autosave error:', e);
      setAutoSaveStatus(e?.name === 'LocalPersistenceValidationError' ? 'changed' : 'failed');
      bestEffortAuditFailure('autosave', currentPatientID, e);
      UI.toast(
        e?.name === 'LocalPersistenceValidationError'
          ? `Autosave paused: ${e.message}`
          : formatStorageFailure(e, 'Autosave failed. Data was not fully stored on this device.'),
        'error',
        8000,
      );
      return false;
    }
  }

  function setAutoSaveStatus(status) {
    const el  = document.getElementById('autoSaveStatus');
    const dot = document.getElementById('autoSaveDot');
    const lbl = document.getElementById('autoSaveLabel');
    if (el) el.className = `autosave-status ${status}`;
    const sidebarLabels = {
      saved:'Saved locally', 'local-saved':'Saved locally', syncing:'Syncing…', synced:'Synced',
      changed:'Unsaved changes', failed:'Unsaved changes',
      'local-pending':'Saved locally — sync pending',
      'cloud-conflict':'Cloud update available — local changes preserved',
    };
    const headerLabels = {
      saved:'Saved locally', 'local-saved':'Saved locally', syncing:'Syncing…', synced:'Synced',
      changed:'Unsaved changes', failed:'Save failed',
      'local-pending':'Saved locally — sync pending',
      'cloud-conflict':'Cloud update available — local changes preserved',
    };
    if (lbl) lbl.textContent = sidebarLabels[status] || '';
    const header=document.getElementById('patientSaveState');
    if(header){header.textContent=headerLabels[status]||'';header.className=`patient-save-state ${status}`;}
  }

  function automaticCloudAvailable() {
    return !automaticCloudSkipReason();
  }

  function automaticCloudSkipReason() {
    if (_safetyState !== SAFETY_STATES.NORMAL) return `safety-state:${_safetyState}`;
    if (!clinicEncryptionUnlocked()) return 'adapter-not-ready';
    if (navigator.onLine === false) return 'offline';
    return '';
  }

  function traceIncrementalSync(event, details={}) {
    let adapterReady = false;
    try { adapterReady = clinicEncryptionUnlocked(); } catch {}
    console.info('[ANC incremental sync]', event, {
      sessionKind: AUTH.getSessionKind?.() || 'unknown',
      adapterReady,
      safetyState: _safetyState,
      online: navigator.onLine !== false,
      ...details,
    });
  }

  function scheduleAutomaticIncrementalSync(delay=INCREMENTAL_SYNC_DEBOUNCE_MS) {
    clearTimeout(_incrementalSyncTimer);
    if (!DB.hasPendingCloudSync?.()) return;
    if (currentPatientID && DB.hasPendingCloudSync(currentPatientID)) {
      setAutoSaveStatus('local-pending');
    }
    const skipReason = automaticCloudSkipReason();
    traceIncrementalSync('debounce-scheduled', { delay, skipReason:skipReason || null });
    if (skipReason) return;
    _incrementalSyncTimer = setTimeout(() => {
      runAutomaticIncrementalSync().catch(error => {
        console.error('Automatic incremental sync failed:', error);
      });
    }, Math.max(0, delay));
  }

  async function syncIncrementalPatientAndVisits(entry) {
    if (!entry?.patientID || !entry.patient || !Array.isArray(entry.visits)) {
      throw new Error('Pending incremental sync entry is incomplete');
    }
    if (AUTH.getSessionKind() === 'temporary' && !(
      _temporaryPermissions.has('related.create')
      || _temporaryPermissions.has('related.update')
    )) {
      throw new Error('Temporary account cannot synchronize Visit records');
    }
    await SUPA.saveRelated('visits', entry.patientID, entry.visits);
    await SUPA.savePatient(entry.patient);
  }

  async function runAutomaticIncrementalSync() {
    const skipReason = automaticCloudSkipReason();
    traceIncrementalSync('worker-entered', {
      pendingCount:Object.keys(DB.getPendingCloudSyncEntries?.() || {}).length,
      skipReason:_incrementalSyncRunning ? 'worker-already-running' : (skipReason || null),
    });
    if (_incrementalSyncRunning || skipReason) return false;
    const entries = Object.values(DB.getPendingCloudSyncEntries?.() || {});
    if (!entries.length) return true;
    _incrementalSyncRunning = true;
    let hadFailure = false;
    try {
      for (const entry of entries) {
        if (entry.patientID === currentPatientID) setAutoSaveStatus('syncing');
        try {
          traceIncrementalSync('visit-write-started', { patientID:entry.patientID });
          await syncIncrementalPatientAndVisits(entry);
          traceIncrementalSync('patient-commit-succeeded', { patientID:entry.patientID });
          const cleared = DB.clearPendingCloudSync(entry.patientID, entry.version);
          traceIncrementalSync('queue-clear-attempted', { patientID:entry.patientID, cleared });
          if (entry.patientID === currentPatientID) {
            setAutoSaveStatus(cleared ? 'synced' : 'local-pending');
          }
        } catch (error) {
          hadFailure = true;
          traceIncrementalSync('worker-write-failed', {
            patientID:entry.patientID,
            reason:error?.message || 'unknown',
          });
          console.error(`Incremental sync pending for ${entry.patientID}:`, error);
          if (entry.patientID === currentPatientID) setAutoSaveStatus('local-pending');
          UI.toast('Saved locally — sync pending', 'warning', 5000);
        }
      }
    } finally {
      _incrementalSyncRunning = false;
      updateSyncStatus();
    }
    if (DB.hasPendingCloudSync?.() && automaticCloudAvailable()) {
      clearTimeout(_incrementalSyncTimer);
      _incrementalSyncTimer = setTimeout(
        () => runAutomaticIncrementalSync(),
        hadFailure ? 30000 : 0,
      );
    }
    return !DB.hasPendingCloudSync?.();
  }

  function cloudRecordIsNewer(cloudPatient, localPatient) {
    return new Date(cloudPatient?.updatedAt || 0).getTime()
      > new Date(localPatient?.updatedAt || 0).getTime();
  }

  function localPatientProtectedFromCloud(patientID) {
    return Boolean(DB.hasPendingCloudSync?.(patientID))
      || (patientID === currentPatientID && DB.hasPendingChanges());
  }

  function warnCloudUpdatePreserved(patientID) {
    console.warn(`Cloud update preserved without overwrite for ${patientID}: local changes are pending`);
    if (patientID === currentPatientID) setAutoSaveStatus('cloud-conflict');
    UI.toast('Cloud update available — local changes preserved', 'warning', 7000);
  }

  async function applyCloudPatientSnapshot(cloudPatient, { renderCurrent=true }={}) {
    const patientID = cloudPatient?.patientID;
    if (!patientID) return { applied:false };
    const localPatient = DB.getPatient(patientID);
    traceIncrementalSync('cloud-record-compared', {
      patientID,
      localPresent:Boolean(localPatient),
      cloudNewer:!localPatient || cloudRecordIsNewer(cloudPatient, localPatient),
      localProtected:localPatientProtectedFromCloud(patientID),
    });
    if (localPatientProtectedFromCloud(patientID)) {
      if (!localPatient || cloudRecordIsNewer(cloudPatient, localPatient)) {
        warnCloudUpdatePreserved(patientID);
      }
      return { applied:false, protected:true };
    }
    if (localPatient && !cloudRecordIsNewer(cloudPatient, localPatient)) {
      return { applied:false, current:true };
    }
    const cloudVisits = await SUPA.getRelated('visits', patientID);
    const visits = cloudVisits == null ? (localPatient ? DB.getVisits(patientID) : []) : cloudVisits;
    const result = DB.applyCloudPatientVisits(cloudPatient, visits);
    if (result.conflict) {
      warnCloudUpdatePreserved(patientID);
      return result;
    }
    if (renderCurrent && patientID === currentPatientID && !DB.hasPendingChanges()) {
      loadPatientIntoForm(result.patient);
      renderPatientSummary(result.patient);
      setRecordMode('summary');
      setAutoSaveStatus('synced');
    }
    traceIncrementalSync('cloud-record-applied', {
      patientID,
      uiRerendered:Boolean(renderCurrent && patientID === currentPatientID && !DB.hasPendingChanges()),
    });
    return result;
  }

  async function refreshCloudPatient(patientID, options={}) {
    const skipReason = automaticCloudSkipReason();
    traceIncrementalSync('patient-refresh-entered', { patientID, skipReason:skipReason || null });
    if (!patientID || skipReason) return { applied:false, skipReason };
    try {
      const cloudPatient = await SUPA.getPatient(patientID);
      traceIncrementalSync('patient-cloud-record-fetched', {
        patientID,
        found:Boolean(cloudPatient),
      });
      if (!cloudPatient) return { applied:false, missing:true };
      return await applyCloudPatientSnapshot(cloudPatient, options);
    } catch (error) {
      console.error(`Cloud refresh failed for ${patientID}:`, error);
      return { applied:false, error };
    }
  }

  async function refreshCloudPatientIndex(trigger='automatic') {
    const skipReason = automaticCloudSkipReason();
    traceIncrementalSync('refresh-entered', {
      trigger,
      skipReason:_cloudRefreshRunning ? 'refresh-already-running' : (skipReason || null),
    });
    if (_cloudRefreshRunning || skipReason) return false;
    const now = Date.now();
    if (trigger === 'focus' && now - _lastCloudRefreshAt < 2000) return false;
    _cloudRefreshRunning = true;
    try {
      const cloudPatients = await SUPA.getAllPatients();
      traceIncrementalSync('cloud-index-fetched', {
        trigger,
        patientCount:Object.keys(cloudPatients || {}).length,
      });
      for (const cloudPatient of Object.values(cloudPatients || {})) {
        await applyCloudPatientSnapshot(cloudPatient, { renderCurrent:true });
      }
      _lastCloudRefreshAt = Date.now();
      refreshDBTable();
      refreshDashboard();
      return true;
    } catch (error) {
      console.error(`Cloud ${trigger} refresh failed:`, error);
      return false;
    } finally {
      _cloudRefreshRunning = false;
    }
  }

  async function resumeAutomaticCloudActivity(trigger='resume') {
    const skipReason = automaticCloudSkipReason();
    traceIncrementalSync('trigger-fired', {
      trigger,
      skipReason:skipReason || null,
      legacyBatchMarkerIgnored:Boolean(localStorage.getItem('anc_phase2_reconciled_batch')),
    });
    if (skipReason) return;
    await runAutomaticIncrementalSync();
    await refreshCloudPatientIndex(trigger);
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
    if (viewKey === 'database') {
      refreshDBTable();
      return resumeAutomaticCloudActivity('database');
    }
    if (viewKey === 'dashboard') refreshDashboard();
    if (viewKey === 'access') {
      UI.toast('Access control is paused for the basic release.', 'info', 4000);
      return renderNavActive('dashboard');
    }
  }


  async function updateSyncStatus() {
    const el = document.getElementById('syncStatus');
    if (!el) return;
    const online = await SUPA.isOnline().catch(() => false);
    const pendingCount = Object.keys(DB.getPendingCloudSyncEntries?.() || {}).length;
    el.textContent = pendingCount
      ? `Saved locally — ${pendingCount} sync pending`
      : (online ? '☁ Synced' : '○ Offline');
    el.style.color  = online && !pendingCount ? 'rgba(100,220,100,.6)' : 'rgba(255,255,255,.45)';
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
    quarantineLegacyManualSyncControls();

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

    // Legacy full-database Push/Pull is quarantined until automatic incremental sync replaces it.
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
    document.getElementById('btnPatientMore')?.addEventListener('click',event=>{
      event.stopPropagation();
      const menu=document.getElementById('patientMoreMenu');
      const opening=menu?.hidden !== false;
      if(menu)menu.hidden=!opening;
      event.currentTarget.setAttribute('aria-expanded',String(opening));
    });
    document.addEventListener('click',event=>{
      if(event.target.closest('.patient-more-wrap'))return;
      closePatientMoreMenu();
    });
    document.getElementById('patientMoreMenu')?.addEventListener('click',()=>closePatientMoreMenu());
    document.getElementById('btnArchiveCurrentPatient')?.addEventListener('click',()=>{
      if(currentPatientID)confirmArchivePatient(currentPatientID);
    });
    document.getElementById('btnRestoreCurrentPatient')?.addEventListener('click',()=>{
      if(currentPatientID)restoreArchivedPatient(currentPatientID);
    });
    document.getElementById('btnPatientAudit')?.addEventListener('click',showCurrentPatientAudit);

    // Import
    document.getElementById('btnImport')?.addEventListener('click', () =>
      ensureClinicalMutationAllowed('Restore') && document.getElementById('importFileInput').click());
    document.getElementById('navImport')?.addEventListener('click', e => {
      e.preventDefault();
      if (ensureClinicalMutationAllowed('Restore')) document.getElementById('importFileInput').click();
    });
    document.getElementById('importFileInput')?.addEventListener('change', function() {
      if (this.files[0]) { importBackup(this.files[0]); this.value=''; }
    });

    // Add rows
    ['btnAddScan','btnAddScanBottom'].forEach(id=>document.getElementById(id)?.addEventListener('click',addScanRow));
    ['btnAddProc','btnAddProcBottom'].forEach(id=>document.getElementById(id)?.addEventListener('click',addProcRow));
    ['btnAddVisit','btnAddVisitBottom'].forEach(id=>document.getElementById(id)?.addEventListener('click',addVisitRow));
    ['btnAddProblem','btnAddProblemBottom'].forEach(id=>document.getElementById(id)?.addEventListener('click',addProblemRow));
    ['btnAddMedication','btnAddMedicationBottom'].forEach(id=>document.getElementById(id)?.addEventListener('click',addMedicationRow));

    // Delete rows (event delegation)
    document.getElementById('ultraBody').addEventListener('click',  handleTableClick);
    document.getElementById('procBody').addEventListener('click',   handleTableClick);
    document.getElementById('visitBody').addEventListener('click',  handleTableClick);
    document.getElementById('visitBody').addEventListener('click', event => {
      const summary=event.target.closest('.visit-derived-labs');if(!summary)return;
      openEditorAt('labWorkspace');
      requestAnimationFrame(()=>document.querySelector(`[data-lab-trim="${summary.dataset.labTrim}"]`)?.click());
    });
    document.getElementById('visitBody').addEventListener('pointerdown', refreshVisitMedicationHelpersBeforeUse);
    document.getElementById('visitBody').addEventListener('focusin', refreshVisitMedicationHelpersBeforeUse);
    document.getElementById('problemList')?.addEventListener('click', handleProblemClick);
    document.getElementById('problemList')?.addEventListener('change', handleProblemChange);
    document.getElementById('medicationList')?.addEventListener('click', handleMedicationClick);
    document.getElementById('medicationList')?.addEventListener('change', handleMedicationChange);
    document.getElementById('medicationList')?.addEventListener('input', handleMedicationInput);
    document.getElementById('medicationList')?.addEventListener('input', handleMedicationStatusEvent);
    document.getElementById('medicationList')?.addEventListener('change', handleMedicationStatusEvent);
    document.getElementById('labWorkspace')?.addEventListener('click', handleLabWorkspaceClick);
    document.getElementById('labWorkspace')?.addEventListener('change', handleLabWorkspaceChange);
    document.getElementById('labWorkspace')?.addEventListener('input', handleLabWorkspaceInput);

    // LMP / calc date
    document.getElementById('lmpDate').addEventListener('change',  () => { applyDating(); DB.markChanged(); });
    document.getElementById('calcDate').addEventListener('change', () => { applyDating(); DB.markChanged(); });
    document.getElementById('datingMethod')?.addEventListener('change', () => applyDating({ confirmChange:true }));
    [
      'embryoTransferDate','embryoAge','ultrasoundDatingDate','ultrasoundGAWeeks',
      'ultrasoundGADays','manualGAWeeks','manualGADays',
    ].forEach(id => document.getElementById(id)?.addEventListener('change', () => { applyDating(); DB.markChanged(); }));
    showDatingMethodFields();

    // Visit date → GA
    document.getElementById('visitBody').addEventListener('change', e => {
      if (e.target.classList.contains('visit-med-insert')) {
        insertActiveMedicationIntoVisit(e.target);
      }
      if (e.target.classList.contains('visit-date')) recalculateAfterClinicalDateChange();
      DB.markChanged();
    });
    document.getElementById('procBody').addEventListener('input', refreshVisitDerivedSummaries);
    document.getElementById('procBody').addEventListener('change', refreshVisitDerivedSummaries);

    // Scan date → GA + placenta logic
    document.getElementById('ultraBody').addEventListener('change', e => {
      if (e.target.classList.contains('scan-date'))    recalculateAfterClinicalDateChange();
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
    // Chart handlers are intentionally not bound in the basic release.

    // TPAL
    ['tpalT','tpalP','tpalA','tpalL'].forEach(id =>
      document.getElementById(id).addEventListener('input', updateTPAL));

    // Summary-first patient record
    document.getElementById('btnSummaryMode').addEventListener('click', () => {
      if (!currentPatientID) {
        UI.toast('Save the patient record before opening the summary.', 'info');
        return;
      }
      renderPatientSummary(currentPatientID);
      setRecordMode('summary');
    });
    document.getElementById('btnEditMode').addEventListener('click', () => setRecordMode('edit'));
    document.getElementById('btnSummaryOpenWorkspace')?.addEventListener('click', () => {
      if (!canEditPatientRecord()) return;
      setRecordMode('edit');
    });
    document.getElementById('btnEditorBackToSummary')?.addEventListener('click', () => {
      if (!currentPatientID) return;
      renderPatientSummary(currentPatientID);
      setRecordMode('summary');
    });
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
    ['btnAddPreviousPregnancy','btnAddPreviousPregnancyBottom'].forEach(id=>document.getElementById(id)?.addEventListener('click',addPreviousPregnancy));
    document.getElementById('previousPregnancyList').addEventListener('click', handlePreviousPregnancyClick);
    document.getElementById('previousPregnancyList').addEventListener('change', handlePreviousPregnancyChange);
    document.getElementById('previousPregnancyList').addEventListener('input', ()=>renderGeneratedObstetricHistory(collectPreviousPregnancies()));
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
    const markPatientChanged=()=>{DB.markChanged();setAutoSaveStatus('changed');};
    document.getElementById('view-patient').addEventListener('input',markPatientChanged);
    document.getElementById('view-patient').addEventListener('change',markPatientChanged);

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

    // Attachment upload/drop and OCR handlers are intentionally not bound in the basic release.

    // Modal close on overlay click
    document.getElementById('modalOverlay').addEventListener('click', e => {
      if (e.target === document.getElementById('modalOverlay'))
        document.getElementById('modalOverlay').style.display = 'none';
    });
  }

  function quarantineLegacyManualSyncControls() {
    ['navSyncPush','navSyncPull'].forEach(id => {
      const control = document.getElementById(id);
      if (!control) return;
      control.hidden = true;
      control.disabled = true;
      control.tabIndex = -1;
      control.setAttribute('aria-disabled', 'true');
      const item = control.closest?.('li');
      if (item) item.hidden = true;
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
      renderPatientSummary(currentPatientID);
    }
  }

  function datingInputs() {
    return {
      lmpDate: document.getElementById('lmpDate')?.value || '',
      embryoTransferDate: document.getElementById('embryoTransferDate')?.value || '',
      embryoAge: document.getElementById('embryoAge')?.value || '5',
      ultrasoundDate: document.getElementById('ultrasoundDatingDate')?.value || '',
      ultrasoundGAWeeks: document.getElementById('ultrasoundGAWeeks')?.value || '',
      ultrasoundGADays: document.getElementById('ultrasoundGADays')?.value || '',
      manualGAWeeks: document.getElementById('manualGAWeeks')?.value || '',
      manualGADays: document.getElementById('manualGADays')?.value || '',
    };
  }

  function currentDatingMethod() {
    return document.getElementById('datingMethod')?.value || 'lmp';
  }

  function showDatingMethodFields(method=currentDatingMethod()) {
    document.querySelectorAll('.dating-method-field').forEach(field => {
      field.hidden = field.dataset.datingField !== method;
    });
  }

  function establishedDatingMethod() {
    if (!currentPatientID) return '';
    const patient = DB.getPatient(currentPatientID);
    return patient?.datingMethod || (patient?.lmpDate ? 'lmp' : '');
  }

  function applyDating({ confirmChange=false }={}) {
    const method = currentDatingMethod();
    if (confirmChange && currentPatientID && !_datingChangeConfirming) {
      const established = establishedDatingMethod();
      if (established && established !== method) {
        _datingChangeConfirming = true;
        UI.modal(
          'Change pregnancy dating?',
          'This patient already has pregnancy dating established. Change the official dating method?',
          () => {
            _datingMethodBeforeChange = method;
            _datingChangeConfirming = false;
            applyDating();
            DB.markChanged();
          },
          true
        );
        document.getElementById('modalCancel').onclick = () => {
          document.getElementById('modalOverlay').style.display = 'none';
          const select = document.getElementById('datingMethod');
          if (select) select.value = _datingMethodBeforeChange || established || 'lmp';
          _datingChangeConfirming = false;
          showDatingMethodFields();
          updateCalculations();
        };
        return;
      }
    }
    showDatingMethodFields(method);
    const calcDate = document.getElementById('calcDate')?.value || CALC.todayISO();
    const derived = CALC.deriveDating(method, datingInputs(), calcDate);
    if (method !== 'lmp' && derived.lmpDate) {
      const lmpInput = document.getElementById('lmpDate');
      if (lmpInput) lmpInput.value = derived.lmpDate;
    }
    _datingMethodBeforeChange = method;
    updateCalculations();
  }

  function setDatingMetadata(patient={}) {
    const set = (id, value) => { const el = document.getElementById(id); if (el) el.value = value || ''; };
    set('datingMethod', patient.datingMethod || 'lmp');
    set('embryoTransferDate', patient.embryoTransferDate);
    set('embryoAge', patient.embryoAge || '5');
    set('ultrasoundDatingDate', patient.ultrasoundDatingDate);
    set('ultrasoundGAWeeks', patient.ultrasoundGAWeeks);
    set('ultrasoundGADays', patient.ultrasoundGADays);
    set('manualGAWeeks', patient.manualGAWeeks);
    set('manualGADays', patient.manualGADays);
    _datingMethodBeforeChange = patient.datingMethod || 'lmp';
    showDatingMethodFields();
  }

  function datingMetadataForSave() {
    const method = currentDatingMethod();
    const derived = CALC.deriveDating(method, datingInputs(), document.getElementById('calcDate')?.value || CALC.todayISO());
    return {
      datingMethod: method,
      datingLabel: derived.label,
      embryoTransferDate: document.getElementById('embryoTransferDate')?.value || '',
      embryoAge: document.getElementById('embryoAge')?.value || '',
      ultrasoundDatingDate: document.getElementById('ultrasoundDatingDate')?.value || '',
      ultrasoundGAWeeks: document.getElementById('ultrasoundGAWeeks')?.value || '',
      ultrasoundGADays: document.getElementById('ultrasoundGADays')?.value || '',
      manualGAWeeks: document.getElementById('manualGAWeeks')?.value || '',
      manualGADays: document.getElementById('manualGADays')?.value || '',
    };
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
    renderGeneratedObstetricHistory();
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

  function runRiskEngine(snapshot=null) {
    const data  = snapshot?.patient || collectFormData();
    const labs  = snapshot?.labs || UI.collectLabs();
    const scans = snapshot?.scans || UI.collectScans();
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

  function allowRepeatableAdd(key) {
    if (!canEditPatientRecord()) return false;
    const now=Date.now();
    if (now-(_lastRepeatableAddAt[key]||0)<400) return false;
    _lastRepeatableAddAt[key]=now;
    return true;
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

  function defaultClinicalDate(input) {
    if (input && input.type === 'date' && !input.value) input.value = CALC.todayISO();
  }

  function focusNewClinicalRow(row, selector='input, select, textarea') {
    const target = selector ? row?.querySelector(selector) : null;
    (target || row?.querySelector('input, select, textarea'))?.focus();
    scrollRowIntoView(row);
  }

  function recalculateAfterClinicalDateChange() {
    updateVisitGAs();
    updateScanGAs();
    refreshVisitDerivedSummaries();
  }

  function rerenderScanRows(focusIdx=null) {
    const body = document.getElementById('ultraBody');
    const scans = UI.collectScans({ includeDrafts:true });
    const lmp = document.getElementById('lmpDate').value;
    body.innerHTML = scans.map((scan, index) => UI.scanRowHTML(scan, index, lmp)).join('');
    if (focusIdx !== null) {
      const row = body.querySelector(`.scan-row[data-idx="${focusIdx}"]`);
      focusNewClinicalRow(row, '.scan-type');
    }
  }

  function addScanRow() {
    if (!allowRepeatableAdd('scan')) return;
    const body = document.getElementById('ultraBody');
    const idx  = body.querySelectorAll('.scan-row').length;
    const lmp  = document.getElementById('lmpDate').value;
    body.insertAdjacentHTML('beforeend', UI.scanRowHTML({ category:'Quick limited clinic scan' }, idx, lmp));
    const row = body.querySelector(`.scan-row[data-idx="${idx}"]`);
    defaultClinicalDate(row?.querySelector('.scan-date'));
    recalculateAfterClinicalDateChange();
    focusNewClinicalRow(row, '.scan-type');
    DB.markChanged();
  }

  function addProcRow() {
    if (!allowRepeatableAdd('procedure')) return;
    const body = document.getElementById('procBody');
    const idx  = body.querySelectorAll('tr[data-idx]').length;
    const lmp  = document.getElementById('lmpDate').value;
    body.insertAdjacentHTML('beforeend', UI.procRowHTML({}, idx, lmp));
    const row = body.lastElementChild;
    defaultClinicalDate(row?.querySelector('.proc-date'));
    recalculateAfterClinicalDateChange();
    focusNewClinicalRow(row, 'select');
    DB.markChanged();
  }

  function addVisitRow() {
    if (!allowRepeatableAdd('visit')) return;
    const body = document.getElementById('visitBody');
    const idx  = body.querySelectorAll('tr[data-idx]').length;
    const lmp  = document.getElementById('lmpDate').value;
    body.insertAdjacentHTML('beforeend', UI.visitRowHTML({}, idx, lmp, activeMedicationsForCurrentPatient()));
    const newRow    = body.lastElementChild;
    const dateInput = newRow.querySelector('.visit-date');
    defaultClinicalDate(dateInput);
    focusNewClinicalRow(newRow, '.visit-date');
    refreshVisitMedicationHelpers();
    recalculateAfterClinicalDateChange();
    DB.markChanged();
  }

  function compactLabLabel(label) {
    return ({'Fasting Blood Glucose':'FBS','Urine Protein':'Urine protein','Platelets':'Platelets'})[label] || label;
  }

  function refreshVisitDerivedSummaries() {
    const rows=document.querySelectorAll('#visitBody tr[data-idx]');if(!rows.length)return;
    const labs=UI.collectLabs();
    const procedures=UI.collectProcs();
    rows.forEach(row=>{
      const date=row.querySelector('.visit-date')?.value || '';
      const labTarget=row.querySelector('.visit-lab-derived');
      const procedureTarget=row.querySelector('.visit-procedure-derived');
      const labItems=UI.sameDayLabItems(labs,date);
      const procedureItems=UI.sameDayProcedureItems(procedures,date);
      const legacyLabs=row.querySelector('.visit-lab-legacy')?.value || '';
      const legacyProcedures=row.querySelector('.visit-proc-legacy')?.value || '';
      if(labTarget) {
        labTarget.innerHTML=labItems.length
          ? `<button type="button" class="visit-derived-labs" data-lab-trim="t${labItems[0].trimester+1}">${labItems.slice(0,8).map(item=>`<span class="visit-lab-chip ${escapeHTML(item.flag)}"><strong>${escapeHTML(compactLabLabel(item.label))}</strong> ${escapeHTML(item.value)}${item.unit?` ${escapeHTML(item.unit)}`:''} ${escapeHTML(item.icon)}</span>`).join('')}</button>`
          : legacyLabs?`<details class="visit-legacy-detail"><summary>Legacy lab note</summary><div>${escapeHTML(legacyLabs)}</div></details>`:'';
      }
      if(procedureTarget) {
        procedureTarget.innerHTML=procedureItems.length
          ? procedureItems.map(item=>`<div class="visit-procedure-indicator"><strong>Procedure recorded:</strong> ${escapeHTML(item.label)}</div>`).join('')
          : legacyProcedures?`<details class="visit-legacy-detail"><summary>Legacy procedure note</summary><div>${escapeHTML(legacyProcedures)}</div></details>`:'';
      }
    });
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
    if (!allowRepeatableAdd('problem')) return;
    const list = document.getElementById('problemList');
    if (!list) return;
    const body = openCollapsibleForList(list);
    const idx = list.querySelectorAll('.problem-row').length;
    list.insertAdjacentHTML('beforeend', UI.problemRowHTML({}, idx));
    if (body) body.style.maxHeight = 'none';
    const row = list.querySelector(`.problem-row[data-idx="${idx}"]`);
    defaultClinicalDate(row?.querySelector('.problem-onset'));
    focusNewClinicalRow(row, '.problem-template');
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
    if (!allowRepeatableAdd('medication')) return;
    const list = document.getElementById('medicationList');
    if (!list) return;
    const body = openCollapsibleForList(list);
    const idx = list.querySelectorAll('.medication-row').length;
    list.insertAdjacentHTML('beforeend', UI.medicationRowHTML({}, idx, DB.getMedicationMemory?.() || []));
    if (body) body.style.maxHeight = 'none';
    const row = list.querySelector(`.medication-row[data-idx="${idx}"]`);
    defaultClinicalDate(row?.querySelector('.med-start'));
    focusNewClinicalRow(row, '.med-template');
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
    refreshVisitDerivedSummaries();
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
    const workspace = document.getElementById('labWorkspace');
    if (!workspace) return;
    try {
      const template = DB.getSettings()?.labsV21Template || null;
      const html = UI.buildLabsWorkspace(labData, template);
      if (!html?.trim()) throw new Error('Labs renderer returned no workspace content.');
      workspace.innerHTML = html;
    } catch (error) {
      console.error('Labs workspace render failed:', error);
      workspace.innerHTML = `<div class="lab-v21-render-error" role="alert">
        <strong>Labs workspace could not load.</strong>
        <span>Reload the application to update its clinical workspace files. No stored results were changed.</span>
      </div>`;
    }
  }

  function replaceActiveLabTrimester(html) {
    const content = document.getElementById('labTrimesterContent');
    if (content) content.innerHTML = html;
  }

  function customLabCode() {
    const random = crypto.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2,10)}`;
    return `custom_${random.replace(/[^a-zA-Z0-9]/g,'_')}`;
  }

  function addCustomLabTest(trimKey=UI.labLayoutState().activeTrimester) {
    if (_archivedRecordMode) {
      UI.toast('Restore this archived patient before changing Labs.', 'warning', 5000);
      return;
    }
    const hidden = UI.hiddenLabTests(trimKey);
    const library = Object.values(CONSTANTS.LAB_TEST_LIBRARY || {});
    UI.modal('Add or restore lab test',
      `<label class="modal-field-label" for="labLibrarySearch">Search test library</label>
       <input id="labLibrarySearch" type="search" placeholder="Search tests">
       <div class="lab-v21-library-list" id="labLibraryList">${library.map(def => {
         const isHidden = hidden.some(item => item.testCode === def.testCode);
         return `<div class="lab-v21-library-item" data-search="${escapeHTML(def.testName.toLowerCase())}">
           <span>${escapeHTML(def.testName)}</span><button type="button" data-restore-code="${escapeHTML(def.testCode)}" ${isHidden?'':'disabled'}>${isHidden?'Restore':'Already shown'}</button>
         </div>`;
       }).join('')}</div>
       <hr style="border:0;border-top:1px solid var(--border);margin:12px 0">
       <div class="field-group"><label for="customLabName">Manual custom test</label><input id="customLabName" placeholder="Test name"></div>
       <div class="fg2" style="margin-top:8px">
         <div class="field-group"><label for="customLabValueType">Value type</label><select id="customLabValueType"><option value="text">Text / numeric</option><option value="qualitative">Qualitative</option></select></div>
         <div class="field-group"><label for="customLabUnit">Unit</label><input id="customLabUnit" placeholder="Optional"></div>
         <div class="field-group"><label for="customLabPanel">Panel</label><select id="customLabPanel">${CONSTANTS.LAB_PANEL_DEFINITIONS.map(panel => `<option value="${panel.code}" ${panel.code==='custom'?'selected':''}>${escapeHTML(panel.name)}</option>`).join('')}</select></div>
         <div class="field-group"><label for="customLabNotes">Definition notes</label><input id="customLabNotes" placeholder="Optional"></div>
         <div class="field-group"><label for="customLabReferenceLow">Reference low</label><input id="customLabReferenceLow" inputmode="decimal" placeholder="Optional"></div>
         <div class="field-group"><label for="customLabReferenceHigh">Reference high</label><input id="customLabReferenceHigh" inputmode="decimal" placeholder="Optional"></div>
       </div>`,
      () => {
        const result = UI.addCustomLabDefinition({
          testCode:customLabCode(),
          testName:document.getElementById('customLabName')?.value || '',
          valueType:document.getElementById('customLabValueType')?.value || 'text',
          unit:document.getElementById('customLabUnit')?.value || '',
          panelCode:document.getElementById('customLabPanel')?.value || 'custom',
          notes:document.getElementById('customLabNotes')?.value || '',
          referenceLow:document.getElementById('customLabReferenceLow')?.value || '',
          referenceHigh:document.getElementById('customLabReferenceHigh')?.value || '',
        });
        if (!result.ok) { UI.toast(result.message, 'error', 5000); return; }
        replaceActiveLabTrimester(result.html);
        refreshVisitDerivedSummaries();
        DB.markChanged();
      });
    document.getElementById('modalConfirm').textContent = 'Add custom test';
    document.getElementById('labLibrarySearch')?.addEventListener('input', event => {
      const query=event.target.value.toLowerCase().trim();
      document.querySelectorAll('#labLibraryList .lab-v21-library-item').forEach(item => { item.hidden=query&&!item.dataset.search.includes(query); });
    });
    document.getElementById('labLibraryList')?.addEventListener('click', event => {
      const button=event.target.closest('[data-restore-code]');if(!button||button.disabled)return;
      replaceActiveLabTrimester(UI.restoreLabTest(trimKey,button.dataset.restoreCode));
      refreshVisitDerivedSummaries();
      document.getElementById('modalOverlay').style.display='none';
      DB.markChanged();
    });
  }

  function handleLabWorkspaceClick(event) {
    const tab=event.target.closest('[data-lab-trim]');
    if (tab) {
      UI.captureLabInputs(document.getElementById('labTrimesterContent'));
      document.querySelectorAll('.lab-v21-tab').forEach(item=>item.classList.toggle('active',item===tab));
      replaceActiveLabTrimester(UI.renderLabTrimester(tab.dataset.labTrim));
      refreshVisitDerivedSummaries();
      return;
    }
    if (event.target.closest('[data-lab-action="add"]')) { addCustomLabTest(); return; }
    const hide=event.target.closest('[data-lab-action="hide"]');
    if (!hide) return;
    if (_archivedRecordMode) return;
    const definition = CONSTANTS.LAB_TEST_LIBRARY?.[hide.dataset.key];
    UI.modal('Hide lab test',
      `Remove <strong>${escapeHTML(definition?.testName || hide.dataset.key)}</strong> from this patient layout? Existing results and dates will remain stored.`,
      () => {
        replaceActiveLabTrimester(UI.hideLabTest(hide.dataset.trim,hide.dataset.key));
        refreshVisitDerivedSummaries();
        DB.markChanged();
      });
  }

  function handleLabWorkspaceChange(event) {
    UI.updateLabRowStatus(event.target);
    const customName=event.target.closest('.lab-v21-custom-name');
    const customPanel=event.target.closest('.lab-v21-custom-panel');
    refreshVisitDerivedSummaries();
    if (!customName&&!customPanel) return;
    if (_archivedRecordMode) return;
    UI.captureLabInputs(document.getElementById('labTrimesterContent'));
    const code=(customName||customPanel).dataset.code;
    const row=(customName||customPanel).closest('.lab-v21-row');
    const result=UI.updateCustomLabDefinition(code,{
      testName:row?.querySelector('.lab-v21-custom-name')?.value,
      panelCode:row?.querySelector('.lab-v21-custom-panel')?.value,
    });
    if(!result.ok){UI.toast(result.message||'Custom test could not be updated','error',5000);return;}
    if(result.html)replaceActiveLabTrimester(result.html);
    DB.markChanged();
  }

  function handleLabWorkspaceInput(event) { UI.updateLabRowStatus(event.target); refreshVisitDerivedSummaries(); }

  function auditPersistedLabLayout(patientID, actions=[]) {
    actions.forEach(action => recordAuditEvent({
      operation:action.operation,
      patientID,
      entityType:'lab-layout',
      entityID:action.testCode || '',
      summary:action.summary || 'Updated Labs layout',
      status:'success',
    }));
    UI.markLabActionsPersisted();
  }

  function promptLabLayoutPersistence(patientID) {
    const state=UI.labLayoutState();
    if (!state.dirty || _archivedRecordMode) return;
    UI.modal('Keep these Labs layout changes?',
      `<p>Results are already saved for this patient. Choose whether added, hidden, restored, or moved tests should also become the clinic default.</p>
       <div class="modal-inline-actions"><button type="button" id="btnSaveLabClinicTemplate" class="btn-modal-confirm">Save to clinic template</button>
       <button type="button" id="btnReviewLabLayout" class="btn-modal-cancel">Review changes</button></div>`,
      () => UI.markLabLayoutDecisionComplete());
    document.getElementById('modalConfirm').textContent='This patient only';
    document.getElementById('modalCancel').textContent='Cancel';
    document.getElementById('btnSaveLabClinicTemplate')?.addEventListener('click',()=>{
      try {
        DB.saveSetting('labsV21Template',UI.labLayoutState().template);
        recordAuditEvent({operation:'lab.template.update',patientID,entityType:'lab-template',summary:'Saved Labs clinic template',status:'success'});
        UI.markLabLayoutDecisionComplete();
        document.getElementById('modalOverlay').style.display='none';
        UI.toast('Labs clinic template saved','success',3000);
      } catch(error) { showStorageFailure(error,'Template save failed','Patient results remain saved, but the clinic Labs template was not stored.'); }
    });
    document.getElementById('btnReviewLabLayout')?.addEventListener('click',()=>{
      document.getElementById('modalOverlay').style.display='none';
      setRecordMode('edit');openEditorAt('labWorkspace');
    });
  }

  /* ════════════════════════════════════
     GROWTH & DOPPLER CHARTS
  ════════════════════════════════════ */
  function openGrowthChartModal(scanIdx) {
    if (BASIC_RELEASE_PAUSED_FEATURES.charts) return pausedBasicReleaseFeature('Charts');
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
    if (BASIC_RELEASE_PAUSED_FEATURES.charts) return pausedBasicReleaseFeature('Charts');
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
    if (BASIC_RELEASE_PAUSED_FEATURES.attachments) return pausedBasicReleaseFeature('Attachments');
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
    if (BASIC_RELEASE_PAUSED_FEATURES.attachments) return pausedBasicReleaseFeature('Attachments');
    if (!currentPatientID) return;
    DB.removeAttachment(currentPatientID, attId);
    document.getElementById(`attItem_${attId}`)?.remove();
    UI.toast('Attachment removed', 'info', 1500);
  }

  function previewAttachment(id, data, type, name) {
    if (BASIC_RELEASE_PAUSED_FEATURES.attachments) return pausedBasicReleaseFeature('Attachments');
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
    if (BASIC_RELEASE_PAUSED_FEATURES.ocr) return pausedBasicReleaseFeature('OCR');
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
    if (BASIC_RELEASE_PAUSED_FEATURES.attachments) return;
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

  function closePatientMoreMenu() {
    const menu=document.getElementById('patientMoreMenu');if(menu)menu.hidden=true;
    document.getElementById('btnPatientMore')?.setAttribute('aria-expanded','false');
  }

  function updatePatientHeaderActions(patient=null) {
    const hasPatient=Boolean(currentPatientID || patient?.patientID);
    const archived=Boolean(patient && DB.isArchived(patient));
    const archive=document.getElementById('btnArchiveCurrentPatient');
    if(archive){archive.hidden=!hasPatient||archived;archive.disabled=!hasPatient||archived;}
    const restore=document.getElementById('btnRestoreCurrentPatient');
    if(restore){restore.hidden=!archived;restore.disabled=!archived;}
    const audit=document.getElementById('btnPatientAudit');if(audit)audit.disabled=!hasPatient;
    const save=document.getElementById('btnSave');if(save)save.disabled=archived||!canEditPatientRecord();
  }

  function showCurrentPatientAudit() {
    if(!currentPatientID){UI.toast('Open a patient to view audit history','info');return;}
    const events=DB.getAuditEvents({patientID:currentPatientID}).slice(-30).reverse();
    UI.modal('Patient audit history',events.length
      ? `<div class="patient-audit-list">${events.map(event=>`<div><strong>${escapeHTML(event.operation||'event')}</strong><span>${escapeHTML(event.timestamp||'')}</span><p>${escapeHTML(event.summary||event.reason||'')}</p></div>`).join('')}</div>`
      : '<p>No local audit events recorded for this patient.</p>',()=>{},true);
    document.getElementById('modalConfirm').style.display='none';
    const cancel=document.getElementById('modalCancel');cancel.style.display='';cancel.textContent='Close';
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
    updatePatientHeaderActions(patient);

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
    updatePatientHeaderActions(patient);
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
      const card=target?.closest('[data-collapsible]');
      const body=card?.querySelector('.collapsible-body');
      if(body?.classList.contains('collapsed')) {
        body.classList.remove('collapsed');body.style.maxHeight='none';
        card.querySelector('.toggle-arrow')?.classList.add('open');
        const label=card.querySelector('.toggle-label');if(label)label.textContent='Hide';
      }
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
    'Live birth', 'Stillbirth', 'Neonatal death', 'Pregnancy loss',
    'Ectopic pregnancy', 'Molar pregnancy', 'Other',
  ];
  const DELIVERY_TYPES = [
    'Cesarean section', 'Normal vaginal delivery', 'Instrumental vaginal delivery',
    'Other', 'Unknown', 'Spontaneous vaginal delivery', 'Assisted vaginal - vacuum',
    'Assisted vaginal - forceps', 'Planned cesarean', 'Emergency cesarean', 'VBAC',
    'Breech vaginal delivery',
  ];
  const LIVING_STATUSES = ['Alive','Stillbirth','Neonatal death','Unknown'];
  const MAJOR_COMPLICATIONS = [
    'None','Previous PET / hypertensive disorder','Preterm birth','Stillbirth','Neonatal death',
    'Postpartum haemorrhage','Fetal growth restriction','Congenital anomaly',
    'Shoulder dystocia','Operative vaginal delivery','Other',
  ];
  const LOSS_TRIMESTERS = ['First trimester','Second trimester','Third trimester','Unknown'];
  const LOSS_MANAGEMENT = ['Spontaneous / expectant','Medical management','Surgical evacuation','Mixed medical and surgical','Other','Unknown'];
  const ECTOPIC_MANAGEMENT = ['Expectant management','Medical management','Surgical management','Other','Unknown'];
  const MOLAR_MANAGEMENT = ['Evacuation','Medical management','Surgical management','Other','Unknown'];
  const ANOMALY_TYPES = [
    'Neural tube defect', 'Congenital heart defect', 'Cleft lip / palate',
    'Down syndrome / Trisomy 21', 'Other chromosomal anomaly', 'Limb anomaly',
    'Renal / urinary anomaly', 'Abdominal wall defect', 'Other',
  ];

  function optionList(items, selected, placeholder) {
    const values=items.slice();
    if (selected && !values.includes(selected)) values.unshift(selected);
    return `<option value="">${escapeHTML(placeholder)}</option>`
      + values.map(item => (
        `<option value="${escapeHTML(item)}" ${item === selected ? 'selected' : ''}>`
        + `${escapeHTML(item === 'Miscarriage / abortion' ? 'Pregnancy loss' : item)}</option>`
      )).join('');
  }

  function previousPregnancyRowHTML(pregnancy={}, index=0) {
    const anomalyPresent = pregnancy.congenitalAnomaly === 'Yes';
    const customAnomaly = pregnancy.anomalyType === 'Other';
    const kind=UI.pregnancyOutcomeKind(pregnancy.outcome);
    const hidden=expected=>kind!==expected?'hidden':'';
    return `
      <article class="previous-pregnancy-row" data-pregnancy-index="${index}">
        <div class="previous-pregnancy-header">
          <strong>Pregnancy ${index + 1}</strong>
          <button type="button" class="btn-remove-pregnancy" aria-label="Remove pregnancy ${index + 1}">Remove</button>
        </div>
        <div class="previous-pregnancy-grid preg-primary-grid">
          <div class="field-group"><label>Year</label>
            <input class="preg-year" type="number" min="1950" max="2100" value="${escapeHTML(pregnancy.year)}" placeholder="2022"></div>
          <div class="field-group"><label>Outcome</label>
            <select class="preg-outcome">${optionList(PREGNANCY_OUTCOMES, pregnancy.outcome, 'Select outcome')}</select></div>
          <div class="field-group preg-kind-delivery" ${hidden('delivery')}><label>Gestation at delivery (weeks)</label>
            <input class="preg-ga" type="number" min="4" max="44" step="0.1" value="${escapeHTML(pregnancy.gestationalAge)}" placeholder="39"></div>
          <div class="field-group preg-kind-delivery" ${hidden('delivery')}><label>Delivery type</label>
            <select class="preg-delivery">${optionList(DELIVERY_TYPES, pregnancy.deliveryType, 'Select delivery type')}</select></div>
          <div class="field-group preg-kind-delivery" ${hidden('delivery')}><label>Living status</label>
            <select class="preg-living">${optionList(LIVING_STATUSES,pregnancy.livingStatus,'Select status')}</select></div>
          <div class="field-group preg-kind-delivery" ${hidden('delivery')}><label>Major complication</label>
            <select class="preg-major">${optionList(MAJOR_COMPLICATIONS,pregnancy.majorComplication,'Optional')}</select></div>

          <div class="field-group preg-kind-loss" ${hidden('loss')}><label>Trimester of loss</label>
            <select class="preg-loss-trimester">${optionList(LOSS_TRIMESTERS,pregnancy.lossTrimester,'Select trimester')}</select></div>
          <div class="field-group preg-kind-loss" ${hidden('loss')}><label>Management</label>
            <select class="preg-loss-management">${optionList(LOSS_MANAGEMENT,pregnancy.lossManagement,'Select management')}</select></div>

          <div class="field-group preg-kind-ectopic" ${hidden('ectopic')}><label>Ectopic site</label>
            <input class="preg-ectopic-site" value="${escapeHTML(pregnancy.ectopicSite)}" placeholder="Optional"></div>
          <div class="field-group preg-kind-ectopic" ${hidden('ectopic')}><label>Management</label>
            <select class="preg-ectopic-management">${optionList(ECTOPIC_MANAGEMENT,pregnancy.ectopicManagement,'Select management')}</select></div>
          <div class="field-group preg-kind-ectopic" ${hidden('ectopic')}><label>Complication</label>
            <input class="preg-ectopic-complication" value="${escapeHTML(pregnancy.ectopicComplication)}" placeholder="Optional"></div>
          <div class="field-group preg-kind-ectopic" ${hidden('ectopic')}><label>Notes</label>
            <textarea class="preg-ectopic-notes">${escapeHTML(pregnancy.ectopicNotes)}</textarea></div>

          <div class="field-group preg-kind-molar" ${hidden('molar')}><label>Management</label>
            <select class="preg-molar-management">${optionList(MOLAR_MANAGEMENT,pregnancy.molarManagement,'Select management')}</select></div>
          <div class="field-group preg-kind-molar" ${hidden('molar')}><label>Follow-up completed</label>
            <select class="preg-molar-followup">${optionList(['Yes','No','Ongoing','Unknown'],pregnancy.molarFollowUpCompleted,'Select')}</select></div>
          <div class="field-group preg-kind-molar" ${hidden('molar')}><label>Complication</label>
            <input class="preg-molar-complication" value="${escapeHTML(pregnancy.molarComplication)}" placeholder="Optional"></div>
          <div class="field-group preg-kind-molar" ${hidden('molar')}><label>Notes</label>
            <textarea class="preg-molar-notes">${escapeHTML(pregnancy.molarNotes)}</textarea></div>
        </div>
        <details class="pregnancy-more-details" ${kind==='empty'?'hidden':''}>
          <summary>More details</summary>
          <div class="previous-pregnancy-grid preg-more-grid">
            <div class="field-group preg-kind-delivery" ${hidden('delivery')}><label>Fetal sex</label>
              <select class="preg-sex">${optionList(['Female','Male','Indeterminate','Unknown'],pregnancy.fetalSex,'Select')}</select></div>
            <div class="field-group preg-kind-delivery" ${hidden('delivery')}><label>Birth weight (kg)</label>
              <input class="preg-weight" type="number" min="0.2" max="8" step="0.01" value="${escapeHTML(pregnancy.birthWeight)}" placeholder="3.2"></div>
            <div class="field-group preg-kind-delivery" ${hidden('delivery')}><label>Cesarean / assisted indication</label>
              <input class="preg-indication" value="${escapeHTML(pregnancy.indication)}" placeholder="If applicable"></div>
            <div class="field-group preg-kind-delivery" ${hidden('delivery')}><label>Neonatal notes</label>
              <input class="preg-neonatal" value="${escapeHTML(pregnancy.neonatalOutcome)}" placeholder="Well, NICU, treatment, outcome"></div>
            <div class="field-group preg-kind-delivery" ${hidden('delivery')}><label>Additional complications</label>
              <input class="preg-maternal" value="${escapeHTML(pregnancy.maternalComplications)}" placeholder="Optional"></div>
            <div class="field-group preg-kind-loss" ${hidden('loss')}><label>Gestational age (weeks)</label>
              <input class="preg-loss-ga" type="number" min="4" max="44" step="0.1" value="${escapeHTML(pregnancy.lossGestationalAge || pregnancy.gestationalAge)}"></div>
            <div class="field-group preg-kind-loss" ${hidden('loss')}><label>Complication</label>
              <input class="preg-loss-complication" value="${escapeHTML(pregnancy.lossComplication)}" placeholder="Optional"></div>
            <div class="field-group preg-kind-loss" ${hidden('loss')}><label>Pathology / genetic testing</label>
              <input class="preg-pathology" value="${escapeHTML(pregnancy.pathologyTesting)}" placeholder="Optional"></div>
            <div class="field-group preg-kind-loss" ${hidden('loss')}><label>Notes</label>
              <textarea class="preg-loss-notes">${escapeHTML(pregnancy.lossNotes)}</textarea></div>
            <div class="field-group preg-kind-delivery" ${hidden('delivery')}><label>Congenital anomaly</label>
              <select class="preg-anomaly"><option value="">Select</option><option ${pregnancy.congenitalAnomaly === 'No' ? 'selected' : ''}>No</option><option ${anomalyPresent ? 'selected' : ''}>Yes</option><option ${pregnancy.congenitalAnomaly === 'Unknown' ? 'selected' : ''}>Unknown</option></select></div>
            <div class="field-group preg-kind-delivery preg-anomaly-type-wrap" ${kind==='delivery'&&anomalyPresent?'':'hidden'}><label>Anomaly type</label>
              <select class="preg-anomaly-type">${optionList(ANOMALY_TYPES,pregnancy.anomalyType,'Select anomaly')}</select></div>
            <div class="field-group preg-kind-delivery preg-anomaly-custom-wrap" ${kind==='delivery'&&anomalyPresent&&customAnomaly?'':'hidden'}><label>Describe anomaly</label>
              <input class="preg-anomaly-custom" value="${escapeHTML(pregnancy.anomalyDetails)}" placeholder="Manual description"></div>
            <div class="field-group preg-kind-delivery" ${hidden('delivery')}><label>Notes</label>
              <textarea class="preg-notes">${escapeHTML(pregnancy.notes)}</textarea></div>
          </div>
        </details>
      </article>`;
  }

  function renderPreviousPregnancies(pregnancies=[]) {
    _previousPregnancies = Array.isArray(pregnancies) ? pregnancies : [];
    const list = document.getElementById('previousPregnancyList');
    if (!list) return;
    list.innerHTML = _previousPregnancies.length
      ? _previousPregnancies.map(previousPregnancyRowHTML).join('')
      : '<div class="previous-pregnancy-empty">No previous pregnancies recorded.</div>';
    renderGeneratedObstetricHistory(_previousPregnancies);
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
      livingStatus: row.querySelector('.preg-living')?.value || '',
      majorComplication: row.querySelector('.preg-major')?.value || '',
      fetalSex: row.querySelector('.preg-sex')?.value || '',
      lossTrimester: row.querySelector('.preg-loss-trimester')?.value || '',
      lossManagement: row.querySelector('.preg-loss-management')?.value || '',
      lossGestationalAge: row.querySelector('.preg-loss-ga')?.value || '',
      lossComplication: row.querySelector('.preg-loss-complication')?.value.trim() || '',
      pathologyTesting: row.querySelector('.preg-pathology')?.value.trim() || '',
      lossNotes: row.querySelector('.preg-loss-notes')?.value.trim() || '',
      ectopicSite: row.querySelector('.preg-ectopic-site')?.value.trim() || '',
      ectopicManagement: row.querySelector('.preg-ectopic-management')?.value || '',
      ectopicComplication: row.querySelector('.preg-ectopic-complication')?.value.trim() || '',
      ectopicNotes: row.querySelector('.preg-ectopic-notes')?.value.trim() || '',
      molarManagement: row.querySelector('.preg-molar-management')?.value || '',
      molarFollowUpCompleted: row.querySelector('.preg-molar-followup')?.value || '',
      molarComplication: row.querySelector('.preg-molar-complication')?.value.trim() || '',
      molarNotes: row.querySelector('.preg-molar-notes')?.value.trim() || '',
      notes: row.querySelector('.preg-notes')?.value.trim() || '',
    })).filter(item => Object.values(item).some(Boolean));
  }

  function addPreviousPregnancy() {
    if (!allowRepeatableAdd('previous-pregnancy')) return;
    _previousPregnancies = collectPreviousPregnancies();
    _previousPregnancies.push({});
    renderPreviousPregnancies(_previousPregnancies);
    DB.markChanged();
    requestAnimationFrame(() => {
      focusNewClinicalRow(document.querySelector('.previous-pregnancy-row:last-child'), '.preg-year');
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
    if (event.target.classList.contains('preg-outcome')) applyPregnancyOutcomeVisibility(row);
    renderGeneratedObstetricHistory(collectPreviousPregnancies());
  }

  function applyPregnancyOutcomeVisibility(row) {
    const kind=UI.pregnancyOutcomeKind(row.querySelector('.preg-outcome')?.value);
    ['delivery','loss','ectopic','molar'].forEach(name=>row.querySelectorAll(`.preg-kind-${name}`).forEach(field=>{field.hidden=kind!==name;}));
    const details=row.querySelector('.pregnancy-more-details');if(details)details.hidden=kind==='empty';
    if(kind==='delivery') {
      const anomaly=row.querySelector('.preg-anomaly')?.value==='Yes';
      const type=row.querySelector('.preg-anomaly-type')?.value;
      const typeWrap=row.querySelector('.preg-anomaly-type-wrap');if(typeWrap)typeWrap.hidden=!anomaly;
      const customWrap=row.querySelector('.preg-anomaly-custom-wrap');if(customWrap)customWrap.hidden=!anomaly||type!=='Other';
    }
  }

  function renderGeneratedObstetricHistory(pregnancies=collectPreviousPregnancies()) {
    const target=document.getElementById('obstetricHistoryGenerated');if(!target)return;
    const summary=UI.obstetricHistorySummary(pregnancies,{
      t:document.getElementById('tpalT')?.value,p:document.getElementById('tpalP')?.value,
      a:document.getElementById('tpalA')?.value,l:document.getElementById('tpalL')?.value,
    });
    target.innerHTML=`<div class="generated-obstetric-title">Obstetric History</div>
      <div class="generated-obstetric-facts"><strong>${escapeHTML(summary.tpalText)}</strong><span>${escapeHTML(summary.deliveryText)}</span></div>
      ${summary.complications.length?`<div class="generated-obstetric-complications"><strong>Previous complications:</strong> ${escapeHTML(summary.complications.join(' · '))}</div>`:''}
      ${summary.rows.length?`<div class="generated-obstetric-rows">${summary.rows.map(parts=>`<div>${parts.map(part=>`<span>${escapeHTML(part)}</span>`).join('')}</div>`).join('')}</div>`:'<div class="generated-obstetric-empty">No previous pregnancies recorded.</div>'}`;
  }

  function renderPregnancyHistorySummary(pregnancies) {
    const target = document.getElementById('summaryPregnancyHistory');
    if (!target) return;
    if (!pregnancies.length) {
      target.className = 'summary-empty';
      target.textContent = 'No previous pregnancy details recorded.';
      return;
    }
    const summary=UI.obstetricHistorySummary(pregnancies,{});
    target.className='summary-pregnancy-list';
    target.innerHTML=summary.rows.map(parts=>`<div><strong>${escapeHTML(parts[0])}</strong><span>${parts.slice(1).map(escapeHTML).join(' · ')}</span></div>`).join('');
  }

  function activeProblemsFrom(records=[]) {
    return (Array.isArray(records) ? records : []).filter(record =>
      record.status === 'Active' || record.status === 'Monitoring'
    );
  }

  function activeMedicationsFrom(records=[]) {
    return (Array.isArray(records) ? records : []).filter(record =>
      record.status === 'Active'
    );
  }

  function savedSummarySnapshot(source=null) {
    const patientID = typeof source === 'string'
      ? source
      : (source?.patientID || source?.patient?.patientID || currentPatientID);
    const patient = source?.patient || (patientID ? DB.getPatient(patientID) : source);
    const id = patient?.patientID || patientID || '';
    return {
      patient: patient || null,
      visits: Array.isArray(source?.visits) ? source.visits : (id ? DB.getVisits(id) : []),
      scans: Array.isArray(source?.scans) ? source.scans : (id ? DB.getScans(id) : []),
      labs: source?.labs || (id ? (DB.getLabs(id) || {}) : {}),
      procedures: Array.isArray(source?.procedures) ? source.procedures : (id ? DB.getProcedures(id) : []),
      problems: Array.isArray(source?.problems)
        ? activeProblemsFrom(source.problems)
        : (id ? DB.getActiveProblems(id) : []),
      medications: Array.isArray(source?.medications)
        ? activeMedicationsFrom(source.medications)
        : (id ? DB.getActiveMedications(id) : []),
    };
  }

  function renderRecentVisit(snapshot) {
    const visits = Array.isArray(snapshot?.visits) ? snapshot.visits : [];
    const completed = visits.filter(visit => visit.date || visit.findings || visit.notes);
    const visit = completed.sort((a,b) => String(b.date).localeCompare(String(a.date)))[0];
    const target = document.getElementById('summaryRecentVisit');
    if (!target) return;
    if (!visit) {
      target.className = 'summary-empty';
      target.textContent = 'No follow-up visit recorded.';
      return;
    }
    const labItems = UI.sameDayLabItems(snapshot.labs || {}, visit.date).slice(0, 4);
    const procedureItems = UI.sameDayProcedureItems(snapshot.procedures || [], visit.date).slice(0, 4);
    const related = [
      labItems.length
        ? `<div><span>Same-day labs</span><strong>${escapeHTML(labItems.map(item => `${item.label}: ${item.value}${item.unit ? ` ${item.unit}` : ''}`).join(' · '))}</strong></div>`
        : '',
      procedureItems.length
        ? `<div><span>Same-day procedures</span><strong>${escapeHTML(procedureItems.map(item => `${item.label}${item.result ? `: ${item.result}` : ''}`).join(' · '))}</strong></div>`
        : '',
    ].filter(Boolean).join('');
    target.className = 'summary-recent-visit';
    target.innerHTML = `
      <div><span>Date</span><strong>${escapeHTML(visit.date ? CALC.formatDate(new Date(`${visit.date}T12:00:00`)) : 'Not dated')}</strong></div>
      <div><span>Blood pressure</span><strong>${escapeHTML(visit.bp || 'Not recorded')}</strong></div>
      <div><span>Weight</span><strong>${escapeHTML(visit.weight ? `${visit.weight} kg` : 'Not recorded')}</strong></div>
      ${related}
      <p>${escapeHTML(visit.findings || visit.notes || 'No clinical note recorded.')}</p>`;
  }

  function renderActiveProblemsSummary(problems=[]) {
    const target = document.getElementById('summaryActiveProblems');
    if (!target) return;
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

  function renderPatientSummary(source) {
    const snapshot = savedSummarySnapshot(source);
    const data = snapshot.patient;
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
    renderActiveProblemsSummary(snapshot.problems);
    renderRecentVisit(snapshot);

    const alerts = [];
    const dating = CALC.deriveDating(data.datingMethod || 'lmp', {
      lmpDate: data.lmpDate,
      embryoTransferDate: data.embryoTransferDate,
      embryoAge: data.embryoAge,
      ultrasoundDate: data.ultrasoundDatingDate,
      ultrasoundGAWeeks: data.ultrasoundGAWeeks,
      ultrasoundGADays: data.ultrasoundGADays,
      manualGAWeeks: data.manualGAWeeks,
      manualGADays: data.manualGADays,
    }, data.calcDate || CALC.todayISO());
    alerts.push({
      level:'clear',
      text:`Dating based on: ${data.datingLabel || dating.label} | Equivalent LMP: ${CALC.formatDate(dating.lmpDate || data.lmpDate)} | EDD: ${CALC.formatDate(dating.edd || CALC.getEDD(data.lmpDate))}`,
    });
    if (data.patientStatus) {
      alerts.push({ level:data.patientStatus === 'Active Follow-up' ? 'clear' : 'attention', text:`Pregnancy status: ${data.patientStatus}` });
    }
    if (data.riskLevel && data.riskLevel !== 'Low Risk') {
      alerts.push({ level:'attention', text:`Risk classification: ${data.riskLevel}` });
    }
    if (snapshot.medications.length) {
      alerts.push({
        level:'clear',
        text:`Active medications: ${snapshot.medications.map(med => med.drugName || med.genericName || 'Unnamed medication').join(', ')}`,
      });
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
      ...datingMetadataForSave(),
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
  function immutableLocalSnapshot(value) {
    const clone = JSON.parse(JSON.stringify(value));
    const freeze = item => {
      if (!item || typeof item !== 'object' || Object.isFrozen(item)) return item;
      Object.values(item).forEach(freeze);
      return Object.freeze(item);
    };
    return freeze(clone);
  }

  function localPersistenceError(name, message, details=[]) {
    const error = new Error(message);
    error.name = name;
    error.details = details;
    return error;
  }

  const COLLECTION_EDITOR_TARGETS = Object.freeze({
    visits:'visitBody',
    scans:'ultraBody',
    procedures:'procBody',
    labs:'labWorkspace',
    problems:'problemList',
    medications:'medicationList',
  });

  function collectionEditorUnsafe(name) {
    const targetID = COLLECTION_EDITOR_TARGETS[name];
    const element = targetID ? document.getElementById(targetID) : null;
    if (!element) return true;
    if (name === 'labs' && element.querySelector?.('.lab-v21-render-error')) return true;
    return false;
  }

  function savedCollectionSnapshot(name, patientID) {
    switch (name) {
      case 'visits': return DB.getVisits(patientID);
      case 'scans': return DB.getScans(patientID);
      case 'procedures': return DB.getProcedures(patientID);
      case 'labs': return DB.getLabs(patientID) || {};
      case 'problems': return DB.getProblems(patientID);
      case 'medications': return DB.getMedications(patientID);
      default: return null;
    }
  }

  function guardCollectedCollections(collected, patientID) {
    const guarded = { ...collected };
    Object.keys(COLLECTION_EDITOR_TARGETS).forEach(name => {
      if (!collectionEditorUnsafe(name)) return;
      guarded[name] = savedCollectionSnapshot(name, patientID);
    });
    return immutableLocalSnapshot(guarded);
  }

  function persistCurrentRecordLocal({ allowCreate=false, auditMode='none' }={}) {
    DB.assertClinicalStorageReadable();

    const collected = immutableLocalSnapshot({
      patient: collectFormData(),
      visits: UI.collectVisits(),
      scans: UI.collectScans(),
      procedures: UI.collectProcs(),
      labs: UI.collectLabs(),
      problems: UI.collectProblems(),
      medications: UI.collectMedications(),
    });
    const validationErrors = validate(collected.patient);
    if (validationErrors.length) {
      throw localPersistenceError(
        'LocalPersistenceValidationError',
        validationErrors[0],
        validationErrors,
      );
    }

    const requestedID = currentPatientID || collected.patient.patientID || '';
    const existing = requestedID ? DB.getPatient(requestedID) : null;
    if (!existing && !allowCreate) {
      throw localPersistenceError(
        'PatientCreationRequiredError',
        'Explicit Save or Quick Save is required to create this patient record.',
      );
    }

    const previousProblems = existing ? DB.getProblems(requestedID) : [];
    const patientToSave = {
      ...collected.patient,
      patientID: existing?.patientID || collected.patient.patientID || '',
      patientUuid: existing?.patientUuid || collected.patient.patientUuid || '',
    };

    const patientID = DB.savePatient(patientToSave);
    if (existing && patientID !== existing.patientID) {
      throw localPersistenceError(
        'PatientIdentityPersistenceError',
        'Existing patient identity changed during local persistence.',
      );
    }
    currentPatientID = patientID;
    const patientIDInput = document.getElementById('patientID');
    if (patientIDInput) patientIDInput.value = patientID;
    DB.setCurrentPatient(patientID);
    const guardedCollections = guardCollectedCollections(collected, patientID);

    // Clinical collections have one deterministic local write order.
    DB.saveVisits(patientID, guardedCollections.visits);
    DB.saveScans(patientID, guardedCollections.scans);
    DB.saveProcedures(patientID, guardedCollections.procedures);
    DB.saveLabs(patientID, guardedCollections.labs);
    DB.saveProblems(patientID, guardedCollections.problems);
    DB.saveMedications(patientID, guardedCollections.medications);

    const persisted = immutableLocalSnapshot({
      patient: DB.getPatient(patientID),
      visits: DB.getVisits(patientID),
      scans: DB.getScans(patientID),
      procedures: DB.getProcedures(patientID),
      labs: DB.getLabs(patientID),
      problems: DB.getProblems(patientID),
      medications: DB.getMedications(patientID),
      patientID,
      created: !existing,
      localSaved: true,
    });
    DB.markPendingCloudSync(persisted.patient, persisted.visits);
    traceIncrementalSync('local-snapshot-queued', {
      patientID,
      visitCount:persisted.visits.length,
    });
    DB.clearChanged();

    if (auditMode === 'manual') {
      recordAuditEvent({
        operation: persisted.created ? 'patient.create' : 'patient.update',
        patientID,
        entityType: 'patient',
        summary: persisted.created
          ? 'Manual save created patient record and related collections'
          : 'Manual save updated patient record and related collections',
        status: 'success',
      });
      recordProblemAuditEvents(previousProblems, persisted.problems, patientID);
    } else if (auditMode === 'autosave') {
      recordAutosaveAudit(patientID);
    }

    scheduleAutomaticIncrementalSync();
    return persisted;
  }

  async function syncSavedPatientAndVisits(id, data, visits=DB.getVisits(id)) {
    if (AUTH.getSessionKind() === 'owner') {
      await SUPA.savePatient(data);
      await SUPA.saveRelated('visits', id, visits);
      return;
    }
    if (AUTH.getSessionKind() !== 'temporary') return;
    await SUPA.savePatient(data);
    if (
      _temporaryPermissions.has('related.create')
      || _temporaryPermissions.has('related.update')
    ) {
      await SUPA.saveRelated('visits', id, visits);
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
    const labLayoutAtSave = UI.labLayoutState();
    let persisted;
    try {
      persisted = persistCurrentRecordLocal({ allowCreate:true, auditMode:'manual' });
      auditPersistedLabLayout(persisted.patientID, labLayoutAtSave.actions);
    } catch (error) {
      console.error('Save failed:', error);
      setAutoSaveStatus('failed');
      bestEffortAuditFailure('manual save', currentPatientID, error);
      if (error?.name === 'LocalPersistenceValidationError') {
        UI.toast('⚠ ' + error.message, 'error', 4000);
      } else if (error?.name === 'StorageReadError' || error?.name === 'StorageShapeError') {
        showStorageFailure(
          error,
          'Stored data could not be read',
          'Stored clinical data appears corrupted. Save was blocked to prevent data loss.'
        );
      } else {
        showStorageFailure(error);
      }
      return { localSaved:false, cloudSynced:false };
    }
    const { patientID:id, patient:data } = persisted;
    document.getElementById('breadcrumbText').textContent = data.fullName;
    setAutoSaveStatus('local-saved');
    updateStorageMeter();
    runRiskEngine(persisted);
    const completeLabLayoutSave = () => {
      if (!labLayoutAtSave.dirty) return;
      if (forTransition) { UI.markLabLayoutDecisionComplete(); return; }
      if (document.getElementById('modalOverlay')?.style.display !== 'flex') promptLabLayoutPersistence(id);
    };
    UI.toast(`Saved locally: ${data.fullName} (${id})`, 'success');
    renderPatientSummary(persisted);
    setRecordMode('summary');
    completeLabLayoutSave();
    return { localSaved:true, cloudSynced:null, syncPending:true };
  }

  async function quickSave() {
    if (!ensureClinicalMutationAllowed('Quick Save')) return false;
    if (_archivedRecordMode) {
      UI.toast('Restore this archived patient before editing or saving.', 'warning', 5000);
      return;
    }
    if (!currentPatientID) {
      return fullSave();
    }
    setAutoSaveStatus('saving');
    let persisted;
    try {
      persisted = persistCurrentRecordLocal({ allowCreate:false, auditMode:'manual' });
    } catch (error) {
      console.error('Quick Save failed:', error);
      setAutoSaveStatus('failed');
      bestEffortAuditFailure('quick save', currentPatientID, error);
      if (error?.name === 'LocalPersistenceValidationError') {
        UI.toast('⚠ ' + error.message, 'error', 4000);
      } else {
        showStorageFailure(error);
      }
      return { localSaved:false, cloudSynced:false };
    }
    updateStorageMeter();
    setAutoSaveStatus('local-saved');
    UI.toast('⚡ Saved locally', 'success', 1800);
    return { localSaved:true, cloudSynced:null, syncPending:true };
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
    setDatingMetadata(p);
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
    refreshVisitDerivedSummaries();
    updateTPAL();
    updateCalculations();
    document.getElementById('breadcrumbText').textContent = p.fullName||'Patient Record';
    document.querySelectorAll('textarea[data-auto-grow]').forEach(autoGrowTextarea);
    renderPatientSummary(p.patientID);
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
    'procBody', 'visitBody', 'labWorkspace',
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
    await runAutomaticIncrementalSync();
    await refreshCloudPatient(id, { renderCurrent:true });
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
     'surgicalHistory','familyHistory','allergyHistory','embryoTransferDate',
     'ultrasoundDatingDate','ultrasoundGAWeeks','ultrasoundGADays','manualGAWeeks',
     'manualGADays'].forEach(id => {
      const el = document.getElementById(id); if(el) el.value='';
    });
    document.getElementById('datingMethod').value = 'lmp';
    document.getElementById('embryoAge').value = '5';
    _datingMethodBeforeChange = 'lmp';
    showDatingMethodFields('lmp');
    const s = document.getElementById('patientStatus');
    s.value=''; UI.applyStatusColor(s);
    document.getElementById('calcDate').value = CALC.todayISO();
    document.getElementById('hospitalRow').style.display       = 'none';
    document.getElementById('multiPregFields').style.display   = 'none';
    document.getElementById('topbarRiskWrap').innerHTML        = UI.riskBadgeHTML('Low Risk');
    initTableRows();
    renderPreviousPregnancies([]);
    buildLabSections(null);
    refreshVisitDerivedSummaries();
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
        await verifyGeneratedBackupPayload(payload, json);
        _downloadJSON(payload, 'ANC_Backup_Shared_Key');
        recordAuditEvent({
          operation: 'export',
          entityType: 'backup',
          summary: 'Exported encrypted shared-key backup',
          status: 'success',
        });
        UI.toast('Backup created and verified', 'success');
      } catch (error) {
        UI.toast(error.message || 'Backup could not be created or verified', 'error', 6000);
      }
      return;
    }
    if (CRYPTO.isEnabled() && CRYPTO.isUnlocked()) {
      try {
        const encrypted = await CRYPTO.encrypt(json);
        const payload = JSON.stringify({ __ancBackup: true, encrypted: true, data: encrypted });
        await verifyGeneratedBackupPayload(payload, json);
        _downloadJSON(payload, 'ANC_Backup_Encrypted');
        recordAuditEvent({
          operation: 'export',
          entityType: 'backup',
          summary: 'Exported encrypted backup',
          status: 'success',
        });
        UI.toast('Backup created and verified', 'success');
      } catch (error) {
        UI.toast(error.message || 'Backup could not be created or verified', 'error', 6000);
      }
    } else {
      try {
        await verifyGeneratedBackupPayload(json, json);
        _downloadJSON(json, 'ANC_Backup');
        recordAuditEvent({
          operation: 'export',
          entityType: 'backup',
          summary: 'Exported unencrypted backup',
          status: 'warning',
        });
        UI.toast('Backup created and verified (unencrypted - enable encryption for security)', 'warning', 6000);
      } catch (error) {
        UI.toast(error.message || 'Backup could not be created or verified', 'error', 6000);
      }
    }
  }

  async function verifyGeneratedBackupPayload(payload, expectedPlaintext) {
    const raw = JSON.parse(payload);
    let plaintext = payload;
    if (raw.__ancBackup && raw.encrypted) {
      if (raw.encryptionScheme === 'phase2-shared-key') {
        if (!phase2Enabled() || !clinicEncryptionUnlocked()) {
          throw new Error('Backup verification requires unlocked shared clinic encryption');
        }
        const decrypted = await _phase2Runtime.decryptPhase2Backup(raw);
        plaintext = typeof decrypted === 'string' ? decrypted : JSON.stringify(decrypted);
      } else {
        if (!CRYPTO.isUnlocked()) throw new Error('Backup verification requires unlocked clinic encryption');
        const decrypted = await CRYPTO.decrypt(raw.data);
        plaintext = typeof decrypted === 'string' ? decrypted : JSON.stringify(decrypted);
      }
    }
    if (raw.plaintextSha256) {
      const actualHash = await sha256(plaintext);
      if (actualHash !== raw.plaintextSha256) throw new Error('Backup integrity check failed');
    }
    if (JSON.stringify(JSON.parse(plaintext)) !== JSON.stringify(JSON.parse(expectedPlaintext))) {
      throw new Error('Backup verification did not match exported data');
    }
    return true;
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
        'Unsaved changes before restore',
        `<p>You have unsaved changes. Importing may replace the currently open record.</p>
         <div class="modal-inline-actions">
           <button type="button" id="btnSaveThenImport" class="btn-modal-confirm">Save, then import</button>
         </div>`,
        () => finish('discard'),
        true
      );
      const discard = document.getElementById('modalConfirm');
      if (discard) discard.textContent = 'Restore without saving';
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
    if (!ensureClinicalMutationAllowed('Restore')) return false;
    const preparation = await prepareImportApplication();
    if (!preparation.proceed) return false;

    beginImportOperation();
    try {
      const ok = DB.importAll(json);
      if (!ok) {
        UI.toast('Restore failed - invalid backup file', 'error');
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
        const restoredCurrentPatient = DB.getPatient(currentPatientID);
        if (!restoredCurrentPatient) throw new Error('Restored current patient could not be reloaded');
        loadPatientIntoForm(restoredCurrentPatient);
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
          ? 'The currently open patient was updated from the restored backup and has been reloaded.'
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
      console.error('Restore failed:', error);
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
    if (!ensureClinicalMutationAllowed('Restore')) return;
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const raw = JSON.parse(e.target.result);
        if (raw.__ancBackup && raw.encrypted) {
          if (raw.encryptionScheme === 'phase2-shared-key') {
            if (!phase2Enabled() || !clinicEncryptionUnlocked()) {
              UI.toast('Unlock shared clinic encryption before restoring this backup', 'error', 5000);
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
              successMessage:'Backup restored successfully',
            });
          } else if (!CRYPTO.isUnlocked()) {
            UI.toast('Unlock the app first to restore an encrypted backup', 'error', 5000);
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
              successMessage:'Backup restored successfully',
            });
          }
        } else {
          UI.modal('Restore Unencrypted Backup',
            'This backup is unencrypted. Restore anyway? Existing data will be merged.',
            () => applyImportPayload(e.target.result, {
              summary:'Imported unencrypted backup',
              successMessage:'Backup restored',
              auditStatus:'warning',
            }));
        }
      } catch(err) {
        if (err?.name === 'StorageWriteError') {
          console.error('Restore storage write failed:', err);
          bestEffortAuditFailure('import', '', err);
          showStorageFailure(
            err,
            'Restore failed',
            'Restore failed. Data was not fully stored on this device.'
          );
          return;
        }
        UI.toast('Restore failed: ' + err.message, 'error', 5000);
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
