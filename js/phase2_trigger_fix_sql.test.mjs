import fs from 'node:fs/promises';

const sql = await fs.readFile(
  new URL('../supabase_phase2_patient_trigger_fix.sql', import.meta.url),
  'utf8',
);

for (const fragment of [
  "if tg_table_name = 'phase2_related_records' then",
  'if new.record_type <> old.record_type then',
  'Shadow row identity is immutable',
  'patient_safe_record_type_check',
  'active_write_guard_count',
]) {
  if (!sql.includes(fragment)) {
    throw new Error(`Trigger fix is missing: ${fragment}`);
  }
}
if (
  sql.includes(
    "if tg_table_name = 'phase2_related_records'\n"
      + '      and new.record_type <> old.record_type then',
  )
) {
  throw new Error('Unsafe cross-table record_type reference remains');
}
if (/\b(update|delete|insert)\s+(public\.)?phase2_(patient|related)_records\b/i.test(sql)) {
  throw new Error('Trigger fix directly modifies Phase 2 records');
}
if (/\bexecute\s+format\b/i.test(sql)) {
  throw new Error('Trigger fix contains dynamic SQL');
}

console.log(JSON.stringify({
  passed: true,
  checks: [
    'record_type check is isolated to the related-record table',
    'patient and related identity guards remain',
    'no patient or related records are modified',
    'no dynamic SQL',
  ],
}, null, 2));
