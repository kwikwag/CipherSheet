// ══════════════════════════════════════════════════════════════
//  CipherSheet sidebar — asymmetric (ECDH) + pre-shared (AES)
//  Key never leaves JS context. Plaintext only sent to server
//  at revealCell(), after UserCache-confirmed consent.
// ══════════════════════════════════════════════════════════════

// ── Constants ──────────────────────────────────────────────────
const VAULT_PFX      = '\uD83D\uDD10'; // 🔐
const PRF_EVAL_INPUT = new TextEncoder().encode('CipherSheet unlock key v1');
const TYPE_ECDH     = 0x02;
const TYPE_PRESHARED = 0x01;
const IV_LEN        = 12;
const HKDF_INFO     = new TextEncoder().encode('CipherSheet'); // domain-separation tag; keeps derived keys invalid outside this protocol
const PBKDF2_ITERS  = 310000; // OWASP 2023 minimum for PBKDF2-SHA-256
const IDB_DB        = 'CipherSheet';
const IDB_STORE     = 'keys';
const IDB_ECDH_KEY  = 'ecdh';
const POLL_MS       = 800;
const POLL_MAX      = 75;
// FEEDBACK_URL, DONATE_URL, PRIVACY_URL, and PASSKEY_POPUP_URL are injected by sidebar.html.

// ── Session state ──────────────────────────────────────────────
let ecdhPrivKey    = null;  // non-extractable ECDH CryptoKey
let ecdhPubKey     = null;  // ECDH public CryptoKey
let presharedKey   = null;  // non-extractable AES-GCM CryptoKey
let unlockPassword = null;  // auto-generated password, in memory while unlocked
let currentCell    = null;
let cellIsEncrypted = false;
let pollTimer      = null;
let pubKeyCache    = [];    // [{ email: string, pubKey: CryptoKey, fp: string }]
let ownEmail       = '';
let setupPassword  = null;  // set during keypair generation, cleared after display
let defaultKeyType = 'ecdh'; // loaded from document settings at init
let emailReady     = Promise.resolve(); // resolves when ownEmail is set
let keyInStorage   = false;            // true when IDB has a stored keypair
let groupCache     = [];               // [{ id, emailHashes, label }]
let ecdhFp         = null;             // fingerprint of active ECDH public key

// ── Encoding helpers ───────────────────────────────────────────
const buf2b64    = b => btoa(String.fromCharCode(...new Uint8Array(b)));
const b642buf    = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const buf2hex    = b => Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2,'0')).join('');
const b64url2buf = s => b642buf(s.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(s.length/4)*4,'='));
const buf2b64url = b => buf2b64(b).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ── Toast ──────────────────────────────────────────────────────
let toastTimer;
function toast(msg, type, duration) {
  document.getElementById('toast-msg').textContent = msg;
  const bar = document.getElementById('status-bar');
  bar.className = 'show' + (type ? ' s-' + type : '');
  clearTimeout(toastTimer);
  if (type !== 'warn' && type !== 'err') {
    duration = duration || 3200;
    toastTimer = setTimeout(dismissToast, duration);
  }
}
function dismissToast() {
  clearTimeout(toastTimer);
  document.getElementById('status-bar').classList.remove('show');
}

// ── Loading overlay ────────────────────────────────────────────
function setLoading(on) {
  const overlay = document.getElementById('loadingOverlay');
  overlay.classList.toggle('visible', on);
  if (!on) overlay.offsetHeight;
  document.getElementById('progressWrap').classList.toggle('visible', on);
  document.getElementById('btnUpdate').disabled  = on || !canEncrypt();
  document.getElementById('btnDecrypt').disabled = on;
}

function canEncrypt() { return ecdhPrivKey !== null || presharedKey !== null; }
function canDecrypt(type) {
  if (type === TYPE_ECDH)      return ecdhPrivKey !== null;
  if (type === TYPE_PRESHARED) return presharedKey !== null;
  return false;
}

// ── IndexedDB helpers ──────────────────────────────────────────
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB, 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore(IDB_STORE);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}
async function idbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}
async function idbPut(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}
async function idbDelete(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).delete(key);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

// ── Key wrapping ───────────────────────────────────────────────
async function deriveWrappingKey(password, salt) {
  const km = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERS },
    km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}

async function wrapData(data, password) {
  const salt   = crypto.getRandomValues(new Uint8Array(16));
  const iv     = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const wrapKey = await deriveWrappingKey(password, salt);
  const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrapKey, data);
  return { wrapped: new Uint8Array(wrapped), iv, salt };
}

async function unwrapData(entry, password) {
  const wrapKey = await deriveWrappingKey(password, entry.salt);
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: entry.iv }, wrapKey, entry.wrapped);
}

// ── Fingerprint ────────────────────────────────────────────────
async function fingerprint(bytes) {
  const h = await crypto.subtle.digest('SHA-256', bytes);
  return buf2hex(h).match(/.{8}/g).join('-');
}

// ── ECDH crypto ────────────────────────────────────────────────
async function encryptECDH(plaintext, recipients) {
  // recipients: [{ email, pubKey: CryptoKey }]
  const cellKey    = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const cellKeyRaw = new Uint8Array(await crypto.subtle.exportKey('raw', cellKey));
  const iv  = crypto.getRandomValues(new Uint8Array(IV_LEN));
  // AAD is the single type byte only.
  // The recipient list is intentionally excluded: including it would invalidate the tag
  // on every add-recipient operation, forcing a full re-encryption of the cell value.
  // The ephemeral public key is excluded because it is already bound cryptographically
  // as the HKDF salt when deriving each per-recipient wrapping key.
  const aad = new Uint8Array([TYPE_ECDH]);
  const ct  = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128, additionalData: aad },
    cellKey, new TextEncoder().encode(plaintext)
  ));

  const ephPair  = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const ephPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', ephPair.publicKey));

  const entries = [];
  for (const { email, pubKey } of recipients) {
    // deriveBits with length=256 extracts the 32-byte x-coordinate of the shared
    // elliptic curve point — the standard ECDH shared secret for P-256.
    const sharedBits = new Uint8Array(await crypto.subtle.deriveBits(
      { name: 'ECDH', public: pubKey }, ephPair.privateKey, 256
    ));
    const hkdfKm = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
    // Using ephPubRaw as the HKDF salt cryptographically binds this wrapping key to the
    // specific ephemeral keypair. This makes the wrapping key unique per encryption event
    // even if the same (ephemeral, recipient) pair were ever reused, and removes any need
    // to include ephemeral_pub explicitly in the cell-value AAD.
    const wrapKey = await crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: ephPubRaw, info: HKDF_INFO },
      hkdfKm, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
    );
    const wrapIv  = crypto.getRandomValues(new Uint8Array(IV_LEN));
    // AES-GCM returns ciphertext || tag concatenated. Cell key is 32 bytes, so
    // wrapOut is exactly 48 bytes: first 32 = ciphertext, last 16 = tag.
    const wrapOut = new Uint8Array(await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: wrapIv, tagLength: 128 }, wrapKey, cellKeyRaw
    ));
    const idBytes = new Uint8Array(await crypto.subtle.digest(
      'SHA-256', new TextEncoder().encode(email.toLowerCase())
    ));
    entries.push({ idBytes, wrapIv, wrappedKey: wrapOut.slice(0, 32), wrapTag: wrapOut.slice(32) });
  }

  const ctLen     = ct.byteLength;
  const nR        = entries.length;
  const totalSize = 1 + IV_LEN + 4 + ctLen + 65 + 2 + nR * 92;
  const payload   = new Uint8Array(totalSize);
  let off = 0;
  payload[off++] = TYPE_ECDH;
  payload.set(iv, off); off += IV_LEN;
  payload[off++] = (ctLen >> 24) & 0xff; payload[off++] = (ctLen >> 16) & 0xff;
  payload[off++] = (ctLen >>  8) & 0xff; payload[off++] =  ctLen        & 0xff;
  payload.set(ct, off); off += ctLen;
  payload.set(ephPubRaw, off); off += 65;
  payload[off++] = (nR >> 8) & 0xff; payload[off++] = nR & 0xff;
  for (const { idBytes, wrapIv, wrappedKey, wrapTag } of entries) {
    payload.set(idBytes,    off); off += 32;
    payload.set(wrapIv,     off); off += IV_LEN;
    payload.set(wrappedKey, off); off += 32;
    payload.set(wrapTag,    off); off += 16;
  }
  return VAULT_PFX + buf2b64(payload.buffer);
}

async function decryptECDH(payload) {
  let off = 1;
  const iv    = payload.slice(off, off + IV_LEN); off += IV_LEN;
  const ctLen = (payload[off] << 24) | (payload[off+1] << 16) | (payload[off+2] << 8) | payload[off+3];
  off += 4;
  const ct        = payload.slice(off, off + ctLen); off += ctLen;
  const ephPubRaw = payload.slice(off, off + 65); off += 65;
  const nR        = (payload[off] << 8) | payload[off+1]; off += 2;

  if (!ownEmail) throw new Error('Own email not available — please refresh');
  const ownId = new Uint8Array(await crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(ownEmail.toLowerCase())
  ));

  // Stride: 32 (id) + 12 (wrapIv) + 32 (wrappedKey) + 16 (wrapTag) = 92 bytes per recipient.
  // The loop always scans all recipients without short-circuiting, so it does not leak
  // the matched position through timing or early exit.
  let myEntry = null;
  for (let i = 0; i < nR; i++) {
    const idBytes    = payload.slice(off,      off + 32);
    const wrapIv     = payload.slice(off + 32, off + 44);
    const wrappedKey = payload.slice(off + 44, off + 76);
    const wrapTag    = payload.slice(off + 76, off + 92);
    off += 92;
    if (arraysEqual(idBytes, ownId)) myEntry = { wrapIv, wrappedKey, wrapTag };
  }
  if (!myEntry) throw new Error('You are not a recipient of this cell');

  const ephPubKey = await crypto.subtle.importKey(
    'raw', ephPubRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, []
  );
  const sharedBits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'ECDH', public: ephPubKey }, ecdhPrivKey, 256
  ));
  const hkdfKm = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
  const wrapKey = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: ephPubRaw, info: HKDF_INFO },
    hkdfKm, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
  );

  const wrapCt = new Uint8Array(48);
  wrapCt.set(myEntry.wrappedKey, 0); wrapCt.set(myEntry.wrapTag, 32);
  const cellKeyRaw = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: myEntry.wrapIv, tagLength: 128 }, wrapKey, wrapCt
  );
  const cellKey = await crypto.subtle.importKey('raw', cellKeyRaw, { name: 'AES-GCM' }, false, ['decrypt']);
  const aad = new Uint8Array([TYPE_ECDH]);
  const pt  = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: 128, additionalData: aad }, cellKey, ct
  );
  return new TextDecoder().decode(pt);
}

// ── Pre-shared key crypto ──────────────────────────────────────
async function encryptPreshared(plaintext) {
  const iv  = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const aad = new Uint8Array([TYPE_PRESHARED]);
  const ct  = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128, additionalData: aad },
    presharedKey, new TextEncoder().encode(plaintext)
  ));
  const ctLen  = ct.byteLength;
  const payload = new Uint8Array(1 + IV_LEN + 4 + ctLen);
  let off = 0;
  payload[off++] = TYPE_PRESHARED;
  payload.set(iv, off); off += IV_LEN;
  payload[off++] = (ctLen >> 24) & 0xff; payload[off++] = (ctLen >> 16) & 0xff;
  payload[off++] = (ctLen >>  8) & 0xff; payload[off++] =  ctLen        & 0xff;
  payload.set(ct, off);
  return VAULT_PFX + buf2b64(payload.buffer);
}

async function decryptPreshared(payload) {
  let off = 1;
  const iv    = payload.slice(off, off + IV_LEN); off += IV_LEN;
  const ctLen = (payload[off] << 24) | (payload[off+1] << 16) | (payload[off+2] << 8) | payload[off+3];
  off += 4;
  const ct  = payload.slice(off, off + ctLen);
  const aad = new Uint8Array([TYPE_PRESHARED]);
  const pt  = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: 128, additionalData: aad }, presharedKey, ct
  );
  return new TextDecoder().decode(pt);
}

// ── Unified decrypt dispatcher ─────────────────────────────────
async function decrypt(ciphertextStr) {
  if (!ciphertextStr.startsWith(VAULT_PFX)) throw new Error('not a vault value');
  const payload = b642buf(ciphertextStr.slice(VAULT_PFX.length));
  const type    = payload[0];
  if (type === TYPE_ECDH)      return decryptECDH(payload);
  if (type === TYPE_PRESHARED) return decryptPreshared(payload);
  throw new Error('Unknown encryption type (0x' + type.toString(16).toUpperCase() +
    ') — please update the add-on to open this cell.');
}

// ── ECDH keypair generation and storage ────────────────────────
async function setupNewKeypair() {
  const btn = document.getElementById('btnGenKey');
  btn.disabled = true; btn.textContent = 'Generating…';
  setLoading(true);
  try {
    // Generate keypair (extractable=true so we can export JWK for backup)
    const keyPair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']
    );
    const jwk         = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
    const spki        = new Uint8Array(await crypto.subtle.exportKey('spki', keyPair.publicKey));
    const fp          = await fingerprint(spki);
    const password    = buf2b64url(crypto.getRandomValues(new Uint8Array(32)));
    const jwkBytes    = new TextEncoder().encode(JSON.stringify(jwk));

    // Wrap and store in IndexedDB.
    // publicKeySpki and publicKeyFp are stored unencrypted so the locked-state UI
    // can display the fingerprint for identity confirmation without needing the password.
    const { wrapped, iv, salt } = await wrapData(jwkBytes, password);
    let credentialId = null;
    try {
      // c2: forward-compatible PRF probe — throws SecurityError today in the iframe;
      // if Google ever adds the iframe permission header, this will silently start working.
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const cred = await navigator.credentials.create({ publicKey: {
        challenge, rp: { name: 'CipherSheet' },
        user: { id: new TextEncoder().encode(fp), name: ownEmail || 'user', displayName: 'CipherSheet' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
        authenticatorSelection: { userVerification: 'required' },
        extensions: { prf: {} }
      }});
      if (cred) credentialId = Array.from(new Uint8Array(cred.rawId));
    } catch (_) {}
    await idbPut(IDB_ECDH_KEY, { wrapped, iv, salt, publicKeySpki: spki, publicKeyFp: fp, credentialId });

    // Try to store password via PasswordCredential (Chrome password manager)
    if (window.PasswordCredential) {
      try {
        const cred = new PasswordCredential({ id: 'ciphersheet-key', password, name: 'CipherSheet Keypair' });
        await navigator.credentials.store(cred);
      } catch (_) {}
    }

    // Download .ciphersheet-key backup BEFORE re-importing as non-extractable.
    // Once re-imported with extractable:false the JWK can no longer be read back,
    // so the download must happen while the original extractable key is still in scope.
    const backup = JSON.stringify({ type: 'CipherSheet-ECDH-P256', version: 1, jwk }, null, 2);
    Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([backup], { type: 'application/json' })),
      download: 'ciphersheet.ciphersheet-key'
    }).click();

    // Re-import private key as non-extractable for session use.
    // Non-extractable CryptoKeys cannot be read out of the JS engine even by XSS;
    // deriveBits still works on them.
    ecdhPrivKey   = await crypto.subtle.importKey(
      'jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']
    );
    ecdhPubKey    = keyPair.publicKey;
    unlockPassword = password;

    // Register public key server-side
    await new Promise((res, rej) =>
      google.script.run.withSuccessHandler(res).withFailureHandler(rej)
        .storePublicKey(buf2b64(spki.buffer))
    );
    await refreshPubKeyCache();

    setupPassword = password;
    showKeyState();
    renderField(currentCell);
    updateButtons();
    document.getElementById('passwordSetupBox').style.display = 'block';
    document.getElementById('setupPasswordDisplay').textContent = password;

    toast('Keypair generated! Save the unlock password below.', 'warn', 8000);
  } catch(e) {
    toast('Setup failed: ' + e.message, 'err');
  } finally {
    btn.disabled = false; btn.textContent = 'Generate key';
    setLoading(false);
  }
}

async function generatePresharedKey() {
  const btn = document.getElementById('btnGenKey');
  btn.disabled = true; btn.textContent = 'Generating…';
  setLoading(true);
  try {
    const keyBytes = crypto.getRandomValues(new Uint8Array(32));
    const backup = JSON.stringify({ type: 'CipherSheet-AES256', version: 1, key: buf2b64(keyBytes.buffer) }, null, 2);
    Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([backup], { type: 'application/json' })),
      download: 'ciphersheet.ciphersheet-key'
    }).click();
    await activatePresharedKey(keyBytes, { type: 'CipherSheet-AES256', version: 1 });
    toast('Shared key generated and downloaded. Keep the file safe!', 'warn', 8000);
  } catch(e) {
    toast('Setup failed: ' + e.message, 'err');
  } finally {
    btn.disabled = false; btn.textContent = 'Generate key';
    setLoading(false);
  }
}

function generateKey() {
  if (defaultKeyType === 'preshared') generatePresharedKey();
  else setupNewKeypair();
}

async function _importEcdhFromJwk(jwk) {
  const pubJwk  = { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
  const pubKey  = await crypto.subtle.importKey(
    'jwk', pubJwk, { name: 'ECDH', namedCurve: 'P-256' }, true, []
  );
  const spki    = new Uint8Array(await crypto.subtle.exportKey('spki', pubKey));
  const fp      = await fingerprint(spki);
  const password = buf2b64url(crypto.getRandomValues(new Uint8Array(32)));
  const jwkBytes = new TextEncoder().encode(JSON.stringify(jwk));
  const { wrapped, iv, salt } = await wrapData(jwkBytes, password);
  let credentialId = null;
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const cred = await navigator.credentials.create({ publicKey: {
      challenge, rp: { name: 'CipherSheet' },
      user: { id: new TextEncoder().encode(fp), name: ownEmail || 'user', displayName: 'CipherSheet' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      authenticatorSelection: { userVerification: 'required' },
      extensions: { prf: {} }
    }});
    if (cred) credentialId = Array.from(new Uint8Array(cred.rawId));
  } catch (_) {}
  await idbPut(IDB_ECDH_KEY, { wrapped, iv, salt, publicKeySpki: spki, publicKeyFp: fp, credentialId });

  ecdhPrivKey   = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']
  );
  ecdhPubKey    = pubKey;
  unlockPassword = password;

  if (window.PasswordCredential) {
    try {
      const cred = new PasswordCredential({ id: 'ciphersheet-key', password, name: 'CipherSheet Keypair' });
      await navigator.credentials.store(cred);
    } catch (_) {}
  }
  _triggerPasswordSave(password);

  try {
    await new Promise((res, rej) =>
      google.script.run.withSuccessHandler(res).withFailureHandler(rej)
        .storePublicKey(buf2b64(spki.buffer))
    );
    await refreshPubKeyCache();
  } catch(_) {}

  setupPassword = password;
  showKeyState();
  renderField(currentCell);
  updateButtons();
  document.getElementById('passwordSetupBox').style.display = 'block';
  document.getElementById('setupPasswordDisplay').textContent = password;
  toast('Keypair imported! Save the unlock password.', 'warn', 8000);
}

async function handleKeypairImport(e) {
  const f = e.target.files[0]; e.target.value = '';
  if (f) await loadKeyFile(f);
}

// ── Unlock ECDH key ────────────────────────────────────────────
function showForgetKeyConfirm() {
  document.getElementById('forgetKeyConfirm').style.display = 'block';
}
function hideForgetKeyConfirm() {
  document.getElementById('forgetKeyConfirm').style.display = 'none';
}
async function forgetKey() {
  await idbDelete(IDB_ECDH_KEY);
  hideForgetKeyConfirm();
  showKeyState();
}

async function unlockWithPassword() {
  const pw = document.getElementById('unlockPassword').value.trim();
  if (!pw) { toast('Enter the unlock password', 'warn'); return; }
  const btn = document.querySelector('.btn-pw-unlock');
  btn.disabled = true;
  setLoading(true);
  try {
    await _doUnlockWithPassword(pw);
    document.getElementById('unlockPassword').value = '';
  } catch(e) {
    toast('Wrong password or corrupted key: ' + e.message, 'err');
  } finally {
    btn.disabled = false;
    setLoading(false);
  }
}

async function _doUnlockWithPassword(password) {
  const entry = await idbGet(IDB_ECDH_KEY);
  if (!entry) throw new Error('No stored keypair found');

  const jwkBytes = await unwrapData(entry, password);
  const jwk      = JSON.parse(new TextDecoder().decode(jwkBytes));

  // Use the stored SPKI bytes — do NOT try exportKey('spki', privateKey),
  // which always throws because SPKI is a public-key-only format.
  const spki = new Uint8Array(entry.publicKeySpki);

  ecdhPrivKey = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']
  );
  ecdhPubKey  = await crypto.subtle.importKey(
    'spki', spki, { name: 'ECDH', namedCurve: 'P-256' }, true, []
  );
  unlockPassword = password;

  await refreshPubKeyCache();
  showKeyState();
  renderField(currentCell);
  await autoDecrypt();
  updateButtons();
  toast('Key unlocked', 'ok');
}

function lockEcdh() {
  ecdhPrivKey    = null;
  ecdhPubKey     = null;
  unlockPassword = null;
  showKeyState();
  renderField(currentCell);
  updateButtons();
  toast('Keypair locked');
}

// ── Pre-shared key management ──────────────────────────────────
async function handleFileInput(e) {
  const f = e.target.files[0]; e.target.value = '';
  if (f) await loadKeyFile(f);
}

const valueWrap = document.getElementById('valueWrap');
valueWrap.addEventListener('dragover', e => {
  if (!presharedKey && !ecdhPrivKey) { e.preventDefault(); valueWrap.classList.add('drag-over'); }
});
valueWrap.addEventListener('dragleave', () => valueWrap.classList.remove('drag-over'));
valueWrap.addEventListener('drop', async e => {
  e.preventDefault(); valueWrap.classList.remove('drag-over');
  if (presharedKey && ecdhPrivKey) return;
  const f = e.dataTransfer.files[0]; if (f) await loadKeyFile(f);
});

async function loadKeyFile(file) {
  try {
    const text = await file.text();
    let obj;
    try { obj = JSON.parse(text.trim()); } catch(_) {}

    if (obj && obj.type === 'CipherSheet-ECDH-P256') {
      const jwk = obj.jwk || (obj.d ? obj : null);
      if (!jwk) throw new Error('Unrecognized .ciphersheet-key format');
      await _importEcdhFromJwk(jwk);
    } else if (obj && obj.type === 'CipherSheet-AES256') {
      if (!obj.key) throw new Error('Missing key field in .ciphersheet-key');
      const bytes = b642buf(obj.key);
      if (bytes.length !== 32) throw new Error('Expected 256-bit key');
      await activatePresharedKey(bytes, { type: obj.type, version: obj.version });
    } else if (obj && (obj.jwk || obj.d)) {
      // Legacy bare ECDH JWK
      const jwk = obj.jwk || obj;
      await _importEcdhFromJwk(jwk);
    } else {
      // Legacy pre-shared: JSON with key field or bare base64
      let bytes;
      if (obj && obj.key) { bytes = b642buf(obj.key); }
      else if (!obj) { try { bytes = b642buf(text.trim()); } catch(_) {} }
      if (!bytes || bytes.length !== 32) throw new Error('Unrecognized key file format — expected .ciphersheet-key');
      await activatePresharedKey(bytes, obj ? { type: obj.type, version: obj.version } : undefined);
    }
  } catch(e) {
    toast('Could not load key: ' + e.message, 'err');
  }
}

async function activatePresharedKey(keyBytes, _meta) {
  // Validate against current cell if encrypted
  if (currentCell) {
    const raw = String(currentCell.value || '');
    if (raw.startsWith(VAULT_PFX) && raw.length > 2) {
      const payload = b642buf(raw.slice(VAULT_PFX.length));
      if (payload[0] === TYPE_PRESHARED) {
        try {
          const candidate = await crypto.subtle.importKey(
            'raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']
          );
          let off = 1;
          const iv    = payload.slice(off, off + IV_LEN); off += IV_LEN;
          const ctLen = (payload[off] << 24) | (payload[off+1] << 16) | (payload[off+2] << 8) | payload[off+3]; off += 4;
          const ct    = payload.slice(off, off + ctLen);
          await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv, tagLength: 128, additionalData: new Uint8Array([TYPE_PRESHARED]) },
            candidate, ct
          );
        } catch(_) {
          toast('Wrong key — cannot decrypt this cell', 'err'); return;
        }
      }
    }
  }

  presharedKey = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']
  );
  const fp = await fingerprint(keyBytes);
  document.getElementById('kPsFp').textContent = fp;
  document.getElementById('ks-preshared-loaded').style.display = 'block';
  updateButtons();
  await autoDecrypt();
  toast('Pre-shared key loaded', 'ok');
}

function clearPresharedKey() {
  presharedKey = null;
  document.getElementById('ks-preshared-loaded').style.display = 'none';
  renderField(currentCell);
  updateButtons();
  toast('Pre-shared key unloaded');
}

// ── Key section display ────────────────────────────────────────
async function showKeyState() {
  const entry = await idbGet(IDB_ECDH_KEY).catch(() => null);
  keyInStorage = !!entry;

  if (ecdhPrivKey) {
    // Unlocked
    document.getElementById('ks-setup').style.display  = 'none';
    document.getElementById('ks-locked').style.display = 'none';
    document.getElementById('forgetKeyConfirm').style.display = 'none';
    document.getElementById('ks-unlocked').style.display = 'block';
    if (ecdhPubKey) {
      const spki = new Uint8Array(await crypto.subtle.exportKey('spki', ecdhPubKey));
      const fp   = await fingerprint(spki);
      ecdhFp = fp;
      document.getElementById('kEmail').textContent       = ownEmail || '—';
      document.getElementById('kFingerprint').textContent = fp;
    }
    const hasPasskey = !!(entry?.credentialId && entry?.prfWrappedPassword);
    const enBtn = document.getElementById('btnEnablePasskey');
    if (enBtn) enBtn.style.display = (PASSKEY_POPUP_URL && !hasPasskey) ? '' : 'none';
  } else if (entry) {
    // Locked — show fingerprint from stored entry
    document.getElementById('ks-setup').style.display    = 'none';
    document.getElementById('ks-locked').style.display   = 'block';
    document.getElementById('ks-unlocked').style.display = 'none';
    document.getElementById('ksLockedFp').textContent    = entry.publicKeyFp || '';
    const hasPasskey = !!(entry.credentialId && entry.prfWrappedPassword);
    const pkBtn = document.getElementById('btnPasskeyUnlock');
    if (pkBtn) pkBtn.style.display = hasPasskey ? '' : 'none';
  } else {
    // No keys
    document.getElementById('ks-setup').style.display    = 'block';
    document.getElementById('ks-locked').style.display   = 'none';
    document.getElementById('forgetKeyConfirm').style.display = 'none';
    document.getElementById('ks-unlocked').style.display = 'none';
  }
}

// ── Copy setup password ────────────────────────────────────────
function copySetupPassword() {
  const pw = document.getElementById('setupPasswordDisplay').textContent;
  navigator.clipboard.writeText(pw).then(
    () => toast('Password copied', 'ok'),
    () => toast('Copy failed — select and copy manually', 'warn')
  );
}

// ── PRF (passkey) unlock ───────────────────────────────────────
function _prfPopupHandshake(action, extraData) {
  return new Promise((resolve, reject) => {
    if (!PASSKEY_POPUP_URL) { reject(new Error('Passkey popup URL not configured')); return; }
    const popupOrigin = new URL(PASSKEY_POPUP_URL).origin;
    const channel = buf2b64url(crypto.getRandomValues(new Uint8Array(16)));
    const url = PASSKEY_POPUP_URL +
      '?action=' + encodeURIComponent(action) +
      '&channel=' + encodeURIComponent(channel) +
      '&returnOrigin=' + encodeURIComponent(window.location.origin);
    const popup = window.open(
      url, 'ciphersheet-prf',
      'width=480,height=280,toolbar=no,menubar=no,location=no,scrollbars=no'
    );
    if (!popup) { reject(new Error('Popup was blocked — allow popups for this site')); return; }
    console.log('[prf] opened popup');

    const timeout = setTimeout(() => { cleanup(); reject(new Error('Passkey timed out')); }, 90000);
    const closedCheck = setInterval(() => {
      if (popup.closed) { cleanup(); reject(new Error('Passkey popup was closed')); }
    }, 600);

    function postStart() {
      console.log('[prf] sending prf-start via postMessage');
      popup.postMessage({ type: 'prf-start', channel, ...extraData }, popupOrigin);
    }
    // Keep retrying until the static popup is loaded. Duplicate starts are ignored there.
    const startRetry = setInterval(postStart, 1000);
    const initialStart = setTimeout(postStart, 250);

    function cleanup() {
      clearTimeout(timeout); clearTimeout(initialStart); clearInterval(startRetry); clearInterval(closedCheck);
      window.removeEventListener('message', onMessage);
    }
    function onMessage(evt) {
      if (evt.origin !== popupOrigin || evt.source !== popup) return;
      const msg = evt.data;
      if (msg?.channel !== channel) return;
      console.log('[prf] sidebar got popup message:', msg?.type);
      if (msg?.type === 'prf-ready') {
        postStart();
      } else if (msg?.type === 'prf-result') {
        cleanup(); resolve(msg);
      } else if (msg?.type === 'prf-error') {
        cleanup(); reject(new Error(msg.message || 'Passkey operation failed'));
      }
    }
    window.addEventListener('message', onMessage);
  });
}

async function _storePrfWrap(credentialId, prfOutput, password) {
  const key = await crypto.subtle.importKey('raw', prfOutput, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, new TextEncoder().encode(password)
  );
  const existing = await idbGet(IDB_ECDH_KEY);
  if (!existing) return;
  await idbPut(IDB_ECDH_KEY, {
    ...existing,
    credentialId,
    prfWrappedPassword: new Uint8Array(enc),
    prfPasswordIv: iv
  });
}

async function _prfUserHandle(fp) {
  const source = 'CipherSheet passkey user v1:' + (ownEmail || '') + ':' + (fp || '');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  return Array.from(new Uint8Array(digest));
}

async function _tryPrfEnroll(password, fp) {
  if (!PASSKEY_POPUP_URL) return;
  const btn = document.getElementById('btnEnablePasskey');
  if (btn) btn.disabled = true;
  try {
    const challenge  = Array.from(crypto.getRandomValues(new Uint8Array(32)));
    const userHandle = await _prfUserHandle(fp);
    const msg = await _prfPopupHandshake('prf-enroll', {
      challenge, userHandle,
      userName:  ownEmail || 'user',
      evalInput: Array.from(PRF_EVAL_INPUT)
    });
    if (msg.prfOutput && msg.credentialId) {
      await _storePrfWrap(msg.credentialId, new Uint8Array(msg.prfOutput), password);
      await showKeyState();
      toast('Passkey unlock enabled!', 'ok');
    }
  } catch (e) {
    if (e.message !== 'Passkey popup was closed') {
      toast('Passkey setup failed: ' + e.message, 'err');
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function enablePasskeyUnlock() {
  if (!ecdhPrivKey) { toast('Unlock your keypair first', 'warn'); return; }
  const fp = ecdhFp ||
    (ecdhPubKey
      ? await fingerprint(new Uint8Array(await crypto.subtle.exportKey('spki', ecdhPubKey)))
      : '');
  await _tryPrfEnroll(unlockPassword, fp);
}

async function unlockWithPasskey() {
  const btn = document.getElementById('btnPasskeyUnlock');
  if (btn) btn.disabled = true;
  setLoading(true);
  try {
    const entry = await idbGet(IDB_ECDH_KEY);
    if (!entry?.credentialId || !entry?.prfWrappedPassword) throw new Error('No passkey enrolled');
    const challenge = Array.from(crypto.getRandomValues(new Uint8Array(32)));
    const msg = await _prfPopupHandshake('prf-get', {
      challenge,
      credentialId: entry.credentialId,
      evalInput: Array.from(PRF_EVAL_INPUT)
    });
    if (!msg.prfOutput) throw new Error('No PRF output received');
    const prfKey = await crypto.subtle.importKey(
      'raw', new Uint8Array(msg.prfOutput), { name: 'AES-GCM' }, false, ['decrypt']
    );
    const pwBytes = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(entry.prfPasswordIv) },
      prfKey, entry.prfWrappedPassword
    );
    await _doUnlockWithPassword(new TextDecoder().decode(pwBytes));
  } catch (e) {
    if (e.message !== 'Passkey popup was closed') {
      toast('Passkey unlock failed: ' + e.message, 'err');
    }
  } finally {
    if (btn) btn.disabled = false;
    setLoading(false);
  }
}

// ── HTML escaping ──────────────────────────────────────────────
function escHtml(s) {
  return String(s).slice(0, 200).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])
  );
}

// ── SHA-256 hex helper (for group id computation) ──────────────
async function sha256hex(str) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return buf2hex(h);
}

async function computeGroupId(emailHashes) {
  const sorted = [...emailHashes].sort().join('|');
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sorted));
  return buf2hex(h).slice(0, 16);
}

// ── Group cache ────────────────────────────────────────────────
async function refreshGroupCache() {
  try {
    groupCache = await new Promise((res, rej) =>
      google.script.run.withSuccessHandler(res).withFailureHandler(rej).listGroups()
    );
  } catch(_) {}
}

// ── Public key cache ───────────────────────────────────────────
async function refreshPubKeyCache() {
  try {
    const entries = await new Promise((res, rej) =>
      google.script.run.withSuccessHandler(res).withFailureHandler(rej).listPublicKeys()
    );
    const newCache = [];
    for (const { email, publicKey } of entries) {
      try {
        const spki   = b642buf(publicKey);
        const pubKey = await crypto.subtle.importKey(
          'spki', spki, { name: 'ECDH', namedCurve: 'P-256' }, true, []
        );
        const fp = await fingerprint(spki);
        newCache.push({ email, pubKey, fp });
      } catch(_) {}
    }
    pubKeyCache = newCache;
    renderRecipientList();
  } catch(_) {}
}

// ── Recipient picker ───────────────────────────────────────────
function renderRecipientList() {
  const list = document.getElementById('recipientList');
  list.innerHTML = '';
  for (const { email, fp } of pubKeyCache) {
    const item = document.createElement('label');
    item.className = 'recipient-item';
    item.innerHTML =
      `<input type="checkbox" checked data-email="${escHtml(email)}">` +
      `<span class="recipient-email">${escHtml(email)}</span>` +
      `<span class="recipient-fp">${escHtml(fp.slice(0, 9))}…</span>`;
    item.querySelector('input').addEventListener('change', updateRecipientSummary);
    list.appendChild(item);
  }
  updateRecipientSummary();
}

function updateRecipientSummary() {
  const all     = document.querySelectorAll('#recipientList input[type=checkbox]');
  const checked = [...document.querySelectorAll('#recipientList input[type=checkbox]:checked')];
  const total   = all.length;
  const n       = checked.length;
  if (total === 0) { document.getElementById('recipientSummary').textContent = 'No registered users'; return; }
  if (n === total) { document.getElementById('recipientSummary').textContent = `Everyone (${total})`; return; }
  if (n === 0)     { document.getElementById('recipientSummary').textContent = 'Nobody'; return; }
  if (n === 1)     { document.getElementById('recipientSummary').textContent = checked[0].dataset.email; return; }
  // Look up in group cache by matching email hashes
  const checkedEmails = checked.map(cb => cb.dataset.email);
  _updateRecipientSummaryAsync(checkedEmails);
}

async function _updateRecipientSummaryAsync(emails) {
  const hashes = await Promise.all(emails.map(e => sha256hex(e.toLowerCase())));
  const sorted = [...hashes].sort();
  const match = groupCache.find(g => {
    const gh = [...g.emailHashes].sort();
    return gh.length === sorted.length && gh.every((h, i) => h === sorted[i]);
  });
  document.getElementById('recipientSummary').textContent =
    match?.label || emails.length + ' people';
}

function toggleRecipientList() {
  const list    = document.getElementById('recipientList');
  const chevron = document.getElementById('recipientChevron');
  const isOpen  = list.classList.toggle('open');
  chevron.classList.toggle('open', isOpen);
}

function getSelectedRecipients() {
  return pubKeyCache.filter(({ email }) => {
    const cb = document.querySelector(`#recipientList input[data-email="${CSS.escape(email)}"]`);
    return cb ? cb.checked : true;
  });
}

// ── Button state ───────────────────────────────────────────────
function updateButtons() {
  const btnD = document.getElementById('btnDecrypt');
  cellIsEncrypted ? btnD.classList.add('visible') : btnD.classList.remove('visible');

  // File input is only interactive when no key exists at all (not locked, not active).
  // When a key is stored but locked, the overlay is informational only — clicking it
  // should not open a file dialog; the user must unlock via the password UI below.
  const noKey = !keyInStorage && !presharedKey;
  document.getElementById('keyFileInput').style.display = noKey ? '' : 'none';

  // "or drop a .ciphersheet-key file" subtext: show only when drag-and-drop is useful
  // (no active key — locked keys still allow drag since ecdhPrivKey is null).
  const allowDrop = !presharedKey && !ecdhPrivKey;
  document.querySelectorAll('.ov-subtext').forEach(el => {
    el.style.display = allowDrop ? '' : 'none';
  });

  // Show recipient picker when ECDH active and cell is not encrypted
  const showPicker = ecdhPrivKey !== null && !cellIsEncrypted && pubKeyCache.length > 0;
  document.getElementById('recipientSection').style.display = showPicker ? '' : 'none';

  document.getElementById('btnUpdate').textContent =
    (cellIsEncrypted && canEncrypt()) ? 'Update' : 'Protect';
  document.getElementById('btnUpdate').disabled = !canEncrypt();
}

// ── Unprotect flow ─────────────────────────────────────────────
async function requestUnprotect() {
  if (!currentCell || !cellIsEncrypted) return;
  document.getElementById('btnDecrypt').disabled = true;
  document.getElementById('btnUpdate').disabled  = true;

  // Determine if a key that can decrypt this cell is loaded
  const raw    = String(currentCell.value || '');
  let keyLoaded = false;
  if (raw.startsWith(VAULT_PFX) && raw.length > 2) {
    const type = b642buf(raw.slice(VAULT_PFX.length))[0];
    keyLoaded  = canDecrypt(type);
  }

  google.script.run
    .withSuccessHandler(startPolling)
    .withFailureHandler(e => {
      toast('Could not open dialog: ' + e.message, 'err');
      restoreButtons();
    })
    .openDecryptConfirm(currentCell.cellRef, currentCell.sheetName, keyLoaded);
}

function startPolling() {
  let attempts = 0;
  const cellRef   = currentCell.cellRef;
  const sheetName = currentCell.sheetName;
  let graceRemaining = 15;

  pollTimer = setInterval(() => {
    attempts++;
    if (attempts > POLL_MAX) { stopPolling(); restoreButtons(); return; }

    google.script.run
      .withSuccessHandler(result => {
        if (result === null || (result && result.closed && graceRemaining > 0)) {
          if (graceRemaining > 0) graceRemaining--;
          return;
        }
        stopPolling();
        const intent = result.intent || (result.closed ? 'cancel' : null);
        if      (intent === 'reveal') _doReveal(cellRef, sheetName);
        else if (intent === 'clear')  _doClear(cellRef, sheetName);
        else                          restoreButtons();
      })
      .withFailureHandler(() => {})
      .pollDecryptIntent(cellRef, sheetName);
  }, POLL_MS);
}

async function _doReveal(cellRef, sheetName) {
  setLoading(true);
  try {
    const plaintext = await decrypt(String(currentCell.value || ''));
    await new Promise((res, rej) =>
      google.script.run.withSuccessHandler(res).withFailureHandler(rej)
        .revealCell(plaintext, cellRef, sheetName)
    );
    currentCell.value = plaintext;
    cellIsEncrypted   = false;
    document.getElementById('valueField').value = plaintext;
    updateButtons();
    toast('Cell revealed', 'warn', 5000);
  } catch(e) {
    toast('Reveal failed: ' + e.message, 'err');
  } finally {
    setLoading(false); restoreButtons();
  }
}

async function _doClear(cellRef, sheetName) {
  setLoading(true);
  try {
    await new Promise((res, rej) =>
      google.script.run.withSuccessHandler(res).withFailureHandler(rej)
        .clearVaultCell(cellRef, sheetName)
    );
    currentCell.value = '';
    cellIsEncrypted   = false;
    document.getElementById('valueField').value = '';
    updateButtons();
    toast('Cell cleared', 'ok');
  } catch(e) {
    toast('Clear failed: ' + e.message, 'err');
  } finally {
    setLoading(false); restoreButtons();
  }
}

function stopPolling()    { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }
function restoreButtons() {
  document.getElementById('btnDecrypt').disabled = false;
  document.getElementById('btnUpdate').disabled  = !canEncrypt();
}

// ── Navigation / Settings ──────────────────────────────────────
function navigateToCell() {
  if (!currentCell) return;
  google.script.run
    .withFailureHandler(e => toast('Navigation failed: ' + e.message, 'err'))
    .navigateToCell(currentCell.cellRef, currentCell.sheetName);
}

function openSettings() {
  google.script.run
    .withFailureHandler(e => toast('Settings failed: ' + e.message, 'err'))
    .showSettings();
}

// ── Cell refresh ───────────────────────────────────────────────
function refreshCell() {
  stopPolling(); restoreButtons(); setLoading(true);
  google.script.run
    .withSuccessHandler(async data => {
      currentCell = data;
      renderField(data);
      await emailReady;
      await autoDecrypt();
      setLoading(false);
    })
    .withFailureHandler(e => {
      toast('Could not read cell: ' + e.message, 'err');
      setLoading(false);
    })
    .getSelectedCellValue();
}

function renderField(data) {
  const field   = document.getElementById('valueField');
  const encOv   = document.getElementById('encOverlay');
  const plainOv = document.getElementById('plainOverlay');

  encOv.classList.remove('visible');
  plainOv.classList.remove('visible');

  if (!data) {
    field.value = ''; field.disabled = true; field.classList.add('blurred');
    document.getElementById('cellRef').textContent   = '—';
    document.getElementById('cellSheet').textContent = '';
    cellIsEncrypted = false; updateButtons(); return;
  }

  document.getElementById('cellRef').textContent   = data.cellRef   || '—';
  document.getElementById('cellSheet').textContent = data.sheetName || '';

  const raw   = String(data.value || '');
  const isEnc = raw.startsWith(VAULT_PFX);
  cellIsEncrypted = isEnc;

  if (!canEncrypt()) {
    field.value = ''; field.classList.add('blurred'); field.disabled = true;
    const verb = keyInStorage ? 'Unlock' : 'Generate';
    encOv.querySelector('.ov-text').textContent   = verb + ' key to decrypt';
    plainOv.querySelector('.ov-text').textContent = verb + ' key to encrypt';
    plainOv.querySelector('.ov-icon').textContent = keyInStorage ? '🔓' : '🔑';
    if (isEnc) encOv.classList.add('visible');
    else       plainOv.classList.add('visible');
  }

  updateButtons();
}

async function autoDecrypt() {
  if (!currentCell) return;
  const raw   = String(currentCell.value || '');
  const field = document.getElementById('valueField');

  if (raw.startsWith(VAULT_PFX) && raw.length > 2) {
    const type = b642buf(raw.slice(VAULT_PFX.length))[0];
    if (canDecrypt(type)) {
      try {
        field.value = await decrypt(raw);
        field.classList.remove('blurred'); field.disabled = false;
      } catch(_) {
        field.value = ''; toast('Cannot decrypt this cell with the loaded key', 'err');
        field.classList.add('blurred'); field.disabled = true;
      }
      document.getElementById('encOverlay').classList.remove('visible');
      document.getElementById('plainOverlay').classList.remove('visible');
    } else {
      field.value = raw; field.classList.add('blurred'); field.disabled = true;
      document.getElementById('encOverlay').classList.add('visible');
    }
  } else {
    field.value = '';
    field.classList.remove('blurred'); field.disabled = false;
    document.getElementById('encOverlay').classList.remove('visible');
    document.getElementById('plainOverlay').classList.remove('visible');
  }
  updateButtons();
}

// ── Protect & save ─────────────────────────────────────────────
async function encryptAndSave() {
  if (!canEncrypt())  { toast('No key loaded', 'warn'); return; }
  if (!currentCell)  { toast('Refresh cell selection first', 'warn'); return; }
  const plaintext = document.getElementById('valueField').value;
  if (!plaintext)    { toast('Value is empty', 'warn'); return; }

  if (!cellIsEncrypted && currentCell.value && currentCell.value === plaintext) {
    const proceed = await new Promise((res, rej) =>
      google.script.run.withSuccessHandler(res).withFailureHandler(rej)
        .showSheetConfirm(
          '🔏 Wait! This text was already saved in this spreadsheet.',
          'Google Sheets permanently records all edits in its Version History. ' +
          'Even though we will replace the cell with ciphertext now, anyone with edit access ' +
          'can look back at the history to see the original unencrypted text.\n\n' +
          'Are you sure you want to proceed?'
        )
    );
    if (!proceed) return;
  }

  setLoading(true);
  try {
    let ct;
    if (ecdhPrivKey) {
      const recipients = getSelectedRecipients();
      if (recipients.length === 0) { toast('Select at least one person', 'warn'); setLoading(false); return; }
      ct = await encryptECDH(plaintext, recipients);
      if (recipients.length > 1) {
        const hashes = await Promise.all(
          recipients.map(r => sha256hex(r.email.toLowerCase()))
        );
        const groupId = await computeGroupId(hashes);
        google.script.run.upsertGroup(groupId, hashes, '');
        refreshGroupCache();
      }
    } else {
      ct = await encryptPreshared(plaintext);
    }

    await new Promise((res, rej) =>
      google.script.run.withSuccessHandler(res).withFailureHandler(rej)
        .setEncryptedCellValue(ct, currentCell.cellRef, currentCell.sheetName)
    );
    currentCell.value = ct;
    cellIsEncrypted   = true;
    google.script.run.navigateToCell(currentCell.cellRef, currentCell.sheetName);
    updateButtons();
    toast('Protected', 'ok');
  } catch(e) {
    toast('Save failed: ' + e.message, 'err');
  } finally {
    setLoading(false);
  }
}

// ── Password manager save helpers ─────────────────────────────
function _triggerPasswordSave(password) {
  const input = document.getElementById('pwSaveInput');
  if (input) {
    input.value = password;
    document.getElementById('pwSaveForm').requestSubmit();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('pwSaveForm');
  if (form) form.addEventListener('submit', e => e.preventDefault());
});

// ── Init ───────────────────────────────────────────────────────
window.addEventListener('load', async () => {
  document.getElementById('footerFeedback').href = FEEDBACK_URL;
  document.getElementById('footerDonate').href   = DONATE_URL;
  document.getElementById('footerPrivacy').href  = PRIVACY_URL;
  document.getElementById('footerVersion').textContent = 'v' + APP_VERSION_STR;
  emailReady = new Promise(resolve =>
    google.script.run
      .withSuccessHandler(email => { ownEmail = email || ''; resolve(); })
      .withFailureHandler(() => resolve())
      .getCurrentUserEmail()
  );
  google.script.run
    .withSuccessHandler(s => { if (s && s.defaultKeyType) defaultKeyType = s.defaultKeyType; })
    .withFailureHandler(() => {})
    .getDocumentSettings();

  await showKeyState();
  refreshCell();
  refreshPubKeyCache();
  refreshGroupCache();

  // If a locked keypair is stored, try silent PasswordCredential autofill
  if (window.PasswordCredential) {
    try {
      const cred = await navigator.credentials.get({ password: true, mediation: 'silent' });
      if (cred && cred.password) await _doUnlockWithPassword(cred.password);
    } catch (_) {}
  }
});
