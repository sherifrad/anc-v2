# Phase 2A Device Acceptance Draft

Status: **DRAFT - NO LIVE KEYS OR RECORDS**

Use the standalone `phase2_review_harness.html` page. It is intentionally not
linked from the EMR or included in the service-worker cache.

## Benchmark Acceptance

Run three samples at `600000` PBKDF2-SHA256 iterations.

- Target: maximum sample below 1000 ms.
- Preferred: average below 500 ms.
- Record desktop and mobile results separately.
- If mobile exceeds 1000 ms, review the work factor before creating a live
  vault. Do not silently reduce it after a vault exists.

OWASP currently documents PBKDF2-HMAC-SHA256 with a work factor of 600,000 or
more when PBKDF2 is used, while also recommending that the work factor be
benchmarked and generally complete in under one second.

## Synthetic Test Acceptance

The device must pass:

- Passphrase unwrap.
- Recovery-key unwrap.
- AES-GCM fake-record round trip.
- Wrong-passphrase rejection.

No real patient data should be used in the review harness.

## Mobile Visual Acceptance

- No horizontal page scrolling.
- Recovery code is readable without truncation.
- Buttons remain usable at 390 px width.
- Benchmark completion does not freeze the page for more than one second.

## Required Recorded Results

Before live key generation, record:

```text
Desktop browser/device: Codex in-app browser on development Mac
600,000 average: 39 ms
600,000 maximum: 43 ms
Synthetic test: Passed

Mobile browser/device: Honor 400 / Chrome
600,000 average: 89 ms
600,000 maximum: 98 ms
Samples: 98, 85, 85 ms
Synthetic test: Passed
```

The 390 px responsive-layout test passed with no horizontal overflow, but it
ran on the development Mac and is not a mobile CPU benchmark.

The real Honor 400 benchmark passed comfortably below the 1000 ms target.

## References

- OWASP Password Storage Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- MDN `SubtleCrypto.deriveKey()`:
  https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey
- MDN AES-GCM parameters:
  https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams
