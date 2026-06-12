# ANC EMR Security Review

Last reviewed: 2026-06-12

## Current Protection

- Cloud sync records are encrypted in the browser before being sent to Supabase.
- Encrypted backups are protected with AES-GCM when the app is unlocked.
- The encryption key is derived from the clinic password with PBKDF2-SHA256.
- The lock bypass is hidden after encryption has been configured.
- Supabase email/password authentication permits only the configured clinic owner UID.
- TOTP verification upgrades the session to `aal2` before the app opens.
- Supabase RLS requires both the owner UID and `aal2` for EMR table access.
- The anonymous role has no privileges on patients, visits, scans, procedures, labs, or audit logs.
- Supabase sync errors distinguish connection, authorization, and table/policy failures.
- Patient-entered text is escaped in the main table/card renderers to reduce accidental HTML injection.
- Phase 2 shared-key cloud reads, writes, and backups are implemented behind
  two disabled production flags.
- Phase 2 activation and rollback SQL drafts stop immediately unless their
  explicit safety guards are deliberately removed.
- New Phase 2 database access uses structured Supabase queries with fixed,
  allowlisted table and record types.

## Important Limitations

- Local working data in `localStorage` is not fully encrypted at rest yet because the current DB layer is synchronous while Web Crypto is asynchronous.
- The displayed security code is not a working password-recovery mechanism.
- Cloudflare Access protects the web app URL, but it does not protect the Supabase REST endpoint by itself.
- Attachments are stored in browser storage and can use significant space.
- Phase 2 is approved for activation but is not active; Phase 1 remains the
  production read/write path.

## Recommended Next Steps

1. Keep Cloudflare Zero Trust Access in front of the Cloudflare Pages app.
2. Refactor the local DB API to async storage so local records can be encrypted at rest before entering `localStorage`.
3. Add a Content Security Policy when deploying to reduce script-injection risk.
4. Use HTTPS-only deployment for any real patient workflow.
5. Maintain a tested recovery process for loss of the TOTP authenticator.
