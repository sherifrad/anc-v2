(function(global){
  'use strict';

  const AUTH_PAUSED = 'AUTH paused for Basic Offline Release';
  const SUPA_PAUSED = 'SUPA paused for Basic Offline Release';

  function authPausedSync() {
    throw new Error(AUTH_PAUSED);
  }

  function authPausedAsync() {
    return Promise.reject(new Error(AUTH_PAUSED));
  }

  function supaPausedSync() {
    throw new Error(SUPA_PAUSED);
  }

  function supaPausedAsync() {
    return Promise.reject(new Error(SUPA_PAUSED));
  }

  global.AUTH = Object.freeze({
    getSessionKind() {
      return 'owner';
    },
    requireAccess() {
      return Promise.resolve(true);
    },
    signOut() {
      return Promise.resolve();
    },
    getAccessToken: authPausedAsync,
    getClient: authPausedSync,
    getSecuritySession: authPausedAsync,
    getTemporaryAccessContext: authPausedSync,
    requireFreshTotp: authPausedAsync,
    verifyFreshTotpCode: authPausedAsync,
  });

  global.SUPA = Object.freeze({
    isPhase2RuntimeEnabled() {
      return false;
    },
    isOnline() {
      return Promise.resolve(false);
    },
    getDeviceID() {
      return 'basic-offline-device';
    },
    configurePhase2Adapter: supaPausedSync,
    deletePatientCloud: supaPausedAsync,
    getAllPatients: supaPausedAsync,
    getPatient: supaPausedAsync,
    getRelated: supaPausedAsync,
    log: supaPausedAsync,
    pullFromCloud: supaPausedAsync,
    pushToCloud: supaPausedAsync,
    reconcilePhase2Local: supaPausedAsync,
    savePatient: supaPausedAsync,
    saveRelated: supaPausedAsync,
  });
})(typeof window !== 'undefined' ? window : globalThis);
