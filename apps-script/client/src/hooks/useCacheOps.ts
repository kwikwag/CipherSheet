import { useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { fingerprint } from '../utils/crypto';
import { gasRun } from '../utils/gas';
import { b642buf } from '../utils/encoding';
import type { GroupEntry, InitialPublicKeyEntry, PubKeyCacheEntry } from '../types';

async function buildPubKeyCache(entries: InitialPublicKeyEntry[]): Promise<PubKeyCacheEntry[]> {
  const cache: PubKeyCacheEntry[] = [];
  for (const { email, publicKey } of entries) {
    try {
      const spki = b642buf(publicKey);
      const pubKey = await crypto.subtle.importKey(
        'spki', spki as unknown as ArrayBuffer, { name: 'ECDH', namedCurve: 'P-256' }, true, []
      );
      const fp = await fingerprint(spki);
      cache.push({ email, pubKey, fp });
    } catch { /* skip invalid entries */ }
  }
  return cache;
}

export function useCacheOps() {
  const { setPubKeyCache, setGroupCache } = useApp();

  const seedPubKeyCache = useCallback(async (entries: InitialPublicKeyEntry[]) => {
    setPubKeyCache(await buildPubKeyCache(entries));
  }, [setPubKeyCache]);

  const refreshPubKeyCache = useCallback(async () => {
    try {
      const entries = await gasRun<InitialPublicKeyEntry[]>('listPublicKeys');
      setPubKeyCache(await buildPubKeyCache(entries));
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

  return { seedPubKeyCache, refreshPubKeyCache, refreshGroupCache };
}
