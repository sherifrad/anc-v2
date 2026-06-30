# Current Task
**Active Task:** Micro-Slice 2d — Restore Global Safety Patch
**Epic:** EPIC-001 Basic Offline Release
**Feature:** FEATURE-004 Stabilization Sprint
**Status:** Completed — Ready for Commit
## Objective
Decouple Safe Restore payload filtering from the transient active UI state (`currentPatientID`).
Whole-Patient Preservation must protect every existing local patient during Safe Restore whether a patient is open or the user is on the Dashboard.
## Definition of Ready - Met
- Unsafe Dashboard-initiated Safe Restore path was identified.
- Current filter and post-import reload paths were inspected.
- `buildSafeRestorePayload()` already supports whole-patient filtering.
- `DB.getAllPatients()` returns the local patient object map.
- State shape remains unchanged.
- No schema migration is required.
- `js/db.js` boundary remains protected.
## Implementation Steps
1. **Global Safe Restore filtering**
   - Run `buildSafeRestorePayload()` whenever the Safe Restore option is selected.
   - Pass the complete `DB.getAllPatients()` object map.
   - Remove any dependency between payload safety filtering and `currentPatientID`.
2. **Post-import UI routing**
   - If `currentPatientID` exists, reload the preserved active patient.
   - If `currentPatientID` is absent, refresh the Dashboard and patient tables only.
   - Never call patient-editor reload functions with a null patient ID.
3. **Helper naming**
   - Rename `validPatientUuid()` to `hasUsablePatientUuid()`.
   - Preserve the current compatibility rule: a usable identifier is a non-empty string.
   - Do not introduce strict RFC UUID validation without a separate compatibility audit.
4. **Focused tests**
   - Reverse the previous no-active-patient expectation.
   - Prove Safe Restore from Dashboard still filters every existing local patient.
   - Prove only genuinely new patients are imported.
   - Prove the original payload is not mutated.
## Definition of Done - Pending
- [x] Safe Restore filters all local patients globally.
- [x] Safe Restore behavior is independent of `currentPatientID`.
- [x] Dashboard-initiated Safe Restore imports only new patients.
- [x] Existing local patient collections remain protected.
- [x] Active patient reload remains conditional.
- [x] Dashboard refresh works without an active patient.
- [x] Helper is renamed to `hasUsablePatientUuid`.
- [x] Original payload remains unmodified.
- [x] `js/db.js` is unchanged.
- [x] Schema and state shape remain unchanged.
- [x] Focused test passes.
- [x] Existing regression tests pass.
- [x] Manual Browser Validation completed.

## Manual Browser Validation - Passed
- Online and offline plain JSON Backup.
- Safe Restore from Dashboard.
- Safe Restore with an active patient.
- Whole-patient preservation for existing local patients.
- Import of genuinely new patients.
- Destructive Restore second confirmation.
- Cancel behavior.
- Malformed and invalid backup rejection.
- Backup file-input dirty-state isolation.
- No browser console exceptions.

## Safety Notes
- Safe Restore blanket preservation protects Archived, Completed, Delivered, Closed, Pregnancy Loss, Lost to Follow-up, and Transferred cases without status-specific branching.
- Destructive Restore remains explicitly available for device migration and disaster recovery.
