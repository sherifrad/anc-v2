# Release 1 Stored-State Contract

State shape impact: Unchanged - documentation of existing behavior only.

## 1. Purpose and Authority

`STATE_SCHEMA.md` is the authoritative Release 1 stored-state contract. It documents the current implementation in `js/db.js`, `js/app.js`, and `js/ui.js`; it does not authorize schema redesign, normalization, migration, or field renaming.

No task may add, rename, remove, reinterpret, relocate, or change the type of a stored field without updating this file or explicitly declaring that state shape is unchanged.

## 2. Storage Topology

Release 1 stores JSON in browser `localStorage` through `js/db.js`.

| Key | Shape | Owner / notes |
| --- | --- | --- |
| `anc_patients` | object map: `{ [patientID]: patient }` | root patient records |
| `anc_visits` | object map: `{ [patientID]: visit[] }` | separate visit collection |
| `anc_scans` | object map: `{ [patientID]: scan[] }` | separate ultrasound/scan collection |
| `anc_procedures` | object map: `{ [patientID]: procedure[] }` | separate procedure collection |
| `anc_labs` | object map: `{ [patientID]: labsObject }` | separate trimester lab collection |
| `anc_problems` | object map: `{ [patientID]: problem[] }` | normalized on read/write |
| `anc_medications` | object map: `{ [patientID]: medication[] }` | normalized on read/write |
| `anc_attachments` | object map: `{ [patientID]: attachment[] }` | persisted/exported but deferred for Release 1 UI scope |
| `anc_current_id` | scalar JSON value | current patient ID or `null` |
| `anc_id_counter` | number | visible `ANC-0001` counter |
| `anc_settings` | object | settings map; includes `labsV21Template` when saved |
| `anc_last_change` | number timestamp | local dirty marker timestamp |
| `anc_last_save` | number timestamp | last local save timestamp |
| `anc_audit_events_v1` | audit event array | normalized audit entries |
| `anc_medication_memory_v1` | medication pattern array | saved reusable medication patterns |
| `anc_incremental_sync_v1` | object map: `{ [patientID]: syncEntry }` | pending sync metadata; retained though cloud is deferred |

Patients and clinical collections are stored separately. The canonical ownership key for patient-owned collections is the map key `patientID`; normalized problem and medication rows also contain `patientID` and `patientUuid`.

Clinical shape guards in `js/db.js` validate object-map/array/object shapes for the clinical keys, but most row fields remain stringly typed and are not deeply schema-validated.

## 3. Patient Root Record

Source: `collectFormData()` in `js/app.js`, `DB.savePatient()` in `js/db.js`, archive helpers in `js/db.js`, and `loadPatientIntoForm()` in `js/app.js`.

| Field | Type | Required/Optional | Default | Source | Notes |
| --- | --- | --- | --- | --- | --- |
| `patientID` | string | canonical required after save | generated `ANC-000N` | `DB.savePatient()` | visible patient ID and collection map key |
| `patientUuid` | string | required after save | generated UUID/local ID | `ensurePatientUuid()` | internal conflict-safe identity |
| `createdAt` | ISO string | generated for new patients | current timestamp | `DB.savePatient()` | set only when new ID generated |
| `updatedAt` | ISO string | generated on save/archive/restore | current timestamp | `DB.savePatient()` | overwritten on save |
| `fullName` | string | required by validation | `''` | `collectFormData()` | must contain at least 3 names for save |
| `age` | string | optional | `''` | `collectFormData()` | no numeric coercion before persistence |
| `phone` | string | optional | `''` | `collectFormData()` | trimmed |
| `address` | string | optional | `''` | `collectFormData()` | trimmed |
| `patientStatus` | string | optional | `''` | `collectFormData()` | loaded into `patientStatus` select |
| `riskLevel` | string | optional | `Low Risk` | `collectFormData()` / `loadPatientIntoForm()` | manual field; not automatic classification |
| `bloodGroup` | string | optional | `''` | `collectFormData()` | select value |
| `basalWeight` | string | optional | `''` | `collectFormData()` | no numeric coercion |
| `pregnancyType` | string | optional | `''` | `collectFormData()` | controls multiple-pregnancy fields |
| `chorionicity` | string | optional | `''` | `collectFormData()` | select value |
| `amnionicity` | string | optional | `''` | `collectFormData()` | select value |
| `medicalHistory` | string | optional | `''` | `collectFormData()` | trimmed |
| `surgicalHistory` | string | optional | `''` | `collectFormData()` | trimmed |
| `familyHistory` | string | optional | `''` | `collectFormData()` | trimmed |
| `allergyHistory` | string | optional | `''` | `collectFormData()` | trimmed |
| `previousPregnancies` | array | optional | `[]` | `collectPreviousPregnancies()` | embedded in patient root |
| `hospitalName` | string | optional | `''` | `collectFormData()` | `hospitalCustom` is folded into this field when custom option selected |
| `tpalT` | string | optional | `''` | `collectFormData()` | validated by `CALC.validateTPAL()` |
| `tpalP` | string | optional | `''` | `collectFormData()` | validated by `CALC.validateTPAL()` |
| `tpalA` | string | optional | `''` | `collectFormData()` | validated by `CALC.validateTPAL()` |
| `tpalL` | string | optional | `''` | `collectFormData()` | validated by `CALC.validateTPAL()` |
| `lmpDate` | date string | optional | `''` | `collectFormData()` / dating controller | canonical equivalent LMP |
| `calcDate` | date string | optional | today on new/load fallback | `collectFormData()` | calculation/reference date |
| `datingMethod` | string | optional | `lmp` | `datingMetadataForSave()` | values are UI select values such as `lmp`, `embryo-transfer`, `ultrasound`, `manual` |
| `datingLabel` | string | optional | derived label | `datingMetadataForSave()` | display label from `CALC.deriveDating()` |
| `embryoTransferDate` | date string | optional | `''` | `datingMetadataForSave()` | ART dating input |
| `embryoAge` | string | optional | `''` on save, `5` on load/new fallback | `datingMetadataForSave()` | Day 3/5/6 value as string |
| `ultrasoundDatingDate` | date string | optional | `''` | `datingMetadataForSave()` | ultrasound dating input |
| `ultrasoundGAWeeks` | string | optional | `''` | `datingMetadataForSave()` | ultrasound measured GA weeks |
| `ultrasoundGADays` | string | optional | `''` | `datingMetadataForSave()` | ultrasound measured GA days |
| `manualGAWeeks` | string | optional | `''` | `datingMetadataForSave()` | established/manual GA weeks |
| `manualGADays` | string | optional | `''` | `datingMetadataForSave()` | established/manual GA days |
| `isArchived` | boolean | optional | false/absent | `archivePatient()` / `savePatient()` | preserved if existing patient archived |
| `archivedAt` | ISO string | optional | `''` | archive helpers | preserved through save/import invariants |
| `archivedBy` | string | optional | `''` | archive helpers | defaults actor to `clinic-user` |
| `archiveReason` | string | optional | `''` | archive helpers | required for archive operation |
| `archiveAudit` | array | optional | `[]` | archive helpers/import merge | archive/restore event objects |

Physician note: no persisted `physicianNote` or equivalent root field was found in `collectFormData()` or `loadPatientIntoForm()` during this audit.

## 4. Clinical Collections

### Visits

Storage key: `anc_visits`. Shape: `{ [patientID]: visit[] }`. Source: `UI.collectVisits()` and `UI.visitRowHTML()`.

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `date` | date string | `''` | Add Visit defaults blank date to today before collection |
| `findings` | string | `''` | exam/findings textarea |
| `bp` | string | `''` | blood pressure |
| `weight` | string | `''` | no numeric coercion |
| `meds` | string | `''` | visit medication note |
| `procSummary` | string | `''` | legacy hidden procedure summary |
| `labSummary` | string | `''` | legacy hidden lab summary |
| `notes` | string | `''` | notes/plan |

Rows are saved only when at least one collected value is non-empty after trimming. Visit GA is display-derived from patient `lmpDate` and `visit.date`; it is not saved by `collectVisits()`.

### Scans

Storage key: `anc_scans`. Shape: `{ [patientID]: scan[] }`. Source: `UI.collectScans()` and `UI.normalizeScan()`.

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `schemaVersion` | number | `2` | written by collector |
| `category` | string | `''` | selected scan type |
| `type` | string | same as `category` | compatibility/display alias |
| `date` | date string | `''` | scan date |
| `ga` | string | `''` | display text copied from `.scan-ga-display`; persisted by collector |
| `operator` | string | `''` | operator input |
| `findings` | string | `''` or limited note | general findings |
| `recs` | string | `''` | recommendations |
| `limitedScan` | object | see below | limited clinic scan fields |
| `biometrics` | object | see below | biometry/fluid/placenta fields |
| `doppler` | object | see below | Doppler numeric fields |

`limitedScan` fields: `disclaimer`, `fetalCardiacActivity`, `fetalMovement`, `fhr`, `placenta`, `placentaOS`, `liquor`, `presentation`, `dopplerStatus`, `note`, `bppScore`, `cervicalLength`.

`biometrics` fields: `BPD`, `HC`, `AC`, `FL`, `AFI`, `DVP`, `EFW`, `placentaLocation`, `placentaOS`.

`doppler` fields: `UA_PI`, `MCA_PI`, `DV_PI`, `UtA_PI`.

Compatibility aliases read by `normalizeScan()` include legacy `scan.type`, `scan.routine.*`, `limitedScan.viability`, and biometrics placenta fields. `normalizeScan()` returns `normalizedSchemaVersion: 2` for rendering, but `collectScans()` persists `schemaVersion: 2`.

### Procedures

Storage key: `anc_procedures`. Shape: `{ [patientID]: procedure[] }`. Source: `UI.collectProcs()` and `UI.procRowHTML()`.

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `type` | string | `''` | procedure type |
| `date` | date string | `''` | procedure date |
| `operator` | string | `''` | operator |
| `result` | string | `''` | result summary |
| `notes` | string | `''` | notes |

Rows are saved when `type`, `date`, or `result` is present. Procedure GA is derived for display and not persisted.

### Labs

Storage key: `anc_labs`. Shape: `{ [patientID]: labsObject }`. Source: `UI.collectLabs()` and lab workspace helpers.

Top-level patient lab object fields:

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `t1` | object | `{}` | first trimester tests |
| `t2` | object | `{}` | second trimester tests |
| `t3` | object | `{}` | third trimester tests |
| `_layout` | object | omitted unless dirty/patient layout exists | patient-specific lab layout |

Each trimester object is a map of `{ [testCode]: labEntry }`. Built-in and custom test codes are exact code strings from `CONSTANTS.LAB_TEST_LIBRARY` or patient custom layout.

Generic lab entry fields:

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `value` | string | `''` | result value |
| `resultDate` | date string | optional/omitted | result date when changed or previously present |
| `status` | string | optional/omitted | `pending`, `completed`, or `''` when explicitly retained |
| `notes` | string | optional/omitted | retained if present or non-empty |
| `ordered` | string | optional legacy | hidden legacy ordered date |

`CBC` entry fields are `Hb`, `HCT`, `WBC`, `PLT`, `MCV`, `MCH`, plus optional `resultDate`, `status`, and legacy `ordered`.

`_layout` fields from `normalizeLabLayout()`: `version`, `hiddenTestCodes` with `t1/t2/t3` arrays, `restoredTestCodes` with `t1/t2/t3` arrays, and `customTests[]`. Each custom test has `testCode`, `testName`, `panelCode`, `valueType`, `unit`, `referenceLow`, `referenceHigh`, `notes`, `builtIn:false`.

### Problems

Storage key: `anc_problems`. Shape: `{ [patientID]: problem[] }`. Source: `UI.collectProblems()` and `DB.normalizeProblem()`.

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `problemID` | string | generated `prob_*` | row identifier |
| `patientID` | string | owning patient ID | inserted by normalizer |
| `patientUuid` | string | patient UUID or `''` | inserted by normalizer |
| `title` | string | `''` | `record.problem` is accepted as legacy alias when normalizing |
| `category` | string | `''` | category |
| `status` | string | `Active` | allowed: `Active`, `Monitoring`, `Resolved`, `Historical` |
| `severity` | string | `''` | allowed: `''`, `Low`, `Moderate`, `High` |
| `onsetDate` | date string | `''` | onset |
| `resolutionDate` | date string | `''` | resolution |
| `notes` | string | `''` | notes |
| `createdAt` | ISO string | current timestamp | preserved if provided |
| `updatedAt` | ISO string | current timestamp | overwritten on normalization |

Rows are saved when meaningful fields exist or status is not `Active`.

### Medications

Storage key: `anc_medications`. Shape: `{ [patientID]: medication[] }`. Source: `UI.collectMedications()` and `DB.normalizeMedication()`.

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `medicationID` | string | generated `med_*` | row identifier |
| `patientID` | string | owning patient ID | inserted by normalizer |
| `patientUuid` | string | patient UUID or `''` | inserted by normalizer |
| `drugName` | string | `''` | drug |
| `genericName` | string | `''` | generic |
| `dose` | string | `''` | dose amount |
| `unit` | string | `''` | unit/form |
| `route` | string | `''` | route |
| `frequency` | string | `''` | collector formats as `N times daily` |
| `indication` | string | `''` | indication |
| `startDate` | date string | `''` | start |
| `stopDate` | date string | `''` | stop |
| `duration` | string | `''` | collector formats as `N days` |
| `prescribedBy` | string | `''` | clinician |
| `status` | string | `Active` | allowed: `Active`, `Completed`, `Stopped`, `Suspended` |
| `notes` | string | `''` | notes |
| `createdAt` | ISO string | current timestamp | preserved if provided |
| `updatedAt` | ISO string | current timestamp | overwritten on normalization |

Rows are saved when meaningful fields exist or status is not `Active`.

### Previous Pregnancies

Storage location: embedded in patient root as `previousPregnancies`. Source: `collectPreviousPregnancies()`.

Fields: `year`, `gestationalAge`, `outcome`, `deliveryType`, `indication`, `birthWeight`, `neonatalOutcome`, `maternalComplications`, `congenitalAnomaly`, `anomalyType`, `anomalyDetails`, `livingStatus`, `majorComplication`, `fetalSex`, `lossTrimester`, `lossManagement`, `lossGestationalAge`, `lossComplication`, `pathologyTesting`, `lossNotes`, `ectopicSite`, `ectopicManagement`, `ectopicComplication`, `ectopicNotes`, `molarManagement`, `molarFollowUpCompleted`, `molarComplication`, `molarNotes`, `notes`.

Rows are persisted only when at least one field is truthy.

### Attachments

Storage key: `anc_attachments`. Shape: `{ [patientID]: attachment[] }`. Source: `DB.addAttachment()`, `DB.saveAttachments()`, `DB.exportAll()`.

`addAttachment()` adds `id` as `att_*` and `addedAt` ISO timestamp to the supplied attachment object. Other attachment fields are not conclusively determined in Release 1 active workflow because attachment UI is deferred.

### Audit Events

Storage key: `anc_audit_events_v1`. Shape: audit event array. Source: `normalizeAuditEvent()`.

Fields: `eventID`, `timestamp`, `actor`, `operation`, `patientID`, `patientUuid`, `entityType`, `entityID`, `reason`, `summary`, `status`, `beforeHash`, `afterHash`.

### Medication Memory

Storage key: `anc_medication_memory_v1`. Shape: medication pattern array. Source: `normalizeMedicationPattern()`.

Fields: `patternID`, `drugName`, `genericName`, `doseAmount`, `unit`, `timesPerDay`, `durationDays`, `route`, `indication`, `notes`, `createdAt`, `updatedAt`.

### Pending Incremental Sync Metadata

Storage key: `anc_incremental_sync_v1`. Shape: `{ [patientID]: syncEntry }`. Source: `markPendingCloudSync()`.

Fields: `version`, `patientID`, `patientUuid`, `patient`, `visits`, `queuedAt`. This is metadata from a deferred cloud path; the local save path still writes it.

## 5. Pregnancy Dating Contract

Persisted patient fields:

- `lmpDate`: canonical persisted equivalent LMP. For non-LMP dating, `applyDating()` writes the derived equivalent LMP into the LMP input before save.
- `calcDate`: reference/calculation date.
- `datingMethod`: current selected method.
- `datingLabel`: display label from `CALC.deriveDating()`.
- `embryoTransferDate`, `embryoAge`: embryo-transfer inputs.
- `ultrasoundDatingDate`, `ultrasoundGAWeeks`, `ultrasoundGADays`: ultrasound dating inputs.
- `manualGAWeeks`, `manualGADays`: established/manual dating inputs.

Calculated but not persisted as patient root fields: EDD, current GA, trimester, milestone text, lab intelligence text, and summary dating line. Scan rows persist a `ga` display string copied from the scan row; visit/procedure GA display strings are not persisted.

## 6. Derived and Non-Persisted Values

Verified runtime-derived values include:

- current gestational age from `CALC.getGA(lmpDate, calcDate/today)`;
- EDD from `CALC.getEDD(lmpDate)`;
- trimester from `CALC.getTrimester()`;
- visit/procedure/scan GA displays from row dates and `lmpDate`;
- summary cards and alerts from saved patient plus saved collections;
- risk badge rendering from persisted manual `riskLevel`;
- patient database GA/EDD/status badges from persisted patient fields;
- backup verification hashes for encrypted wrapper payloads.

## 7. Preservation and Backward Compatibility

- `DB.getAllPatients()` normalizes missing `patientID` from map key and inserts missing `patientUuid`, persisting the normalization.
- `DB.savePatient()` preserves existing `patientUuid` and archive fields, but root patient unknown fields are not generally preserved when saving from current form data.
- `mergePatientPreservingArchiveInvariant()` preserves/merges archive fields during import.
- Collection editor readiness guard in `persistCurrentRecordLocal()` preserves saved visits, scans, procedures, labs, problems, and medications if an expected editor container is missing; labs are also preserved if `.lab-v21-render-error` exists.
- Intentional empty collections remain valid when the editor container exists and renders.
- `DB._read()` throws `StorageReadError`/`StorageShapeError` for malformed JSON or invalid top-level clinical shapes.
- Problems and medications are normalized on read/write; unknown row fields are not preserved by their normalizers.
- Lab legacy fields `ordered`, `completedDate`, and `date` may feed result-date display; `ordered` is preserved through hidden inputs.
- Scan legacy aliases from `routine.*`, `limitedScan.viability`, `scan.type`, and biometrics placenta fields are read into the normalized render model.
- Import skips patients with same visible `patientID` but conflicting/missing incoming `patientUuid` when a local UUID exists.

## 8. Backup and Restore Contract

Plain backup payload from `DB.exportAll()` is JSON:

| Field | Shape |
| --- | --- |
| `exportedAt` | ISO string |
| `version` | string, currently `2.0` |
| `patients` | `anc_patients` map |
| `visits` | `anc_visits` map |
| `scans` | `anc_scans` map |
| `procedures` | `anc_procedures` map |
| `labs` | `anc_labs` map |
| `problems` | `anc_problems` map |
| `medications` | `anc_medications` map |
| `attachments` | `anc_attachments` map |
| `settings` | `anc_settings` object |
| `auditEvents` | audit event array |

`downloadBackup()` may wrap this payload when encryption paths are enabled/unlocked. Basic offline Release 1 accepts unencrypted backup as current active path. The generated backup is verified by parsing and comparing normalized JSON; encrypted wrappers may also use `plaintextSha256`.

Restore/import accepts plain payloads or encrypted wrapper payloads. `DB.importAll()` requires `patients`, validates top-level shapes for supplied collections, merges accepted patients into existing patients, merges supplied collections only for accepted patient IDs, merges settings shallowly, and merges audit events by `eventID`. Import is merge-oriented, not a complete replacement. `replaceClinicalData()` exists separately for complete snapshot replacement/recovery flows.

Rollback backup functions exist for an encrypted phase migration path but are not part of active Basic Offline Release 1 workflow.

## 9. State Mutation Rules

- State shape changes require updating this document or explicitly declaring state shape unchanged.
- Backward compatibility is mandatory for existing local records.
- Old records require safe defaults on read/render.
- Unknown stored fields must not be silently destroyed where current preservation rules apply.
- If future work changes collection ownership, row identifiers, field meanings, or data types, it must update this contract before implementation is considered Done.

## 10. Audit Findings Requiring Review

| Classification | Finding |
| --- | --- |
| Confirmed | Patient root unknown fields are not generally preserved by `collectFormData()` -> `DB.savePatient()`; archive fields are the explicit preserved exception. |
| Confirmed | Problem and medication normalizers return fixed objects, so unknown fields in those row records are not preserved on read/save normalization. |
| Confirmed | `anc_incremental_sync_v1` is written by local save even though cloud sync is deferred for Release 1. It stores full patient plus visits snapshots only. |
| Confirmed | No persisted physician note field was found in inspected `collectFormData()`, `loadPatientIntoForm()`, or UI collectors. |
| Probable | Scan compatibility fields such as `routine.*` are read into the render model, but a subsequent save through `collectScans()` writes the current fixed scan shape and may not preserve all legacy scan fields. |
| Probable | Generic lab test entries may retain legacy keys already present in `_labSource` because capture starts from an existing entry object, but row rendering only exposes known controls for value/date/status/notes/ordered. |
| Ambiguous | Attachment row object shape beyond injected `id` and `addedAt` cannot be conclusively determined from active Release 1 UI because attachment features are deferred. |
| Ambiguous | Settings schema beyond `labsV21Template` is an open object map and was not exhaustively determined in this audit. |
