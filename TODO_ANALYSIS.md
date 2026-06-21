# ANC-V2 Analysis and Roadmap

## Current Focus: ANC-EMR Only

ANC-V2 is the only active project. Current work is limited to stabilizing and extending the antenatal EMR.

## Completed and Verified

- Data Integrity Stabilization Phase 1: complete.
- Data Integrity Stabilization Phase 1.1: complete.
- Data Integrity Stabilization Phase 1.2: complete and externally browser verified using the production `db.js`, `ui.js`, and `app.js` on a clean local HTTP origin.
- Phase 1.2 verification covered safety-state transitions, recovery markers, import decisions and recovery, archive invariants, UUID immutability, patient-transition rollback, structural corruption blocking, Summary First, and core record workflows.
- Labs V2.1 Compact Core Workspace: complete and browser verified on desktop Chromium, Safari-compatible WebKit, and a 390 x 844 mobile viewport using production scripts on a clean local HTTP origin.
- Labs V2.1 verification covered empty and legacy records, trimester panels, compact entry, unified urinalysis, pending results, custom tests, hide/restore, clinic templates, archived read-only behavior, manual save, autosave, reload, patient switching, and core workflow regressions.

## Next Approved Work

1. Commit the verified Labs V2.1 patch when explicitly approved.
2. Do not begin Labs V2.2 until its scope is separately approved.

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

- Labs V2.2 interpretation and timeline work, pending separate approval.
- Medication duplicated-unit formatting polish.
- Medication pattern manager.
- Medication-section simplification:
  - retain a compact central medication list;
  - add a persistent "+ New Medication" action;
  - keep visit-linked medication actions;
  - do not merge medications into visit free text only.
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
