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
   - [x] Remove obsolete legacy `allow_all` RLS policies before creating any
     temporary account; revoke anonymous attachment access and verify Phase 2
     row counts remain unchanged — 2026-06-12.
   - [x] Add the reviewed Phase 3 foreign-key indexes before access-control
     records are created — 2026-06-12.
   - [ ] Enable Supabase leaked-password protection for authenticated users.
     - Blocked on the Supabase Pro plan; the free tier does not provide this
       setting. Keep the app's stronger local password policy meanwhile.
   - [x] Add an owner-only access-control panel and immutable audit history
     — 2026-06-12.
     - [x] Build the owner/TOTP-gated read-only panel preview with grant,
       key-envelope, audit, and release-safeguard states — 2026-06-12.
     - [x] Add reviewed server functions for owner grant commands before
       enabling create, activate, suspend, or revoke actions.
       - [x] Draft owner/TOTP-gated commands for draft creation, suspension,
         and irreversible revocation with command-gated audit writes
         — 2026-06-12.
       - [x] Review and apply the owner-command migration, including
         adversarial direct-write tests and the null-safe command-gate
         correction — 2026-06-12.
       - [x] Add owner/TOTP-gated activation with a password-wrapped per-user
         key envelope and an audited delegated server gateway — 2026-06-13.
       - [x] Prepare a disabled, owner/TOTP-protected Edge Function draft for
         generated temporary usernames and one-time displayed passwords
         — 2026-06-12.
         - [x] Add guarded account records, draft grants, immutable provisioning
           audit, rollback cleanup, and a five-per-hour creation limit
           — 2026-06-12.
         - [x] Add a disabled audited delegated-operation gateway that records
           allowed and denied attempts, including attempts after expiry, using
           hashed resource identifiers — 2026-06-12.
         - [x] Add a scheduled expiry command draft that records
           `grant.expired` even without further user activity — 2026-06-12.
         - [x] Add a server-secret-only expiry endpoint draft for future
           scheduled execution — 2026-06-12.
       - [x] Independently review generated credential handover, the
         owner-approved password-only staff decision, account banning, expiry
         scheduling, and delegated-action audit coverage before deployment
         — 2026-06-13.
         - [x] Identify owner-only login routing, username translation,
           transactional action-result audit, and account-ban/session-revocation
           blockers — 2026-06-12.
         - [x] Add denied audit events for malformed delegated requests and
           correlated final result events for authorized actions — 2026-06-12.
         - [x] Build a temporary-account login route that accepts the generated
           credentials directly and stops at the owner-activation waiting
           state; staff TOTP and first-login password replacement were removed
           by owner decision — 2026-06-13.
           - [x] Translate generated usernames to private internal Auth
             identifiers without exposing the internal domain — 2026-06-13.
           - [x] Trust only server-controlled Auth app metadata when routing a
             temporary account — 2026-06-13.
           - [x] Make the generated password final for the selected temporary
             validity period, eliminating the refresh-token failure caused by
             server-admin password replacement; owner TOTP remains unchanged
             — 2026-06-13.
         - [x] Keep the grant in draft, delegated access disabled, and key
             release blocked while waiting for owner approval — 2026-06-13.
         - [x] Draft account-ban and refresh-session containment commands for
           expiry, suspension, and revocation — 2026-06-13.
           - [x] Block the live grant before attempting any Auth administrator
             operation, so an Auth or network failure cannot restore clinical
             access — 2026-06-13.
           - [x] Require the exact owner identity and a TOTP proof no older
             than ten minutes for manual suspension or revocation
             — 2026-06-13.
           - [x] Ban the managed Auth account server-side to prevent new
             sign-ins and refreshes, while continuing to reject any unexpired
             JWT through live grant checks — 2026-06-13.
           - [x] Audit successful and failed Auth containment without storing
             tokens, passwords, keys, or patient identifiers — 2026-06-13.
           - [x] Add a database command gate preventing the older direct owner
             RPC from bypassing Auth containment for managed accounts
             — 2026-06-13.
           - [x] Add scheduled retry for expired, suspended, or revoked
             accounts whose Auth containment is incomplete — 2026-06-13.
           - [x] Independently review the temporary-account foundation and
             containment SQL, including privileges, RLS, command gates,
             verification, and empty-state rollback — 2026-06-13.
           - [x] Apply the two reviewed SQL migrations in order and run the
             read-only verification before deploying any Edge Function
             — 2026-06-13.
           - [x] Deploy the onboarding, containment, provisioning, delegated
             gateway, and expiry Edge Functions before enabling any flag
             — 2026-06-13.
             - [x] Add independent server-side disabled-by-default switches to
               all five functions before deployment — 2026-06-13.
             - [x] Probe every live endpoint and verify each returns disabled;
               confirm empty Phase 3 state and unchanged Phase 2 row counts
               — 2026-06-13.
     - [x] Connect the panel to protected draft, suspend, and revoke commands
       with explicit confirmations and mobile-safe forms — 2026-06-12.
   - [x] Add temporary data-entry accounts with start time, expiry time,
     restricted permissions, owner TOTP approval, and immediate revocation
     — 2026-06-13.
     - [x] Replace the owner-facing legacy Supabase user-ID field with the
       generated temporary-account workflow, kept locked behind its disabled
       release flag — 2026-06-13.
     - [x] Release generated account provisioning with direct generated
       credentials and Auth containment while keeping patient access and key
       release disabled; retire the unnecessary staff onboarding function
       — 2026-06-13.
     - [x] Combine account creation and activation into one owner action; show
       the final username and password only after activation succeeds
       — 2026-06-13.
     - [x] Let temporary staff sign in directly with the generated credentials,
       without password replacement, staff TOTP, or an activation-code screen
       — 2026-06-13.
     - [x] Audit successful and denied delegated reads and writes atomically,
       including attempts after expiry, without storing plaintext patient data
       — 2026-06-13.
   - [x] Wrap the Clinic Data Key separately for each approved temporary grant;
     never reveal or share the owner clinic passphrase — 2026-06-13.
   - [x] Enforce roles, expiry, and permissions in protected server functions
     with owner-only direct RLS, not only in the frontend — 2026-06-13.
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

2. [ ] Urgent clinical workflow and readability redesign
   - Priority: urgent. Review and implement in staged releases without
     interrupting the active clinical app or changing existing records.
   - Start with a backup, data-model compatibility review, mobile mockups, and
     owner approval before changing the production interface.
   - [ ] Expand patient history.
     - Add structured medical, surgical, medication, allergy, and family
       history sections.
     - Show ABO/Rh in laboratory planning only when it is absent from patient
       history.
   - [ ] Redesign obstetric history and calculations.
     - Correct alignment and responsive behavior of TPAL, previous-pregnancy
       history, and obstetric calculations.
     - Add one structured row/card for every previous pregnancy, including
       year, gestational age, outcome, delivery mode, indication, place,
       maternal complications, neonatal outcome, birth weight, sex, and notes.
     - Add detailed delivery types suitable for multiparous patients.
     - Add previous fetal malformation/congenital-anomaly history.
     - When anomaly history is positive, show an Egypt-relevant reviewed list
       plus searchable manual entry; retain the exact source terminology.
   - [ ] Improve visual comfort and clinical scanability.
     - Increase text contrast and use a calm, high-legibility font, spacing,
       hierarchy, and color system that remains clear in bright clinic light.
     - Avoid faint text and color-only meaning; pair every state color with a
       symbol and accessible label.
     - Review the design against the owner's stated visual needs and eye
       examination, while also meeting standard accessibility contrast and
       text-size requirements.
     - Keep the workflow easy to follow, easy to track, and mobile friendly.
   - [ ] Rebuild laboratory tracking as a compact configurable system.
     - Use one clinically meaningful specimen/result date per test entry.
     - Remove the separate persistent pending badge; use compact pending and
       completed symbols with accessible text/tooltips.
     - Automatically flag high, low, positive, negative, normal, abnormal, and
       critical results from reviewed reference rules; show an upper alert
       summary for abnormalities and never rely on color alone.
     - Group urinalysis into one expandable row/category with selectable
       protein, glucose, ketones, nitrite, leukocytes/pus cells, blood/RBCs,
       bacteria/bacilli, culture, and manual additional results.
     - First-trimester default review: remove Rubella IgG, VDRL/RPR, folate,
       vitamin B12, and indirect Coombs; conditionally show ABO/Rh only when
       missing from history.
     - Second-trimester default review: remove routine OGTT; recommend reviewed
       glucose testing only when its configured indication is met, and display
       fasting, one-hour, and two-hour values compactly in one glucose row when
       ordered.
     - Keep second-trimester urine results in one urinalysis row.
     - If proteinuria is positive, offer an owner-approved PET panel containing
       configurable tests such as protein/creatinine ratio, albumin/creatinine
       ratio, serum albumin, serum creatinine, CBC/platelets, and other locally
       approved investigations.
     - Remove routine AFP, PAPP-A, and free beta-hCG; offer them only through
       reviewed indication rules such as relevant scan findings, previous
       congenital anomaly, or recurrent pregnancy loss.
     - Third-trimester default review: remove postprandial glucose, AST, and
       ALT; group PT, aPTT, INR, and the platelet count sourced from CBC under
       one coagulation-profile row.
     - Allow multiple tests to be collected in reusable named categories such
       as PET panel and coagulation profile.
     - Add an `X` control to hide/remove a predefined test for the current
       patient. After saving, separately ask whether the layout change should
       become a future default.
     - Preserve existing saved laboratory data even when a test is removed
       from future defaults.
     - Treat all clinical prompts and reference ranges as versioned,
       configurable rules requiring clinical review; never silently diagnose.
   - [ ] Add clinician-approved adaptive templates.
     - Detect repeated owner-entered test/procedure combinations for similar
       cases, such as PET, without making autonomous clinical changes.
     - Suggest creating or applying a reusable template only after a meaningful
       repeated pattern; show the evidence and require explicit owner approval.
     - Support create, name, edit, version, disable, and audit operations for
       templates. Never train on or export patient-identifying information.
   - [ ] Redesign follow-up visits and medication entry.
     - Remove horizontally or internally scrollable follow-up-visit text.
     - Replace free-text medication entry with repeatable rows containing trade
       name, dose, packet/strip quantity, duration in days, and Arabic input.
       Pressing Enter adds another medication row.
     - Build the laboratory summary automatically from structured results with
       compact normal/abnormal status and high/low arrows.
     - Build the examination/ultrasound summary from structured scan data,
       highlight calculated abnormalities, and retain a manual text addition.
     - Do not show all three ultrasound sections by default; let the clinician
       add only the scans needed for the current patient.
   - [ ] Replace cramped text areas with progressive disclosure.
     - Let short content expand to its natural height without internal
       scrolling.
     - For long content, show a readable preview around 120 characters with
       `Show more` and `Show less`, while keeping full text available for edit,
       print, and export.
   - [ ] Make a read-only clinical summary the default patient view.
     - On opening a case, show a concise longitudinal summary containing
       identity, pregnancy calculations, risks, history, current medications,
       recent visits, abnormal labs, scans, and pending actions.
     - Add clear `Edit` and `Add` actions that open the relevant focused editor
       rather than forcing the clinician through one long form.
     - Keep a separate printable version generated from the same structured
       data; do not use the print layout itself as the primary interactive
       screen.
     - Verify desktop and Honor 400 workflows, keyboard entry, Arabic text,
       no unintended horizontal scrolling, and preservation of all existing
       patient data.

3. [x] Phase 2A shared encryption key across devices — 2026-06-12
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

4. [ ] Automatic Supabase synchronization
   - Automatically push record changes after a configurable quiet period.
   - Avoid uploading on every keystroke.
   - Show pending, syncing, synced, and failed states.
   - Prevent concurrent syncs and preserve local changes when offline.

5. [ ] Full-screen installed mobile app
   - Investigate why the home-screen installation still displays browser UI.
   - Verify Android and iOS installation behavior separately.
   - Review manifest scope/start URL, standalone display mode, HTTPS deployment,
     service-worker control, and stale installed-app caches.

6. [ ] Ongoing SQL injection prevention and verification
   - Keep database access on structured Supabase/PostgREST operations.
   - Never concatenate user input into SQL, RPC names, table names, or operators.
   - Allowlist any application-selected table or column identifiers.
   - Review new database functions for dynamic SQL and fixed `search_path`.
   - Re-run injection-focused checks whenever cloud query code changes.

7. [ ] WhatsApp pregnancy reminders and patient document intake
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

8. [ ] Redesign the frontend with clinic branding
   - Define the clinic name, logo, colors, typography, and Arabic/English use.
   - Apply the branding consistently to login, navigation, patient records,
     printed reports, backups, and the installed mobile experience.
   - Preserve accessibility, mobile usability, and fast clinical workflows.

9. [ ] Arabic patient pregnancy summary card accessed by QR code
   - Create a mobile-friendly Arabic, view-only pregnancy follow-up summary.
   - Generate a revocable QR link for each patient without exposing patient
     identifiers or reusable authentication secrets in the QR code.
   - Show only clinician-approved summary information and exclude internal
     notes or unnecessary medical data.
   - Add expiration, access logging, emergency revocation, screenshots/printing
     policy, and patient-consent controls.
   - Keep advertising isolated from medical records and assess healthcare,
     privacy, app-store, and advertising-program rules before adding ads.

10. [ ] WHO Labour Care Guide and digital partograph module
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

11. [ ] Detailed previous-delivery history
   - This requirement is now also tracked as part of urgent item 2; keep this
     original item for history until the shared implementation is completed.
   - Add a structured section for the number and types of previous deliveries,
     rather than relying only on the TPAL summary.
   - Record each delivery separately, including year/date, gestational age,
     term or preterm status, mode of delivery, indication for operative
     delivery, place of delivery, and plurality.
   - Support spontaneous vaginal delivery, assisted vaginal delivery, planned
     cesarean, emergency cesarean, VBAC, and other clinically relevant types.
   - Record maternal complications, neonatal sex, birth weight, live birth or
     loss, neonatal complications, NICU admission, and free clinical notes.
   - Automatically calculate and cross-check parity and delivery totals against
     TPAL while allowing the clinician to resolve discrepancies explicitly.
   - Preserve edits as auditable clinical-history corrections and include the
     summarized delivery history in reports and future risk assessment.
   - Optimize entry and review for mobile use without horizontal scrolling.

## Non-Urgent Follow-Up After Stabilization

- [ ] medication duplicated-unit formatting polish
- [ ] medication pattern manager
- [ ] problem dashboard counts
- [ ] problem PDF section
- [ ] medication PDF section
- [ ] medication dashboard flags
- [ ] cloud sync expansion for medications/problems
- [ ] audit refinement and audit viewer
- [ ] archive history refinement
- [ ] UUID Phase 2
- [ ] service-worker cache bump only at final packaging

## Completed

- [x] Owner-only Supabase login, TOTP MFA, and MFA-enforced RLS — 2026-06-11
- [x] Mobile clinical tables converted to stacked card layouts — 2026-06-10
- [x] Supabase cloud synchronization connection — 2026-06-10
