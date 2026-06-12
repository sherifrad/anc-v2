import assert from 'node:assert/strict';
import {
  createAccessGrant,
  loadAccessControlSnapshot,
} from './phase3_access_control.mjs';

const ownerId = 'bfcaa90e-c49c-4a94-8cfd-06a16a96a094';
const now = new Date('2026-06-12T10:00:00Z');
const rows = {
  phase3_access_grants: [
    {
      id: 'grant-active',
      grantee_user_id: '11111111-1111-4111-8111-111111111111',
      role: 'data_entry',
      permissions: ['patients.read', 'patients.create'],
      status: 'active',
      valid_from: '2026-06-12T09:00:00Z',
      valid_until: '2026-06-12T12:00:00Z',
      revoked_at: null,
      revocation_reason: null,
      created_at: '2026-06-12T08:00:00Z',
      updated_at: '2026-06-12T08:00:00Z',
    },
    {
      id: 'grant-scheduled',
      grantee_user_id: '22222222-2222-4222-8222-222222222222',
      role: 'data_entry',
      permissions: ['patients.read'],
      status: 'invited',
      valid_from: '2026-06-13T09:00:00Z',
      valid_until: '2026-06-13T12:00:00Z',
      revoked_at: null,
      revocation_reason: null,
      created_at: '2026-06-12T08:00:00Z',
      updated_at: '2026-06-12T08:00:00Z',
    },
  ],
  phase3_key_envelopes: [
    {
      grant_id: 'grant-active',
      key_version: 1,
      created_at: '2026-06-12T08:00:00Z',
      retired_at: null,
    },
  ],
  phase3_security_audit: [],
};

const client = {
  from(table) {
    return {
      async select() {
        return { data: rows[table] || [], error: null };
      },
    };
  },
};

const snapshot = await loadAccessControlSnapshot({
  client,
  session: { user: { id: ownerId }, aal: 'aal2' },
  now,
});

assert.equal(snapshot.counts.total, 2);
assert.equal(snapshot.counts.active, 1);
assert.equal(snapshot.counts.scheduled, 1);
assert.equal(snapshot.grants[0].envelopeStatus, 'ready');
assert.equal(snapshot.grants[1].envelopeStatus, 'not_created');
assert.equal(snapshot.safety.grantMutationsEnabled, false);
assert.equal(snapshot.safety.delegatedAccessEnabled, false);

await assert.rejects(
  loadAccessControlSnapshot({
    client,
    session: { user: { id: ownerId }, aal: 'aal1' },
    now,
  }),
  /Owner authentication and TOTP verification are required/,
);
await assert.rejects(
  loadAccessControlSnapshot({
    client,
    session: {
      user: { id: '33333333-3333-4333-8333-333333333333' },
      aal: 'aal2',
    },
    now,
  }),
  /Owner authentication and TOTP verification are required/,
);
await assert.rejects(
  createAccessGrant(),
  /Grant changes remain disabled/,
);

console.log(JSON.stringify({
  passed: true,
  checks: [
    'owner and aal2 are required',
    'grant counts use the validity window',
    'key-envelope readiness is joined by grant',
    'grant mutations remain disabled',
    'delegated access remains disabled',
  ],
}, null, 2));
