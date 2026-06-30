# ANC-EMR Changelog

## 2026-07-01

- Final local browser/network validation passed for Micro-Slice 4B: Safari showed no token/auth/session requests, no Supabase load/auth retry errors, no incremental-sync logs, and local save/reload, Backup/Restore, and Dating remained functional; deployed verification remains pending after release, and no schema, DB, calculation, or local-storage behavior changed.
- Added dedicated Basic Offline runtime-isolation regression coverage proving no cloud listeners, Supabase/Auth probes, sync snapshots, sync scheduling, cloud refreshes, or incremental-sync logs occur in Basic Offline mode while future online functions remain gated and callable in a non-basic fixture.
- Implemented Basic Offline hard runtime isolation: startup sync status no longer probes Supabase/Auth, automatic cloud listeners are not bound, local saves no longer queue pending cloud snapshots, incremental-sync workers/logs are suppressed, future online code remains gated, and no schema/DB/storage-shape change occurred.

## 2026-06-30

- Final manual browser validation passed for Micro-Slice 3B/3B2: the Dating CSS-hidden defect is resolved, all Dating methods were visually revalidated, and no schema, DB, calculation, or storage behavior changed.
- Inactive Dating method groups now use an explicit Dating-specific hidden rule, correcting visual rendering without changing JS state logic, schema, DB, calculations, save/load, or storage behavior.
- Implemented Pregnancy Dating UI State Isolation: Dating UI now uses one selected method as the source of truth, direct LMP is editable only in LMP mode, Equivalent LMP is visible/read-only in non-LMP modes, only active method metadata is persisted, session values remain available while toggling, legacy LMP-only records remain compatible, no medical formula/schema/DB change occurred, and focused Dating UI-state regression coverage was added.
- Final manual browser validation passed for Micro-Slice 2/2b/2c/2d: Safe Restore preserves all existing local cases and related collections, terminal/workflow statuses remain protected by blanket whole-patient preservation, and destructive replacement requires explicit second confirmation.
- Dashboard-initiated Safe Restore now applies the same whole-patient filtering as Workspace Restore: Safe Restore no longer depends on `currentPatientID`, existing local patients remain protected when no patient is open, active-patient reload remains conditional, Dashboard refreshes without opening a patient, the UUID helper was renamed to `hasUsablePatientUuid`, and no DB or schema change occurred.
- Implemented whole-patient Safe Restore policy: default restore now imports only new UUIDs with unused incoming patient keys, preserves every existing local patient and related collections, skips UUID/MRN conflicts and invalid UUID records, keeps destructive restore behind a second explicit confirmation, leaves `DB.importAll()` unchanged, and adds focused regression coverage.
- Excluded Backup and Verify backup file inputs from clinical dirty tracking so file selection no longer marks the active patient changed, triggers false unsaved Restore warnings, or queues autosave/sync through the dirty-state path; normal clinical dirty tracking remains unchanged and no schema or DB change occurred.
- Corrected the confirmed Restore choice overwrite defect: the safe save branch now preserves the active patient and all related collections while importing other backup patients, the destructive overwrite branch remains explicit, `DB.importAll()` is unchanged, no schema migration was introduced, and focused regression coverage was added.
- Basic Offline Backup now produces plain local JSON; Phase 2 and legacy encryption gates are bypassed only for the default Basic Release backup path, plain Restore remains merge-based without unlock, and encrypted Restore protections remain intact.

## 2026-06-29

- Completed Risk Neutralization: official `riskLevel` remains manual-only, missing risk remains blank and displays as Not recorded, current values are Low Risk/Moderate Risk/High Risk, legacy Middle Risk displays as Moderate Risk, and clinical risk triggers now produce advisories without mutating official risk; state shape unchanged and no migration performed.

## 2026-06-28

- Paper-like Summary V2 failed manual validation due to Summary/Workspace overlap, misleading risk behavior, layout/overflow failure, unexpected backup encryption gate, and incomplete Summary data presentation.
- Selectively rolled back V2-only DOM/CSS/renderer changes while preserving valid persistence, Pregnancy Dating calculation, Basic Offline, and saved-data work; no destructive Git reset was used.
- Completed Baseline Closure by diagnosing missing CSS hidden enforcement, adding `#patientEditor[hidden]{display:none!important}`, extending the shell regression test, passing the automated shell test, and passing manual browser validation with no runtime console exceptions.
- Pending recovery sequence: Working tree cleanup, Risk Neutralization, Backup/Encryption Isolation, Dating State Isolation, Final Summary/Workspace state verification, then Summary V2 rebuild in micro-slices.
- Corrected Paper-like Summary V2 missing-risk handling, risk-value styling, active-medication filtering, supported Last Visit metrics, and same-day association wording; state shape unchanged and Slice 2 remains pending owner manual validation.
- Refined Paper-like Summary V2 to match the approved hierarchy using existing Summary/editor containers and saved local data; state shape unchanged.
- Added Vertical Slice 1 Summary shell and focused-workspace navigation using existing patient containers; no persistence or state-shape behavior changed.
- Release 1 persisted-state contract documented from current code; no schema or application behavior changed, and unresolved schema findings remain pending review.
- The earlier governance baseline entry is superseded by Revision 1.1; final Governance Freeze remains pending completion and acceptance of the Release 1 State Schema Audit.
- Release 1 Engineering Constitution Revision 1.1 aligned: added mechanical DoR/DoD and governance hierarchy, consolidated accepted technical debt and deferred work authorities, and set State Schema Audit as the next required task before Summary/Workspace implementation.
- Release 1 Engineering Constitution and SCM governance baseline finalized, including AI behavior rules, accepted technical debt, state schema contract, and governance freeze.

## 2026-06-27

- Disabled the startup sign-in/MFA gate for the basic offline clinic release while keeping full auth/user roles deferred and code present.
- Polished visit row order and compact visit-specific styling for faster repeated follow-up entry without changing visit storage or collectors.
- Polished pregnancy dating labels and summary display to show method, equivalent LMP, and EDD without changing dating formulas.
- Added unified pregnancy dating helpers for LMP, embryo transfer, ultrasound dating, and manual GA, plus shared clinical row date/focus/recalculation helpers for faster consistent entry.
- Simplified the visible backup/restore workflow to Backup and Restore, with generated backups verified before success messaging; automatic scheduled backup/export remains deferred.
- Improved patient summary accuracy so the summary renders from locally saved data and clears stale visit, lab, procedure, problem, medication, status, and risk values when patients change.
- Stabilized offline local persistence so missing or failed-rendered collection editors preserve previously saved visits, scans, procedures, labs, problems, and medications instead of overwriting them with accidental empty snapshots.
- Added permanent project memory in `docs/`.
- Established core-app-first development workflow.
- Marked platform/cloud/auth/media/AI work as deferred for the current delivery target.
- Recorded current architecture and storage reality: local browser SPA using `localStorage` through `js/db.js`.
