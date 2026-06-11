# Phase 2A Shared Encryption Key - Review Draft

Status: **DRAFT - NOT ACTIVE**

Nothing in this design is loaded by the current app. No live records or
Supabase tables should be changed until this document, the SQL, and the
migration procedure are reviewed.

## Objective

Use one random 256-bit Clinic Data Key (CDK) to encrypt cloud records on every
approved device.

The CDK is never stored in plaintext. Supabase stores two encrypted copies:

1. Wrapped by a key derived from the clinic passphrase.
2. Wrapped by a separate random recovery key.

## Proposed Unlock Flow

1. Complete Supabase email/password authentication.
2. Complete TOTP so the session reaches `aal2`.
3. Download the encrypted key-vault row.
4. Enter the clinic passphrase.
5. Derive a Key Encryption Key (KEK) with PBKDF2-SHA256.
6. Decrypt the wrapped CDK in browser memory.
7. Use the CDK for cloud-record encryption and decryption.
8. Remove the CDK from memory when the app locks or signs out.

## Proposed Cryptography

- Clinic Data Key: random AES-256-GCM key.
- Record encryption: AES-256-GCM with a fresh 96-bit IV for every payload.
- Passphrase KEK: PBKDF2-HMAC-SHA256.
- Proposed PBKDF2 iteration count: `600000`.
- KDF salt: random 256-bit value stored with the wrapped key.
- CDK wrapping: AES-256-GCM with a fresh 96-bit IV.
- Recovery key: random 256-bit value generated once and shown once.
- Recovery wrapping: AES-256-GCM with a separate fresh IV.
- Stored binary values: base64url.
- Associated data binds wrapped keys to owner UID, vault version, and purpose.

The iteration count was benchmarked successfully on the Honor 400. Version 1
vault readers require exactly `600000` iterations and reject altered, reduced,
or excessive values before deriving a key.

## Proposed Vault Record

One row per Supabase owner and key version:

- `owner_id`
- `key_version`
- `algorithm`
- `kdf`
- `wrapped_by_passphrase`
- `wrapped_by_recovery`
- `status`
- timestamps

The database permits retained retired versions but enforces at most one active
key version for the owner. Owner UID, key version, and format version become
immutable after insertion.

The table must require:

- The configured owner UID.
- An authenticated role.
- An `aal2` JWT.

## Migration Safety Rules

1. Do not overwrite Phase 1 ciphertext initially.
2. Add a new schema version for Phase 2 ciphertext.
3. Migrate into temporary/versioned columns or tables.
4. Verify every migrated record decrypts before switching readers.
5. Compare patient and related-record counts.
6. Verify on both mobile and desktop.
7. Keep the Phase 1 rollback backup and Git tag.
8. Switch writes only after read verification succeeds.
9. Remove old ciphertext only in a later, separately approved cleanup.

## Decisions Required Before Activation

1. Confirm or change the proposed `600000` PBKDF2 iterations.
2. Review the proposed grouped `ANC2....` recovery code with checksum.
3. Decide whether recovery requires TOTP access or supports an offline restore.
4. Decide how many active key versions to retain.
5. Decide whether migration uses temporary columns or shadow tables.
6. Define what happens if one record fails migration.
7. Define the exact second-device acceptance test.

## Draft Shadow Migration

The current proposal uses separate shadow tables:

- `phase2_patient_records`
- `phase2_related_records`
- `phase2_migration_batches`

The draft migration builder:

- Encrypts each patient independently.
- Encrypts related collections separately by record type.
- Adds a SHA-256 hash of each plaintext object.
- Binds ciphertext to owner, table, patient, record type, and key version.
- Marks the entire migration batch failed if any patient cannot migrate.
- Verifies row counts and batch IDs before any activation.
- Decrypts every staged row and compares it with the original source.
- Recomputes every SHA-256 hash after decryption.
- Rejects altered ciphertext, altered hashes, or the wrong Clinic Data Key.
- Rejects non-JSON values such as `undefined`, non-finite numbers, or custom
  object types before staging.
- Requires each shadow row's owner and key version to match its migration batch.

The Phase 1 production tables remain unchanged during staging and verification.

## Draft Activation Gates

The proposed activation state sequence is:

```text
draft
  -> staged
  -> verified
  -> device_verified
  -> activation_approved
  -> activated
```

Activation cannot occur unless:

- Deep row verification passed with zero failures.
- Desktop and mobile tests both passed.
- The Phase 1 rollback backup remains verified.
- The recovery code was recorded and confirmed.
- The clinic owner gives an explicit final approval.

Every staged or activated migration remains eligible for rollback.

## Review Notes

- The recovery checksum detects typing errors; it is not authentication and
  does not protect a recovery code that is photographed or copied.
- Recovery text is case-sensitive and should be displayed once, confirmed, and
  kept offline.
- JavaScript cannot guarantee immediate erasure of secret bytes from memory.
  The live design must keep the unwrapped CDK only in memory, never log it, and
  discard references on lock, sign-out, or page close.
- A passphrase change should re-wrap the same CDK. It should not re-encrypt
  every patient record.
