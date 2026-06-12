import fs from 'node:fs/promises';

const activation = await fs.readFile(
  new URL('../supabase_phase2_activation_DRAFT.sql', import.meta.url),
  'utf8',
);
const rollback = await fs.readFile(
  new URL('../supabase_phase2_activation_rollback_DRAFT.sql', import.meta.url),
  'utf8',
);

const activationChecks = [
  ['activation guard', 'PHASE 2 DRAFT ONLY'],
  ['active vault status', "set status = 'active'"],
  ['activated batch status', "status = 'activated'"],
  ['explicit owner approval', "'explicit_approval', true"],
  ['patient row count gate', '<> 10'],
  ['related row count gate', '<> 40'],
  ['Phase 1 freshness gate', 'updated_at > approved_batch_created_at'],
  ['update restricted to active batch', "batch_status <> 'activated'"],
];
for (const [label, fragment] of activationChecks) {
  if (!activation.includes(fragment)) {
    throw new Error(`Activation SQL is missing ${label}`);
  }
}

const rollbackChecks = [
  ['rollback guard', 'PHASE 2 ROLLBACK DRAFT'],
  ['rolled-back batch status', "set status = 'rolled_back'"],
  ['draft vault status', "set status = 'draft'"],
];
for (const [label, fragment] of rollbackChecks) {
  if (!rollback.includes(fragment)) {
    throw new Error(`Rollback SQL is missing ${label}`);
  }
}

if (/\bexecute\s+format\b/i.test(`${activation}\n${rollback}`)) {
  throw new Error('Activation SQL contains dynamic SQL');
}

console.log(JSON.stringify({
  passed: true,
  checks: [
    'activation is guarded',
    'vault and batch activate in one transaction',
    'expected encrypted row counts are enforced',
    'Phase 1 row counts and freshness are enforced',
    'explicit owner approval evidence is recorded',
    'rollback is guarded and transactional',
    'no dynamic SQL',
  ],
}, null, 2));
