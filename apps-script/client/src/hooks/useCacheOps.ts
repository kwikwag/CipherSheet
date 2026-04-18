import { useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { fingerprint } from '../utils/crypto';
import { gasRun } from '../utils/gas';
import { b642buf } from '../utils/encoding';
import type { GroupEntry, PubKeyCacheEntry } from '../types';

interface PublicKeyEntry { email: string; publicKey: string }

export function useCacheOps() {
  const { setPubKeyCache, setGroupCache } = useApp();

  const refreshPubKeyCache = useCallback(async () => {
    try {
      const entries = await gasRun<PublicKeyEntry[]>('listPublicKeys');
      const newCache: PubKeyCacheEntry[] = [];
      for (const { email, publicKey } of entries) {
        try {
          const spki = b642buf(publicKey);
          const pubKey = await crypto.subtle.importKey(
            'spki', spki as unknown as ArrayBuffer, { name: 'ECDH', namedCurve: 'P-256' }, true, []
          );
          const fp = await fingerprint(spki);
          newCache.push({ email, pubKey, fp });
        } catch { /* skip invalid entries */ }
      }
      setPubKeyCache(newCache);
    } catch (e) {
      console.warn('refreshPubKeyCache failed:', e);
    }
  }, [setPubKeyCache]);

  const refreshGroupCache = useCallback(async () => {
    try {
      const groups = await gasRun<GroupEntry[]>('listGroups');
      setGroupCache(groups);
    } catch (e) {
      console.warn('refreshGroupCache failed:', e);
    }
  }, [setGroupCache]);

  return { refreshPubKeyCache, refreshGroupCache };
}
