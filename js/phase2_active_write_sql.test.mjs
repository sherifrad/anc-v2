import fs from 'node:fs/promises';

const sql = await fs.readFile(
  new URL('../supabase_phase2_active_write_DRAFT.sql', import.meta.url),
  'utf8',
);

const required = [
  "raise exception 'PHASE 2 DRAFT ONLY",
  "batch_status not in ('draft', 'activated')",
  "batch_status <> 'activated'",
  "before insert or update or delete",
  'Shadow row identity is immutable',
];
for (const text of required) {
  if (!sql.includes(text)) {
    throw new Error(`Active-write SQL guard is missing: ${text}`);
  }
}
if (/execute\s+format|quote_ident|quote_literal/i.test(sql)) {
  throw new Error('Active-write SQL uses dynamic SQL');
}

console.log(JSON.stringify({
  passed: true,
  checks: [
    'draft execution guard exists',
    'insert restricted to draft or activated',
    'update restricted to activated',
    'row identity is immutable',
    'no dynamic SQL',
  ],
}, null, 2));
