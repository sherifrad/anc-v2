# Phase 3 Security Design Draft

Status: owner-only grant commands implemented. Generated temporary accounts,
key release, and delegated access remain disabled.

Production baseline: `816a9e9 Fix Phase 2 production write trigger`

## Safety Boundary

- Phase 2 remains the production authentication, encryption, read, write, and
  recovery path until each Phase 3 capability is separately approved.
- Phase 3 uses additive tables, functions, and screens behind disabled feature
  flags.
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
  session has completed MFA.
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

`draft -> invited -> active -> expired | suspended | revoked`

- The database evaluates `valid_from`, `valid_until`, status, user ID, owner
  ID, permission, and MFA for every protected operation.
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
- The first release will not support shared passwords or plaintext key export.
- The empty-container foundation exposes envelopes only to the owner. Grantee
  access remains disabled until a dedicated, tested authorization function is
  reviewed.

## Audit

- Security events are append-only.
- Events include actor, target grant/user, action, result, timestamp, device
  hint, session assurance level, and non-PHI metadata.
- Updates and deletes are denied to normal application roles.
- Clinical record access and changes will later reference the active grant ID.
- Audit events must not contain plaintext patient data.
- The empty-container foundation permits audit inserts only from the owner with
  MFA. Delegated audit events will later use a fixed database function so users
  cannot choose another actor identity or unrestricted metadata.

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
- First login must require TOTP enrollment and a password change before a
  grant can move from draft to active.
- Grant expiry blocks every delegated operation and remains auditable, but Auth
  account banning and session revocation need a separately reviewed command.

Disabled staff onboarding route prepared 2026-06-13:

- Generated `ANC-XXXXXXXX` usernames are translated locally to the private
  internal Auth address only when both temporary-account feature flags are
  enabled. Owner email login is unchanged while the flags remain disabled.
- Session routing trusts the exact owner ID or server-controlled
  `app_metadata`; user-editable metadata cannot identify or authorize staff.
- First login requires TOTP enrollment or challenge before the temporary
  password can be replaced.
- Password replacement is performed by a JWT-protected Edge Function after it
  reloads authoritative Auth user metadata and verifies a recent TOTP proof.
- The server records `account.onboarding_completed` in the immutable audit and
  marks only the temporary identity as invited. The access grant remains
  `draft`, delegated operations remain disabled, and no key envelope is
  created or released.
- Partial completion fails closed. A changed password with pending audit cannot
  unlock access, and the audited server command supports a safe retry if final
  Auth metadata refresh is interrupted.
- The password, TOTP secret, patient identifiers, and encryption keys are never
  written to the application audit.
- The SQL migration and both Edge Functions remain drafts and are not deployed.

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
