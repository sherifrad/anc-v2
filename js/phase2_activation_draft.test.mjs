import {
  allowedTransitions,
  transitionMigration,
} from './phase2_activation_draft.mjs';

let state = 'draft';
state = transitionMigration(state, 'staged');
state = transitionMigration(state, 'verified', {
  deepVerified: true,
  failedRows: 0,
});
state = transitionMigration(state, 'device_verified', {
  desktopPassed: true,
  mobilePassed: true,
});
state = transitionMigration(state, 'activation_approved', {
  rollbackBackupVerified: true,
  recoveryCodeConfirmed: true,
});
state = transitionMigration(state, 'activated', {
  explicitApproval: true,
  approvedBy: 'clinic-owner',
});

if (state !== 'activated') throw new Error('Happy-path activation failed');
if (!allowedTransitions('activated').includes('rolled_back')) {
  throw new Error('Activated migrations must remain rollback-capable');
}

const forbidden = [
  ['draft', 'activated', {}],
  ['staged', 'verified', { deepVerified: false, failedRows: 0 }],
  ['verified', 'device_verified', { desktopPassed: true, mobilePassed: false }],
  ['device_verified', 'activation_approved', {
    rollbackBackupVerified: true,
    recoveryCodeConfirmed: false,
  }],
  ['activation_approved', 'activated', {
    explicitApproval: false,
    approvedBy: 'clinic-owner',
  }],
];

for (const [from, to, evidence] of forbidden) {
  let rejected = false;
  try {
    transitionMigration(from, to, evidence);
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error(`Unsafe transition ${from} -> ${to} was accepted`);
}

console.log(JSON.stringify({
  passed: true,
  checks: [
    'ordered activation workflow',
    'no direct draft activation',
    'deep verification required',
    'desktop and mobile checks required',
    'rollback and recovery confirmation required',
    'explicit owner approval required',
    'post-activation rollback remains available',
  ],
}, null, 2));

