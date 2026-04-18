import { useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useCacheOps } from './useCacheOps';
import { useCellOps } from './useCellOps';
import { useKeyOps } from './useKeyOps';
import { gasRun } from '../utils/gas';
import type { DocumentSettings } from '../types';

export function useInitApp() {
  const {
    setOwnEmail, setDefaultKeyType,
  } = useApp();
  const { refreshPubKeyCache, refreshGroupCache } = useCacheOps();
  const { refreshCell } = useCellOps();
  const { syncKeyInStorage, doUnlockWithPassword } = useKeyOps();

  useEffect(() => {
    (async () => {
      // Load email
      gasRun<string>('getCurrentUserEmail')
        .then(email => setOwnEmail(email || ''))
        .catch(() => {});

      // Load settings
      gasRun<DocumentSettings>('getDocumentSettings')
        .then(s => { if (s?.defaultKeyType) setDefaultKeyType(s.defaultKeyType); })
        .catch(() => {});

      await syncKeyInStorage();
      await refreshCell();
      refreshPubKeyCache();
      refreshGroupCache();

      // Try silent PasswordCredential autofill
      if (window.PasswordCredential) {
        try {
          const cred = await navigator.credentials.get({ password: true, mediation: 'silent' } as CredentialRequestOptions);
          const pw = cred && (cred as unknown as { password?: string }).password;
          if (pw) await doUnlockWithPassword(pw);
        } catch { /* ignore */ }
      }
    })();
  // Run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
