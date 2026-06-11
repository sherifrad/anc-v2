# Phase 2 Backup and Rollback

Stable code tag: `phase1-stable-2026-06-11`

Do not begin shared-key migration until the rollback backup has been downloaded
and successfully tested.

## Create the Data Checkpoint

1. Sign in with email, password, and TOTP.
2. Unlock the current clinic encryption password.
3. Pull from Supabase so the current device has the latest cloud records.
4. Confirm the patient count and open a recent patient record.
5. Select **Rollback Backup**.
6. Keep the downloaded `ANC_Phase2_Rollback_YYYY-MM-DD.json` file offline.
7. Do not rename or edit the JSON contents.

The rollback file contains:

- The full local EMR export, including attachments.
- AES-GCM encryption using the current Phase 1 clinic key.
- A SHA-256 integrity hash checked during import.
- The patient count and the stable Git rollback tag.

## Test Before Migration

The Phase 1 encryption salt is device-specific, so another browser/device may
not be able to decrypt this file even when the same password is entered.

On the primary device:

1. Sign in and unlock using the current clinic encryption password.
2. Select **Verify Backup**.
3. Choose the downloaded rollback JSON file.
4. Confirm that the integrity hash and patient-count checks pass.

Verification is read-only. It does not import, overwrite, or upload records.

## Roll Back the Application

If Phase 2 fails, deploy the code identified by:

```text
phase1-stable-2026-06-11
```

Git command for a recovery branch:

```bash
git switch -c codex/phase1-recovery phase1-stable-2026-06-11
```

## Roll Back Patient Data

1. Deploy/open the Phase 1 stable version.
2. Sign in with email/password and TOTP.
3. Unlock using the original Phase 1 clinic encryption password.
4. Import the rollback backup.
5. Verify the patient count and several records.
6. Push the restored records to Supabase.
7. Pull on the second device and verify decryption.

Keep the rollback file until Phase 2 has passed on every active device.
