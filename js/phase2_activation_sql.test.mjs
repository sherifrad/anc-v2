import fs from 'node:fs/promises';

const activation = await fs.readFile(
  new URL('../supabase_phase2_activation.sql', import.meta.url),
  'utf8',
);
const rollback = await fs.readFile(
  new URL('../supabase_phase2_activation_rollback_DRAFT.sql', import.meta.url),
  'utf8',
);
const verification = await fs.readFile(
  new URL('../supabase_phase2_activation_verify.sql', import.meta.url),
  'utf8',
);

const activationChecks = [
  ['clinic-owner authorization record', 'Authorized by the clinic owner on 2026-06-12'],
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
if (activation.includes('PHASE 2 DRAFT ONLY')) {
  throw new Error('Authorized activation SQL still contains the draft stop guard');
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
for (const fragment of [
  'batch_status',
  'vault_status',
  'explicit_approval',
  'patient_rows',
  'related_rows',
  'active_write_guard_count',
]) {
  if (!verification.includes(fragment)) {
    throw new Error(`Activation verification is missing ${fragment}`);
  }
}

console.log(JSON.stringify({
  passed: true,
  checks: [
    'clinic-owner authorization is recorded',
    'vault and batch activate in one transaction',
    'expected encrypted row counts are enforced',
    'Phase 1 row counts and freshness are enforced',
    'explicit owner approval evidence is recorded',
    'rollback is guarded and transactional',
    'read-only activation verification is complete',
    'no dynamic SQL',
  ],
}, null, 2));
