import {
  createVaultDraft,
  decryptDraftPayload,
  encryptDraftPayload,
  unlockVaultWithPassphrase,
  unlockVaultWithRecoveryKey,
} from './phase2_crypto_draft.mjs';
import {
  formatRecoveryCode,
  parseRecoveryCode,
} from './phase2_recovery_draft.mjs';
import {
  buildMigrationDraft,
  verifyEncryptedMigrationPackageDraft,
  verifyMigrationDraftDeep,
} from './phase2_migration_draft.mjs';

const OWNER_ID = 'bfcaa90e-c49c-4a94-8cfd-06a16a96a094';
const MIN_PASSPHRASE_LENGTH = 16;
const SUPA_URL = 'https://tfplewrzjlbugdgiuoum.supabase.co';
const SUPA_KEY = 'sb_publishable_rnm4S-EW9KwMidxD1aTxww_UVUOlhFI';

let candidateVault = null;
let candidateRecoveryKey = null;
let supabaseClient = null;
let securityReady = false;
let recoveryConfirmed = false;
let activeFactorId = null;
let existingVault = null;
let verifiedClinicKey = null;
let migrationPackage = null;
const MIGRATION_PACKAGE_FORMAT = 'anc-phase2-encrypted-migration';

function element(id) {
  return document.getElementById(id);
}

function setHidden(id, hidden) {
  element(id).classList.toggle('hidden', hidden);
}

function setBusy(button, busy, busyText) {
  if (!button.dataset.idleText) button.dataset.idleText = button.textContent;
  button.disabled = busy;
  button.textContent = busy ? busyText : button.dataset.idleText;
}

function setSecurityStatus(title, detail, passed=false) {
  const status = element('securityStatus');
  status.replaceChildren();
  const strong = document.createElement('strong');
  strong.textContent = title;
  status.append(strong, document.createTextNode(detail));
  status.classList.toggle('success', passed);
}

async function verifySecurity() {
  securityReady = false;
  setHidden('passphraseSection', true);
  setHidden('existingVaultSection', true);
  setHidden('storedVerifiedSection', true);
  setHidden('migrationPreviewSection', true);
  setHidden('migrationStagedSection', true);
  setHidden('retrySecurity', true);
  setHidden('enrollmentLogin', true);
  setHidden('enrollmentMfa', true);
  setSecurityStatus(
    'Checking secure session...',
    ' Verifying clinic owner, authenticator level, and empty vault.',
  );

  try {
    if (!window.supabase?.createClient) {
      throw new Error('The secure Supabase library could not load.');
    }
    supabaseClient ||= window.supabase.createClient(SUPA_URL, SUPA_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });

    const sessionResult = await supabaseClient.auth.getSession();
    if (sessionResult.error) throw sessionResult.error;
    const session = sessionResult.data.session;
    if (!session) {
      setSecurityStatus(
        'Sign in required',
        ' Use your private Supabase account to continue.',
      );
      setHidden('enrollmentLogin', false);
      element('enrollmentEmail').focus();
      return;
    }
    if (session.user.id !== OWNER_ID) {
      throw new Error('This Supabase account is not the configured clinic owner.');
    }

    const assurance = await supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance.error) throw assurance.error;
    if (assurance.data.currentLevel !== 'aal2') {
      const factors = await supabaseClient.auth.mfa.listFactors();
      if (factors.error) throw factors.error;
      const factor = (factors.data.totp || [])
        .find(item => item.status === 'verified');
      if (!factor) {
        throw new Error('No verified authenticator is enrolled for this account.');
      }
      activeFactorId = factor.id;
      setSecurityStatus(
        'Authenticator required',
        ' Enter the current six-digit code.',
      );
      setHidden('enrollmentMfa', false);
      element('enrollmentMfaCode').focus();
      return;
    }

    const existing = await supabaseClient
      .from('clinic_key_vault')
      .select(
        'owner_id,key_version,format_version,algorithm,kdf,'
        + 'wrapped_by_passphrase,wrapped_by_recovery,status,created_at',
      )
      .limit(2);
    if (existing.error) throw existing.error;
    if (existing.data.length > 1) {
      throw new Error('More than one vault row exists. Verification has been stopped.');
    }
    if (existing.data.length === 1) {
      const row = existing.data[0];
      if (
        row.owner_id !== OWNER_ID
        || row.key_version !== 1
        || row.format_version !== 1
        || row.algorithm !== 'AES-256-GCM'
        || row.status !== 'draft'
      ) {
        throw new Error('The stored vault metadata is not the expected version 1 draft.');
      }
      existingVault = row;
      securityReady = true;
      setSecurityStatus(
        'Stored draft found',
        ' Owner session and TOTP verification passed. Verify both recovery paths.',
        true,
      );
      setHidden('existingVaultSection', false);
      element('existingPassphrase').focus();
      return;
    }

    existingVault = null;
    securityReady = true;
    setSecurityStatus(
      'Security check passed',
      ' Owner session, TOTP verification, and empty vault confirmed.',
      true,
    );
    setHidden('passphraseSection', false);
    element('clinicPassphrase').focus();
  } catch (error) {
    setSecurityStatus(
      'Security check stopped',
      ` ${error.message || 'The secure session could not be verified.'}`,
    );
    setHidden('retrySecurity', false);
  }
}

async function handleEnrollmentLogin(event) {
  event.preventDefault();
  const button = element('enrollmentLoginButton');
  element('enrollmentLoginError').textContent = '';
  setBusy(button, true, 'Signing in...');
  try {
    const result = await supabaseClient.auth.signInWithPassword({
      email: element('enrollmentEmail').value.trim(),
      password: element('enrollmentPassword').value,
    });
    element('enrollmentPassword').value = '';
    if (result.error) throw result.error;
    if (result.data.user?.id !== OWNER_ID) {
      await supabaseClient.auth.signOut();
      throw new Error('This account is not authorized for this clinic.');
    }
    await verifySecurity();
  } catch (error) {
    element('enrollmentPassword').value = '';
    element('enrollmentLoginError').textContent =
      error.message || 'Sign-in failed.';
  } finally {
    setBusy(button, false, 'Signing in...');
  }
}

async function handleEnrollmentMfa(event) {
  event.preventDefault();
  const button = element('enrollmentMfaButton');
  const code = element('enrollmentMfaCode').value.replace(/\D/g, '').slice(0, 6);
  element('enrollmentMfaError').textContent = '';
  if (code.length !== 6 || !activeFactorId) {
    element('enrollmentMfaError').textContent =
      'Enter the complete six-digit code.';
    return;
  }

  setBusy(button, true, 'Verifying...');
  try {
    const challenge = await supabaseClient.auth.mfa.challenge({
      factorId: activeFactorId,
    });
    if (challenge.error) throw challenge.error;
    const verification = await supabaseClient.auth.mfa.verify({
      factorId: activeFactorId,
      challengeId: challenge.data.id,
      code,
    });
    if (verification.error) throw verification.error;
    element('enrollmentMfaCode').value = '';
    await verifySecurity();
  } catch (error) {
    element('enrollmentMfaCode').value = '';
    element('enrollmentMfaError').textContent =
      error.message || 'The authenticator code was not accepted.';
  } finally {
    setBusy(button, false, 'Verifying...');
  }
}

function clearCandidate() {
  candidateVault = null;
  candidateRecoveryKey = null;
  recoveryConfirmed = false;
  element('clinicPassphrase').value = '';
  element('clinicPassphraseConfirm').value = '';
  element('recoveryCode').textContent = '';
  element('recoveryConfirmation').value = '';
  element('passphraseError').textContent = '';
  element('recoveryError').textContent = '';
  setHidden('recoverySection', true);
  setHidden('confirmationSection', true);
  setHidden('readySection', true);
  setHidden('savedSection', true);
  element('saveError').textContent = '';
  element('clinicPassphrase').focus();
}

function getLegacySnapshot() {
  if (typeof DB === 'undefined') {
    throw new Error('The local EMR database could not be loaded.');
  }
  return {
    patients: DB.getAllPatients(),
    visits: Object.fromEntries(
      Object.keys(DB.getAllPatients()).map(code => [code, DB.getVisits(code)]),
    ),
    scans: Object.fromEntries(
      Object.keys(DB.getAllPatients()).map(code => [code, DB.getScans(code)]),
    ),
    procedures: Object.fromEntries(
      Object.keys(DB.getAllPatients()).map(code => [code, DB.getProcedures(code)]),
    ),
    labs: Object.fromEntries(
      Object.keys(DB.getAllPatients())
        .map(code => [code, DB.getLabs(code)])
        .filter(([, value]) => value != null),
    ),
  };
}

function countSnapshot(legacy) {
  const patientCodes = Object.keys(legacy.patients);
  return {
    patients: patientCodes.length,
    visits: patientCodes.reduce(
      (total, code) => total + (legacy.visits[code]?.length || 0),
      0,
    ),
    scans: patientCodes.reduce(
      (total, code) => total + (legacy.scans[code]?.length || 0),
      0,
    ),
    procedures: patientCodes.reduce(
      (total, code) => total + (legacy.procedures[code]?.length || 0),
      0,
    ),
    labs: patientCodes.reduce(
      (total, code) => total + (legacy.labs[code] != null ? 1 : 0),
      0,
    ),
  };
}

function showMigrationPreview() {
  const legacy = getLegacySnapshot();
  const counts = countSnapshot(legacy);
  const preview = element('migrationPreview');
  preview.replaceChildren();
  const strong = document.createElement('strong');
  const hasLocalRecords = counts.patients > 0;
  strong.textContent = hasLocalRecords
    ? `${counts.patients} patient records ready`
    : 'No patient records in this browser storage';
  const detail = document.createTextNode(hasLocalRecords
    ? ` Visits: ${counts.visits}; scans: ${counts.scans}; `
      + `procedures: ${counts.procedures}; labs: ${counts.labs}.`
    : ' Choose the encrypted package created from the original app storage.');
  preview.append(strong, detail);
  setHidden('downloadMigrationPackage', !hasLocalRecords);
  setHidden('chooseMigrationPackage', hasLocalRecords);
  setHidden('stageMigration', true);
  setHidden('migrationPreviewSection', false);
}

function downloadJson(value, filename) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function createEncryptedMigrationPackage() {
  const button = element('downloadMigrationPackage');
  element('migrationError').textContent = '';
  if (!verifiedClinicKey || !existingVault) {
    element('migrationError').textContent =
      'Verify the stored vault before creating the package.';
    return;
  }

  setBusy(button, true, 'Encrypting and checking...');
  try {
    const legacy = getLegacySnapshot();
    if (Object.keys(legacy.patients).length === 0) {
      throw new Error('This browser storage contains no patient records.');
    }
    const packageDraft = await buildMigrationDraft({
      legacy,
      clinicKey: verifiedClinicKey,
      ownerId: OWNER_ID,
      keyVersion: existingVault.key_version,
      batchId: crypto.randomUUID(),
    });
    if (packageDraft.failures.length) {
      throw new Error('One or more local records could not be encrypted.');
    }
    await verifyMigrationDraftDeep({
      legacy,
      migrationPackage: packageDraft,
      clinicKey: verifiedClinicKey,
    });
    await verifyEncryptedMigrationPackageDraft({
      migrationPackage: packageDraft,
      clinicKey: verifiedClinicKey,
    });
    downloadJson({
      format: MIGRATION_PACKAGE_FORMAT,
      formatVersion: 1,
      createdAt: new Date().toISOString(),
      ownerId: OWNER_ID,
      keyVersion: existingVault.key_version,
      migrationPackage: packageDraft,
    }, `ANC_Phase2_Encrypted_Migration_${new Date().toISOString().slice(0, 10)}.json`);
  } catch (error) {
    element('migrationError').textContent =
      error.message || 'The encrypted package could not be created.';
  } finally {
    setBusy(button, false, 'Encrypting and checking...');
  }
}

async function importEncryptedMigrationPackage(file) {
  if (!file) return;
  element('migrationError').textContent = '';
  setHidden('stageMigration', true);
  try {
    const envelope = JSON.parse(await file.text());
    if (
      envelope.format !== MIGRATION_PACKAGE_FORMAT
      || envelope.formatVersion !== 1
      || envelope.ownerId !== OWNER_ID
      || envelope.keyVersion !== existingVault?.key_version
      || !envelope.migrationPackage
    ) {
      throw new Error('This is not the expected encrypted migration package.');
    }
    const verification = await verifyEncryptedMigrationPackageDraft({
      migrationPackage: envelope.migrationPackage,
      clinicKey: verifiedClinicKey,
    });
    migrationPackage = envelope.migrationPackage;
    const preview = element('migrationPreview');
    preview.replaceChildren();
    const strong = document.createElement('strong');
    strong.textContent = `${verification.patientRows} encrypted patient rows verified`;
    preview.append(
      strong,
      document.createTextNode(
        ` ${verification.relatedRows} related rows also decrypted and passed integrity checks.`,
      ),
    );
    setHidden('stageMigration', false);
  } catch (error) {
    migrationPackage = null;
    element('migrationError').textContent =
      error.message || 'The encrypted package could not be verified.';
  }
}

async function verifyStoredVault() {
  const button = element('verifyStoredVault');
  const passphraseInput = element('existingPassphrase');
  const recoveryInput = element('existingRecoveryCode');
  element('existingVaultError').textContent = '';
  setHidden('storedVerifiedSection', true);

  if (!securityReady || !existingVault) {
    element('existingVaultError').textContent =
      'The stored draft vault and secure session must be available.';
    return;
  }

  const passphrase = passphraseInput.value;
  const recoveryText = recoveryInput.value;
  if (!passphrase || !recoveryText) {
    element('existingVaultError').textContent =
      'Enter both the passphrase and recovery code.';
    return;
  }

  setBusy(button, true, 'Verifying...');
  try {
    const recoveryKeyText = await parseRecoveryCode(recoveryText);
    const passphraseKey = await unlockVaultWithPassphrase({
      vault: existingVault,
      passphrase,
    });
    const recoveryKey = await unlockVaultWithRecoveryKey({
      vault: existingVault,
      recoveryKey: recoveryKeyText,
    });
    const context = {
      ownerId: OWNER_ID,
      table: 'phase2_stored_vault_verification',
      recordId: crypto.randomUUID(),
      keyVersion: existingVault.key_version,
    };
    const proof = {
      verifiedAt: new Date().toISOString(),
      nonce: crypto.randomUUID(),
    };
    const encrypted = await encryptDraftPayload(passphraseKey, proof, context);
    const decrypted = await decryptDraftPayload(recoveryKey, encrypted, context);
    if (
      decrypted.verifiedAt !== proof.verifiedAt
      || decrypted.nonce !== proof.nonce
    ) {
      throw new Error('The passphrase and recovery paths did not match.');
    }

    verifiedClinicKey = passphraseKey;
    passphraseInput.value = '';
    recoveryInput.value = '';
    setHidden('existingVaultSection', true);
    setHidden('storedVerifiedSection', false);
    setSecurityStatus(
      'Stored vault verified',
      ' Both independent recovery paths unlocked the same key version 1.',
      true,
    );
    showMigrationPreview();
  } catch (error) {
    verifiedClinicKey = null;
    passphraseInput.value = '';
    recoveryInput.value = '';
    element('existingVaultError').textContent =
      'Verification failed. Check the passphrase and recovery code.';
    console.warn('Stored vault verification failed:', error.message);
  } finally {
    setBusy(button, false, 'Verifying...');
  }
}

async function removeFailedBatch(batchId) {
  if (!batchId) return;
  await supabaseClient
    .from('phase2_related_records')
    .delete()
    .eq('migration_batch_id', batchId);
  await supabaseClient
    .from('phase2_patient_records')
    .delete()
    .eq('migration_batch_id', batchId);
  await supabaseClient
    .from('phase2_migration_batches')
    .delete()
    .eq('id', batchId);
}

async function stageMigration() {
  const button = element('stageMigration');
  element('migrationError').textContent = '';
  setHidden('migrationStagedSection', true);
  if (!securityReady || !verifiedClinicKey || !existingVault || !migrationPackage) {
    element('migrationError').textContent =
      'Verify and choose the encrypted migration package before staging.';
    return;
  }

  setBusy(button, true, 'Encrypting and verifying...');
  let batchId = null;
  try {
    const existingBatches = await supabaseClient
      .from('phase2_migration_batches')
      .select('id,status')
      .limit(2);
    if (existingBatches.error) throw existingBatches.error;
    if (existingBatches.data.length !== 0) {
      throw new Error('A Phase 2 migration batch already exists.');
    }

    const packageVerification = await verifyEncryptedMigrationPackageDraft({
      migrationPackage,
      clinicKey: verifiedClinicKey,
    });
    batchId = migrationPackage.batch.id;

    const batchInsert = await supabaseClient
      .from('phase2_migration_batches')
      .insert({
        id: migrationPackage.batch.id,
        owner_id: OWNER_ID,
        key_version: existingVault.key_version,
        status: 'draft',
        expected_counts: migrationPackage.batch.expected_counts,
        uploaded_counts: null,
      });
    if (batchInsert.error) throw batchInsert.error;

    const patientInsert = await supabaseClient
      .from('phase2_patient_records')
      .insert(migrationPackage.patients);
    if (patientInsert.error) throw patientInsert.error;

    if (migrationPackage.related.length) {
      const relatedInsert = await supabaseClient
        .from('phase2_related_records')
        .insert(migrationPackage.related);
      if (relatedInsert.error) throw relatedInsert.error;
    }

    const [patientRows, relatedRows] = await Promise.all([
      supabaseClient
        .from('phase2_patient_records')
        .select(
          'owner_id,patient_code,key_version,encrypted_data,'
          + 'source_updated_at,plaintext_sha256,migration_batch_id',
        )
        .eq('migration_batch_id', batchId),
      supabaseClient
        .from('phase2_related_records')
        .select(
          'owner_id,patient_code,record_type,key_version,encrypted_data,'
          + 'plaintext_sha256,migration_batch_id',
        )
        .eq('migration_batch_id', batchId),
    ]);
    if (patientRows.error) throw patientRows.error;
    if (relatedRows.error) throw relatedRows.error;

    const uploadedPackage = {
      ...migrationPackage,
      patients: patientRows.data,
      related: relatedRows.data,
    };
    const uploadedVerification = await verifyEncryptedMigrationPackageDraft({
      migrationPackage: uploadedPackage,
      clinicKey: verifiedClinicKey,
    });
    if (!uploadedVerification.verified) {
      throw new Error('Uploaded encrypted records failed deep verification.');
    }

    const uploadedCounts = {
      patient_rows: patientRows.data.length,
      related_rows: relatedRows.data.length,
      decrypted_rows: uploadedVerification.decryptedRows,
    };
    const staged = await supabaseClient
      .from('phase2_migration_batches')
      .update({
        status: 'staged',
        uploaded_counts: uploadedCounts,
      })
      .eq('id', batchId)
      .eq('status', 'draft')
      .select('id,status')
      .single();
    if (staged.error) throw staged.error;
    if (staged.data.status !== 'staged') {
      throw new Error('The migration batch did not enter staged status.');
    }

    verifiedClinicKey = null;
    migrationPackage = null;
    setHidden('migrationPreviewSection', true);
    element('migrationStagedSummary').textContent =
      `${patientRows.data.length} patient rows and `
      + `${relatedRows.data.length} related rows were uploaded, decrypted, `
      + 'and matched to the local source. Phase 1 remains active.';
    setHidden('migrationStagedSection', false);
  } catch (error) {
    await removeFailedBatch(batchId).catch(() => {});
    migrationPackage = null;
    element('migrationError').textContent =
      error.message || 'Encrypted staging failed and was rolled back.';
  } finally {
    setBusy(button, false, 'Encrypting and verifying...');
  }
}

async function verifySameCandidateKey(passphrase) {
  const key = await unlockVaultWithPassphrase({
    vault: candidateVault,
    passphrase,
  });
  const context = {
    ownerId: OWNER_ID,
    table: 'phase2_key_enrollment_review',
    recordId: 'candidate-proof',
    keyVersion: 1,
  };
  const proof = { purpose: 'candidate-key-proof', version: 1 };
  const encrypted = await encryptDraftPayload(key, proof, context);
  const decrypted = await decryptDraftPayload(key, encrypted, context);
  if (decrypted.purpose !== proof.purpose || decrypted.version !== proof.version) {
    throw new Error('Candidate key self-check failed');
  }
}

element('generateKey').addEventListener('click', async event => {
  const button = event.currentTarget;
  const passphrase = element('clinicPassphrase').value;
  const confirmation = element('clinicPassphraseConfirm').value;
  element('passphraseError').textContent = '';

  if (!securityReady) {
    element('passphraseError').textContent =
      'The owner session and authenticator check must pass first.';
    return;
  }
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    element('passphraseError').textContent =
      `Use at least ${MIN_PASSPHRASE_LENGTH} characters.`;
    return;
  }
  if (passphrase !== confirmation) {
    element('passphraseError').textContent = 'The passphrases do not match.';
    return;
  }

  setBusy(button, true, 'Generating...');
  try {
    const generated = await createVaultDraft({
      ownerId: OWNER_ID,
      passphrase,
      keyVersion: 1,
    });
    candidateVault = generated.vault;
    candidateRecoveryKey = generated.recoveryKey;
    recoveryConfirmed = false;
    await verifySameCandidateKey(passphrase);

    const formatted = await formatRecoveryCode(candidateRecoveryKey);
    element('recoveryCode').textContent = formatted;
    element('clinicPassphrase').value = '';
    element('clinicPassphraseConfirm').value = '';
    setHidden('recoverySection', false);
    setHidden('confirmationSection', false);
    setHidden('readySection', true);
    element('recoveryConfirmation').focus();
  } catch (error) {
    clearCandidate();
    element('passphraseError').textContent =
      error.message || 'Candidate key generation failed.';
  } finally {
    setBusy(button, false, 'Generating...');
  }
});

element('copyRecovery').addEventListener('click', async event => {
  const button = event.currentTarget;
  try {
    await navigator.clipboard.writeText(element('recoveryCode').textContent);
    const idle = button.textContent;
    button.textContent = 'Copied';
    window.setTimeout(() => {
      button.textContent = idle;
    }, 1500);
  } catch {
    element('recoveryError').textContent =
      'Copy was unavailable. Record the displayed code manually.';
  }
});

element('verifyRecovery').addEventListener('click', async event => {
  const button = event.currentTarget;
  element('recoveryError').textContent = '';
  if (!candidateVault || !candidateRecoveryKey) {
    element('recoveryError').textContent = 'Generate a candidate key first.';
    return;
  }

  setBusy(button, true, 'Verifying...');
  try {
    const enteredKey = await parseRecoveryCode(
      element('recoveryConfirmation').value,
    );
    if (enteredKey !== candidateRecoveryKey) {
      throw new Error('This recovery code does not match the candidate key.');
    }

    const recoveryKey = await unlockVaultWithRecoveryKey({
      vault: candidateVault,
      recoveryKey: enteredKey,
    });
    const context = {
      ownerId: OWNER_ID,
      table: 'phase2_key_enrollment_review',
      recordId: 'recovery-proof',
      keyVersion: 1,
    };
    const encrypted = await encryptDraftPayload(
      recoveryKey,
      { confirmed: true },
      context,
    );
    const decrypted = await decryptDraftPayload(recoveryKey, encrypted, context);
    if (decrypted.confirmed !== true) throw new Error('Recovery proof failed');

    recoveryConfirmed = true;
    element('recoveryConfirmation').value = '';
    setHidden('readySection', false);
  } catch (error) {
    setHidden('readySection', true);
    element('recoveryError').textContent =
      error.message || 'Recovery verification failed.';
  } finally {
    setBusy(button, false, 'Verifying...');
  }
});

element('saveVault').addEventListener('click', async event => {
  const button = event.currentTarget;
  element('saveError').textContent = '';
  if (!securityReady || !recoveryConfirmed || !candidateVault) {
    element('saveError').textContent =
      'Security and recovery confirmation must pass before saving.';
    return;
  }

  setBusy(button, true, 'Saving...');
  try {
    const insert = await supabaseClient
      .from('clinic_key_vault')
      .insert(candidateVault)
      .select('owner_id,key_version,format_version,algorithm,status')
      .single();
    if (insert.error) throw insert.error;

    const saved = insert.data;
    if (
      saved.owner_id !== OWNER_ID
      || saved.key_version !== 1
      || saved.format_version !== 1
      || saved.algorithm !== 'AES-256-GCM'
      || saved.status !== 'draft'
    ) {
      throw new Error('The saved vault did not pass verification.');
    }

    candidateVault = null;
    candidateRecoveryKey = null;
    recoveryConfirmed = false;
    securityReady = false;
    element('recoveryCode').textContent = '';
    element('recoveryConfirmation').value = '';
    setHidden('passphraseSection', true);
    setHidden('recoverySection', true);
    setHidden('confirmationSection', true);
    setHidden('readySection', true);
    setHidden('savedSection', false);
    setSecurityStatus(
      'Enrollment complete',
      ' The encrypted vault now contains key version 1 in draft status.',
      true,
    );
  } catch (error) {
    element('saveError').textContent =
      error.message || 'The encrypted vault could not be saved.';
  } finally {
    setBusy(button, false, 'Saving...');
  }
});

element('discardCandidate').addEventListener('click', clearCandidate);
element('retrySecurity').addEventListener('click', verifySecurity);
element('verifyStoredVault').addEventListener('click', verifyStoredVault);
element('stageMigration').addEventListener('click', stageMigration);
element('downloadMigrationPackage').addEventListener(
  'click',
  createEncryptedMigrationPackage,
);
element('chooseMigrationPackage').addEventListener('click', () => {
  element('migrationPackageFile').click();
});
element('migrationPackageFile').addEventListener('change', event => {
  importEncryptedMigrationPackage(event.target.files?.[0]);
  event.target.value = '';
});
element('enrollmentLogin').addEventListener('submit', handleEnrollmentLogin);
element('enrollmentMfa').addEventListener('submit', handleEnrollmentMfa);
element('enrollmentMfaCode').addEventListener('input', event => {
  event.target.value = event.target.value.replace(/\D/g, '').slice(0, 6);
});
window.addEventListener('pagehide', () => {
  candidateVault = null;
  candidateRecoveryKey = null;
  verifiedClinicKey = null;
  migrationPackage = null;
});

verifySecurity();
