import { useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { fingerprint } from '../utils/crypto';
import { gasRun } from '../utils/gas';
import { b642buf } from '../utils/encoding';
import type { EditorEntry, GroupEntry, SerializedEditorEntry } from '../types';

async function resolveEditors(entries: SerializedEditorEntry[]): Promise<EditorEntry[]> {
  const result = await Promise.all(entries.map(async ({ email, name, publicKeyBase64 }) => {
    if (!publicKeyBase64) { console.log('[CipherSheet] no key for', email); return { email, name }; }
    try {
      const spki = b642buf(publicKeyBase64);
      const pubKey = await crypto.subtle.importKey(
        'spki', spki as unknown as ArrayBuffer, { name: 'ECDH', namedCurve: 'P-256' }, true, []
      );
      const fp = await fingerprint(spki);
      console.log('[CipherSheet] resolved key for', email, 'fp:', fp);
      return { email, name, pubKey, fp };
    } catch (e) {
      console.error('[CipherSheet] failed to resolve key for', email, e);
      return { email, name };
    }
  }));
  console.log('[CipherSheet] setEditors:', result.map(e => ({ email: e.email, hasPubKey: !!e.pubKey, fp: e.fp })));
  return result;
}

export function useCacheOps() {
  const { setEditors, setGroupCache } = useApp();

  const seedEditors = useCallback(async (entries: SerializedEditorEntry[]) => {
    setEditors(await resolveEditors(entries));
  }, [setEditors]);

  const refreshEditors = useCallback(async () => {
    try {
      const entries = await gasRun<SerializedEditorEntry[]>('listEditors');
      setEditors(await resolveEditors(entries));
    } catch (e) {
      console.warn('refreshEditors failed:', e);
    }
  }, [setEditors]);

  const refreshGroupCache = useCallback(async () => {
    try {
      const groups = await gasRun<GroupEntry[]>('listGroups');
      setGroupCache(groups);
    } catch (e) {
      console.warn('refreshGroupCache failed:', e);
    }
  }, [setGroupCache]);

  return { seedEditors, refreshEditors, refreshGroupCache };
}
