# ANC-EMR Roadmap

Non-Operational Product Reference Document. Preserves long-term product sequencing. Not read during normal Release 1 implementation unless explicitly requested. Current actionable work is authoritative in `PROJECT_BACKLOG.md` and `CURRENT_TASK.md`.

## Phase 1: Stabilize Core Local Records

- Confirm current patient save/load behavior.
- Fix any patient transition, autosave, or manual save defects.
- Ensure core collections persist together: patient, visits, scans, procedures, labs, problems, and medications.
- Keep archive/restore behavior stable.

## Phase 2: Complete Core ANC Workflow

- Improve patient management and database navigation.
- Tighten visit workflow for fast repeat follow-up entry.
- Improve summary screen accuracy and readability.
- Keep workflow close to a paper ANC record.

## Phase 3: Data Integrity And Validation

- Add or refine validation only where it prevents real clinical data errors.
- Improve corrupted-storage handling and recovery messages.
- Verify backup/import merge behavior for normal clinic use.
- Improve visible save state and failure handling.

## Phase 4: Usability, Printing, And Backup

- Polish mobile-first layouts for repeated clinic use.
- Improve print/PDF output for the active record.
- Make local export/import and rollback backup flows clear and dependable.
- Address performance only where it directly affects usability.

## Deferred Scope

Deferred technical debt is authoritative in `ARCHITECTURE.md`.
Deferred actionable work is authoritative in `PROJECT_BACKLOG.md`.
