# ANC EMR Todo List

Ideas and future work stay in this list after completion. Mark completed items
with `[x]` and add the completion date; do not delete them.

## Active

1. [ ] Phase 2A shared encryption key across devices
   - Create and verify the Phase 1 rollback backup before migration.
   - Generate one random Clinic Data Key.
   - Wrap the key with the clinic passphrase and a separate recovery key.
   - Migrate cloud records without losing the Phase 1 ciphertext backup.
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

## Completed

- [x] Owner-only Supabase login, TOTP MFA, and MFA-enforced RLS — 2026-06-11
- [x] Mobile clinical tables converted to stacked card layouts — 2026-06-10
- [x] Supabase cloud synchronization connection — 2026-06-10
