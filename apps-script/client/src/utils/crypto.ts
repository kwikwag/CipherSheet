import { buf2b64, buf2hex, b642buf, buf2b64url } from './encoding';

export { buf2b64url };
export const VAULT_PFX = '\uD83D\uDD10'; // 🔐
export const TYPE_ECDH = 0x02;
export const IV_LEN = 12;
export const PRF_EVAL_INPUT = new TextEncoder().encode('CipherSheet unlock key v1');

const HKDF_INFO: Uint8Array<ArrayBuffer> = new TextEncoder().encode('CipherSheet') as Uint8Array<ArrayBuffer>;
const PBKDF2_ITERS = 310000;

// Helper to ensure Uint8Array<ArrayBuffer> for WebCrypto APIs
function u8(b: Uint8Array): Uint8Array<ArrayBuffer> {
  return b as unknown as Uint8Array<ArrayBuffer>;
}

// ── Fingerprint ─────────────────────────────────────────────────

export async function fingerprint(bytes: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', u8(bytes));
  return buf2hex(h).match(/.{8}/g)!.join('-');
}

export async function sha256hex(str: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return buf2hex(h);
}

export async function computeGroupId(emailHashes: string[]): Promise<string> {
  const sorted = [...emailHashes].sort().join('|');
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sorted));
  return buf2hex(h).slice(0, 16);
}

// ── Key wrapping (PBKDF2 + AES-GCM) ────────────────────────────

async function deriveWrappingKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const km = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: u8(salt), iterations: PBKDF2_ITERS },
    km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}

export interface WrappedData {
  wrapped: Uint8Array<ArrayBuffer>;
  iv: Uint8Array<ArrayBuffer>;
  salt: Uint8Array<ArrayBuffer>;
}

export async function wrapData(data: Uint8Array, password: string): Promise<WrappedData> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const wrapKey = await deriveWrappingKey(password, salt);
  const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrapKey, u8(data));
  return { wrapped: new Uint8Array(wrapped) as Uint8Array<ArrayBuffer>, iv, salt };
}

export async function unwrapData(
  entry: { wrapped: Uint8Array; iv: Uint8Array; salt: Uint8Array },
  password: string
): Promise<ArrayBuffer> {
  const wrapKey = await deriveWrappingKey(password, entry.salt);
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: u8(entry.iv) }, wrapKey, u8(entry.wrapped));
}

// ── PRF wrapping ────────────────────────────────────────────────

export async function prfWrapPassword(
  prfOutput: Uint8Array,
  password: string
): Promise<{ wrapped: Uint8Array<ArrayBuffer>; iv: Uint8Array<ArrayBuffer> }> {
  const key = await crypto.subtle.importKey('raw', u8(prfOutput), { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(password));
  return { wrapped: new Uint8Array(enc) as Uint8Array<ArrayBuffer>, iv };
}

export async function prfUnwrapPassword(
  prfOutput: Uint8Array,
  wrapped: Uint8Array,
  iv: Uint8Array
): Promise<string> {
  const key = await crypto.subtle.importKey('raw', u8(prfOutput), { name: 'AES-GCM' }, false, ['decrypt']);
  const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u8(iv) }, key, u8(wrapped));
  return new TextDecoder().decode(dec);
}

// ── ECDH encryption (type 0x02) ─────────────────────────────────

export interface Recipient {
  email: string;
  pubKey: CryptoKey;
}

export async function encryptECDH(plaintext: string, recipients: Recipient[]): Promise<string> {
  const cellKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const cellKeyRaw = new Uint8Array(await crypto.subtle.exportKey('raw', cellKey)) as Uint8Array<ArrayBuffer>;
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const aad = new Uint8Array([TYPE_ECDH]) as Uint8Array<ArrayBuffer>;
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128, additionalData: aad },
    cellKey, new TextEncoder().encode(plaintext)
  )) as Uint8Array<ArrayBuffer>;

  const ephPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']
  );
  const ephPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', ephPair.publicKey)) as Uint8Array<ArrayBuffer>;

  const entries: { idBytes: Uint8Array<ArrayBuffer>; wrapIv: Uint8Array<ArrayBuffer>; wrappedKey: Uint8Array<ArrayBuffer>; wrapTag: Uint8Array<ArrayBuffer> }[] = [];
  for (const { email, pubKey } of recipients) {
    const sharedBits = new Uint8Array(await crypto.subtle.deriveBits(
      { name: 'ECDH', public: pubKey }, ephPair.privateKey, 256
    )) as Uint8Array<ArrayBuffer>;
    const hkdfKm = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
    const wrapKey = await crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: ephPubRaw, info: HKDF_INFO },
      hkdfKm, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
    );
    const wrapIv = crypto.getRandomValues(new Uint8Array(IV_LEN));
    const wrapOut = new Uint8Array(await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: wrapIv, tagLength: 128 }, wrapKey, cellKeyRaw
    )) as Uint8Array<ArrayBuffer>;
    const idBytes = new Uint8Array(await crypto.subtle.digest(
      'SHA-256', new TextEncoder().encode(email.toLowerCase())
    )) as Uint8Array<ArrayBuffer>;
    entries.push({
      idBytes,
      wrapIv,
      wrappedKey: wrapOut.slice(0, 32) as Uint8Array<ArrayBuffer>,
      wrapTag: wrapOut.slice(32) as Uint8Array<ArrayBuffer>,
    });
  }

  const ctLen = ct.byteLength;
  const nR = entries.length;
  const totalSize = 1 + IV_LEN + 4 + ctLen + 65 + 2 + nR * 92;
  const payload = new Uint8Array(totalSize);
  let off = 0;
  payload[off++] = TYPE_ECDH;
  payload.set(iv, off); off += IV_LEN;
  payload[off++] = (ctLen >> 24) & 0xff;
  payload[off++] = (ctLen >> 16) & 0xff;
  payload[off++] = (ctLen >> 8) & 0xff;
  payload[off++] = ctLen & 0xff;
  payload.set(ct, off); off += ctLen;
  payload.set(ephPubRaw, off); off += 65;
  payload[off++] = (nR >> 8) & 0xff;
  payload[off++] = nR & 0xff;
  for (const { idBytes, wrapIv, wrappedKey, wrapTag } of entries) {
    payload.set(idBytes, off); off += 32;
    payload.set(wrapIv, off); off += IV_LEN;
    payload.set(wrappedKey, off); off += 32;
    payload.set(wrapTag, off); off += 16;
  }
  return VAULT_PFX + buf2b64(payload.buffer);
}

// ── Parse recipient hashes (no decryption) ──────────────────────

export function parseRecipientHashes(raw: string): Set<string> {
  try {
    const payload = b642buf(raw.slice(VAULT_PFX.length));
    const bytes = new Uint8Array(payload);
    if (bytes[0] !== TYPE_ECDH) return new Set();
    let off = 1 + IV_LEN;
    const ctLen = (bytes[off] << 24) | (bytes[off + 1] << 16) | (bytes[off + 2] << 8) | bytes[off + 3];
    off += 4 + ctLen + 65;
    const nR = (bytes[off] << 8) | bytes[off + 1]; off += 2;
    const hashes = new Set<string>();
    for (let i = 0; i < nR; i++) {
      hashes.add(buf2hex(bytes.slice(off, off + 32).buffer));
      off += 92;
    }
    return hashes;
  } catch { return new Set(); }
}

// ── ECDH decryption ─────────────────────────────────────────────

function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export async function decryptECDH(
  payload: Uint8Array<ArrayBuffer>,
  ecdhPrivKey: CryptoKey,
  ownEmail: string
): Promise<string> {
  let off = 1;
  const iv = payload.slice(off, off + IV_LEN); off += IV_LEN;
  const ctLen = (payload[off] << 24) | (payload[off + 1] << 16) | (payload[off + 2] << 8) | payload[off + 3];
  off += 4;
  const ct = payload.slice(off, off + ctLen); off += ctLen;
  const ephPubRaw = payload.slice(off, off + 65); off += 65;
  const nR = (payload[off] << 8) | payload[off + 1]; off += 2;

  const ownId = new Uint8Array(await crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(ownEmail.toLowerCase())
  ));

  let myEntry: { wrapIv: Uint8Array<ArrayBuffer>; wrappedKey: Uint8Array<ArrayBuffer>; wrapTag: Uint8Array<ArrayBuffer> } | null = null;
  for (let i = 0; i < nR; i++) {
    const idBytes = payload.slice(off, off + 32);
    const wrapIv = payload.slice(off + 32, off + 44) as Uint8Array<ArrayBuffer>;
    const wrappedKey = payload.slice(off + 44, off + 76) as Uint8Array<ArrayBuffer>;
    const wrapTag = payload.slice(off + 76, off + 92) as Uint8Array<ArrayBuffer>;
    off += 92;
    if (arraysEqual(idBytes, ownId)) myEntry = { wrapIv, wrappedKey, wrapTag };
  }
  if (!myEntry) throw new Error('You are not a recipient of this cell');

  const ephPubKey = await crypto.subtle.importKey(
    'raw', u8(ephPubRaw), { name: 'ECDH', namedCurve: 'P-256' }, false, []
  );
  const sharedBits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'ECDH', public: ephPubKey }, ecdhPrivKey, 256
  )) as Uint8Array<ArrayBuffer>;
  const hkdfKm = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
  const wrapKey = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: u8(ephPubRaw), info: HKDF_INFO },
    hkdfKm, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
  );

  const wrapCt = new Uint8Array(48) as Uint8Array<ArrayBuffer>;
  wrapCt.set(myEntry.wrappedKey, 0);
  wrapCt.set(myEntry.wrapTag, 32);
  let cellKeyRaw: ArrayBuffer;
  try {
    cellKeyRaw = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: myEntry.wrapIv, tagLength: 128 }, wrapKey, wrapCt
    );
  } catch {
    throw new Error('This cell was encrypted with your old key — ask a collaborator to re-encrypt it for your current key');
  }
  const cellKey = await crypto.subtle.importKey('raw', cellKeyRaw, { name: 'AES-GCM' }, false, ['decrypt']);
  const aad = new Uint8Array([TYPE_ECDH]) as Uint8Array<ArrayBuffer>;
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: 128, additionalData: aad }, cellKey, ct
  );
  return new TextDecoder().decode(pt);
}

// ── Unified decrypt ─────────────────────────────────────────────

export async function decrypt(
  ciphertextStr: string,
  ecdhPrivKey: CryptoKey,
  ownEmail: string
): Promise<string> {
  if (!ciphertextStr.startsWith(VAULT_PFX)) throw new Error('not a vault value');
  const raw = b642buf(ciphertextStr.slice(VAULT_PFX.length));
  const type = raw[0];
  if (type === TYPE_ECDH) {
    if (!ownEmail) throw new Error('Own email not available — please refresh');
    return decryptECDH(raw, ecdhPrivKey, ownEmail);
  }
  throw new Error(
    'Unknown encryption type (0x' + type.toString(16).toUpperCase() +
    ') — please update the add-on to open this cell.'
  );
}

export function getPayloadType(ciphertextStr: string): number | null {
  if (!ciphertextStr.startsWith(VAULT_PFX) || ciphertextStr.length <= VAULT_PFX.length) return null;
  try {
    return b642buf(ciphertextStr.slice(VAULT_PFX.length))[0];
  } catch {
    return null;
  }
}
