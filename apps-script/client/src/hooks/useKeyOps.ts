import { useCallback } from 'react';
import { useApp } from '../context/AppContext';
import {
  fingerprint, wrapData, unwrapData,
  prfWrapPassword, prfUnwrapPassword, PRF_EVAL_INPUT,
} from '../utils/crypto';
import { idbGet, idbPut, idbDelete, IDB_ECDH_KEY } from '../utils/idb';
import { buf2b64, b642buf, buf2b64url } from '../utils/encoding';
import { gasRun } from '../utils/gas';
import { downloadJson } from '../utils/download';
import type { IdbEcdhEntry } from '../types';

export function useKeyOps() {
  const {
    ecdhPrivKey, unlockPassword, ecdhFp,
    ownEmail, defaultKeyType,
    setEcdhPrivKey, setEcdhPubKey, setUnlockPassword, setEcdhFp,
    setKeyInStorage, setSetupPassword, setLoading,
    showToast, pwSaveFormRef, pwSaveInputRef,
  } = useApp();

  // ── Shared password-manager save helper ────────────────────────
  const triggerPasswordSave = useCallback((password: string) => {
    const input = pwSaveInputRef.current;
    const form = pwSaveFormRef.current;
    if (input && form) {
      input.value = password;
      form.requestSubmit();
    }
  }, [pwSaveFormRef, pwSaveInputRef]);

  // ── Core: import ECDH JWK → store + activate ──────────────────
  const importEcdhFromJwk = useCallback(async (
    jwk: JsonWebKey,
    { isNewKey = false }: { isNewKey?: boolean } = {}
  ) => {
    const pubJwk: JsonWebKey = { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
    const pubKey = await crypto.subtle.importKey(
      'jwk', pubJwk, { name: 'ECDH', namedCurve: 'P-256' }, true, []
    );
    const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pubKey));
    const fp = await fingerprint(spki);
    const password = buf2b64url(crypto.getRandomValues(new Uint8Array(32)).buffer);
    const jwkBytes = new TextEncoder().encode(JSON.stringify(jwk));
    const { wrapped, iv, salt } = await wrapData(jwkBytes, password);

    let credentialId: number[] | null = null;
    try {
      // Forward-compatible PRF probe — throws SecurityError in iframe today
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const cred = await navigator.credentials.create({ publicKey: {
        challenge, rp: { name: 'CipherSheet' },
        user: { id: new TextEncoder().encode(fp), name: ownEmail || 'user', displayName: 'CipherSheet' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
        authenticatorSelection: { userVerification: 'required' },
        extensions: { prf: {} },
      }});
      if (cred) credentialId = Array.from(new Uint8Array((cred as PublicKeyCredential).rawId));
    } catch { /* expected in iframe */ }

    await idbPut<IdbEcdhEntry>(IDB_ECDH_KEY, {
      wrapped, iv, salt, publicKeySpki: spki, publicKeyFp: fp,
      ...(credentialId ? { credentialId } : {}),
    });
    setKeyInStorage(true);

    const privKey = await crypto.subtle.importKey(
      'jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']
    );
    setEcdhPrivKey(privKey);
    setEcdhPubKey(pubKey);
    setEcdhFp(fp);
    setUnlockPassword(password);

    if (window.PasswordCredential) {
      try {
        const cred = new window.PasswordCredential({ id: 'ciphersheet-key', password, name: 'CipherSheet Keypair' });
        await navigator.credentials.store(cred);
      } catch { /* ignore */ }
    }
    triggerPasswordSave(password);

    try {
      await gasRun('storePublicKey', buf2b64(spki.buffer as ArrayBuffer));
    } catch { /* non-fatal */ }

    setSetupPassword(password);
    showToast(
      isNewKey ? 'Keypair generated! Save the unlock password below.' : 'Keypair imported! Save the unlock password.',
      'warning',
      true
    );
  }, [ownEmail, setEcdhPrivKey, setEcdhPubKey, setEcdhFp, setUnlockPassword,
      setKeyInStorage, setSetupPassword, showToast, triggerPasswordSave]);

  // ── Generate new ECDH keypair ──────────────────────────────────
  const setupNewKeypair = useCallback(async () => {
    setLoading(true);
    try {
      const keyPair = await crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']
      );
      const jwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
      downloadJson({ type: 'CipherSheet-ECDH-P256', version: 1, jwk }, 'ciphersheet.ciphersheet-key');
      await importEcdhFromJwk(jwk, { isNewKey: true });
    } catch (e) {
      showToast('Setup failed: ' + (e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [setLoading, importEcdhFromJwk, showToast]);

  // ── Generate pre-shared key ────────────────────────────────────
  const generatePresharedKey = useCallback(async () => {
    setLoading(true);
    try {
      const keyBytes = crypto.getRandomValues(new Uint8Array(32));
      downloadJson({ type: 'CipherSheet-AES256', version: 1, key: buf2b64(keyBytes.buffer) }, 'ciphersheet.ciphersheet-key');
      // activatePresharedKey is in usePresharedKey hook; call it here via shared logic
      // Return the bytes so the caller can activate
      return keyBytes;
    } catch (e) {
      showToast('Setup failed: ' + (e as Error).message, 'error');
      return null;
    } finally {
      setLoading(false);
    }
  }, [setLoading, showToast]);

  const generateKey = useCallback(async (onPresharedBytes?: (b: Uint8Array) => Promise<void>) => {
    if (defaultKeyType === 'preshared') {
      const bytes = await generatePresharedKey();
      if (bytes && onPresharedBytes) await onPresharedBytes(bytes);
    } else {
      await setupNewKeypair();
    }
  }, [defaultKeyType, setupNewKeypair, generatePresharedKey]);

  // ── Load key from file ─────────────────────────────────────────
  const loadKeyFile = useCallback(async (
    file: File,
    onPresharedBytes: (b: Uint8Array) => Promise<void>
  ) => {
    try {
      const text = await file.text();
      let obj: Record<string, unknown> | null = null;
      try { obj = JSON.parse(text.trim()); } catch { /* not JSON */ }

      if (obj?.type === 'CipherSheet-ECDH-P256') {
        const jwk = (obj.jwk as JsonWebKey) ?? (obj.d ? obj as unknown as JsonWebKey : null);
        if (!jwk) throw new Error('Unrecognized .ciphersheet-key format');
        await importEcdhFromJwk(jwk);
      } else if (obj?.type === 'CipherSheet-AES256') {
        if (!obj.key) throw new Error('Missing key field in .ciphersheet-key');
        const bytes = b642buf(obj.key as string);
        if (bytes.length !== 32) throw new Error('Expected 256-bit key');
        await onPresharedBytes(bytes);
      } else if (obj?.jwk || obj?.d) {
        await importEcdhFromJwk((obj.jwk ?? obj) as JsonWebKey);
      } else {
        let bytes: Uint8Array | null = null;
        if (obj?.key) { bytes = b642buf(obj.key as string); }
        else if (!obj) { try { bytes = b642buf(text.trim()); } catch { /* ignore */ } }
        if (!bytes || bytes.length !== 32) throw new Error('Unrecognized key file format — expected .ciphersheet-key');
        await onPresharedBytes(bytes);
      }
    } catch (e) {
      showToast('Could not load key: ' + (e as Error).message, 'error');
    }
  }, [importEcdhFromJwk, showToast]);

  // ── Unlock with password ───────────────────────────────────────
  const doUnlockWithPassword = useCallback(async (password: string) => {
    const entry = await idbGet<IdbEcdhEntry>(IDB_ECDH_KEY);
    if (!entry) throw new Error('No stored keypair found');

    const jwkBytes = await unwrapData(entry, password);
    const jwk = JSON.parse(new TextDecoder().decode(jwkBytes)) as JsonWebKey;
    const spki = new Uint8Array(entry.publicKeySpki);

    const privKey = await crypto.subtle.importKey(
      'jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']
    );
    const pubKey = await crypto.subtle.importKey(
      'spki', spki, { name: 'ECDH', namedCurve: 'P-256' }, true, []
    );

    setEcdhPrivKey(privKey);
    setEcdhPubKey(pubKey);
    setEcdhFp(entry.publicKeyFp || null);
    setUnlockPassword(password);
    showToast('Key unlocked', 'success');
  }, [setEcdhPrivKey, setEcdhPubKey, setEcdhFp, setUnlockPassword, showToast]);

  const unlockWithPassword = useCallback(async (password: string) => {
    setLoading(true);
    try {
      await doUnlockWithPassword(password);
    } catch (e) {
      showToast('Wrong password or corrupted key: ' + (e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [setLoading, doUnlockWithPassword, showToast]);

  // ── Lock ───────────────────────────────────────────────────────
  const lockEcdh = useCallback(() => {
    setEcdhPrivKey(null);
    setEcdhPubKey(null);
    setUnlockPassword(null);
    showToast('Keypair locked');
  }, [setEcdhPrivKey, setEcdhPubKey, setUnlockPassword, showToast]);

  // ── Forget key ─────────────────────────────────────────────────
  const forgetKey = useCallback(async () => {
    await idbDelete(IDB_ECDH_KEY);
    setKeyInStorage(false);
    setEcdhPrivKey(null);
    setEcdhPubKey(null);
    setUnlockPassword(null);
    setEcdhFp(null);
    showToast('Keypair deleted');
  }, [setKeyInStorage, setEcdhPrivKey, setEcdhPubKey, setUnlockPassword, setEcdhFp, showToast]);

  // ── Sync key-in-storage state ──────────────────────────────────
  const syncKeyInStorage = useCallback(async () => {
    const entry = await idbGet<IdbEcdhEntry>(IDB_ECDH_KEY).catch(() => null);
    setKeyInStorage(!!entry);
    return entry ?? null;
  }, [setKeyInStorage]);

  // ── PRF passkey enroll ─────────────────────────────────────────
  const tryPrfEnroll = useCallback(async () => {
    const passkeyPopupUrl = window.CS_CONFIG?.passkeyPopupUrl;
    if (!passkeyPopupUrl || !ecdhPrivKey) {
      if (!ecdhPrivKey) showToast('Unlock your keypair first', 'warning');
      return;
    }
    const fp = ecdhFp || '';
    const password = unlockPassword;
    if (!password) { showToast('Unlock your keypair first', 'warning'); return; }

    try {
      const challenge = Array.from(crypto.getRandomValues(new Uint8Array(32)));
      const source = 'CipherSheet passkey user v1:' + ownEmail + ':' + fp;
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
      const userHandle = Array.from(new Uint8Array(digest));

      const msg = await prfPopupHandshake('prf-enroll', {
        challenge, userHandle,
        userName: ownEmail || 'user',
        evalInput: Array.from(PRF_EVAL_INPUT),
      });
      if (msg.prfOutput && msg.credentialId) {
        const { wrapped, iv } = await prfWrapPassword(
          new Uint8Array(msg.prfOutput as number[]),
          password
        );
        const existing = await idbGet<IdbEcdhEntry>(IDB_ECDH_KEY);
        if (existing) {
          await idbPut(IDB_ECDH_KEY, {
            ...existing,
            credentialId: msg.credentialId,
            prfWrappedPassword: wrapped,
            prfPasswordIv: iv,
          });
        }
        showToast('Passkey unlock enabled!', 'success');
      }
    } catch (e) {
      const msg = (e as Error).message;
      if (msg !== 'Passkey popup was closed') showToast('Passkey setup failed: ' + msg, 'error');
    }
  }, [ecdhPrivKey, ecdhFp, unlockPassword, ownEmail, showToast]);

  // ── PRF passkey unlock ─────────────────────────────────────────
  const unlockWithPasskey = useCallback(async () => {
    setLoading(true);
    try {
      const entry = await idbGet<IdbEcdhEntry>(IDB_ECDH_KEY);
      if (!entry?.credentialId || !entry?.prfWrappedPassword) throw new Error('No passkey enrolled');

      const challenge = Array.from(crypto.getRandomValues(new Uint8Array(32)));
      const msg = await prfPopupHandshake('prf-get', {
        challenge,
        credentialId: entry.credentialId,
        evalInput: Array.from(PRF_EVAL_INPUT),
      });
      if (!msg.prfOutput) throw new Error('No PRF output received');
      const password = await prfUnwrapPassword(
        new Uint8Array(msg.prfOutput as number[]),
        new Uint8Array(entry.prfWrappedPassword),
        new Uint8Array(entry.prfPasswordIv!)
      );
      await doUnlockWithPassword(password);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg !== 'Passkey popup was closed') showToast('Passkey unlock failed: ' + msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [setLoading, doUnlockWithPassword, showToast]);


  return {
    setupNewKeypair, generatePresharedKey, generateKey,
    loadKeyFile, unlockWithPassword, doUnlockWithPassword,
    lockEcdh, forgetKey, syncKeyInStorage,
    tryPrfEnroll, unlockWithPasskey,
  };
}

// ── PRF popup handshake (module-level helper) ──────────────────

interface PrfMessage {
  type: string;
  channel: string;
  prfOutput?: number[];
  credentialId?: number[];
  message?: string;
}

function prfPopupHandshake(action: string, extraData: Record<string, unknown>): Promise<PrfMessage> {
  return new Promise((resolve, reject) => {
    const passkeyPopupUrl = window.CS_CONFIG?.passkeyPopupUrl;
    if (!passkeyPopupUrl) { reject(new Error('Passkey popup URL not configured')); return; }
    const popupOrigin = new URL(passkeyPopupUrl).origin;
    const channel = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const url = passkeyPopupUrl +
      '?action=' + encodeURIComponent(action) +
      '&channel=' + encodeURIComponent(channel) +
      '&returnOrigin=' + encodeURIComponent(window.location.origin);
    const popup = window.open(url, 'ciphersheet-prf', 'width=480,height=280,toolbar=no,menubar=no');
    if (!popup) { reject(new Error('Popup was blocked — allow popups for this site')); return; }

    const timeout = setTimeout(() => { cleanup(); reject(new Error('Passkey timed out')); }, 90000);
    const closedCheck = setInterval(() => {
      if (popup.closed) { cleanup(); reject(new Error('Passkey popup was closed')); }
    }, 600);

    const postStart = () => popup.postMessage({ type: 'prf-start', channel, ...extraData }, popupOrigin);
    const startRetry = setInterval(postStart, 1000);
    const initialStart = setTimeout(postStart, 250);

    function cleanup() {
      clearTimeout(timeout); clearTimeout(initialStart);
      clearInterval(startRetry); clearInterval(closedCheck);
      window.removeEventListener('message', onMessage);
    }
    function onMessage(evt: MessageEvent) {
      if (evt.origin !== popupOrigin || evt.source !== popup) return;
      const msg = evt.data as PrfMessage;
      if (msg?.channel !== channel) return;
      if (msg.type === 'prf-ready') { postStart(); }
      else if (msg.type === 'prf-result') { cleanup(); resolve(msg); }
      else if (msg.type === 'prf-error') { cleanup(); reject(new Error(msg.message || 'Passkey operation failed')); }
    }
    window.addEventListener('message', onMessage);
  });
}
