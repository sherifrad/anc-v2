import { createSupabaseContext } from 'npm:@supabase/server';

const DEFAULT_APP_ORIGIN = 'https://anc-radwan.dr-sherif1992.workers.dev';
const MAX_BODY_BYTES = 8192;
const FEATURE_FLAG = 'PHASE3_DELEGATED_GATEWAY_ENABLED';

function allowedOrigins() {
  return new Set(
    (Deno.env.get('PHASE3_ALLOWED_APP_ORIGINS') || DEFAULT_APP_ORIGIN)
      .split(',')
      .map(value => value.trim())
      .filter(Boolean),
  );
}

function featureEnabled() {
  return Deno.env.get(FEATURE_FLAG) === 'true';
}

function headers(origin: string | null) {
  const value = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
    'Vary': 'Origin',
  });
  if (origin && allowedOrigins().has(origin)) {
    value.set('Access-Control-Allow-Origin', origin);
    value.set('Access-Control-Allow-Headers', 'authorization, apikey, content-type');
    value.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  }
  return value;
}

function json(body: Record<string, unknown>, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: headers(origin),
  });
}

async function fingerprint(value: unknown) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(normalized),
  );
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin');
  if (origin && !allowedOrigins().has(origin)) {
    return json({ error: 'Origin not allowed.' }, 403, null);
  }
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: headers(origin) });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405, origin);
  }
  if (!featureEnabled()) {
    return json({ error: 'Delegated clinical operations are disabled.' }, 503, origin);
  }

  const { data: context, error: contextError } = await createSupabaseContext(
    req,
    { auth: 'user' },
  );
  if (contextError || !context?.userClaims?.id) {
    return json({ error: 'Authentication required.' }, 401, origin);
  }

  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return json({ error: 'Request is too large.' }, 413, origin);
  }

  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Invalid request.');
    }
    payload = parsed as Record<string, unknown>;
  } catch {
    return json({ error: 'A valid JSON request is required.' }, 400, origin);
  }

  const requestId = crypto.randomUUID();
  const { data: decision, error } = await context.supabaseAdmin.rpc(
    'phase3_authorize_and_audit_action',
    {
      p_actor_user_id: context.userClaims.id,
      p_action: String(payload.action || ''),
      p_resource_type: String(payload.resourceType || ''),
      p_resource_fingerprint: await fingerprint(payload.resourceId),
      p_request_id: requestId,
      p_assurance_level: String(context.jwtClaims?.aal || 'unknown'),
      p_device_hint: req.headers.get('User-Agent')?.slice(0, 120) || null,
    },
  );

  if (error) {
    return json({ error: 'The audited authorization check failed.', requestId }, 403, origin);
  }
  if (!decision?.allowed) {
    return json({
      error: 'Temporary access is not authorized.',
      reason: decision?.reason || 'denied',
      requestId,
    }, 403, origin);
  }

  // Each future handler must perform its data operation and final audit append
  // in one database transaction. Authorization alone never grants direct access.
  const { error: resultAuditError } = await context.supabaseAdmin.rpc(
    'phase3_record_action_result',
    {
    p_actor_user_id: context.userClaims.id,
    p_grant_id: decision.grant_id,
    p_request_id: requestId,
    p_action: String(payload.action || ''),
    p_outcome: 'failed',
    p_failure_code: 'handler_not_implemented',
    p_rows_affected: null,
    },
  );
  if (resultAuditError) {
    return json({
      error: 'The action was stopped because its final audit could not be recorded.',
      reason: 'result_audit_failed',
      requestId,
    }, 500, origin);
  }
  return json({
    error: 'Delegated clinical operations are not enabled.',
    reason: 'handler_not_implemented',
    requestId,
  }, 503, origin);
});
