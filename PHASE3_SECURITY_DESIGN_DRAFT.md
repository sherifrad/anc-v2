# Phase 3 Security Design Draft

Status: owner-only grant commands, temporary-account provisioning, activation,
Auth containment, password-wrapped per-grant key release, and audited delegated
encrypted patient access are released. Generated credentials are final for
their selected validity period; the obsolete onboarding function is dormant.

Production baseline: `816a9e9 Fix Phase 2 production write trigger`

## Safety Boundary

- Phase 2 remains the production authentication, encryption, read, write, and
  recovery path until each Phase 3 capability is separately approved.
- Phase 3 uses additive tables, functions, and screens with separately reviewed
  release flags.
- Phase 3 work must not rewrite patient ciphertext or rotate the active Clinic
  Data Key.
- The owner account keeps uninterrupted access and the existing Phase 2
  rollback process.

## Roles

### Clinic Owner

- Creates, schedules, suspends, revokes, and reviews access grants.
- Chooses the permissions and expiry for each delegated user.
- Approves a separate encrypted Clinic Data Key envelope for each grant.
- Can view the complete security audit history.

### Temporary Data Entry

- Has no access unless a grant is active, within its time window, and the
  generated password has authenticated the exact managed staff identity.
- Receives only explicitly selected permissions.
- Cannot manage users, grants, devices, keys, backups, exports, or audit data.
- Cannot obtain the owner's clinic passphrase or recovery code.

## Initial Permission Set

- `patients.read`
- `patients.create`
- `patients.update`
- `related.read`
- `related.create`
- `related.update`
- `attachments.upload`

Delete, print, export, backup, key management, user management, and audit-log
access are excluded from the initial data-entry role.

## Access Grant Lifecycle

`draft -> active -> expired | suspended | revoked`

- The database evaluates `valid_from`, `valid_until`, status, user ID, owner
  ID, selected permission, and active key-envelope state for every protected
  operation. Owner activation requires a fresh TOTP proof.
- Browser controls are secondary safeguards and never replace RLS.
- Revocation blocks new database operations immediately.
- A user invitation must be created by a protected server function. The
  Supabase service-role key must never be included in browser code.

## Encryption

- The owner Clinic Data Key remains unchanged.
- Every approved grant receives a separate encrypted key envelope.
- The key envelope is bound to owner ID, grantee ID, grant ID, key version,
  purpose, and envelope format.
- Revoking a grant removes access to its envelope without exposing the owner
  passphrase.
- The generated account password derives a dedicated wrapping key using
  PBKDF2-SHA256 with 600,000 iterations. AES-256-GCM wraps the Clinic Data Key
  with owner, grantee, grant, and key-version binding.
- The browser unwraps the key after the active grant is verified. The server
  never receives the plaintext Clinic Data Key or patient plaintext.

## Audit

- Security events are append-only.
- Events include actor, target grant/user, action, result, timestamp, device
  hint, session assurance level, and non-PHI metadata.
- Updates and deletes are denied to normal application roles.
- Clinical record access and changes reference the active grant ID and are
  recorded in the same database transaction as each encrypted operation.
- Audit events must not contain plaintext patient data.
- Delegated audit events use a fixed server-only database function, so staff
  cannot choose another actor identity or unrestricted metadata. Denied
  attempts remain auditable after the grant expires.

## Owner Control Panel

The first disabled UI draft will show:

- Active, scheduled, expired, suspended, and revoked grants.
- User email/display name, role, permissions, start/end time, MFA readiness,
  last activity, and key-envelope status.
- Commands for invite, activate, suspend, revoke, and inspect audit history.
- Explicit confirmation for security-sensitive changes.

Implemented 2026-06-12:

- The owner/TOTP-gated panel reads grants, key-envelope readiness, and the
  append-only security audit.
- Empty-state, status filtering, release safeguards, and responsive mobile
  layouts are available.
- Grant creation and state-changing commands remain blocked in both the UI and
  application module.
- No temporary user can authenticate, unwrap a key, or access clinical data.

Owner-command draft prepared 2026-06-12:

- Draft grants require the owner account with TOTP, an existing non-owner
  Supabase user ID, allowlisted permissions, and a valid time window.
- Temporary grant windows are capped at 30 days in the draft and may be set to
  a much shorter duration.
- Overlapping non-terminal grants for the same user are rejected.
- Only suspension and irreversible revocation are drafted. Invitation,
  activation, reactivation, and key-envelope access remain unavailable.
- Direct grant changes and Phase 3 audit inserts are blocked by command-gate
  triggers; reviewed security-invoker functions must perform the transaction.

Applied and independently verified 2026-06-12:

- Public and anonymous roles cannot execute the owner commands.
- Calls without the clinic owner identity and `aal2` are rejected.
- Direct grant and audit writes are rejected by null-safe command gates.
- Adversarial checks left grants, envelopes, and Phase 3 audit at zero rows.
- Phase 2 remained unchanged at 10 patient rows and 40 related rows.

Owner panel commands connected 2026-06-12:

- The owner can create a draft grant for an existing Supabase user ID and
  choose allowlisted permissions plus a start and end time.
- Suspension and irreversible revocation require an explicit reason.
- The interface calls only the reviewed RPCs and cannot activate, invite, or
  release a key envelope.

Generated temporary-account draft prepared 2026-06-12:

- A JWT-protected Edge Function draft verifies the exact clinic owner, `aal2`,
  and a TOTP proof no older than ten minutes before using the server-only
  Supabase administrator client.
- The owner supplies a staff label, selected allowlisted permissions, and a
  validity window no longer than 30 days.
- The server generates an internal `ANC-XXXXXXXX` username and strong temporary
  password, creates a confirmed internal Auth account, and returns the
  credentials once. Passwords are never stored in application tables or audit.
- A guarded service-role command creates the temporary-account label, draft
  grant, and immutable `account.provisioned` audit event transactionally.
- If the audited grant cannot be created, the Edge Function deletes the new
  Auth account so an orphan login is not left behind.
- A separate disabled delegated gateway binds every clinical attempt to the
  authenticated user, checks grant status, time, permission, and key-envelope
  readiness, then appends success or denial before any future clinical handler.
- Malformed actions and resource types are recorded as denied invalid requests
  instead of failing before the audit boundary.
- Authorization and action completion use the same correlation ID. Every
  future clinical handler must perform the encrypted data operation and append
  its final success/failure audit result in one database transaction; an
  authorization event alone is not proof that the write completed.
- Expired attempts are retained as denied audit events. A scheduled
  service-role command also marks due grants expired and appends
  `grant.expired`, even when the account has no further activity.
- A non-browser Edge Function draft requires a server secret and invokes only
  that expiry command. Deployment must keep platform JWT checking disabled for
  the secret-key call while retaining the function's explicit secret
  authentication.
- Authenticated login, logout, MFA enrollment, password change, and clinical
  actions are included in the gateway event allowlist. Attempts that fail
  before a user can be cryptographically identified remain in Supabase Auth
  logs; the application audit never guesses an actor identity.
- Resource identifiers are stored in audit only as SHA-256 fingerprints.
  Plaintext patient data, generated passwords, and encryption keys are
  prohibited from audit metadata.
- Account provisioning, delegated clinical handlers, key release, and
  activation remain disabled and undeployed.

Independent review blockers found 2026-06-12:

- The current production authentication router is owner-only and correctly
  rejects generated temporary accounts. A separate temporary-account route is
  required before deployment.
- The login form must translate `ANC-XXXXXXXX` to the internal Auth email
  without displaying or disclosing that internal identifier.
- Generated credentials are final for the selected temporary validity period.
  Temporary staff do not replace the password or enroll TOTP; owner approval
  remains required before activation.
- Grant expiry blocks every delegated operation and remains auditable, but Auth
  account banning and session revocation need a separately reviewed command.

Temporary staff login route finalized 2026-06-13:

- Generated `ANC-XXXXXXXX` usernames are translated locally to the private
  internal Auth address when temporary-account provisioning is enabled. Owner
  email login is unchanged.
- Session routing trusts the exact owner ID or server-controlled
  `app_metadata`; user-editable metadata cannot identify or authorize staff.
- First login uses the generated credentials and goes directly to the
  owner-approval waiting screen without password replacement or staff TOTP.
- Provisioning marks the temporary identity as invited and records that the
  generated credentials are final. The access grant remains `draft`, delegated
  operations remain disabled, and no key envelope is created or released.
- The former password-replacement Edge Function is disabled. This removes the
  refresh-token invalidation that could interrupt the temporary login.
- The password, patient identifiers, and encryption keys are never
  written to the application audit.
- The direct-credential migration and provisioning function are deployed only
  after their independent checks pass.

Disabled Auth account containment prepared 2026-06-13:

- Manual suspension and revocation move through an owner-only Edge Function
  that requires the exact clinic owner and a TOTP proof no older than ten
  minutes.
- The database grant is blocked and immutably audited before the Auth
  administrator call. This makes patient access fail closed even if Auth is
  temporarily unavailable.
- The server applies a long Auth ban to managed temporary accounts after
  suspension, revocation, or expiry. This prevents new sign-ins and refresh
  attempts.
- Supabase access JWTs can remain cryptographically valid until their expiry.
  Delegated clinical operations therefore continue checking the current grant
  state on every request and never treat an Auth ban alone as authorization.
- Successful and failed Auth containment attempts are appended as
  `account.auth_containment` events. Audit metadata contains only the reason,
  failure code, and containment state; it excludes tokens, passwords, keys,
  and patient identifiers.
- A database containment gate rejects managed-account transitions to expired,
  suspended, or revoked unless they originate from the reviewed containment
  command. The older direct owner RPC cannot silently bypass the Auth ban.
- The server-secret expiry worker retries Auth containment for expired,
  suspended, and revoked accounts that do not have a successful containment
  timestamp.
- Suspension remains non-reactivatable in this release. A future reviewed
  reactivation flow must explicitly unban Auth, issue a new validity window,
  and create or revalidate a per-user key envelope.
- The containment SQL, owner endpoint, scheduler changes, and feature flag
  remain disabled and undeployed.

Production migration review completed 2026-06-13:

- `supabase_phase3_temporary_accounts.sql` is the first reviewed migration. It
  creates the empty owner-readable identity table and service-role-only
  provisioning, onboarding, authorization, result-audit, and expiry commands.
- `supabase_phase3_account_containment.sql` is the second reviewed migration.
  It adds Auth-containment state, the managed-account transition gate, manual
  containment commands, result audit, and scheduled retry discovery.
- Both migrations use `SECURITY INVOKER`, fixed empty search paths, explicit
  execution revocation from public/anonymous/authenticated roles, and no
  dynamic SQL.
- The migrations do not alter Phase 2 ciphertext tables, the active Clinic
  Data Key, or existing patient records. No key envelope is created.
- `supabase_phase3_temporary_security_verify.sql` checks the table, RLS,
  owner policy, command gates, function count, role privileges, empty Phase 3
  state, and the 10-patient/40-related-row production baseline.
- `supabase_phase3_temporary_security_rollback_DRAFT.sql` refuses rollback if
  any Phase 3 account, grant, envelope, or audit data exists, or if the Phase 2
  baseline has changed. It does not delete Auth users.
- Apply order is foundation, containment, then read-only verification. Edge
  Functions and all temporary-account flags remain disabled until a separate
  deployment review.

Production migrations applied and verified 2026-06-13:

- The temporary-account foundation and Auth-containment migrations were
  applied in the reviewed order.
- The temporary-account table has RLS enabled and one owner/TOTP read policy.
- All three distinct command-gate trigger names are present. PostgreSQL exposes
  the multi-event table gate as separate trigger-event rows, so verification
  counts distinct trigger names.
- Eight reviewed security functions are installed with fixed search paths.
- Anonymous and authenticated roles cannot execute provisioning or containment;
  only the server role can execute those commands.
- Temporary accounts, grants, key envelopes, and Phase 3 audit remain at zero
  rows. Phase 2 remains at 10 patient rows and 40 related rows.
- All five reviewed Edge Functions were deployed on 2026-06-13 with Supabase
  platform JWT checking disabled and explicit `@supabase/server`
  authentication inside each function. All temporary-account feature flags
  remain disabled.
- Deployment review added a separate disabled-by-default environment switch
  inside every Edge Function. Browser flags therefore cannot accidentally make
  a deployed endpoint live. Each capability requires both its browser release
  flag and its exact server environment switch to be deliberately enabled.
- Live POST probes returned `503` with the expected disabled response from
  provisioning, onboarding, containment, delegated gateway, and expiry.
  Temporary accounts, grants, key envelopes, and Phase 3 audit remained at
  zero rows; Phase 2 remained at 10 patient and 40 related rows.

Temporary delegated access released 2026-06-13:

- Account generation and activation are one owner/TOTP-approved action. The
  final username and password remain visible until the owner confirms they
  were saved.
- Temporary staff use only the generated username and password. There is no
  password-change, staff-TOTP, activation-code, or waiting screen.
- A per-grant password-wrapped Clinic Data Key envelope is created only after
  provisioning succeeds. Failed activation does not display usable credentials.
- Every encrypted patient or related-record read/write goes through the
  authenticated delegated gateway and a server-only atomic database function.
- The database rechecks grant status, validity window, selected permission,
  active migration batch, and key envelope on every operation. Direct clinical
  table RLS remains owner-only.
- Delete, export, print, backup, key management, user management, and security
  audit access remain unavailable to temporary staff.
- Automated encryption, authorization, SQL, endpoint, and UI tests passed.
  Mobile verification at 393 x 873 and desktop verification at 1280 x 720 had
  no horizontal page overflow or browser console errors.
- Live endpoint probes rejected unauthenticated activation with `403` and
  unauthenticated delegated access with `401`; CORS allows only the clinic app
  origin.
- Final verification found zero temporary accounts, grants, key envelopes, or
  Phase 3 audit rows before the owner creates the first real account. Phase 2
  remained unchanged at 10 patient rows and 40 related rows.

## Acceptance Gates

1. Existing owner login, unlock, reads, writes, backup, and recovery pass.
2. Empty Phase 3 tables have RLS and no anonymous access.
3. Non-owner sessions cannot read owner grants or audit records.
4. Expired, suspended, and revoked grants fail at the database layer.
5. Missing MFA fails at the database layer.
6. Data-entry permissions cannot delete, export, print, manage users, or read
   key material outside their own active envelope.
7. Revocation is verified on desktop and Honor 400.
8. Rollback removes Phase 3 objects without changing Phase 2 patient data.

## Current Decision

Use database-backed grants and permissions as the immediate authority. Custom
JWT claims may later improve performance and UI routing, but grant status and
expiry must still be checked against current database state so revocation does
not depend on waiting for an old token to expire.
