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
   - [x] Verify all cloud rows on Honor 400 and desktop — 2026-06-12.
   - [x] Build and test disabled Phase 2 production cloud adapter — 2026-06-12.
   - [x] Build and test disabled shared-key unlock and backup integration — 2026-06-12.
   - [x] Prepare guarded production activation and rollback transactions — 2026-06-12.
   - Review and explicitly approve Phase 2 activation.

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

5. [ ] WhatsApp pregnancy reminders and patient document intake
   - Connect the official WhatsApp Business Platform to the EMR.
   - Send consented reminders for important pregnancy events, counselling,
     procedures, laboratory tests, and follow-up appointments.
   - Recognize patient messages such as `#lab` and `#تحاليل`.
   - Securely associate each WhatsApp account with the correct patient record
     before accepting any document or clinical information.
   - Store incoming laboratory documents in a clinician-review queue rather
     than automatically accepting them as verified results.
   - Reply that the document was received and the doctor will review it.
   - Add opt-in, opt-out, message-template approval, audit logging, retention,
     access-control, and medical-privacy safeguards.

6. [ ] Redesign the frontend with clinic branding
   - Define the clinic name, logo, colors, typography, and Arabic/English use.
   - Apply the branding consistently to login, navigation, patient records,
     printed reports, backups, and the installed mobile experience.
   - Preserve accessibility, mobile usability, and fast clinical workflows.

7. [ ] Arabic patient pregnancy summary card accessed by QR code
   - Create a mobile-friendly Arabic, view-only pregnancy follow-up summary.
   - Generate a revocable QR link for each patient without exposing patient
     identifiers or reusable authentication secrets in the QR code.
   - Show only clinician-approved summary information and exclude internal
     notes or unnecessary medical data.
   - Add expiration, access logging, emergency revocation, screenshots/printing
     policy, and patient-consent controls.
   - Keep advertising isolated from medical records and assess healthcare,
     privacy, app-store, and advertising-program rules before adding ads.

## Completed

- [x] Owner-only Supabase login, TOTP MFA, and MFA-enforced RLS — 2026-06-11
- [x] Mobile clinical tables converted to stacked card layouts — 2026-06-10
- [x] Supabase cloud synchronization connection — 2026-06-10
