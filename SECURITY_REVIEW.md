# ANC EMR Security Review

Last reviewed: 2026-06-10

## Current Protection

- Cloud sync records are encrypted in the browser before being sent to Supabase.
- Encrypted backups are protected with AES-GCM when the app is unlocked.
- The encryption key is derived from the clinic password with PBKDF2-SHA256.
- The lock bypass is hidden after encryption has been configured.
- Supabase sync errors distinguish connection, authorization, and table/policy failures.
- Patient-entered text is escaped in the main table/card renderers to reduce accidental HTML injection.

## Important Limitations

- Local working data in `localStorage` is not fully encrypted at rest yet because the current DB layer is synchronous while Web Crypto is asynchronous.
- The displayed security code is not a working password-recovery mechanism.
- Browser-side encryption does not replace Supabase Auth and Row Level Security.
- Cloudflare Access protects the web app URL, but it does not protect the Supabase REST endpoint by itself.
- Attachments are stored in browser storage and can use significant space.

## Recommended Next Steps

1. Add Supabase Auth and replace anonymous RLS policies with authenticated-user policies.
2. Keep Cloudflare Zero Trust Access in front of the Cloudflare Pages app.
3. Refactor the local DB API to async storage so local records can be encrypted at rest before entering `localStorage`.
4. Remove or protect the test seed tools before real clinical use.
5. Add a Content Security Policy when deploying to reduce script-injection risk.
6. Use HTTPS-only deployment for any real patient workflow.
