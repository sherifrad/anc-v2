# ANC-EMR Master Plan

Non-Operational Product Reference Document. Preserves long-term product vision. Not read during normal Release 1 implementation unless explicitly requested. Operational authority resides in the Release 1 governance stack.

## Vision

ANC-EMR is a fast, offline-first antenatal care EMR for a private obstetrics clinic. The core product should feel like a paper ANC record translated into a reliable mobile browser app: quick registration, quick follow-up entry, clear pregnancy summary, dependable local persistence, easy printing, and safe local backup/restore.

The current delivery target is the core clinic application only. It must run locally in the browser, work well on mobile, preserve records deterministically, and prioritize data-entry speed over broad platform features.

## Product Goals

- Maintain stable patient records across browser sessions.
- Support the full core ANC workflow: patient registration, pregnancy details, visits, labs, scans, procedures, problems, medications, risk/status, summary, printing, and backup/restore.
- Make save/load behavior predictable and visible.
- Keep clinical workflows paper-like and low-friction.
- Prefer small, focused fixes over broad redesigns.

## Engineering Goals

- Keep implementation scope narrow and stable.
- Minimize repository traversal before changes.
- Verify only affected functionality.
- Avoid large refactors unless directly required for core reliability.
- Deferred scope is authoritative in `ARCHITECTURE.md` and `PROJECT_BACKLOG.md`.

## Completion Definition For Core App

The core app is complete when a clinic user can create, reopen, update, print, export, import, and safely continue ANC follow-up records locally with clear validation and no routine data loss.
