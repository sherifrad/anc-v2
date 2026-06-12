import { PHASE3_SECURITY } from './phase3_security_config.mjs';

const TABLES = Object.freeze({
  grants: 'phase3_access_grants',
  envelopes: 'phase3_key_envelopes',
  audit: 'phase3_security_audit',
});

function requireOwnerSession(session) {
  if (
    !session?.user
    || session.user.id !== PHASE3_SECURITY.ownerId
    || session.aal !== 'aal2'
  ) {
    throw new Error('Owner authentication and TOTP verification are required.');
  }
}

function requirePreview() {
  if (!PHASE3_SECURITY.panelPreviewEnabled) {
    throw new Error('Phase 3 access control is not available.');
  }
}

function requireMutations() {
  if (!PHASE3_SECURITY.grantMutationsEnabled) {
    throw new Error(
      'Grant changes remain disabled until the delegated-key and server-function review is complete.',
    );
  }
}

async function fetchRows(client, table, query) {
  const { data, error } = await client.from(table).select(query);
  if (error) throw error;
  return data || [];
}

export async function loadAccessControlSnapshot({
  client,
  session,
  now = new Date(),
} = {}) {
  requirePreview();
  requireOwnerSession(session);
  if (!client) throw new Error('Secure Supabase client is unavailable.');

  const [grantRows, envelopeRows, auditRows] = await Promise.all([
    fetchRows(
      client,
      TABLES.grants,
      'id,grantee_user_id,role,permissions,status,valid_from,valid_until,'
        + 'revoked_at,revocation_reason,created_at,updated_at',
    ),
    fetchRows(client, TABLES.envelopes, 'grant_id,key_version,created_at,retired_at'),
    fetchRows(
      client,
      TABLES.audit,
      'id,actor_user_id,target_user_id,grant_id,event_type,outcome,'
        + 'assurance_level,device_hint,metadata,created_at',
    ),
  ]);

  const envelopes = new Map(envelopeRows.map(row => [row.grant_id, row]));
  const grants = grantRows.map(row => {
    const envelope = envelopes.get(row.id);
    return {
      id: row.id,
      userId: row.grantee_user_id,
      role: row.role,
      permissions: Array.isArray(row.permissions) ? row.permissions : [],
      status: row.status,
      validFrom: row.valid_from,
      validUntil: row.valid_until,
      revokedAt: row.revoked_at,
      revocationReason: row.revocation_reason,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      envelopeStatus: envelope
        ? (envelope.retired_at ? 'retired' : 'ready')
        : 'not_created',
      keyVersion: envelope?.key_version || null,
    };
  });
  const currentTime = now.getTime();

  return {
    grants,
    audit: auditRows.map(row => ({
      id: row.id,
      actorUserId: row.actor_user_id,
      targetUserId: row.target_user_id,
      grantId: row.grant_id,
      eventType: row.event_type,
      outcome: row.outcome,
      assuranceLevel: row.assurance_level,
      deviceHint: row.device_hint,
      metadata: row.metadata || {},
      createdAt: row.created_at,
    })),
    counts: {
      total: grants.length,
      active: grants.filter(grant => (
        grant.status === 'active'
        && new Date(grant.validFrom).getTime() <= currentTime
        && new Date(grant.validUntil).getTime() > currentTime
      )).length,
      scheduled: grants.filter(grant => (
        ['draft', 'invited', 'active'].includes(grant.status)
        && new Date(grant.validFrom).getTime() > currentTime
      )).length,
      attention: grants.filter(grant => (
        grant.status === 'suspended'
        || (
          grant.status === 'active'
          && new Date(grant.validUntil).getTime() <= currentTime
        )
      )).length,
    },
    safety: {
      panelPreviewEnabled: PHASE3_SECURITY.panelPreviewEnabled,
      grantMutationsEnabled: PHASE3_SECURITY.grantMutationsEnabled,
      delegatedAccessEnabled: PHASE3_SECURITY.delegatedAccessEnabled,
    },
  };
}

export async function createAccessGrant() {
  requireMutations();
  throw new Error('Grant creation requires the reviewed server function.');
}

export async function changeAccessGrant() {
  requireMutations();
  throw new Error('Grant changes require the reviewed server function.');
}
