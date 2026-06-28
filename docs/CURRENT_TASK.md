# Current Task

## Goal

Working Tree Cleanup is the active step before Risk Neutralization.

Paper-like Summary V2 failed manual validation and remains halted. The V2-only visual structure was selectively rolled back. The Slice 1 Summary/Focused Workspace shell remains, along with valid saved-data, persistence, Pregnancy Dating calculation, and Basic Offline work.

## Baseline Closure

The Summary/Workspace browser exclusivity defect was fixed with:

```css
#patientEditor[hidden]{display:none!important}
```

Manual Baseline Closure passed:

- Summary-only state;
- Workspace-only state;
- unsaved values preserved during mode switching;
- Save + Reload persistence;
- patient-to-patient isolation;
- incomplete-patient handling;
- Labs and medications persistence;
- no browser console exceptions.

## Known Pending Defects

- automatic/legacy risk classification;
- missing risk displayed as Low Risk;
- Backup blocked by encryption unlock gate;
- Pregnancy Dating UI state isolation;
- misleading missing-LMP dating alert;
- Recent Labs absent from Slice 1 Summary;
- visit medications absent from Recent Visit Summary;
- deferred sync triggers still active/noisy.

## Current Step

Working Tree Cleanup.

## Next Approved Implementation Step

Risk Neutralization.

Risk Neutralization has not started.

## Stop Condition

Stop after Step 4A documentation sync and safe artifact isolation.

Summary V2 rebuild remains halted.
