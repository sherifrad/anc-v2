# Phase 3 Security Design Draft

Status: owner-only read preview implemented. Grant mutations and delegated access
remain disabled.

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
