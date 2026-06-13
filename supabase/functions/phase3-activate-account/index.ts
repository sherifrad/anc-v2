import { createSupabaseContext } from 'npm:@supabase/server';

const OWNER_ID = 'bfcaa90e-c49c-4a94-8cfd-06a16a96a094';
const DEFAULT_APP_ORIGIN = 'https://anc-radwan.dr-sherif1992.workers.dev';
const MAX_BODY_BYTES = 8192;
const MAX_TOTP_AGE_SECONDS = 10 * 60;

function origins() {
  return new Set(
    (Deno.env.get('PHASE3_ALLOWED_APP_ORIGINS') || DEFAULT_APP_ORIGIN)
      .split(',').map(value => value.trim()).filter(Boolean),
  );
}

function headers(origin: string | null) {
  const result = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
    'Vary': 'Origin',
  });
  if (origin && origins().has(origin)) {
    result.set('Access-Control-Allow-Origin', origin);
    result.set(
      'Access-Control-Allow-Headers',
      'authorization, x-client-info, apikey, content-type',
    );
    result.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  }
  return result;
}

function json(body: Record<string, unknown>, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: headers(origin),
  });
}

function hasRecentTotp(claims: Record<string, unknown>) {
  if (claims.aal !== 'aal2' || !Array.isArray(claims.amr)) return false;
  const cutoff = Math.floor(Date.now() / 1000) - MAX_TOTP_AGE_SECONDS;
  return claims.amr.some(entry => {
    if (!entry || typeof entry !== 'object') return false;
    const item = entry as Record<string, unknown>;
    return item.method === 'totp' && Number(item.timestamp) >= cutoff;
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin');
  if (origin && !origins().has(origin)) {
    return json({ error: 'Origin not allowed.' }, 403, null);
  }
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: headers(origin) });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405, origin);
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
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return json({ error: 'Request is too large.' }, 413, origin);
    }
    payload = JSON.parse(raw);
  } catch {
    return json({ error: 'A valid JSON request is required.' }, 400, origin);
  }

  const envelope = payload.envelope as Record<string, unknown> | undefined;
  const { data, error } = await context.supabaseAdmin.rpc(
    'phase3_activate_temporary_account',
    {
      p_actor_user_id: OWNER_ID,
      p_grant_id: String(payload.grantId || ''),
      p_key_version: Number(payload.keyVersion),
      p_format_version: Number(envelope?.format_version),
      p_algorithm: String(envelope?.algorithm || ''),
      p_wrapping_method: String(envelope?.wrapping_method || ''),
      p_wrapped_key: envelope?.wrapped_key || null,
      p_device_hint: req.headers.get('User-Agent')?.slice(0, 120) || null,
    },
  );
  if (error) {
    return json({ error: error.message || 'Activation failed.' }, 422, origin);
  }
  return json({ status: 'active', ...data }, 200, origin);
});
