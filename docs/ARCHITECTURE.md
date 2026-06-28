# ANC-EMR Current Architecture

## Runtime

ANC-EMR Release 1 is a Basic Offline Release for one physician, one primary device, approximately 30 patients, local browser operation, and manual clinical validation by the project owner.

## Architecture Principles

- Workflow First
- Mobile First
- Offline First
- Summary First
- Reuse Before Rewrite
- Vertical Slice Development
- Conservative Data Handling

## Module Boundaries

- `index.html` defines the application shell, screens, forms, navigation, action buttons, and script loading.
- `js/app.js` is the main controller for lifecycle, patient transitions, save/load, backup/restore, print/PDF, summary, and safety states.
- `js/ui.js` renders and collects form sections including visits, labs, scans, problems, medications, modals, and status UI.
- `js/db.js` is the local persistence layer.
- `js/calc.js` and `js/constants.js` provide clinical calculations and reference data.

## Release 1 Product Shape

Summary is the patient home screen, clinical dashboard, and navigation hub. Focused Workspaces are full-screen application states. Workspaces are not modals, popups, or overlay dialogs.

Release 1 workflow:

Summary -> Focused Workspace -> Save -> Summary

## Storage Model

Current working data uses browser `localStorage`, not IndexedDB/Dexie. Clinical collections are stored separately through `js/db.js` and shape-checked on read/write. Backup export returns one JSON payload. Import/restore uses existing local backup logic.

## Accepted Technical Debt Register

The following are conscious Release 1 design decisions, not bugs and not permission for automatic refactoring:

- `localStorage`
- no encryption at rest
- encrypted backup deferred
- no cloud sync
- no auth/MFA
- no IndexedDB/Dexie
- no OCR
- no AI
- no general dashboard implementation

## Release 1 Clinical Safety

Clinical Safety for Release 1 means:

- accurate obstetric calculations;
- correct display of saved clinical data;
- no misleading clinical labels;
- no automatic risk classification;
- no silent overwrite caused by missing or broken UI render state.

Clinical Safety is separate from IT security. IT security, encryption, multi-device consistency, and enterprise-grade persistence remain accepted pilot risks.
