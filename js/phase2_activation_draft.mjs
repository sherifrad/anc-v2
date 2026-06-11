/*
 * PHASE 2A ACTIVATION REVIEW DRAFT - NOT LOADED BY THE APP
 *
 * Pure state-transition validation for migration activation.
 */

const TRANSITIONS = {
  draft: ['staged', 'failed'],
  staged: ['verified', 'failed', 'rolled_back'],
  verified: ['device_verified', 'failed', 'rolled_back'],
  device_verified: ['activation_approved', 'failed', 'rolled_back'],
  activation_approved: ['activated', 'rolled_back'],
  activated: ['rolled_back'],
  failed: ['rolled_back'],
  rolled_back: [],
};

export function transitionMigration(state, nextState, evidence={}) {
  if (!TRANSITIONS[state]?.includes(nextState)) {
    throw new Error(`Migration cannot move from ${state} to ${nextState}`);
  }

  if (nextState === 'verified') {
    if (!evidence.deepVerified || evidence.failedRows !== 0) {
      throw new Error('Deep verification evidence is required');
    }
  }

  if (nextState === 'device_verified') {
    if (!evidence.desktopPassed || !evidence.mobilePassed) {
      throw new Error('Desktop and mobile verification are both required');
    }
  }

  if (nextState === 'activation_approved') {
    if (!evidence.rollbackBackupVerified || !evidence.recoveryCodeConfirmed) {
      throw new Error('Rollback and recovery confirmation are required');
    }
  }

  if (nextState === 'activated') {
    if (!evidence.explicitApproval || evidence.approvedBy !== 'clinic-owner') {
      throw new Error('Explicit clinic-owner approval is required');
    }
  }

  return nextState;
}

export function allowedTransitions(state) {
  return [...(TRANSITIONS[state] || [])];
}

