import fs from 'node:fs/promises';

const source = await fs.readFile(
  new URL('./supabase.js', import.meta.url),
  'utf8',
);

if (!source.includes('const PHASE2_RUNTIME_ENABLED = false;')) {
  throw new Error('Production Phase 2 runtime is not explicitly disabled');
}
if (source.includes('const PHASE2_RUNTIME_ENABLED = true;')) {
  throw new Error('Production Phase 2 runtime was enabled unexpectedly');
}
if (!source.includes("throw new Error('Phase 2 cloud runtime is disabled')")) {
  throw new Error('Disabled adapter configuration guard is missing');
}

console.log(JSON.stringify({
  passed: true,
  checks: [
    'production feature flag is false',
    'no enabled feature flag exists',
    'adapter configuration fails while disabled',
  ],
}, null, 2));
