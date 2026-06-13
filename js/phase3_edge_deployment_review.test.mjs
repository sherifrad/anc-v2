import fs from 'node:fs/promises';

const functions = [
  ['phase3-provision-user', 'PHASE3_PROVISIONING_ENABLED', "{ auth: 'user' }", true],
  ['phase3-complete-onboarding', 'PHASE3_ONBOARDING_ENABLED', "{ auth: 'user' }", true],
  ['phase3-contain-account', 'PHASE3_CONTAINMENT_ENABLED', "{ auth: 'user' }", true],
  ['phase3-delegated-gateway', 'PHASE3_DELEGATED_GATEWAY_ENABLED', "{ auth: 'user' }", false],
  ['phase3-expire-accounts', 'PHASE3_EXPIRY_ENABLED', "{ auth: 'secret' }", false],
];

for (const [name, flag, authMode, released] of functions) {
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
    "'Cache-Control': 'no-store'",
  ]) {
    if (!source.includes(fragment)) {
      throw new Error(`${name} deployment control is missing: ${fragment}`);
    }
  }
  if (released && !source.includes('FEATURE_RELEASED = true')) {
    throw new Error(`${name} expected released server control.`);
  }
  if (!released && source.includes('FEATURE_RELEASED = true')) {
    throw new Error(`${name} must remain dormant.`);
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
  'temporaryAccountProvisioningEnabled: true',
  'temporaryAccountOnboardingEnabled: true',
  'accountContainmentEnabled: true',
  'delegatedAccessEnabled: false',
]) {
  if (!browserConfig.includes(fragment)) {
    throw new Error(`Browser release control is not disabled: ${fragment}`);
  }
}

console.log(JSON.stringify({
  passed: true,
  checks: [
    'only provisioning, onboarding, and containment are released on the server',
    'user endpoints verify signed-in users inside the function',
    'the scheduler requires a server secret',
    'unauthenticated auth mode is absent',
    'strict TypeScript settings are present',
    'delegated browser access remains disabled',
  ],
}, null, 2));
