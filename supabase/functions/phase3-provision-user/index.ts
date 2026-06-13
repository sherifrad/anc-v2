import { createSupabaseContext } from 'npm:@supabase/server';

const OWNER_ID = 'bfcaa90e-c49c-4a94-8cfd-06a16a96a094';
const DEFAULT_APP_ORIGIN = 'https://anc-radwan.dr-sherif1992.workers.dev';
const MAX_BODY_BYTES = 4096;
const MAX_TOTP_AGE_SECONDS = 10 * 60;
const INTERNAL_LOGIN_DOMAIN = 'accounts.anc.invalid';
const ALLOWED_PERMISSIONS = new Set([
  'patients.read',
  'patients.create',
  'patients.update',
  'related.read',
  'related.create',
  'related.update',
  'attachments.upload',
]);

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

function normalizedDisplayName(value: unknown) {
  const displayName = String(value || '').trim().replace(/\s+/g, ' ');
  if (displayName.length < 2 || displayName.length > 80) {
    throw new Error('Enter a staff label between 2 and 80 characters.');
  }
  return displayName;
}

function normalizedPermissions(value: unknown) {
  if (!Array.isArray(value)) throw new Error('Select at least one permission.');
  const permissions = [...new Set(
    value.map(item => String(item || '').trim()).filter(Boolean),
  )];
  if (
    !permissions.length
    || permissions.some(permission => !ALLOWED_PERMISSIONS.has(permission))
  ) {
    throw new Error('One or more selected permissions are not allowed.');
  }
  return permissions;
}

function normalizedWindow(validFromValue: unknown, validUntilValue: unknown) {
  const validFrom = new Date(String(validFromValue || ''));
  const validUntil = new Date(String(validUntilValue || ''));
  if (
    Number.isNaN(validFrom.getTime())
    || Number.isNaN(validUntil.getTime())
    || validUntil <= validFrom
    || validUntil.getTime() > validFrom.getTime() + 30 * 24 * 60 * 60 * 1000
  ) {
    throw new Error('Access must have a valid start and end within 30 days.');
  }
  return {
    validFrom: validFrom.toISOString(),
    validUntil: validUntil.toISOString(),
  };
}

function randomCharacters(alphabet: string, length: number) {
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  return [...values].map(value => alphabet[value % alphabet.length]).join('');
}

function shuffled(value: string) {
  const characters = [...value];
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    const swapIndex = random[0] % (index + 1);
    [characters[index], characters[swapIndex]] = [
      characters[swapIndex],
      characters[index],
    ];
  }
  return characters.join('');
}

function generateCredentials() {
  const username = `ANC-${randomCharacters('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8)}`;
  const password = shuffled([
    randomCharacters('ABCDEFGHJKLMNPQRSTUVWXYZ', 5),
    randomCharacters('abcdefghijkmnopqrstuvwxyz', 7),
    randomCharacters('23456789', 5),
    randomCharacters('!@#$%*+-_', 5),
  ].join(''));
  return {
    username,
    email: `${username.toLowerCase()}@${INTERNAL_LOGIN_DOMAIN}`,
    password,
  };
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

  let displayName: string;
  let permissions: string[];
  let validFrom: string;
  let validUntil: string;
  try {
    displayName = normalizedDisplayName(payload.displayName);
    permissions = normalizedPermissions(payload.permissions);
    ({ validFrom, validUntil } = normalizedWindow(
      payload.validFrom,
      payload.validUntil,
    ));
  } catch (error) {
    return json({ error: (error as Error).message }, 400, origin);
  }

  const deviceHint = req.headers.get('User-Agent')?.slice(0, 120) || null;
  let credentials = generateCredentials();
  let createdUserId: string | null = null;
  let createError: { code?: string } | null = null;

  for (let attempt = 0; attempt < 3 && !createdUserId; attempt += 1) {
    const { data, error } = await context.supabaseAdmin.auth.admin.createUser({
      email: credentials.email,
      password: credentials.password,
      email_confirm: true,
      app_metadata: {
        account_type: 'temporary_data_entry',
        clinic_owner_id: OWNER_ID,
        must_change_password: true,
        onboarding_complete: false,
      },
    });
    if (data.user?.id) {
      createdUserId = data.user.id;
      break;
    }
    createError = error;
    credentials = generateCredentials();
  }

  if (!createdUserId) {
    return json({
      error: 'Temporary credentials could not be generated.',
      code: createError?.code || 'account_creation_failed',
    }, 422, origin);
  }

  const { data: grant, error: grantError } = await context.supabaseAdmin.rpc(
    'phase3_provision_temporary_account',
    {
      p_user_id: createdUserId,
      p_username: credentials.username,
      p_display_name: displayName,
      p_permissions: permissions,
      p_valid_from: validFrom,
      p_valid_until: validUntil,
      p_device_hint: deviceHint,
    },
  );

  if (grantError || !grant?.id) {
    await context.supabaseAdmin.auth.admin.deleteUser(createdUserId);
    return json({
      error: 'The account was rolled back because its audited grant could not be created.',
    }, 422, origin);
  }

  return json({
    status: 'provisioned_draft',
    userId: createdUserId,
    grantId: grant.id,
    username: credentials.username,
    temporaryPassword: credentials.password,
    validFrom,
    validUntil,
    accessEnabled: false,
    passwordShownOnce: true,
  }, 201, origin);
});
