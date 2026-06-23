/*
 * PHASE 2 CLOUD ADAPTER - DISABLED UNTIL EXPLICIT ACTIVATION
 *
 * Structured Supabase operations only. No raw SQL or dynamic identifiers.
 */

import {
  decryptDraftPayload,
  encryptDraftPayload,
} from './phase2_crypto_draft.mjs';
import { hashDraftValue } from './phase2_migration_draft.mjs';
export { PHASE2_RUNTIME } from './phase2_runtime_config.mjs';
import { PHASE2_RUNTIME } from './phase2_runtime_config.mjs';

const RELATED_TYPES = new Set(['visits', 'scans', 'procedures', 'labs']);

function requireRelatedType(recordType) {
  if (!RELATED_TYPES.has(recordType)) {
    throw new Error('Unsupported Phase 2 related-data type');
  }
  return recordType;
}

function requireActiveBatch(batch, ownerId) {
  if (
    !batch
    || batch.status !== 'activated'
    || batch.owner_id !== ownerId
    || batch.key_version !== PHASE2_RUNTIME.keyVersion
  ) {
    throw new Error('An activated Phase 2 migration batch is required');
  }
}

function patientContext(ownerId, patientCode, keyVersion) {
  return {
    ownerId,
    table: 'phase2_patient_records',
    recordId: patientCode,
    keyVersion,
  };
}

function relatedContext(ownerId, patientCode, recordType, keyVersion) {
  return {
    ownerId,
    table: 'phase2_related_records',
    recordId: patientCode,
    recordType,
    keyVersion,
  };
}

export async function buildPhase2PatientRow({
  patient,
  clinicKey,
  ownerId,
  batch,
}) {
  requireActiveBatch(batch, ownerId);
  const patientCode = patient?.patientID;
  if (!patientCode || typeof patientCode !== 'string') {
    throw new Error('Patient ID is required');
  }
  return {
    owner_id: ownerId,
    patient_code: patientCode,
    key_version: batch.key_version,
    encrypted_data: await encryptDraftPayload(
      clinicKey,
      patient,
      patientContext(ownerId, patientCode, batch.key_version),
    ),
    source_updated_at: patient.updatedAt || null,
    plaintext_sha256: await hashDraftValue(patient),
    migration_batch_id: batch.id,
  };
}

export async function buildPhase2RelatedRow({
  recordType,
  patientCode,
  value,
  clinicKey,
  ownerId,
  batch,
}) {
  requireRelatedType(recordType);
  requireActiveBatch(batch, ownerId);
  if (!patientCode || typeof patientCode !== 'string') {
    throw new Error('Patient ID is required');
  }
  return {
    owner_id: ownerId,
    patient_code: patientCode,
    record_type: recordType,
    key_version: batch.key_version,
    encrypted_data: await encryptDraftPayload(
      clinicKey,
      value,
      relatedContext(ownerId, patientCode, recordType, batch.key_version),
    ),
    plaintext_sha256: await hashDraftValue(value),
    migration_batch_id: batch.id,
  };
}

export async function decryptPhase2PatientRow({
  row,
  clinicKey,
  ownerId,
  batch,
}) {
  requireActiveBatch(batch, ownerId);
  if (
    row.owner_id !== ownerId
    || row.key_version !== batch.key_version
    || row.migration_batch_id !== batch.id
  ) {
    throw new Error('Patient row is not bound to the active batch');
  }
  const patient = await decryptDraftPayload(
    clinicKey,
    row.encrypted_data,
    patientContext(ownerId, row.patient_code, batch.key_version),
  );
  if (await hashDraftValue(patient) !== row.plaintext_sha256) {
    throw new Error(`Patient integrity check failed for ${row.patient_code}`);
  }
  return patient;
}

export async function decryptPhase2RelatedRow({
  row,
  clinicKey,
  ownerId,
  batch,
}) {
  requireRelatedType(row.record_type);
  requireActiveBatch(batch, ownerId);
  if (
    row.owner_id !== ownerId
    || row.key_version !== batch.key_version
    || row.migration_batch_id !== batch.id
  ) {
    throw new Error('Related row is not bound to the active batch');
  }
  const value = await decryptDraftPayload(
    clinicKey,
    row.encrypted_data,
    relatedContext(
      ownerId,
      row.patient_code,
      row.record_type,
      batch.key_version,
    ),
  );
  if (await hashDraftValue(value) !== row.plaintext_sha256) {
    throw new Error(
      `${row.record_type} integrity check failed for ${row.patient_code}`,
    );
  }
  return value;
}

export function createPhase2CloudAdapter({
  supabaseClient,
  clinicKey,
  ownerId=PHASE2_RUNTIME.ownerId,
  batch,
  runtimeEnabled=PHASE2_RUNTIME.enabled,
}) {
  if (!runtimeEnabled) {
    throw new Error('Phase 2 runtime is disabled');
  }
  if (!supabaseClient || !clinicKey) {
    throw new Error('Supabase client and Clinic Data Key are required');
  }
  requireActiveBatch(batch, ownerId);

  async function savePatient(patient) {
    const row = await buildPhase2PatientRow({
      patient,
      clinicKey,
      ownerId,
      batch,
    });
    const result = await supabaseClient
      .from('phase2_patient_records')
      .upsert(row, {
        onConflict: 'owner_id,patient_code,key_version',
      });
    if (result.error) throw result.error;
  }

  async function saveRelated(recordType, patientCode, value) {
    requireRelatedType(recordType);
    if (value == null) {
      const deletion = await supabaseClient
        .from('phase2_related_records')
        .delete()
        .eq('owner_id', ownerId)
        .eq('patient_code', patientCode)
        .eq('record_type', recordType)
        .eq('key_version', batch.key_version);
      if (deletion.error) throw deletion.error;
      return;
    }
    const row = await buildPhase2RelatedRow({
      recordType,
      patientCode,
      value,
      clinicKey,
      ownerId,
      batch,
    });
    const result = await supabaseClient
      .from('phase2_related_records')
      .upsert(row, {
        onConflict: 'owner_id,patient_code,record_type,key_version',
      });
    if (result.error) throw result.error;
  }

  async function getAllPatients() {
    const result = await supabaseClient
      .from('phase2_patient_records')
      .select(
        'owner_id,patient_code,key_version,encrypted_data,'
        + 'source_updated_at,plaintext_sha256,migration_batch_id',
      )
      .eq('migration_batch_id', batch.id);
    if (result.error) throw result.error;
    const patients = {};
    for (const row of result.data) {
      const patient = await decryptPhase2PatientRow({
        row,
        clinicKey,
        ownerId,
        batch,
      });
      patients[patient.patientID] = patient;
    }
    return patients;
  }

  async function getPatient(patientCode) {
    const result = await supabaseClient
      .from('phase2_patient_records')
      .select(
        'owner_id,patient_code,key_version,encrypted_data,'
        + 'source_updated_at,plaintext_sha256,migration_batch_id',
      )
      .eq('migration_batch_id', batch.id)
      .eq('patient_code', patientCode)
      .maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) return null;
    return decryptPhase2PatientRow({
      row: result.data,
      clinicKey,
      ownerId,
      batch,
    });
  }

  async function getRelated(recordType, patientCode) {
    requireRelatedType(recordType);
    const result = await supabaseClient
      .from('phase2_related_records')
      .select(
        'owner_id,patient_code,record_type,key_version,encrypted_data,'
        + 'plaintext_sha256,migration_batch_id',
      )
      .eq('migration_batch_id', batch.id)
      .eq('patient_code', patientCode)
      .eq('record_type', recordType)
      .maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) return null;
    return decryptPhase2RelatedRow({
      row: result.data,
      clinicKey,
      ownerId,
      batch,
    });
  }

  async function deletePatient(patientCode) {
    for (const recordType of RELATED_TYPES) {
      await saveRelated(recordType, patientCode, null);
    }
    const deletion = await supabaseClient
      .from('phase2_patient_records')
      .delete()
      .eq('owner_id', ownerId)
      .eq('patient_code', patientCode)
      .eq('key_version', batch.key_version);
    if (deletion.error) throw deletion.error;
  }

  return {
    savePatient,
    saveRelated,
    getPatient,
    getAllPatients,
    getRelated,
    deletePatient,
  };
}
