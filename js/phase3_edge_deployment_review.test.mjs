import fs from 'node:fs/promises';

const functions = [
  ['phase3-provision-user', 'PHASE3_PROVISIONING_ENABLED', "{ auth: 'user' }"],
  ['phase3-complete-onboarding', 'PHASE3_ONBOARDING_ENABLED', "{ auth: 'user' }"],
  ['phase3-contain-account', 'PHASE3_CONTAINMENT_ENABLED', "{ auth: 'user' }"],
  ['phase3-delegated-gateway', 'PHASE3_DELEGATED_GATEWAY_ENABLED', "{ auth: 'user' }"],
  ['phase3-expire-accounts', 'PHASE3_EXPIRY_ENABLED', "{ auth: 'secret' }"],
];

for (const [name, flag, authMode] of functions) {
  const source = await fs.readFile(
    new URL(`../supabase/functions/${name}/index.ts`, import.meta.url),
    'utf8',
  );
  const denoConfig = await fs.readFile(
    new URL(`../supabase/functions/${name}/deno.json`, import.meta.url),
    'utf8',
  );

  for (const fragment of [
    "createSupabaseContext",
    authMode,
    flag,
    "Deno.env.get(FEATURE_FLAG)",
    "'true'",
    "'Cache-Control': 'no-store'",
  ]) {
    if (!source.includes(fragment)) {
      throw new Error(`${name} deployment control is missing: ${fragment}`);
    }
  }

  if (!denoConfig.includes('"strict": true')) {
    throw new Error(`${name} must retain strict TypeScript checks.`);
  }
  if (source.includes("{ auth: 'none' }")) {
    throw new Error(`${name} must not permit unauthenticated calls.`);
  }
}

const browserConfig = await fs.readFile(
  new URL('./phase3_security_config.mjs', import.meta.url),
  'utf8',
);
for (const fragment of [
  'temporaryAccountProvisioningEnabled: false',
  'temporaryAccountOnboardingEnabled: false',
  'accountContainmentEnabled: false',
  'delegatedAccessEnabled: false',
]) {
  if (!browserConfig.includes(fragment)) {
    throw new Error(`Browser release control is not disabled: ${fragment}`);
  }
}

console.log(JSON.stringify({
  passed: true,
  checks: [
    'all five Edge Functions default to disabled on the server',
    'user endpoints verify signed-in users inside the function',
    'the scheduler requires a server secret',
    'unauthenticated auth mode is absent',
    'strict TypeScript settings are present',
    'all browser release flags remain disabled',
  ],
}, null, 2));
