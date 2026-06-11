/*
 * PHASE 2A MIGRATION REVIEW DRAFT - NOT LOADED BY THE APP
 *
 * Builds and verifies an in-memory migration package. It does not access
 * Supabase, localStorage, files, or the live application database.
 */

import {
  decryptDraftPayload,
  encryptDraftPayload,
} from './phase2_crypto_draft.mjs';

const encoder = new TextEncoder();
const RELATED_TYPES = ['visits', 'scans', 'procedures', 'labs'];

function stableJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Legacy data contains a non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => {
      if (item === undefined) throw new Error('Legacy arrays cannot contain undefined');
      return stableJson(item);
    }).join(',')}]`;
  }
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(key => {
      if (value[key] === undefined) {
        throw new Error('Legacy objects cannot contain undefined');
      }
      return `${JSON.stringify(key)}:${stableJson(value[key])}`;
    }).join(',')}}`;
  }
  throw new Error('Legacy data must contain only plain JSON values');
}

async function sha256(value) {
  const bytes = encoder.encode(stableJson(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

function validateLegacyExport(legacy) {
  if (!legacy || typeof legacy !== 'object') throw new Error('Legacy export is required');
  if (!legacy.patients || typeof legacy.patients !== 'object') {
    throw new Error('Legacy export has no patient collection');
  }
  for (const type of RELATED_TYPES) {
    if (legacy[type] != null && typeof legacy[type] !== 'object') {
      throw new Error(`Legacy ${type} collection is invalid`);
    }
  }
  stableJson(legacy);
}

function countLegacyRecords(legacy) {
  const counts = {
    patients: Object.keys(legacy.patients || {}).length,
    visits: 0,
    scans: 0,
    procedures: 0,
    labs: 0,
  };
  for (const patientCode of Object.keys(legacy.patients || {})) {
    counts.visits += Array.isArray(legacy.visits?.[patientCode])
      ? legacy.visits[patientCode].length : 0;
    counts.scans += Array.isArray(legacy.scans?.[patientCode])
      ? legacy.scans[patientCode].length : 0;
    counts.procedures += Array.isArray(legacy.procedures?.[patientCode])
      ? legacy.procedures[patientCode].length : 0;
    counts.labs += legacy.labs?.[patientCode] ? 1 : 0;
  }
  return counts;
}

export async function buildMigrationDraft({
  legacy,
  clinicKey,
  ownerId,
  keyVersion=1,
  batchId=crypto.randomUUID(),
}) {
  validateLegacyExport(legacy);
  if (!clinicKey) throw new Error('Clinic Data Key is required');
  if (!ownerId) throw new Error('Owner UID is required');

  const patients = [];
  const related = [];
  const failures = [];

  for (const [patientCode, patient] of Object.entries(legacy.patients)) {
    try {
      if (!patientCode || !patient || typeof patient !== 'object') {
        throw new Error('Patient record is malformed');
      }
      const context = {
        ownerId,
        table: 'phase2_patient_records',
        recordId: patientCode,
        keyVersion,
      };
      patients.push({
        owner_id: ownerId,
        patient_code: patientCode,
        key_version: keyVersion,
        encrypted_data: await encryptDraftPayload(clinicKey, patient, context),
        source_updated_at: patient.updatedAt || null,
        plaintext_sha256: await sha256(patient),
        migration_batch_id: batchId,
      });

      for (const recordType of RELATED_TYPES) {
        const value = legacy[recordType]?.[patientCode];
        if (value == null) continue;
        const relatedContext = {
          ownerId,
          table: 'phase2_related_records',
          recordId: patientCode,
          recordType,
          keyVersion,
        };
        related.push({
          owner_id: ownerId,
          patient_code: patientCode,
          record_type: recordType,
          key_version: keyVersion,
          encrypted_data: await encryptDraftPayload(clinicKey, value, relatedContext),
          plaintext_sha256: await sha256(value),
          migration_batch_id: batchId,
        });
      }
    } catch (error) {
      failures.push({
        patientCode,
        message: error.message || 'Unknown migration error',
      });
    }
  }

  const expectedCounts = countLegacyRecords(legacy);
  const packageCounts = {
    patients: patients.length,
    relatedRows: related.length,
  };

  return {
    batch: {
      id: batchId,
      owner_id: ownerId,
      key_version: keyVersion,
      status: failures.length ? 'failed' : 'staged',
      expected_counts: expectedCounts,
      package_counts: packageCounts,
    },
    patients,
    related,
    failures,
  };
}

export function verifyMigrationDraft({ legacy, migrationPackage }) {
  validateLegacyExport(legacy);
  if (!migrationPackage?.batch) throw new Error('Migration package is missing');
  if (migrationPackage.failures?.length) {
    throw new Error(`Migration package has ${migrationPackage.failures.length} failure(s)`);
  }

  const expected = countLegacyRecords(legacy);
  const patientRows = migrationPackage.patients || [];
  const relatedRows = migrationPackage.related || [];

  if (patientRows.length !== expected.patients) {
    throw new Error('Patient row count mismatch');
  }

  const expectedRelatedRows = Object.keys(legacy.patients).reduce((total, patientCode) =>
    total + RELATED_TYPES.filter(type => legacy[type]?.[patientCode] != null).length
  , 0);
  if (relatedRows.length !== expectedRelatedRows) {
    throw new Error('Related row count mismatch');
  }

  const uniquePatients = new Set(patientRows.map(row => row.patient_code));
  if (uniquePatients.size !== expected.patients) {
    throw new Error('Duplicate or missing patient codes');
  }

  for (const row of [...patientRows, ...relatedRows]) {
    if (!/^[a-f0-9]{64}$/.test(row.plaintext_sha256 || '')) {
      throw new Error('A plaintext integrity hash is missing or malformed');
    }
    if (row.migration_batch_id !== migrationPackage.batch.id) {
      throw new Error('Migration batch binding mismatch');
    }
  }

  return {
    verified: true,
    expectedCounts: expected,
    patientRows: patientRows.length,
    relatedRows: relatedRows.length,
  };
}

export async function verifyMigrationDraftDeep({
  legacy,
  migrationPackage,
  clinicKey,
}) {
  const structural = verifyMigrationDraft({ legacy, migrationPackage });
  if (!clinicKey) throw new Error('Clinic Data Key is required for deep verification');

  const ownerId = migrationPackage.batch.owner_id;
  const keyVersion = migrationPackage.batch.key_version;

  for (const row of migrationPackage.patients) {
    const source = legacy.patients[row.patient_code];
    if (!source) throw new Error(`Missing source patient ${row.patient_code}`);
    const context = {
      ownerId,
      table: 'phase2_patient_records',
      recordId: row.patient_code,
      keyVersion,
    };
    const decrypted = await decryptDraftPayload(
      clinicKey,
      row.encrypted_data,
      context,
    );
    if (stableJson(decrypted) !== stableJson(source)) {
      throw new Error(`Decrypted patient mismatch for ${row.patient_code}`);
    }
    if (await sha256(decrypted) !== row.plaintext_sha256) {
      throw new Error(`Patient hash mismatch for ${row.patient_code}`);
    }
  }

  for (const row of migrationPackage.related) {
    const source = legacy[row.record_type]?.[row.patient_code];
    if (source == null) {
      throw new Error(`Missing source ${row.record_type} for ${row.patient_code}`);
    }
    const context = {
      ownerId,
      table: 'phase2_related_records',
      recordId: row.patient_code,
      recordType: row.record_type,
      keyVersion,
    };
    const decrypted = await decryptDraftPayload(
      clinicKey,
      row.encrypted_data,
      context,
    );
    if (stableJson(decrypted) !== stableJson(source)) {
      throw new Error(`Decrypted ${row.record_type} mismatch for ${row.patient_code}`);
    }
    if (await sha256(decrypted) !== row.plaintext_sha256) {
      throw new Error(`${row.record_type} hash mismatch for ${row.patient_code}`);
    }
  }

  return {
    ...structural,
    deepVerified: true,
    decryptedRows: migrationPackage.patients.length + migrationPackage.related.length,
  };
}

export async function verifyEncryptedMigrationPackageDraft({
  migrationPackage,
  clinicKey,
}) {
  if (!migrationPackage?.batch) throw new Error('Migration package is missing');
  if (!clinicKey) throw new Error('Clinic Data Key is required');
  if (migrationPackage.failures?.length) {
    throw new Error('Migration package contains failures');
  }

  const { batch } = migrationPackage;
  const patients = migrationPackage.patients || [];
  const related = migrationPackage.related || [];
  const expected = batch.expected_counts || {};
  if (patients.length !== expected.patients) {
    throw new Error('Encrypted patient row count mismatch');
  }

  const patientCodes = new Set();
  const relatedKeys = new Set();
  const decryptedCounts = {
    patients: 0,
    visits: 0,
    scans: 0,
    procedures: 0,
    labs: 0,
  };

  for (const row of patients) {
    if (
      row.owner_id !== batch.owner_id
      || row.key_version !== batch.key_version
      || row.migration_batch_id !== batch.id
      || patientCodes.has(row.patient_code)
      || !/^[a-f0-9]{64}$/.test(row.plaintext_sha256 || '')
    ) {
      throw new Error('Encrypted patient row metadata is invalid');
    }
    patientCodes.add(row.patient_code);
    const decrypted = await decryptDraftPayload(
      clinicKey,
      row.encrypted_data,
      {
        ownerId: batch.owner_id,
        table: 'phase2_patient_records',
        recordId: row.patient_code,
        keyVersion: batch.key_version,
      },
    );
    if (await sha256(decrypted) !== row.plaintext_sha256) {
      throw new Error(`Patient hash mismatch for ${row.patient_code}`);
    }
    decryptedCounts.patients++;
  }

  for (const row of related) {
    const uniqueKey = `${row.patient_code}:${row.record_type}`;
    if (
      row.owner_id !== batch.owner_id
      || row.key_version !== batch.key_version
      || row.migration_batch_id !== batch.id
      || !patientCodes.has(row.patient_code)
      || !RELATED_TYPES.includes(row.record_type)
      || relatedKeys.has(uniqueKey)
      || !/^[a-f0-9]{64}$/.test(row.plaintext_sha256 || '')
    ) {
      throw new Error('Encrypted related row metadata is invalid');
    }
    relatedKeys.add(uniqueKey);
    const decrypted = await decryptDraftPayload(
      clinicKey,
      row.encrypted_data,
      {
        ownerId: batch.owner_id,
        table: 'phase2_related_records',
        recordId: row.patient_code,
        recordType: row.record_type,
        keyVersion: batch.key_version,
      },
    );
    if (await sha256(decrypted) !== row.plaintext_sha256) {
      throw new Error(`${row.record_type} hash mismatch for ${row.patient_code}`);
    }
    if (row.record_type === 'labs') {
      decryptedCounts.labs++;
    } else {
      if (!Array.isArray(decrypted)) {
        throw new Error(`${row.record_type} must decrypt to an array`);
      }
      decryptedCounts[row.record_type] += decrypted.length;
    }
  }

  for (const type of Object.keys(decryptedCounts)) {
    if (decryptedCounts[type] !== expected[type]) {
      throw new Error(`Encrypted ${type} count mismatch`);
    }
  }

  return {
    verified: true,
    decryptedRows: patients.length + related.length,
    expectedCounts: expected,
    patientRows: patients.length,
    relatedRows: related.length,
  };
}
