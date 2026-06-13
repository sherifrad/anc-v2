const DEFAULT_APP_ORIGIN = 'https://anc-radwan.dr-sherif1992.workers.dev';

function allowedOrigins() {
  const configured = Deno.env.get('PHASE3_ALLOWED_APP_ORIGINS') || DEFAULT_APP_ORIGIN;
  return new Set(configured.split(',').map(value => value.trim()).filter(Boolean));
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

Deno.serve((req: Request) => {
  const origin = req.headers.get('Origin');
  if (origin && !allowedOrigins().has(origin)) {
    return new Response(
      JSON.stringify({ error: 'Origin not allowed.' }),
      { status: 403, headers: headers(null) },
    );
  }
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: headers(origin) });
  }
  return new Response(
    JSON.stringify({
      error: 'Temporary account onboarding was retired. Use the generated credentials.',
    }),
    { status: 410, headers: headers(origin) },
  );
});
