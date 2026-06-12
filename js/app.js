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
    _inactivityTimer = setTimeout(() => {
      performAutoSave().then(() => {
        lockClinicEncryption();
        UI.toast('🔒 Auto-locked after inactivity', 'warning', 3000);
        setTimeout(() => location.reload(), 2000);
      });
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

    // Wire all UI handlers before the lock overlay is dismissed
    try {
      bootApp();
    } catch (e) {
      console.error('ANC boot failed:', e);
      UI.toast('App failed to start — see browser console (F12)', 'error', 8000);
    }

    if (phase2Enabled()) {
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
    renderNavActive('patient');
    updateStorageMeter();
    startAutoSave();
    import('./phase3_access_control_ui.mjs?v=19')
      .then(module => {
        _phase3AccessUI = module;
        return module.initializeAccessControlPanel();
      })
      .catch(error => console.error('Phase 3 preview failed to initialize:', error));

    // Start inactivity tracking
    ['click','keydown','touchstart','scroll'].forEach(evt =>
      document.addEventListener(evt, resetInactivityTimer, {passive:true}));
    resetInactivityTimer();

    // Restore last patient
    const lastID = DB.getCurrentPatient();
    if (lastID) {
      const p = DB.getPatient(lastID);
      if (p) { loadPatientIntoForm(p); currentPatientID = lastID; }
    }

    // Sidebar patient search
    document.getElementById('patientSearch').addEventListener('input', CALC.debounce(e => {
      const q = e.target.value.toLowerCase().trim();
      if (!q) return;
      const found = Object.values(DB.getAllPatients()).filter(p => (p.fullName||'').toLowerCase().includes(q));
      if (found.length === 1) openPatient(found[0].patientID);
    }, 350));
    setTimeout(updateSyncStatus, 2000);
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
        _phase2Runtime ||= await import('./phase2_runtime.mjs?v=16');
        const adapter = await _phase2Runtime.unlockPhase2Runtime({
          supabaseClient: AUTH.getClient(),
          passphrase: pw,
        });
        SUPA.configurePhase2Adapter(adapter);
        const batchId = _phase2Runtime.getActiveBatchId();
        const reconciliationKey = 'anc_phase2_reconciled_batch';
        if (localStorage.getItem(reconciliationKey) !== batchId) {
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
      const phrase = await CRYPTO.setupEncryption(pw);
      document.getElementById('recoveryPhrase').textContent = phrase;
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
    UI.toast('🔒 Encryption enabled. Keep your recovery phrase safe!', 'success', 5000);
  }

  /* ════════════════════════════════════
     AUTOSAVE ENGINE
  ════════════════════════════════════ */
  function startAutoSave() {
    setInterval(() => {
      if (!currentPatientID && !_hasMinimumData()) return;
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

  async function performAutoSave() {
    if (!_hasMinimumData()) return;
    setAutoSaveStatus('saving');
    try {
      const data = collectFormData();
      if (!data.fullName || data.fullName.split(/\s+/).filter(Boolean).length < 3) return;
      const id = DB.savePatient(data);
      currentPatientID = id;
      document.getElementById('patientID').value = id;
      DB.setCurrentPatient(id);
      DB.saveVisits(id,     UI.collectVisits());
      DB.saveScans(id,      UI.collectScans());
      DB.saveProcedures(id, UI.collectProcs());
      DB.saveLabs(id,       UI.collectLabs());
      DB.clearChanged();
      setAutoSaveStatus('saved');
      updateStorageMeter();
    } catch(e) {
      console.error('Autosave error:', e);
      setAutoSaveStatus('changed');
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
    if (viewKey === 'database') refreshDBTable();
    if (viewKey === 'dashboard') refreshDashboard();
    if (viewKey === 'access') {
      const openPanel = _phase3AccessUI
        ? Promise.resolve(_phase3AccessUI)
        : import('./phase3_access_control_ui.mjs?v=19');
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
  }
  /* ════════════════════════════════════
     EVENT BINDING
  ════════════════════════════════════ */
  function bindEvents() {
    // Nav
    document.querySelectorAll('[data-view]').forEach(a => a.addEventListener('click', e => {
      e.preventDefault(); renderNavActive(a.dataset.view);
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
      try {
        if (!await SUPA.isOnline()) { UI.toast('No cloud connection', 'error'); return; }
        UI.modal('Pull from Cloud',
          'Download all cloud data and merge with local? Cloud wins if newer.',
          async () => {
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
      document.getElementById('importFileInput').click());
    document.getElementById('navImport')?.addEventListener('click', e => {
      e.preventDefault();
      document.getElementById('importFileInput').click();
    });
    document.getElementById('importFileInput')?.addEventListener('change', function() {
      if (this.files[0]) { importBackup(this.files[0]); this.value=''; }
    });

    // Add rows
    document.getElementById('btnAddScan').addEventListener('click',  addScanRow);
    document.getElementById('btnAddProc').addEventListener('click',  addProcRow);
    document.getElementById('btnAddVisit').addEventListener('click', addVisitRow);

    // Delete rows (event delegation)
    document.getElementById('ultraBody').addEventListener('click',  handleTableClick);
    document.getElementById('procBody').addEventListener('click',   handleTableClick);
    document.getElementById('visitBody').addEventListener('click',  handleTableClick);

    // LMP / calc date
    document.getElementById('lmpDate').addEventListener('change',  updateCalculations);
    document.getElementById('calcDate').addEventListener('change', updateCalculations);

    // Visit date → GA
    document.getElementById('visitBody').addEventListener('change', e => {
      if (e.target.classList.contains('visit-date')) updateVisitGAs();
      DB.markChanged();
    });

    // Scan date → GA + placenta logic
    document.getElementById('ultraBody').addEventListener('change', e => {
      if (e.target.classList.contains('scan-date'))    updateScanGAs();
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
    document.getElementById('btnLock')?.addEventListener('click', () => {
      if (!clinicEncryptionEnabled()) { UI.toast('Encryption not enabled', 'info'); return; }
      performAutoSave().then(() => {
        lockClinicEncryption();
        location.reload();
      });
    });

    document.getElementById('btnSignOut')?.addEventListener('click', async () => {
      try {
        await performAutoSave();
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
    document.getElementById('ultraBody').innerHTML  = [0,1,2].map(i => UI.scanRowHTML({},i,lmp)).join('');
    document.getElementById('procBody').innerHTML   = [0,1,2].map(i => UI.procRowHTML({},i,lmp)).join('');
    document.getElementById('visitBody').innerHTML  = [0,1,2].map(i => UI.visitRowHTML({},i,lmp)).join('');
  }

  function addScanRow() {
    const body = document.getElementById('ultraBody');
    const idx  = body.querySelectorAll('.scan-row').length;
    const lmp  = document.getElementById('lmpDate').value;
    body.insertAdjacentHTML('beforeend', UI.scanRowHTML({}, idx, lmp));
    body.lastElementChild.querySelector('input,select')?.focus();
    DB.markChanged();
  }

  function addProcRow() {
    const body = document.getElementById('procBody');
    const idx  = body.querySelectorAll('tr[data-idx]').length;
    const lmp  = document.getElementById('lmpDate').value;
    body.insertAdjacentHTML('beforeend', UI.procRowHTML({}, idx, lmp));
    body.lastElementChild.querySelector('select')?.focus();
    DB.markChanged();
  }

  function addVisitRow() {
    const body = document.getElementById('visitBody');
    const idx  = body.querySelectorAll('tr[data-idx]').length;
    const lmp  = document.getElementById('lmpDate').value;
    body.insertAdjacentHTML('beforeend', UI.visitRowHTML({}, idx, lmp));
    const newRow    = body.lastElementChild;
    const dateInput = newRow.querySelector('.visit-date');
    if (dateInput && !dateInput.value) { dateInput.value = CALC.todayISO(); updateVisitGAs(); }
    dateInput?.focus();
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
  function fullSave() {
    const data   = collectFormData();
    const errors = validate(data);
    if (errors.length) { UI.toast('⚠ ' + errors[0], 'error', 4000); return; }
    const id = DB.savePatient(data);
    currentPatientID = id;
    document.getElementById('patientID').value = id;
    DB.setCurrentPatient(id);
    DB.saveVisits(id,     UI.collectVisits());
    DB.saveScans(id,      UI.collectScans());
    DB.saveProcedures(id, UI.collectProcs());
    DB.saveLabs(id,       UI.collectLabs());
    DB.clearChanged();
    document.getElementById('breadcrumbText').textContent = data.fullName;
    setAutoSaveStatus('saved');
    updateStorageMeter();
    runRiskEngine();
    UI.toast(`✅ Saved: ${data.fullName} (${id})`, 'success');
  }

  function quickSave() {
    if (!_hasMinimumData()) { UI.toast('Enter at least 3-word name to save', 'error'); return; }
    performAutoSave().then(() => UI.toast('⚡ Saved', 'success', 1800));
  }

  /* ════════════════════════════════════
     LOAD PATIENT
  ════════════════════════════════════ */
  function loadPatientIntoForm(p) {
    const set = (id,v) => { const el=document.getElementById(id); if(el) el.value=v||''; };
    set('fullName',p.fullName); set('age',p.age); set('phone',p.phone);
    set('address',p.address);  set('patientID',p.patientID);
    set('bloodGroup',p.bloodGroup); set('basalWeight',p.basalWeight);
    set('pregnancyType',p.pregnancyType); set('chorionicity',p.chorionicity);
    set('amnionicity',p.amnionicity);
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

    document.getElementById('ultraBody').innerHTML =
      (scans.length?scans:[{},{},{}]).map((s,i)=>UI.scanRowHTML(s,i,lmp)).join('');
    document.getElementById('procBody').innerHTML  =
      (procs.length?procs:[{},{},{}]).map((s,i)=>UI.procRowHTML(s,i,lmp)).join('');
    document.getElementById('visitBody').innerHTML =
      (visits.length?visits:[{},{},{}]).map((v,i)=>UI.visitRowHTML(v,i,lmp)).join('');

    buildLabSections(labs);
    updateTPAL();
    updateCalculations();
    document.getElementById('breadcrumbText').textContent = p.fullName||'Patient Record';
  }

  function openPatient(id) {
    const p = DB.getPatient(id);
    if (!p) return;
    currentPatientID = id;
    DB.setCurrentPatient(id);
    loadPatientIntoForm(p);
    renderNavActive('patient');
    window.scrollTo(0,0);
    UI.toast(`📂 ${p.fullName}`, 'info', 2000);
  }

  /* ════════════════════════════════════
     NEW PATIENT
  ════════════════════════════════════ */
  function confirmNewPatient() {
    UI.modal('New Patient','Clear current data and start new registration? Unsaved changes will be lost.',
      clearForm, true);
  }

  function clearForm() {
    currentPatientID = null;
    DB.setCurrentPatient(null);
    ['fullName','age','phone','address','patientID','bloodGroup','basalWeight',
     'pregnancyType','chorionicity','amnionicity','tpalT','tpalP','tpalA','tpalL',
     'lmpDate','hospitalName2','hospitalCustom','riskLevelInput'].forEach(id => {
      const el = document.getElementById(id); if(el) el.value='';
    });
    const s = document.getElementById('patientStatus');
    s.value=''; UI.applyStatusColor(s);
    document.getElementById('calcDate').value = CALC.todayISO();
    document.getElementById('hospitalRow').style.display       = 'none';
    document.getElementById('multiPregFields').style.display   = 'none';
    document.getElementById('topbarRiskWrap').innerHTML        = UI.riskBadgeHTML('Low Risk');
    initTableRows();
    buildLabSections(null);
    updateTPAL(); updateCalculations();
    document.getElementById('breadcrumbText').textContent = 'New Patient';
    document.getElementById('fullName').focus();
    DB.clearChanged(); setAutoSaveStatus('saved');
    UI.toast('🆕 New patient form ready', 'info');
  }

  function confirmDeletePatient(id) {
    const p = DB.getPatient(id); if(!p) return;
    UI.modal('Delete Patient',`Permanently delete <strong>${p.fullName}</strong>? Cannot be undone.`,
      () => { DB.deletePatient(id); if(currentPatientID===id) clearForm(); refreshDBTable(); UI.toast('Deleted','info'); }, true);
  }

  /* ════════════════════════════════════
     DB + DASHBOARD
  ════════════════════════════════════ */
  function refreshDBTable() {
    UI.renderDBTable(DB.getAllPatients(),
      document.getElementById('dbSearch')?.value||'',
      document.getElementById('dbFilter')?.value||'');
  }

  function refreshDashboard() { UI.renderDashboard(DB.getStats()); }

  function updateStorageMeter() { UI.updateStorageMeter(); }

  /* ════════════════════════════════════
     PDF EXPORT
  ════════════════════════════════════ */
  function exportPDF() {
    const data = collectFormData();
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
${scans.length?`
<div class="sec">
  <div class="sec-title" style="background:#1e6091">◈ Ultrasound / Scans</div>
  <div class="sec-body">
    <table><thead><tr><th>Type</th><th>Date</th><th>GA</th><th>BPD</th><th>HC</th><th>AC</th><th>FL</th><th>AFI</th><th>Placenta</th><th>Findings</th></tr></thead>
    <tbody>${scans.map(s=>`<tr>
      <td>${s.type||'—'}</td><td>${CALC.formatDate(s.date)}</td>
      <td>${s.ga||'—'}</td>
      <td>${s.biometrics?.BPD||'—'}</td><td>${s.biometrics?.HC||'—'}</td>
      <td>${s.biometrics?.AC||'—'}</td><td>${s.biometrics?.FL||'—'}</td>
      <td>${s.biometrics?.AFI||s.biometrics?.DVP?`AFI:${s.biometrics.AFI||'—'} DVP:${s.biometrics.DVP||'—'}`:'—'}</td>
      <td>${s.biometrics?.placentaLocation||'—'}${s.biometrics?.placentaOS?` (${s.biometrics.placentaOS}mm from OS)`:''}</td>
      <td>${s.findings||'—'}</td>
    </tr>`).join('')}</tbody></table>
    ${scans.some(s=>s.doppler?.UA_PI||s.doppler?.MCA_PI)?`
    <div style="margin-top:8px;font-weight:700;font-size:9px;color:#7a8fa6;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Doppler Results</div>
    <table><thead><tr><th>Date</th><th>UA PI</th><th>MCA PI</th><th>DV PI</th><th>UtA PI</th><th>CPR</th></tr></thead>
    <tbody>${scans.filter(s=>s.doppler?.UA_PI||s.doppler?.MCA_PI).map(s=>{
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
        UI.toast('💾 Encrypted backup downloaded', 'success');
      });
    } else {
      _downloadJSON(json, 'ANC_Backup');
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
            const ok = DB.importAll(decryptedJson);
            if (ok) {
              UI.toast('Shared-key backup imported successfully', 'success');
              refreshDBTable();
            } else {
              UI.toast('Import failed - invalid backup file', 'error');
            }
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
            const ok = DB.importAll(decryptedJson);
            if (ok) { UI.toast('✅ Encrypted backup imported successfully', 'success'); refreshDBTable(); }
            else UI.toast('❌ Import failed — invalid backup file', 'error');
          }
        } else {
          UI.modal('Import Unencrypted Backup',
            '⚠️ This backup is <strong>unencrypted</strong>. Import anyway? Existing data will be merged.',
            () => {
              const ok = DB.importAll(e.target.result);
              if (ok) { UI.toast('✅ Backup imported', 'success'); refreshDBTable(); }
              else UI.toast('❌ Import failed', 'error');
            });
        }
      } catch(err) {
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
    init, openPatient, confirmDeletePatient,
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
