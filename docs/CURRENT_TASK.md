# Current Task
**Active Task:** Micro-Slice 4C-B — Basic Offline App Shell Dependency Cleanup
**Epic:** EPIC-001 Basic Offline Release
**Feature:** FEATURE-004 Stabilization Sprint
**Status:** Completed — Ready for Commit

## Objective
Remove Supabase/Auth/cloud dependencies from the Basic Offline App Shell while preserving the minimal local `AUTH` and `SUPA` contracts required by the existing app runtime.

## Architectural Decisions
- Basic Offline uses `js/basic_offline_adapter.js` as the only loaded `AUTH`/`SUPA` provider.
- The adapter performs no network calls, timers, storage writes, patient mutation, or cloud queue behavior.
- Supabase CDN, `js/auth.js`, and `js/supabase.js` are not loaded by the Basic Offline shell.
- Future Auth, Supabase, Phase 2, and Phase 3 source files remain in the repository.
- Service Worker App Shell no longer precaches deferred cloud/security modules.
- Service Worker cache advanced to `anc-emr-v2-shell-31`.
- Local persistence, Backup/Restore, Dating, Summary, Risk, and UI behavior remain unchanged.
- No DB, schema, local-storage-shape, calculation, or migration change is introduced.

## Implementation Completed
- Added `js/basic_offline_adapter.js` with minimal offline `window.AUTH` and `window.SUPA` contracts.
- Removed Supabase CDN, `js/auth.js`, and `js/supabase.js` script loading from `index.html`.
- Loaded `js/basic_offline_adapter.js?v=1` before `js/app.js`.
- Updated Service Worker registration to `service-worker.js?v=31`.
- Updated the Service Worker cache to shell 31.
- Removed Auth/Supabase and deferred Phase 2/Phase 3 cloud/security modules from `APP_SHELL`.
- Added focused App Shell regression coverage.
- Updated Basic Offline runtime-isolation coverage to use the adapter contract for the offline fixture.
- Updated Phase 3 access-control UI coverage to confirm future source remains present but is not precached in the Basic Offline shell.

## Definition of Done
- [x] Supabase CDN is not loaded by the Basic Offline shell.
- [x] `js/auth.js` is not loaded by the Basic Offline shell.
- [x] `js/supabase.js` is not loaded by the Basic Offline shell.
- [x] Basic Offline adapter loads before `js/app.js`.
- [x] `AUTH` and `SUPA` globals remain available locally.
- [x] Adapter performs no network, timer, or storage-write work on evaluation.
- [x] Deferred cloud/Auth methods fail clearly if accidentally reached.
- [x] Service Worker cache advanced to shell 31.
- [x] Service Worker precaches the adapter.
- [x] Service Worker excludes Auth/Supabase/Phase 2/Phase 3 cloud/security modules.
- [x] Future online source remains in the repository.
- [x] Focused App Shell test passes.
- [x] Existing regression tests pass.
- [x] Manual browser/network validation completed.

## Manual Validation — Passed Locally
- Local Safari validation passed with Supabase CDN absent from Network.
- `js/auth.js` was absent from Network.
- `js/supabase.js` was absent from Network.
- `js/basic_offline_adapter.js` loaded before `js/app.js`.
- No `/token` or auth/session requests were observed.
- No Supabase/Auth errors were observed.
- No incremental-sync logs were observed.
- Local save and reload passed.
- Backup/Restore passed.
- Dating passed.
- Offline reload from Service Worker shell 31 passed.
- Local patient data remained available offline.
- Deployed Cloudflare revalidation remains required after commit, push, and deployment.

## Deferred Documentation Debt
- Reconcile `docs/STATE_SCHEMA.md` wording for `anc_incremental_sync_v1` with the Basic Offline 4B contract in a later documentation-only task.
