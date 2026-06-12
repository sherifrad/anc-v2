import { createSupabaseContext } from 'npm:@supabase/server';

const OWNER_ID = 'bfcaa90e-c49c-4a94-8cfd-06a16a96a094';
const DEFAULT_APP_ORIGIN = 'https://anc-radwan.dr-sherif1992.workers.dev';
const MAX_BODY_BYTES = 4096;
const MAX_TOTP_AGE_SECONDS = 10 * 60;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function allowedOrigins() {
  const configured = Deno.env.get('PHASE3_ALLOWED_APP_ORIGINS') || DEFAULT_APP_ORIGIN;
  return new Set(
    configured
      .split(',')
      .map(value => value.trim())
      .filter(Boolean),
  );
}

function responseHeaders(origin: string | null) {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
    'Vary': 'Origin',
  });
  if (origin && allowedOrigins().has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Headers', 'authorization, apikey, content-type');
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  }
  return headers;
}

function json(
  body: Record<string, unknown>,
  status: number,
  origin: string | null,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(origin),
  });
}

function normalizedEmail(value: unknown) {
  const email = String(value || '').trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw new Error('A valid email address is required.');
  }
  return email;
}

function inviteRedirectUrl() {
  const configured = Deno.env.get('PHASE3_INVITE_REDIRECT_URL')
    || `${DEFAULT_APP_ORIGIN}/`;
  const redirect = new URL(configured);
  if (redirect.protocol !== 'https:' || !allowedOrigins().has(redirect.origin)) {
    throw new Error('The invitation redirect is not approved.');
  }
  return redirect.toString();
}

async function emailFingerprint(email: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(email),
  );
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

function hasRecentTotp(jwtClaims: Record<string, unknown>) {
  if (jwtClaims.aal !== 'aal2' || !Array.isArray(jwtClaims.amr)) return false;
  const cutoff = Math.floor(Date.now() / 1000) - MAX_TOTP_AGE_SECONDS;
  return jwtClaims.amr.some(entry => {
    if (!entry || typeof entry !== 'object') return false;
    const method = (entry as Record<string, unknown>).method;
    const timestamp = Number((entry as Record<string, unknown>).timestamp);
    return method === 'totp' && Number.isFinite(timestamp) && timestamp >= cutoff;
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

  const contentLength = Number(req.headers.get('Content-Length') || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return json({ error: 'Request is too large.' }, 413, origin);
  }

  const { data: context, error: contextError } = await createSupabaseContext(
    req,
    { auth: 'user' },
  );
  if (contextError || !context) {
    return json({ error: 'Authentication required.' }, 401, origin);
  }

  const actorId = context.userClaims?.id;
  if (
    actorId !== OWNER_ID
    || !hasRecentTotp(context.jwtClaims as Record<string, unknown>)
  ) {
    return json(
      { error: 'Owner authentication and a fresh TOTP verification are required.' },
      403,
      origin,
    );
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

  let email: string;
  try {
    email = normalizedEmail(payload.email);
  } catch (error) {
    return json({ error: (error as Error).message }, 400, origin);
  }

  if (email === String(context.userClaims?.email || '').toLowerCase()) {
    return json({ error: 'The owner account cannot be invited.' }, 400, origin);
  }

  let redirectTo: string;
  try {
    redirectTo = inviteRedirectUrl();
  } catch {
    return json({ error: 'Invitation configuration is unavailable.' }, 503, origin);
  }

  const fingerprint = await emailFingerprint(email);
  const deviceHint = req.headers.get('User-Agent')?.slice(0, 120) || null;
  const { data: requestAuditId, error: requestAuditError } =
    await context.supabaseAdmin.rpc('phase3_begin_user_invitation', {
      p_email_fingerprint: fingerprint,
      p_device_hint: deviceHint,
    });

  if (requestAuditError || !requestAuditId) {
    return json(
      { error: 'Invitation safety limit reached or audit is unavailable.' },
      429,
      origin,
    );
  }

  const { data, error } = await context.supabaseAdmin.auth.admin
    .inviteUserByEmail(email, { redirectTo });

  if (error || !data.user?.id) {
    await context.supabaseAdmin.rpc('phase3_finish_user_invitation', {
      p_request_audit_id: requestAuditId,
      p_target_user_id: null,
      p_outcome: 'failed',
      p_failure_code: error?.code || 'invite_failed',
    });
    return json(
      { error: 'The invitation could not be sent. Check the address and email settings.' },
      422,
      origin,
    );
  }

  const { error: completionAuditError } = await context.supabaseAdmin.rpc(
    'phase3_finish_user_invitation',
    {
      p_request_audit_id: requestAuditId,
      p_target_user_id: data.user.id,
      p_outcome: 'success',
      p_failure_code: null,
    },
  );

  return json({
    status: 'invited',
    userId: data.user.id,
    email: data.user.email,
    accessEnabled: false,
    auditPending: Boolean(completionAuditError),
  }, completionAuditError ? 202 : 201, origin);
});
