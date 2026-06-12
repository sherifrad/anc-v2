# ANC EMR Todo List

Ideas and future work stay in this list after completion. Mark completed items
with `[x]` and add the completion date; do not delete them.

## Active

1. [ ] Phase 3: biometric access, delegated users, and secure Android app
   - Priority: highest. Treat this as the next major mission.
   - Production-safety rule: Phase 3 development must not interrupt or change
     normal use of the active Phase 2 web app.
   - Keep unfinished Phase 3 features behind disabled feature flags and isolated
     database objects until they pass review and receive explicit approval.
   - Use additive migrations, tested rollback checkpoints, and staged releases;
     do not modify active patient ciphertext or the current Clinic Data Key.
   - [x] Design the security model and create a Phase 3 rollback checkpoint
     — 2026-06-12.
     - [x] Document the isolated delegated-access trust model — 2026-06-12.
     - [x] Draft blocked grant, key-envelope, and audit containers — 2026-06-12.
     - [x] Tag the verified Phase 2 production baseline before applying any
       Phase 3 database migration — 2026-06-12.
     - [x] Apply and verify the empty, owner-only Phase 3 foundation tables
       without enabling delegated access — 2026-06-12.
   - [ ] Remove obsolete legacy `allow_all` RLS policies before creating any
     temporary account; revoke anonymous attachment access and verify Phase 2
     row counts remain unchanged.
   - [ ] Add the reviewed Phase 3 foreign-key indexes before access-control
     records are created.
   - [ ] Enable Supabase leaked-password protection for authenticated users.
   - [ ] Add an owner-only access-control panel and immutable audit history.
   - [ ] Add temporary data-entry accounts with start time, expiry time,
     restricted permissions, MFA/passkey requirements, and immediate revocation.
   - [ ] Wrap the Clinic Data Key separately for each approved user/device;
     never reveal or share the owner clinic passphrase.
   - [ ] Enforce roles, expiry, and permissions in Supabase RLS and protected
     server functions, not only in the frontend.
   - [ ] Add web privacy deterrents: blur on background, short auto-lock,
     user/time watermarks, and role-based print/export restrictions.
   - [ ] Build and verify a native Android wrapper after delegated-access
     security passes, while keeping the current web app available.
   - [ ] Use Android Keystore-backed biometric key protection and secure local
     storage without exporting private device keys.
   - [ ] Enable Android screenshot/app-switcher protection for clinical screens.
   - [ ] Preserve Supabase authentication, MFA, RLS, AES-GCM encryption,
     shared-key recovery, audit logging, and rollback behavior.
   - [ ] Prepare for future commercial distribution: unique application ID,
     signed release builds, Play App Signing, privacy policy, consent and
     deletion workflows, crash reporting without PHI, dependency updates,
     staged releases, and store-policy review.
   - [ ] Keep advertising and analytics completely separated from authenticated
     medical records and prohibit PHI in ad, analytics, or crash-report events.
   - [ ] Add trusted-device biometric quick unlock only after the native Android
     wrapper and Keystore security have passed acceptance testing.
   - [ ] Add an owner-only trusted-device panel with device names, last use,
     expiration, and immediate revocation.
   - [ ] Keep the clinic passphrase and recovery code as emergency fallbacks.
   - [ ] Complete desktop, Honor 400, Android release-build, recovery, revoked
     user, expired user, offline, and rollback acceptance testing.

2. [x] Phase 2A shared encryption key across devices — 2026-06-12
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
   - [x] Review and explicitly approve Phase 2 activation — 2026-06-12.
   - [x] Apply and verify the authorized database activation transaction — 2026-06-12.
   - [x] Deploy and verify the enabled Phase 2 application runtime — 2026-06-12.
   - [x] Verify production reads on desktop and Honor 400 — 2026-06-12.
   - [x] Verify production writes for 10 patients and 40 related collections — 2026-06-12.

3. [ ] Automatic Supabase synchronization
   - Automatically push record changes after a configurable quiet period.
   - Avoid uploading on every keystroke.
   - Show pending, syncing, synced, and failed states.
   - Prevent concurrent syncs and preserve local changes when offline.

4. [ ] Full-screen installed mobile app
   - Investigate why the home-screen installation still displays browser UI.
   - Verify Android and iOS installation behavior separately.
   - Review manifest scope/start URL, standalone display mode, HTTPS deployment,
     service-worker control, and stale installed-app caches.

5. [ ] Ongoing SQL injection prevention and verification
   - Keep database access on structured Supabase/PostgREST operations.
   - Never concatenate user input into SQL, RPC names, table names, or operators.
   - Allowlist any application-selected table or column identifiers.
   - Review new database functions for dynamic SQL and fixed `search_path`.
   - Re-run injection-focused checks whenever cloud query code changes.

6. [ ] WhatsApp pregnancy reminders and patient document intake
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

7. [ ] Redesign the frontend with clinic branding
   - Define the clinic name, logo, colors, typography, and Arabic/English use.
   - Apply the branding consistently to login, navigation, patient records,
     printed reports, backups, and the installed mobile experience.
   - Preserve accessibility, mobile usability, and fast clinical workflows.

8. [ ] Arabic patient pregnancy summary card accessed by QR code
   - Create a mobile-friendly Arabic, view-only pregnancy follow-up summary.
   - Generate a revocable QR link for each patient without exposing patient
     identifiers or reusable authentication secrets in the QR code.
   - Show only clinician-approved summary information and exclude internal
     notes or unnecessary medical data.
   - Add expiration, access logging, emergency revocation, screenshots/printing
     policy, and patient-consent controls.
   - Keep advertising isolated from medical records and assess healthcare,
     privacy, app-store, and advertising-program rules before adding ads.

9. [ ] WHO Labour Care Guide and digital partograph module
   - Importance: very high.
   - Product direction: design for future commercial distribution, not only
     private clinic use.
   - Verify the implementation against the latest official WHO Labour Care
     Guide, implementation manual, and clinical documentation before design.
   - Confirm WHO content, name, logo, translation, adaptation, and distribution
     permissions before commercial publication.
   - Add structured labour examination points with configurable observation
     times and clinician identity.
   - Record fetal condition, maternal condition, labour progress, medications,
     fluids, supportive care, assessment, and agreed clinical plan.
   - Automatically chart cervical dilatation, descent, contractions, fetal
     heart rate, maternal observations, and other required trends.
   - Show missing observations, abnormal values, escalation prompts, and
     time-based reassessment reminders without replacing clinical judgment.
   - Preserve every correction as an auditable amendment rather than silently
     overwriting the original observation.
   - Support mobile bedside entry, offline-safe drafts, encrypted synchronization,
     printable reports, and role-based access.
   - Validate calculations, charts, terminology, alerts, and workflow with
     obstetric clinicians before any real-patient use.
   - Obtain legal and regulatory review for intended markets to determine
     whether the product is clinical documentation software, clinical decision
     support, or regulated software as a medical device.
   - Prepare versioned clinical specifications, risk management, validation
     evidence, change control, incident handling, and post-release monitoring.
   - Support secure multi-clinic tenancy, organization administration, data
     ownership, regional hosting, retention, export, deletion, and subscription
     controls without weakening encryption or tenant isolation.
   - Add a country-specific clinical-rules configuration section for labour
     definitions, observation intervals, alert thresholds, escalation criteria,
     and other authority-dependent guidance.
   - Provide validated, versioned rule packs for national health authorities,
     common Arab-region guidance, WHO guidance, and selected international
     obstetric organizations.
   - Store the issuing authority, source document, jurisdiction, publication
     date, effective date, version, language, evidence level, and review date
     with every rule pack.
   - Allow an authorized clinical administrator to select the applicable
     jurisdiction and rule pack; do not silently infer clinical rules from
     device location or language.
   - When no national guidance is configured, require an explicit choice from
     a labeled list of validated regional or international guidance rather than
     silently applying a default.
   - Show the active rule authority and version beside affected alerts and in
     printed clinical reports.
   - Preserve the rule pack used for each labour episode so later guidance
     updates cannot retrospectively change historical alerts or charts.
   - Require clinical review, approval, digital signing, and audit logging for
     rule activation, customization, replacement, and rollback.
   - Permit local threshold customization only for authorized governance roles,
     with a documented reason, approval workflow, bounds validation, and a
     visible "locally customized" label.
   - Test conflicting, missing, expired, withdrawn, and newly updated guidance,
     including the behavior of time-based alerts such as prolonged labour.
   - Add a clinician-facing "Current Situation" guidance tab that converts the
     active case data into a concise, prioritized, easy-to-read summary.
   - Organize guidance into: current assessment, important changes, missing
     information, what to do now, how to perform or arrange it, when to
     reassess, escalation triggers, and actions to avoid or reconsider.
   - Individualize the guidance using gestational age, labour stage and trend,
     maternal and fetal observations, risk factors, interventions, response,
     contraindications, allergies, available resources, and the active rule
     authority/version.
   - Support the guidance workspace with a specialized obstetric AI service,
     but keep deterministic validated rules responsible for hard thresholds,
     timers, contraindication checks, and emergency escalation triggers.
   - Require the AI to use only authorized case data and approved, versioned,
     cited clinical sources; show the supporting source and rule version beside
     each recommendation.
   - Make uncertainty, conflicting guidance, missing data, stale observations,
     and out-of-scope situations prominent; never invent absent clinical facts.
   - Require clinician review and explicit acceptance, modification, deferral,
     or rejection before an AI-supported recommendation enters the care plan.
   - Record the input snapshot, model/version, rule pack, retrieved sources,
     recommendation, clinician response, reason, and timestamp in an immutable
     audit record.
   - Never allow AI output to autonomously diagnose, prescribe, order treatment,
     discharge, or suppress an emergency alert.
   - Provide a clearly separated emergency view based on validated rules that
     remains available if the AI service is unavailable, slow, or offline.
   - Prevent patient identifiers and clinical content from being used for model
     training, advertising, general analytics, or third-party retention.
   - Validate recommendations with representative normal, abnormal, incomplete,
     conflicting, rare, and adversarial cases before any real-patient release.
   - Obtain clinical, legal, privacy, cybersecurity, and medical-device
     regulatory review for every intended commercial market.
   - Prepare Arabic and English localization, accessibility, privacy policy,
     terms, support process, and app-store disclosures.
   - Keep advertisements and commercial analytics outside authenticated
     clinical screens and prohibit transmission of patient data to them.
   - Keep this module isolated behind a disabled feature flag until clinical,
     security, usability, and recovery acceptance testing is complete.

## Completed

- [x] Owner-only Supabase login, TOTP MFA, and MFA-enforced RLS — 2026-06-11
- [x] Mobile clinical tables converted to stacked card layouts — 2026-06-10
- [x] Supabase cloud synchronization connection — 2026-06-10
