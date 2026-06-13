import { PHASE3_SECURITY } from './phase3_security_config.mjs?v=4';

const SECURE_APP_ORIGIN = 'https://anc-radwan.dr-sherif1992.workers.dev';

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
  if (
    !PHASE3_SECURITY.ownerCommandsEnabled
    || !PHASE3_SECURITY.grantMutationsEnabled
  ) {
    throw new Error(
      'Grant changes remain disabled until the delegated-key and server-function review is complete.',
    );
  }
}

function requireClient(client) {
  if (!client?.rpc) throw new Error('Secure Supabase client is unavailable.');
}

function requireSecureAppOrigin(runtimeOrigin) {
  if (runtimeOrigin === undefined) return;
  if (runtimeOrigin !== SECURE_APP_ORIGIN) {
    throw new Error(
      `Temporary account security actions must be opened from ${SECURE_APP_ORIGIN}`,
    );
  }
}

async function edgeFunctionError(error, fallback) {
  const response = error?.context;
  if (response?.clone && response?.json) {
    try {
      const payload = await response.clone().json();
      const message = payload?.error || payload?.message;
      if (message) return new Error(String(message));
    } catch {
      // Fall back to the SDK error when the response is not JSON.
    }
  }
  const message = String(error?.message || '').trim();
  return new Error(message && message !== 'Edge Function returned a non-2xx status code'
    ? message
    : fallback);
}

function normalizeUuid(value, label) {
  const normalized = String(value || '').trim().toLowerCase();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      normalized,
    )
  ) {
    throw new Error(`${label} must be a valid user ID.`);
  }
  return normalized;
}

function normalizeDate(value, label) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} is invalid.`);
  return date.toISOString();
}

async function callRpc(client, name, params) {
  const { data, error } = await client.rpc(name, params);
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
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
      ownerCommandsEnabled: PHASE3_SECURITY.ownerCommandsEnabled,
      grantMutationsEnabled: PHASE3_SECURITY.grantMutationsEnabled,
      delegatedAccessEnabled: PHASE3_SECURITY.delegatedAccessEnabled,
    },
  };
}

export async function createAccessGrant({
  client,
  session,
  granteeUserId,
  permissions,
  validFrom,
  validUntil,
  deviceHint,
} = {}) {
  requireMutations();
  requireOwnerSession(session);
  requireClient(client);
  const normalizedPermissions = [...new Set(
    (permissions || []).map(value => String(value).trim()).filter(Boolean),
  )];
  if (!normalizedPermissions.length) {
    throw new Error('Select at least one permission.');
  }
  return callRpc(client, 'phase3_create_draft_grant', {
    p_grantee_user_id: normalizeUuid(granteeUserId, 'Grantee user ID'),
    p_permissions: normalizedPermissions,
    p_valid_from: normalizeDate(validFrom, 'Start time'),
    p_valid_until: normalizeDate(validUntil, 'End time'),
    p_device_hint: String(deviceHint || '').slice(0, 120) || null,
  });
}

export async function provisionTemporaryAccount({
  client,
  session,
  displayName,
  permissions,
  validFrom,
  validUntil,
  runtimeOrigin = globalThis.location?.origin,
} = {}) {
  requireOwnerSession(session);
  requireSecureAppOrigin(runtimeOrigin);
  if (!PHASE3_SECURITY.temporaryAccountProvisioningEnabled) {
    throw new Error(
      'Temporary account creation remains locked until the security review is approved.',
    );
  }
  if (!client?.functions?.invoke) {
    throw new Error('Secure temporary account creation is unavailable.');
  }
  const normalizedDisplayName = String(displayName || '').trim().replace(/\s+/g, ' ');
  if (normalizedDisplayName.length < 2 || normalizedDisplayName.length > 80) {
    throw new Error('Enter a staff name or label between 2 and 80 characters.');
  }
  const normalizedPermissions = [...new Set(
    (permissions || []).map(value => String(value).trim()).filter(Boolean),
  )];
  if (!normalizedPermissions.length) {
    throw new Error('Select at least one permission.');
  }
  const { data, error } = await client.functions.invoke(
    'phase3-provision-user',
    {
      body: {
        displayName: normalizedDisplayName,
        permissions: normalizedPermissions,
        validFrom: normalizeDate(validFrom, 'Start time'),
        validUntil: normalizeDate(validUntil, 'End time'),
      },
    },
  );
  if (error) {
    throw await edgeFunctionError(
      error,
      'Temporary account creation failed. Verify TOTP again and retry.',
    );
  }
  if (
    data?.status !== 'provisioned_draft'
    || !data?.username
    || !data?.temporaryPassword
    || data?.accessEnabled !== false
    || data?.onboardingRequired !== false
    || data?.generatedCredentialsFinal !== true
  ) {
    throw new Error('The temporary account response could not be verified.');
  }
  return data;
}

export async function activateTemporaryAccount({
  client,
  session,
  grantId,
  keyVersion,
  envelope,
  runtimeOrigin = globalThis.location?.origin,
} = {}) {
  requireOwnerSession(session);
  requireSecureAppOrigin(runtimeOrigin);
  if (!PHASE3_SECURITY.delegatedAccessEnabled) {
    throw new Error('Temporary clinical access is disabled.');
  }
  if (!client?.functions?.invoke) {
    throw new Error('Secure temporary account activation is unavailable.');
  }
  const { data, error } = await client.functions.invoke(
    'phase3-activate-account',
    {
      body: {
        grantId: normalizeUuid(grantId, 'Grant ID'),
        keyVersion,
        envelope,
      },
    },
  );
  if (error) {
    throw await edgeFunctionError(
      error,
      'Temporary account activation failed. Verify TOTP again and retry.',
    );
  }
  if (data?.status !== 'active' || data?.grant_id !== grantId) {
    throw new Error('The activated account response could not be verified.');
  }
  return data;
}

export async function changeAccessGrant({
  client,
  session,
  grantId,
  action,
  reason,
  deviceHint,
  runtimeOrigin = globalThis.location?.origin,
} = {}) {
  requireMutations();
  requireOwnerSession(session);
  requireClient(client);
  if (!['suspend', 'revoke'].includes(action)) {
    throw new Error('Only suspend and revoke are available.');
  }
  const normalizedReason = String(reason || '').trim();
  if (!normalizedReason) throw new Error('A reason is required.');

  if (PHASE3_SECURITY.accountContainmentEnabled) {
    requireSecureAppOrigin(runtimeOrigin);
    if (!client.functions?.invoke) {
      throw new Error('Secure account containment is unavailable.');
    }
    const { data, error } = await client.functions.invoke(
      'phase3-contain-account',
      {
        body: {
          grantId: normalizeUuid(grantId, 'Grant ID'),
          action,
          reason: normalizedReason.slice(0, 500),
        },
      },
    );
    if (error) {
      throw await edgeFunctionError(
        error,
        'Account containment failed. Verify TOTP again and retry.',
      );
    }
    if (data?.accessBlocked !== true || data?.authContained !== true) {
      throw new Error('Access was blocked, but Auth containment needs review.');
    }
    return data;
  }

  return callRpc(client, 'phase3_change_grant_state', {
    p_grant_id: normalizeUuid(grantId, 'Grant ID'),
    p_action: action,
    p_reason: normalizedReason.slice(0, 500),
    p_device_hint: String(deviceHint || '').slice(0, 120) || null,
  });
}
