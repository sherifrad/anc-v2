import {
  buildPhase2PatientRow,
  buildPhase2RelatedRow,
  decryptPhase2PatientRow,
  decryptPhase2RelatedRow,
} from './phase2_cloud_adapter.mjs';

const RELATED_TYPES = new Set(['visits', 'scans', 'procedures', 'labs']);

async function invoke(client, body) {
  const { data, error } = await client.functions.invoke(
    'phase3-delegated-gateway',
    { body },
  );
  if (error) {
    const response = error.context;
    if (response?.clone && response?.json) {
      try {
        const payload = await response.clone().json();
        throw new Error(payload?.error || payload?.reason || error.message);
      } catch (parsedError) {
        if (parsedError instanceof Error && parsedError.message !== error.message) {
          throw parsedError;
        }
      }
    }
    throw error;
  }
  if (data?.status !== 'success') {
    throw new Error(data?.error || 'Temporary clinical operation failed');
  }
  return data.data;
}

export function createPhase3DelegatedAdapter({
  supabaseClient,
  clinicKey,
  ownerId,
  batch,
}) {
  if (!supabaseClient || !clinicKey || !batch?.id) {
    throw new Error('Temporary clinical access is incomplete');
  }

  async function savePatient(patient) {
    const row = await buildPhase2PatientRow({
      patient,
      clinicKey,
      ownerId,
      batch,
    });
    await invoke(supabaseClient, {
      operation: 'patient.upsert',
      resourceId: patient.patientID,
      row,
    });
  }

  async function saveRelated(recordType, patientCode, value) {
    if (!RELATED_TYPES.has(recordType)) {
      throw new Error('Unsupported related-data type');
    }
    if (value == null) {
      throw new Error('Temporary accounts cannot delete clinical records');
    }
    const row = await buildPhase2RelatedRow({
      recordType,
      patientCode,
      value,
      clinicKey,
      ownerId,
      batch,
    });
    await invoke(supabaseClient, {
      operation: 'related.upsert',
      resourceId: patientCode,
      row,
    });
  }

  async function getAllPatients() {
    const rows = await invoke(supabaseClient, {
      operation: 'patient.list',
      resourceId: 'patient-list',
    });
    const patients = {};
    for (const row of rows || []) {
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

  async function getRelated(recordType, patientCode) {
    if (!RELATED_TYPES.has(recordType)) {
      throw new Error('Unsupported related-data type');
    }
    const row = await invoke(supabaseClient, {
      operation: 'related.get',
      resourceId: patientCode,
      recordType,
      row: { patient_code: patientCode },
    });
    if (!row) return null;
    return decryptPhase2RelatedRow({
      row,
      clinicKey,
      ownerId,
      batch,
    });
  }

  async function deletePatient() {
    throw new Error('Temporary accounts cannot delete patients');
  }

  return {
    savePatient,
    saveRelated,
    getAllPatients,
    getRelated,
    deletePatient,
  };
}
