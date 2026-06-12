import fs from 'node:fs/promises';

const app = await fs.readFile(new URL('./app.js', import.meta.url), 'utf8');
const supabase = await fs.readFile(
  new URL('./supabase.js', import.meta.url),
  'utf8',
);

if (!supabase.includes('if (PHASE2_RUNTIME_ENABLED) break;')) {
  throw new Error('Phase 2 push does not stop after the first failure');
}
if (!app.includes('${result.errors[0]}')) {
  throw new Error('The first Phase 2 database error is not shown to the user');
}

console.log(JSON.stringify({
  passed: true,
  checks: [
    'Phase 2 push stops after the first failed patient',
    'the exact first database error is displayed',
  ],
}, null, 2));
