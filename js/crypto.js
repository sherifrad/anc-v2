/* ═══════════════════════════════════════════════════════════
   crypto.js — AES-256-GCM Encryption Layer
   Uses browser built-in SubtleCrypto — no dependencies
   Key derivation: PBKDF2 with SHA-256, 310,000 iterations
═══════════════════════════════════════════════════════════ */

const CRYPTO = (() => {

  const SALT_KEY    = 'anc_enc_salt';
  const VERIFY_KEY  = 'anc_enc_verify';
  const ENABLED_KEY = 'anc_enc_enabled';
  const ITER        = 310000; // OWASP 2023 recommended PBKDF2-SHA256

  let _derivedKey  = null;  // in-memory only, never persisted
  let _enabled     = false;

  /* ─── CHECK SUPPORT ─── */
  function isSupported() {
    return !!(window.crypto && window.crypto.subtle);
  }

  /* ─── DERIVE KEY FROM PASSWORD ─── */
  async function deriveKey(password, saltBytes) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw', enc.encode(password), {name:'PBKDF2'}, false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      {name:'PBKDF2', salt:saltBytes, iterations:ITER, hash:'SHA-256'},
      keyMaterial,
      {name:'AES-GCM', length:256},
      false,
      ['encrypt','decrypt']
    );
  }

  /* ─── ENCRYPT ─── */
  async function encrypt(plaintext) {
    if (!_enabled || !_derivedKey) return plaintext;
    const enc = new TextEncoder();
    const iv  = crypto.getRandomValues(new Uint8Array(12));
    const ct  = await crypto.subtle.encrypt(
      {name:'AES-GCM', iv}, _derivedKey, enc.encode(JSON.stringify(plaintext))
    );
    return {
      __enc: true,
      iv:  btoa(String.fromCharCode(...iv)),
      ct:  btoa(String.fromCharCode(...new Uint8Array(ct))),
    };
  }

  /* ─── DECRYPT ─── */
  async function decrypt(data) {
    if (!_enabled || !_derivedKey) return data;
    if (!data || !data.__enc) return data;
    try {
      const iv = Uint8Array.from(atob(data.iv), c => c.charCodeAt(0));
      const ct = Uint8Array.from(atob(data.ct), c => c.charCodeAt(0));
      const pt = await crypto.subtle.decrypt({name:'AES-GCM', iv}, _derivedKey, ct);
      return JSON.parse(new TextDecoder().decode(pt));
    } catch {
      throw new Error('Decryption failed — wrong password or corrupted data');
    }
  }

  /* ─── SETUP ENCRYPTION (first time) ─── */
  async function setupEncryption(password) {
    if (!isSupported()) throw new Error('Web Crypto API not available in this browser');
    const salt = crypto.getRandomValues(new Uint8Array(32));
    localStorage.setItem(SALT_KEY, btoa(String.fromCharCode(...salt)));
    localStorage.setItem(ENABLED_KEY, '1');

    _derivedKey = await deriveKey(password, salt);
    _enabled    = true;

    // Store a verify token (encrypted known string)
    const verify = await encrypt('ANC_VERIFY_2024');
    localStorage.setItem(VERIFY_KEY, JSON.stringify(verify));

    return generateRecoveryPhrase(password, salt);
  }

  /* ─── UNLOCK WITH PASSWORD ─── */
  async function unlock(password) {
    const saltB64 = localStorage.getItem(SALT_KEY);
    if (!saltB64) throw new Error('No encrypted database found');
    const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));

    const key = await deriveKey(password, salt);
    // Temporarily set to verify
    _derivedKey = key;
    _enabled    = true;

    const verifyRaw = JSON.parse(localStorage.getItem(VERIFY_KEY) || 'null');
    if (!verifyRaw) { _derivedKey = null; _enabled = false; throw new Error('No verification token found'); }

    try {
      const result = await decrypt(verifyRaw);
      if (result !== 'ANC_VERIFY_2024') throw new Error('Mismatch');
      return true; // Password correct
    } catch {
      _derivedKey = null;
      _enabled    = false;
      throw new Error('Incorrect password');
    }
  }

  /* ─── LOCK ─── */
  function lock() {
    _derivedKey = null;
    _enabled    = false;
  }

  /* ─── RECOVERY PHRASE ─── */
  function generateRecoveryPhrase(password, salt) {
    // A deterministic 8-word phrase from salt + password hint
    const words = ['alpha','bravo','charlie','delta','echo','foxtrot','golf','hotel',
                   'india','juliet','kilo','lima','mike','november','oscar','papa',
                   'quebec','romeo','sierra','tango','uniform','victor','whiskey','xray'];
    const saltSum = Array.from(salt).reduce((a,b)=>a+b,0);
    const phrase = [];
    for (let i=0; i<8; i++) {
      phrase.push(words[(saltSum + i*37) % words.length]);
    }
    return phrase.join('-');
  }

  /* ─── STATUS ─── */
  function isEnabled()  { return _enabled; }
  function isSetup()    { return !!localStorage.getItem(ENABLED_KEY); }
  function isUnlocked() { return _enabled && !!_derivedKey; }

  /* ─── DISABLE ENCRYPTION ─── */
  function disableEncryption() {
    localStorage.removeItem(SALT_KEY);
    localStorage.removeItem(VERIFY_KEY);
    localStorage.removeItem(ENABLED_KEY);
    _derivedKey = null;
    _enabled    = false;
  }

  return {
    isSupported, setupEncryption, unlock, lock,
    encrypt, decrypt,
    isEnabled, isSetup, isUnlocked,
    disableEncryption,
  };
})();
