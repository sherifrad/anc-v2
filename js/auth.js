/* ═══════════════════════════════════════════════════════
   auth.js — Supabase owner-only authentication + TOTP MFA
═══════════════════════════════════════════════════════ */
const AUTH = (() => {
  const SUPA_URL = 'https://tfplewrzjlbugdgiuoum.supabase.co';
  const SUPA_KEY = 'sb_publishable_rnm4S-EW9KwMidxD1aTxww_UVUOlhFI';
  const OWNER_UID = 'bfcaa90e-c49c-4a94-8cfd-06a16a96a094';

  let client = null;
  let activeFactorId = null;
  let accessPromise = null;
  let resolveAccess = null;

  function el(id) {
    return document.getElementById(id);
  }

  function showPanel(panelId) {
    ['authLoadingPanel', 'authLoginPanel', 'authMfaPanel', 'authEnrollPanel'].forEach(id => {
      el(id).style.display = id === panelId ? 'flex' : 'none';
    });
  }

  function setError(id, message='') {
    el(id).textContent = message;
  }

  function setBusy(buttonId, busy, busyText, idleText) {
    const button = el(buttonId);
    button.disabled = busy;
    button.textContent = busy ? busyText : idleText;
  }

  function normalizeCode(value) {
    return String(value || '').replace(/\D/g, '').slice(0, 6);
  }

  async function ensureClient() {
    if (client) return client;
    if (!window.supabase?.createClient) {
      throw new Error('Secure login library could not load. Check your internet connection and reload.');
    }
    client = window.supabase.createClient(SUPA_URL, SUPA_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    return client;
  }

  async function getCurrentSession() {
    const supabaseClient = await ensureClient();
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    return data.session || null;
  }

  async function assertOwner(session) {
    if (!session?.user || session.user.id !== OWNER_UID) {
      await client.auth.signOut();
      throw new Error('This account is not authorized for this clinic.');
    }
  }

  async function getVerifiedTotpFactor() {
    const { data, error } = await client.auth.mfa.listFactors();
    if (error) throw error;
    return (data.totp || []).find(factor => factor.status === 'verified') || null;
  }

  async function beginEnrollment() {
    showPanel('authLoadingPanel');

    const listed = await client.auth.mfa.listFactors();
    if (listed.error) throw listed.error;

    // An interrupted enrollment cannot display its QR secret again. Remove
    // unverified factors and create one fresh enrollment.
    for (const factor of listed.data.totp || []) {
      if (factor.status !== 'verified') {
        await client.auth.mfa.unenroll({ factorId: factor.id }).catch(() => {});
      }
    }

    const { data, error } = await client.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'ANC Clinic Authenticator',
    });
    if (error) throw error;

    activeFactorId = data.id;
    el('authQrCode').src = data.totp.qr_code;
    el('authTotpSecret').textContent = data.totp.secret;
    el('authEnrollCode').value = '';
    setError('authEnrollError');
    showPanel('authEnrollPanel');
    el('authEnrollCode').focus();
  }

  async function routeAuthenticatedSession(session) {
    await assertOwner(session);

    const aal = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal.error) throw aal.error;

    if (aal.data.currentLevel === 'aal2') {
      finishAccess();
      return;
    }

    const verifiedFactor = await getVerifiedTotpFactor();
    if (verifiedFactor) {
      activeFactorId = verifiedFactor.id;
      el('authMfaCode').value = '';
      setError('authMfaError');
      showPanel('authMfaPanel');
      el('authMfaCode').focus();
      return;
    }

    await beginEnrollment();
  }

  function finishAccess() {
    el('authScreen').style.display = 'none';
    resolveAccess?.(true);
    resolveAccess = null;
  }

  async function handleLogin(event) {
    event.preventDefault();
    setError('authLoginError');
    setBusy('authLoginButton', true, 'Signing in…', 'Continue');

    try {
      const email = el('authEmail').value.trim();
      const password = el('authPassword').value;
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await routeAuthenticatedSession(data.session);
    } catch (error) {
      setError('authLoginError', error.message || 'Sign-in failed');
    } finally {
      setBusy('authLoginButton', false, 'Signing in…', 'Continue');
    }
  }

  async function challengeAndVerify(factorId, code) {
    const challenge = await client.auth.mfa.challenge({ factorId });
    if (challenge.error) throw challenge.error;

    const verify = await client.auth.mfa.verify({
      factorId,
      challengeId: challenge.data.id,
      code,
    });
    if (verify.error) throw verify.error;
  }

  async function handleMfa(event) {
    event.preventDefault();
    setError('authMfaError');
    const code = normalizeCode(el('authMfaCode').value);
    if (code.length !== 6) {
      setError('authMfaError', 'Enter the complete six-digit code.');
      return;
    }

    setBusy('authMfaButton', true, 'Verifying…', 'Verify code');
    try {
      await challengeAndVerify(activeFactorId, code);
      finishAccess();
    } catch (error) {
      setError('authMfaError', error.message || 'The verification code was not accepted.');
    } finally {
      setBusy('authMfaButton', false, 'Verifying…', 'Verify code');
    }
  }

  async function handleEnrollment(event) {
    event.preventDefault();
    setError('authEnrollError');
    const code = normalizeCode(el('authEnrollCode').value);
    if (code.length !== 6) {
      setError('authEnrollError', 'Enter the complete six-digit code.');
      return;
    }

    setBusy('authEnrollButton', true, 'Enabling…', 'Enable verification');
    try {
      await challengeAndVerify(activeFactorId, code);
      finishAccess();
    } catch (error) {
      setError('authEnrollError', error.message || 'The verification code was not accepted.');
    } finally {
      setBusy('authEnrollButton', false, 'Enabling…', 'Enable verification');
    }
  }

  async function signOut() {
    await client?.auth.signOut();
    activeFactorId = null;
    el('authPassword').value = '';
    el('authMfaCode').value = '';
    el('authEnrollCode').value = '';
    setError('authLoginError');
    showPanel('authLoginPanel');
    el('authEmail').focus();
  }

  function bindEvents() {
    el('authLoginPanel').addEventListener('submit', handleLogin);
    el('authMfaPanel').addEventListener('submit', handleMfa);
    el('authEnrollPanel').addEventListener('submit', handleEnrollment);
    document.querySelectorAll('[data-auth-signout]').forEach(button => {
      button.addEventListener('click', signOut);
    });
    ['authMfaCode', 'authEnrollCode'].forEach(id => {
      el(id).addEventListener('input', event => {
        event.target.value = normalizeCode(event.target.value);
      });
    });
  }

  async function initialize() {
    try {
      await ensureClient();
      bindEvents();
      const session = await getCurrentSession();
      if (!session) {
        showPanel('authLoginPanel');
        el('authEmail').focus();
        return;
      }
      await routeAuthenticatedSession(session);
    } catch (error) {
      console.error('Authentication initialization failed:', error);
      showPanel('authLoginPanel');
      setError('authLoginError', error.message || 'Secure login could not start.');
    }
  }

  function requireAccess() {
    if (!accessPromise) {
      accessPromise = new Promise(resolve => {
        resolveAccess = resolve;
      });
      initialize();
    }
    return accessPromise;
  }

  async function getAccessToken() {
    const session = await getCurrentSession();
    if (!session) throw new Error('Your secure session has expired. Reload and sign in again.');
    await assertOwner(session);

    const aal = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal.error) throw aal.error;
    if (aal.data.currentLevel !== 'aal2') {
      throw new Error('Authenticator verification is required before cloud access.');
    }
    return session.access_token;
  }

  function getClient() {
    return client;
  }

  async function getSecuritySession() {
    const session = await getCurrentSession();
    if (!session) {
      throw new Error('Your secure session has expired. Reload and sign in again.');
    }
    await assertOwner(session);
    const aal = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal.error) throw aal.error;
    return {
      user: session.user,
      aal: aal.data.currentLevel,
    };
  }

  return {
    requireAccess,
    getAccessToken,
    getClient,
    getSecuritySession,
    signOut,
  };
})();
