import { createSupabaseContext } from 'npm:@supabase/server';

const OWNER_ID = 'bfcaa90e-c49c-4a94-8cfd-06a16a96a094';
const DEFAULT_APP_ORIGIN = 'https://anc-radwan.dr-sherif1992.workers.dev';
const MAX_BODY_BYTES = 2048;
const MAX_TOTP_AGE_SECONDS = 10 * 60;
const FEATURE_FLAG = 'PHASE3_ONBOARDING_ENABLED';
const FEATURE_RELEASED = true;

function allowedOrigins() {
  const configured = Deno.env.get('PHASE3_ALLOWED_APP_ORIGINS') || DEFAULT_APP_ORIGIN;
  return new Set(configured.split(',').map(value => value.trim()).filter(Boolean));
}

function featureEnabled() {
  return FEATURE_RELEASED && Deno.env.get(FEATURE_FLAG) !== 'false';
}

function headers(origin: string | null) {
  const result = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
    'Vary': 'Origin',
  });
  if (origin && allowedOrigins().has(origin)) {
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

function hasRecentTotp(jwtClaims: Record<string, unknown>) {
  if (jwtClaims.aal !== 'aal2' || !Array.isArray(jwtClaims.amr)) return false;
  const cutoff = Math.floor(Date.now() / 1000) - MAX_TOTP_AGE_SECONDS;
  return jwtClaims.amr.some(entry => {
    if (!entry || typeof entry !== 'object') return false;
    const item = entry as Record<string, unknown>;
    return item.method === 'totp'
      && Number.isFinite(Number(item.timestamp))
      && Number(item.timestamp) >= cutoff;
  });
}

function passwordError(password: string, username: string) {
  if (password.length < 16 || password.length > 128) return 'Use 16 to 128 characters.';
  if (!/[A-Z]/.test(password)) return 'Add an uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Add a lowercase letter.';
  if (!/[0-9]/.test(password)) return 'Add a number.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Add a symbol.';
  if (
    password.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
      .includes(username.replace(/[^A-Za-z0-9]/g, '').toUpperCase())
  ) {
    return 'The password must not contain the staff username.';
  }
  return '';
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
    return json({ error: 'Temporary account onboarding is disabled.' }, 503, origin);
  }
  if (Number(req.headers.get('Content-Length') || 0) > MAX_BODY_BYTES) {
    return json({ error: 'Request is too large.' }, 413, origin);
  }

  const { data: context, error: contextError } = await createSupabaseContext(
    req,
    { auth: 'user' },
  );
  const userId = context?.userClaims?.id;
  if (contextError || !context || !userId) {
    return json({ error: 'Authentication required.' }, 401, origin);
  }
  if (!hasRecentTotp(context.jwtClaims as Record<string, unknown>)) {
    return json({ error: 'A fresh authenticator verification is required.' }, 403, origin);
  }

  let newPassword = '';
  try {
    const body = await req.text();
    if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
      return json({ error: 'Request is too large.' }, 413, origin);
    }
    const payload = JSON.parse(body);
    newPassword = String(payload?.newPassword || '');
  } catch {
    return json({ error: 'A valid JSON request is required.' }, 400, origin);
  }

  const { data: userResult, error: userError } =
    await context.supabaseAdmin.auth.admin.getUserById(userId);
  const user = userResult.user;
  const metadata = user?.app_metadata || {};
  if (
    userError
    || !user
    || metadata.account_type !== 'temporary_data_entry'
    || metadata.clinic_owner_id !== OWNER_ID
  ) {
    return json({ error: 'This account is not eligible for staff onboarding.' }, 403, origin);
  }

  const username = String(user.email || '').split('@')[0].toUpperCase();
  const validationError = passwordError(newPassword, username);
  if (validationError) {
    return json({ error: validationError }, 400, origin);
  }

  const nextMetadata = {
    ...metadata,
    must_change_password: false,
    onboarding_complete: false,
    onboarding_audit_pending: true,
  };
  const { error: passwordUpdateError } =
    await context.supabaseAdmin.auth.admin.updateUserById(userId, {
      password: newPassword,
      app_metadata: nextMetadata,
    });
  if (passwordUpdateError) {
    return json({ error: 'The new password could not be saved.' }, 422, origin);
  }

  const deviceHint = req.headers.get('User-Agent')?.slice(0, 120) || null;
  const { error: auditError } = await context.supabaseAdmin.rpc(
    'phase3_complete_temporary_onboarding',
    {
      p_user_id: userId,
      p_device_hint: deviceHint,
    },
  );
  if (auditError) {
    return json({
      error: 'The password changed, but security setup is not complete. Sign in with the new password and retry.',
      code: 'onboarding_audit_pending',
    }, 422, origin);
  }

  const { error: completionError } =
    await context.supabaseAdmin.auth.admin.updateUserById(userId, {
      app_metadata: {
        ...nextMetadata,
        onboarding_complete: true,
        onboarding_audit_pending: false,
      },
    });
  if (completionError) {
    return json({
      error: 'Security setup was recorded, but the session could not be finalized. Sign out and contact the owner.',
      code: 'onboarding_claim_pending',
    }, 422, origin);
  }

  return json({
    status: 'waiting_for_owner',
    accessEnabled: false,
    grantStatus: 'draft',
  }, 200, origin);
});
