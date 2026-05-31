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
import type { EditorEntry, IdbEcdhEntry } from '../types';
import { isPubKeyEntry } from '../types';

export interface KeyConflict {
  registeredFp: string;
  incomingFp: string;
  isGenerate: boolean;
  proceed: () => Promise<void>;
}

export function useKeyOps() {
  const {
    ecdhPrivKey, unlockPassword, ecdhFp,
    ownEmail, editors,
    setEcdhPrivKey, setEcdhPubKey, setUnlockPassword, setEcdhFp,
    setKeyInStorage, setKeyHasPasskey, setSetupPassword, startLoading, stopLoading,
    setEditors, showToast, pwSaveFormRef, pwSaveUsernameRef, pwSaveInputRef,
  } = useApp();

  const updateOwnEntry = useCallback((patch: Partial<EditorEntry>) => {
    if (!ownEmail) return;
    setEditors(editors.map(e => e.email === ownEmail ? { ...e, ...patch } : e));
  }, [ownEmail, editors, setEditors]);

  // ── Targeted pub key cache updates ────────────────────────────
  const cacheUpsertOwn = useCallback(async (spki: Uint8Array) => {
    if (!ownEmail) return;
    try {
      const pubKey = await crypto.subtle.importKey(
        'spki', spki as unknown as ArrayBuffer, { name: 'ECDH', namedCurve: 'P-256' }, true, []
      );
      const fp = await fingerprint(spki);
      updateOwnEntry({ pubKey, fp });
    } catch { /* non-fatal */ }
  }, [ownEmail, updateOwnEntry]);

  const cacheRemoveOwn = useCallback(() => {
    updateOwnEntry({ pubKey: undefined, fp: undefined });
  }, [updateOwnEntry]);

  // ── Shared password-manager save helper ────────────────────────
  const triggerPasswordSave = useCallback((username: string, password: string) => {
    const usernameInput = pwSaveUsernameRef.current;
    const input = pwSaveInputRef.current;
    const form = pwSaveFormRef.current;
    if (input && form) {
      if (usernameInput) usernameInput.value = username;
      input.value = password;
      form.requestSubmit();
    }
  }, [pwSaveFormRef, pwSaveUsernameRef, pwSaveInputRef]);

  // ── Core: generate ECDH keypair → encrypt → store + activate ───
  const importEcdhFromJwk = useCallback(async (jwk: JsonWebKey) => {
    const pubJwk: JsonWebKey = { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
    const pubKey = await crypto.subtle.importKey(
      'jwk', pubJwk, { name: 'ECDH', namedCurve: 'P-256' }, true, []
    );
    const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pubKey));
    const fp = await fingerprint(spki);
    const password = buf2b64url(crypto.getRandomValues(new Uint8Array(32)).buffer);
    const jwkBytes = new TextEncoder().encode(JSON.stringify(jwk));
    const { wrapped, iv, salt } = await wrapData(jwkBytes, password);

    const entry: IdbEcdhEntry = { wrapped, iv, salt, publicKeySpki: spki };
    await idbPut<IdbEcdhEntry>(IDB_ECDH_KEY, entry);
    setKeyInStorage(true);
    setKeyHasPasskey(false);

    const fpShort = fp.replace(/-/g, '').slice(0, 8);
    downloadJson({
      type: 'CipherSheet-ECDH-P256',
      version: 1,
      created: new Date().toISOString(),
      appVersion: window.CS_CONFIG?.appVersion ?? '',
      fingerprint: fp,
      wrapped: buf2b64(wrapped.buffer as ArrayBuffer),
      iv: buf2b64(iv.buffer as ArrayBuffer),
      salt: buf2b64(salt.buffer as ArrayBuffer),
      publicKeySpki: buf2b64(spki.buffer as ArrayBuffer),
    }, `ciphersheet-${fpShort}.ciphersheet-key`);

    const privKey = await crypto.subtle.importKey(
      'jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']
    );
    setEcdhPrivKey(privKey);
    setEcdhPubKey(pubKey);
    setEcdhFp(fp);
    setUnlockPassword(password);

    if (window.PasswordCredential) {
      try {
        const cred = new window.PasswordCredential({ id: fp, password, name: 'CipherSheet Key' });
        await navigator.credentials.store(cred);
      } catch { /* ignore */ }
    }
    triggerPasswordSave(fp, password);

    await gasRun('storePublicKey', buf2b64(spki.buffer as ArrayBuffer));
    await cacheUpsertOwn(spki);

    setSetupPassword(password);
    showToast('Key generated! Save the unlock password below.', 'warning', true);
  }, [setEcdhPrivKey, setEcdhPubKey, setEcdhFp, setUnlockPassword,
      setKeyInStorage, setKeyHasPasskey, setSetupPassword, showToast, triggerPasswordSave, cacheUpsertOwn]);

  // ── Registered fingerprint for own email (null if not registered) ─
  const getRegisteredFp = useCallback((): string | null => {
    if (!ownEmail) return null;
    const own = editors.find(e => e.email === ownEmail);
    return (own && isPubKeyEntry(own)) ? own.fp : null;
  }, [ownEmail, editors]);

  // ── Generate new ECDH keypair ──────────────────────────────────
  const setupNewKeypair = useCallback(async (): Promise<KeyConflict | null> => {
    startLoading('key');
    try {
      const keyPair = await crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']
      );
      const jwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
      const pubJwk: JsonWebKey = { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
      const pubKey = await crypto.subtle.importKey(
        'jwk', pubJwk, { name: 'ECDH', namedCurve: 'P-256' }, true, []
      );
      const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pubKey));
      const incomingFp = await fingerprint(spki);
      const registeredFp = getRegisteredFp();
      if (registeredFp && registeredFp !== incomingFp) {
        return {
          registeredFp,
          incomingFp,
          isGenerate: true,
          proceed: async () => {
            startLoading('key');
            try { await importEcdhFromJwk(jwk); }
            catch (e) { showToast('Setup failed: ' + (e as Error).message, 'error'); }
            finally { stopLoading('key'); }
          },
        };
      }
      await importEcdhFromJwk(jwk);
      return null;
    } catch (e) {
      showToast('Setup failed: ' + (e as Error).message, 'error');
      return null;
    } finally {
      stopLoading('key');
    }
  }, [startLoading, stopLoading, importEcdhFromJwk, showToast, getRegisteredFp]);


  // ── Sync key-in-storage state ──────────────────────────────────
  const syncKeyInStorage = useCallback(async () => {
    const entry = await idbGet<IdbEcdhEntry>(IDB_ECDH_KEY).catch(() => null);
    setKeyInStorage(!!entry);
    setKeyHasPasskey(!!(entry?.credentialId && entry?.prfWrappedPassword));
    setEcdhFp(entry ? await fingerprint(new Uint8Array(entry.publicKeySpki)) : null);
    return entry ?? null;
  }, [setKeyInStorage, setKeyHasPasskey, setEcdhFp]);

  // ── Load key from file ─────────────────────────────────────────
  const loadKeyFile = useCallback(async (file: File): Promise<KeyConflict | null> => {
    try {
      const text = await file.text();
      let obj: Record<string, unknown> | null = null;
      try { obj = JSON.parse(text.trim()); } catch { /* not JSON */ }

      if (obj?.type !== 'CipherSheet-ECDH-P256' || obj?.version !== 1)
        throw new Error('Unrecognized key file format — expected .ciphersheet-key');
      if (!obj.wrapped || !obj.iv || !obj.salt || !obj.publicKeySpki)
        throw new Error('Incomplete key file — required fields missing');

      const entry: IdbEcdhEntry = {
        wrapped: b642buf(obj.wrapped as string),
        iv: b642buf(obj.iv as string),
        salt: b642buf(obj.salt as string),
        publicKeySpki: b642buf(obj.publicKeySpki as string),
      };
      const incomingFp = await fingerprint(new Uint8Array(entry.publicKeySpki));
      const registeredFp = getRegisteredFp();
      const doImport = async () => {
        try {
          await idbPut<IdbEcdhEntry>(IDB_ECDH_KEY, entry);
          await syncKeyInStorage();
          await gasRun('storePublicKey', buf2b64(entry.publicKeySpki.buffer as ArrayBuffer));
          await cacheUpsertOwn(new Uint8Array(entry.publicKeySpki));
          showToast('Key imported — enter your password to unlock', 'info');
        } catch (e) {
          showToast('Could not load key: ' + (e as Error).message, 'error');
        }
      };
      if (registeredFp && registeredFp !== incomingFp) {
        return { registeredFp, incomingFp, isGenerate: false, proceed: doImport };
      }
      await doImport();
      return null;
    } catch (e) {
      showToast('Could not load key: ' + (e as Error).message, 'error');
      return null;
    }
  }, [syncKeyInStorage, showToast, getRegisteredFp, cacheUpsertOwn]);

  // ── Unlock with password ───────────────────────────────────────
  const doUnlockWithPassword = useCallback(async (password: string) => {
    const entry = await idbGet<IdbEcdhEntry>(IDB_ECDH_KEY);
    if (!entry) throw new Error('No stored key found');

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
    setEcdhFp(await fingerprint(spki));
    setUnlockPassword(password);

    // Register public key in this document if not already present (e.g. key was
    // created in a different spreadsheet but shares the same IndexedDB origin).
    if (!getRegisteredFp()) {
      try {
        await gasRun('storePublicKey', buf2b64(spki.buffer as ArrayBuffer));
        await cacheUpsertOwn(spki);
      } catch { /* non-fatal */ }
    }

    showToast('Key unlocked', 'success');
  }, [setEcdhPrivKey, setEcdhPubKey, setEcdhFp, setUnlockPassword, showToast, getRegisteredFp, cacheUpsertOwn]);

  const unlockWithPassword = useCallback(async (password: string) => {
    startLoading('key');
    try {
      await doUnlockWithPassword(password);
    } catch (e) {
      showToast('Wrong password or corrupted key: ' + (e as Error).message, 'error');
    } finally {
      stopLoading('key');
    }
  }, [startLoading, stopLoading, doUnlockWithPassword, showToast]);

  // ── Lock ───────────────────────────────────────────────────────
  const lockEcdh = useCallback(() => {
    setEcdhPrivKey(null);
    setEcdhPubKey(null);
    setUnlockPassword(null);
    showToast('Key locked');
  }, [setEcdhPrivKey, setEcdhPubKey, setUnlockPassword, showToast]);

  // ── Forget key ─────────────────────────────────────────────────
  const forgetKey = useCallback(async (alsoRemoveFromDoc = false) => {
    await idbDelete(IDB_ECDH_KEY);
    setKeyInStorage(false);
    setKeyHasPasskey(false);
    setEcdhPrivKey(null);
    setEcdhPubKey(null);
    setUnlockPassword(null);
    setEcdhFp(null);
    setSetupPassword(null);
    if (alsoRemoveFromDoc) {
      await gasRun('removePublicKey');
      cacheRemoveOwn();
    }
    showToast('Key forgotten');
  }, [setKeyInStorage, setKeyHasPasskey, setEcdhPrivKey, setEcdhPubKey, setUnlockPassword, setEcdhFp, setSetupPassword, cacheRemoveOwn, showToast]);

  // ── PRF passkey enroll ─────────────────────────────────────────
  const tryPrfEnroll = useCallback(async () => {
    const passkeyPopupUrl = window.CS_CONFIG?.passkeyPopupUrl;
    if (!passkeyPopupUrl || !ecdhPrivKey) {
      if (!ecdhPrivKey) showToast('Unlock your key first', 'warning');
      return;
    }
    const fp = ecdhFp || '';
    const password = unlockPassword;
    if (!password) { showToast('Unlock your key first', 'warning'); return; }

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
        setKeyHasPasskey(true);
        showToast('Passkey unlock enabled!', 'success');
      }
    } catch (e) {
      const msg = (e as Error).message;
      if (msg !== 'Passkey popup was closed') showToast('Passkey setup failed: ' + msg, 'error');
    }
  }, [ecdhPrivKey, ecdhFp, unlockPassword, ownEmail, setKeyHasPasskey, showToast]);

  // ── PRF passkey unlock ─────────────────────────────────────────
  const unlockWithPasskey = useCallback(async () => {
    startLoading('key');
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
      stopLoading('key');
    }
  }, [startLoading, stopLoading, doUnlockWithPassword, showToast]);


  // ── Remove public key from document properties ─────────────────
  const removePublicKey = useCallback(async () => {
    await gasRun('removePublicKey');
    cacheRemoveOwn();
  }, [cacheRemoveOwn]);

  return {
    setupNewKeypair,
    loadKeyFile, unlockWithPassword, doUnlockWithPassword,
    lockEcdh, forgetKey, removePublicKey, syncKeyInStorage,
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
    const popup = window.open(url, 'ciphersheet-prf', 'width=480,height=640,toolbar=no,menubar=no');
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
