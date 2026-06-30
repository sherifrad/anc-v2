# Current Task
**Active Task:** Micro-Slice 4B — Basic Offline Hard Runtime Isolation
**Epic:** EPIC-001 Basic Offline Release
**Feature:** FEATURE-004 Stabilization Sprint
**Status:** Completed — Ready for Commit

## Objective
Enforce the Basic Offline runtime gate so the app does not create Supabase/Auth clients, probe sessions/tokens, queue cloud snapshots, schedule incremental-sync workers, bind cloud event listeners, or emit incremental-sync noise while Release 1 offline mode is active.

## Architectural Decisions
- `basicOfflineReleaseActive()` is the runtime source of truth.
- Future Auth, Supabase, Phase 2, and incremental-sync code remains in the repository.
- Basic Offline mode makes automatic cloud paths unreachable at runtime.
- Local persistence, Backup/Restore, Dating, Summary, and Risk behavior remain unchanged.
- No schema, DB storage-shape, or migration change is introduced.

## Definition of Ready — Met
- Supabase Runtime Isolation Audit was accepted.
- Startup token/session requests were traced to sync-status probing.
- Incremental-sync queueing and cloud listeners were traced.
- Basic Offline source of truth already exists in `js/app.js`.
- The correction boundary is limited to runtime gating and focused regression coverage.

## Implementation Completed
- Startup sync status no longer calls `SUPA.isOnline()` in Basic Offline mode.
- Online, focus, and visibility cloud listeners are not bound in Basic Offline mode.
- Local save no longer creates `anc_incremental_sync_v1` pending cloud snapshots in Basic Offline mode.
- Incremental-sync debounce and workers do not schedule or run in Basic Offline mode.
- Cloud patient refresh and cloud index refresh return without Supabase calls in Basic Offline mode.
- Incremental-sync log noise is suppressed in Basic Offline mode.
- Focused VM regression coverage was updated for Basic Offline runtime isolation.
- Dedicated addendum coverage was added in `js/basic_offline_runtime_isolation.test.mjs` and passed.
- The addendum proves Basic Offline isolation without modifying runtime code.
- The addendum also proves future online functions remain present when the Basic Offline gate is disabled in the test fixture.

## Definition of Done
- [x] No Supabase online probe is made by sync status in Basic Offline mode.
- [x] No automatic cloud event listeners are bound in Basic Offline mode.
- [x] No pending cloud-sync snapshot is created after local save in Basic Offline mode.
- [x] No incremental-sync debounce or worker is scheduled in Basic Offline mode.
- [x] No cloud patient or index refresh is attempted in Basic Offline mode.
- [x] No incremental-sync log noise is emitted in Basic Offline mode.
- [x] Local persistence remains active.
- [x] Future online code remains present but gated.
- [x] Focused regression test passes.
- [x] Dedicated Basic Offline runtime-isolation test passes.
- [x] Manual browser validation completed.

## Manual Browser Validation — Passed Locally
- Local Safari validation passed with no `/token` requests.
- No Supabase auth/session requests were observed.
- No `AuthRetryableFetchError` was observed.
- No `TypeError: Load failed` from Supabase was observed.
- No incremental-sync logs were observed.
- No cloud activity occurred on focus, online, visibility, or Patient Database navigation.
- Local save and reload passed.
- Backup/Restore passed.
- Dating passed.
- Deployed Cloudflare revalidation remains required after commit, push, and deployment.
- External script/App Shell cleanup remains deferred to Micro-Slice 4C.
