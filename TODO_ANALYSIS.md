# ANC-V2 Analysis and Roadmap

## Current Focus: ANC-EMR Only

ANC-V2 is the only active project. Current work is limited to stabilizing and extending the antenatal EMR.

## Completed and Verified

- Data Integrity Stabilization Phase 1: complete.
- Data Integrity Stabilization Phase 1.1: complete.
- Data Integrity Stabilization Phase 1.2: complete and externally browser verified using the production `db.js`, `ui.js`, and `app.js` on a clean local HTTP origin.
- Phase 1.2 verification covered safety-state transitions, recovery markers, import decisions and recovery, archive invariants, UUID immutability, patient-transition rollback, structural corruption blocking, Summary First, and core record workflows.

## Next Approved Work

1. Record a brief measured performance baseline.
2. Begin Labs Redesign after the baseline is documented.

## Deferred Phase 2 Data-Integrity Work

- Atomic multi-collection save batches.
- Transactional imports.
- Durable rollback journal.
- Automatic pre-import snapshots.
- Complete field-level schemas and validation.
- IndexedDB storage migration.
- Attachment storage migration.
- UUID Phase 2 relation re-keying.
- Append-only, tamper-resistant audit storage.
- Cloud synchronization expansion for medications and problems.

## ANC-EMR Feature Backlog

- Labs Redesign.
- Medication duplicated-unit formatting polish.
- Medication pattern manager.
- Problem dashboard counts.
- Problem PDF section.
- Medication PDF section.
- Medication dashboard flags.
- Audit refinement and audit viewer.
- Archive history refinement.
- Guideline/rules engine versioning and physician-approved overrides.
- Clinical safety test expansion.

## Separate Future Application

Partograph / Labour Monitoring is a completely separate future application. It is not part of ANC-V2 or the active ANC-EMR backlog and must not be developed as an ANC-V2 module.
