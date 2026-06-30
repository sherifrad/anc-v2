# Current Task
**Active Task:** Micro-Slice 3B — Pregnancy Dating UI State Isolation
**Epic:** EPIC-001 Basic Offline Release
**Feature:** FEATURE-004 Stabilization Sprint
**Status:** Completed — Ready for Commit
## Objective
Isolate Pregnancy Dating UI state so exactly one dating method input group is active at a time, while preserving the existing medical formulas, storage schema, legacy compatibility, and canonical `lmpDate` calculation anchor.
## Architectural Decisions
- `#datingMethod` is the single UI source of truth.
- `lmpDate` remains the canonical stored calculation reference.
- LMP mode uses `#lmpDate` as a direct editable clinical input.
- Non-LMP modes use `#lmpDate` as an Equivalent LMP result.
- In non-LMP modes, `#lmpDate` must be `readonly`, never `disabled`.
- The visible label must change to `Equivalent LMP (Calculated)` for non-LMP methods.
- Only the selected method metadata is persisted.
- Inactive method metadata is removed from the save payload only.
- Inactive DOM values remain intact during the current editing session.
- Legacy patients with `lmpDate` but no `datingMethod` load as LMP.
- No medical formula changes.
- No schema migration.
- No new dating methods in this slice.
## Definition of Ready — Met
- Current Dating DOM and state paths were audited.
- Existing supported methods were identified.
- No schema blocker was found.
- Existing formula tests pass.
- Reference UX principles were reviewed.
- Immediate work is limited to UI state, save sanitization, load consistency, and tests.
## Implementation Steps
1. Add one reusable Dating UI-state helper.
2. Ensure exactly one method-specific raw input group is active.
3. Reuse existing `#lmpDate` input:
   - editable and labeled `LMP` in LMP mode;
   - read-only and labeled `Equivalent LMP (Calculated)` in non-LMP modes.
4. Preserve entered values while switching methods.
5. Persist only the active method metadata in the patient payload.
6. Preserve canonical `lmpDate`, `datingMethod`, and `datingLabel`.
7. Add explicit legacy fallback to LMP.
8. Ensure patient switching restores correct Dating UI and does not leak stale state.
9. Add focused UI-state regression coverage.
10. Update `docs/CHANGELOG.md` after successful tests.
## Definition of Done — Pending
- [x] Exactly one Dating method input group is active at a time.
- [x] LMP input is editable only in LMP mode.
- [x] Equivalent LMP is read-only in non-LMP modes.
- [x] Equivalent LMP label is explicit.
- [x] `disabled` is not used for `#lmpDate`.
- [x] Toggling methods does not erase session values.
- [x] Only active method metadata is persisted.
- [x] DOM values are not cleared during payload sanitization.
- [x] Legacy LMP-only records load safely.
- [x] Patient switching does not leak Dating state.
- [x] No schema change.
- [x] No `calc.js` or `db.js` change.
- [x] Focused test passes.
- [x] Existing regression tests pass.
- [x] Manual browser validation completed.

## Manual Browser Validation — Passed
- LMP visual revalidation passed.
- Embryo Transfer visual revalidation passed.
- Ultrasound visual revalidation passed.
- Manual visual revalidation passed.
- Inactive Dating method groups are now visually hidden.
- Equivalent LMP remains visible and read-only in non-LMP modes.
- No console TypeError, ReferenceError, Uncaught, or null-property errors were observed.

## Micro-Slice 3B2 Visibility Fix
- Manual browser validation exposed inactive Dating groups still rendering after method changes.
- The focused real-markup test reproduced the defect using `index.html` Dating markup and project CSS.
- Root cause was `.field-group { display:flex; }` overriding native hidden rendering for Dating field groups.
- Added the narrow `.dating-method-field[hidden]` rule.
- Automated regression validation now passes.
- Final browser revalidation passed.
