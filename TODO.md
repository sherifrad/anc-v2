# ANC EMR Todo List

Ideas and future work stay in this list after completion. Mark completed items
with `[x]` and add the completion date; do not delete them.

## Active

1. [ ] Phase 2A shared encryption key across devices
   - [x] Create and verify the Phase 1 rollback backup — 2026-06-11.
   - [x] Review the disabled key-vault SQL and shared-key crypto draft — 2026-06-11.
   - [x] Benchmark 600,000 PBKDF2 iterations on desktop and Honor 400 — 2026-06-11.
   - [x] Create the empty owner-only, MFA-protected key vault — 2026-06-11.
   - [x] Verify vault RLS, owner policy, MFA policy, and zero rows — 2026-06-11.
   - [x] Test isolated key enrollment and recovery confirmation — 2026-06-11.
   - [x] Generate and store one wrapped Clinic Data Key — 2026-06-11.
   - [x] Verify passphrase and recovery code unlock the stored key — 2026-06-11.
   - [x] Create and verify empty owner/MFA-protected shadow tables — 2026-06-11.
   - [x] Add guarded failed-draft rollback cleanup — 2026-06-11.
   - [x] Build and test ciphertext-only migration package workflow — 2026-06-11.
   - [x] Stage and deep-verify encrypted shadow copies — 2026-06-11.
   - [x] Independently download and verify all staged cloud rows — 2026-06-11.
   - Verify decryption on mobile and desktop before completion.

2. [ ] Automatic Supabase synchronization
   - Automatically push record changes after a configurable quiet period.
   - Avoid uploading on every keystroke.
   - Show pending, syncing, synced, and failed states.
   - Prevent concurrent syncs and preserve local changes when offline.

3. [ ] Full-screen installed mobile app
   - Investigate why the home-screen installation still displays browser UI.
   - Verify Android and iOS installation behavior separately.
   - Review manifest scope/start URL, standalone display mode, HTTPS deployment,
     service-worker control, and stale installed-app caches.

4. [ ] Ongoing SQL injection prevention and verification
   - Keep database access on structured Supabase/PostgREST operations.
   - Never concatenate user input into SQL, RPC names, table names, or operators.
   - Allowlist any application-selected table or column identifiers.
   - Review new database functions for dynamic SQL and fixed `search_path`.
   - Re-run injection-focused checks whenever cloud query code changes.

## Completed

- [x] Owner-only Supabase login, TOTP MFA, and MFA-enforced RLS — 2026-06-11
- [x] Mobile clinical tables converted to stacked card layouts — 2026-06-10
- [x] Supabase cloud synchronization connection — 2026-06-10
