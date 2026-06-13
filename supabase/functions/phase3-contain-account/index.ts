import { createSupabaseContext } from 'npm:@supabase/server';

const OWNER_ID = 'bfcaa90e-c49c-4a94-8cfd-06a16a96a094';
const DEFAULT_APP_ORIGIN = 'https://anc-radwan.dr-sherif1992.workers.dev';
const MAX_BODY_BYTES = 4096;
const MAX_TOTP_AGE_SECONDS = 10 * 60;
const LONG_BAN_DURATION = '876000h';
const FEATURE_FLAG = 'PHASE3_CONTAINMENT_ENABLED';
const FEATURE_RELEASED = true;

function allowedOrigins() {
  const value = Deno.env.get('PHASE3_ALLOWED_APP_ORIGINS') || DEFAULT_APP_ORIGIN;
  return new Set(value.split(',').map(item => item.trim()).filter(Boolean));
}

function featureEnabled() {
  return FEATURE_RELEASED && Deno.env.get(FEATURE_FLAG) !== 'false';
}

function responseHeaders(origin: string | null) {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
    'Vary': 'Origin',
  });
  if (origin && allowedOrigins().has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set(
      'Access-Control-Allow-Headers',
      'authorization, x-client-info, apikey, content-type',
    );
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  }
  return headers;
}

function json(body: Record<string, unknown>, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(origin),
  });
}

function hasRecentTotp(claims: Record<string, unknown>) {
  if (claims.aal !== 'aal2' || !Array.isArray(claims.amr)) return false;
  const cutoff = Math.floor(Date.now() / 1000) - MAX_TOTP_AGE_SECONDS;
  return claims.amr.some(entry => {
    if (!entry || typeof entry !== 'object') return false;
    const item = entry as Record<string, unknown>;
    return item.method === 'totp'
      && Number.isFinite(Number(item.timestamp))
      && Number(item.timestamp) >= cutoff;
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin');
  if (origin && !allowedOrigins().has(origin)) {
    return json({ error: 'Origin not allowed.' }, 403, null);
  }
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: responseHeaders(origin) });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405, origin);
  }
  if (!featureEnabled()) {
    return json({ error: 'Temporary account containment is disabled.' }, 503, origin);
  }
  if (Number(req.headers.get('Content-Length') || 0) > MAX_BODY_BYTES) {
    return json({ error: 'Request is too large.' }, 413, origin);
  }

  const { data: context, error: contextError } = await createSupabaseContext(
    req,
    { auth: 'user' },
  );
  if (
    contextError
    || !context
    || context.userClaims?.id !== OWNER_ID
    || !hasRecentTotp(context.jwtClaims as Record<string, unknown>)
  ) {
    return json({
      error: 'Owner authentication and a fresh TOTP verification are required.',
    }, 403, origin);
  }

  let payload: Record<string, unknown>;
  try {
    const body = await req.text();
    if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
      return json({ error: 'Request is too large.' }, 413, origin);
    }
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Invalid request shape.');
    }
    payload = parsed as Record<string, unknown>;
  } catch {
    return json({ error: 'A valid JSON request is required.' }, 400, origin);
  }

  const grantId = String(payload.grantId || '').trim();
  const action = String(payload.action || '').trim();
  const reason = String(payload.reason || '').trim().slice(0, 500);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(grantId)
    || !['suspend', 'revoke'].includes(action)
  ) {
    return json({ error: 'The containment request is invalid.' }, 400, origin);
  }
  if (!reason) return json({ error: 'A reason is required.' }, 400, origin);

  const deviceHint = req.headers.get('User-Agent')?.slice(0, 120) || null;
  const { data: prepared, error: prepareError } = await context.supabaseAdmin.rpc(
    'phase3_prepare_account_containment',
    {
      p_actor_user_id: OWNER_ID,
      p_grant_id: grantId,
      p_action: action,
      p_reason: reason,
      p_device_hint: deviceHint,
    },
  );
  const targetUserId = prepared?.target_user_id;
  if (prepareError || !targetUserId) {
    return json({ error: 'The access grant could not be blocked.' }, 422, origin);
  }

  const { error: banError } =
    await context.supabaseAdmin.auth.admin.updateUserById(targetUserId, {
      ban_duration: LONG_BAN_DURATION,
    });
  const outcome = banError ? 'failed' : 'success';
  const { error: auditError } = await context.supabaseAdmin.rpc(
    'phase3_record_auth_containment',
    {
      p_actor_user_id: OWNER_ID,
      p_target_user_id: targetUserId,
      p_grant_id: grantId,
      p_reason: `owner_${action}`,
      p_outcome: outcome,
      p_failure_code: banError?.code || null,
    },
  );
  if (auditError) {
    return json({
      error: 'Access is blocked, but the Auth containment result needs review.',
      accessBlocked: true,
      authContained: false,
    }, 500, origin);
  }
  if (banError) {
    return json({
      error: 'Access is blocked. Auth account containment will be retried.',
      accessBlocked: true,
      authContained: false,
    }, 502, origin);
  }

  return json({
    status: prepared.status,
    accessBlocked: true,
    authContained: true,
    existingJwtBlockedByLiveGrant: true,
  }, 200, origin);
});
