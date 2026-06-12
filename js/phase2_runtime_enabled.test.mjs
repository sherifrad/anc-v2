import fs from 'node:fs/promises';

const source = await fs.readFile(
  new URL('./supabase.js', import.meta.url),
  'utf8',
);
const config = await fs.readFile(
  new URL('./phase2_runtime_config.mjs', import.meta.url),
  'utf8',
);

if (!source.includes('const PHASE2_RUNTIME_ENABLED = true;')) {
  throw new Error('Production Phase 2 runtime is not explicitly enabled');
}
if (source.includes('const PHASE2_RUNTIME_ENABLED = false;')) {
  throw new Error('Production Phase 2 runtime still contains the disabled flag');
}
if (!config.includes('enabled: true')) {
  throw new Error('Module Phase 2 runtime is not explicitly enabled');
}
if (config.includes('enabled: false')) {
  throw new Error('Module Phase 2 runtime still contains the disabled flag');
}
if (!source.includes('configurePhase2Adapter')) {
  throw new Error('Phase 2 adapter configuration is missing');
}

console.log(JSON.stringify({
  passed: true,
  checks: [
    'production feature flag is true',
    'module feature flag is true',
    'no disabled feature flag remains',
    'adapter configuration is available',
  ],
}, null, 2));
