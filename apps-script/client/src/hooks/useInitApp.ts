import { useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useCacheOps } from './useCacheOps';
import { useCellOps } from './useCellOps';
import { useKeyOps } from './useKeyOps';
import { gasRun } from '../utils/gas';

export function useInitApp() {
  const { setOwnEmail } = useApp();
  const { seedEditors, refreshGroupCache } = useCacheOps();
  const { refreshCell } = useCellOps();
  const { syncKeyInStorage, doUnlockWithPassword } = useKeyOps();

  useEffect(() => {
    (async () => {
      // Seed editors instantly from server-rendered data (no GAS round-trip)
      console.log('[CipherSheet] CS_CONFIG:', window.CS_CONFIG);
      const initial = window.CS_CONFIG?.editors;
      console.log('[CipherSheet] editors from config:', initial);
      if (initial?.length) {
        await seedEditors(initial);
      } else {
        console.warn('[CipherSheet] no editors in CS_CONFIG — picker will be hidden');
      }

      // Load email
      gasRun<string>('getCurrentUserEmail')
        .then(email => setOwnEmail(email || ''))
        .catch(() => {});


      const entry = await syncKeyInStorage();
      await refreshCell();
      refreshGroupCache();

      // Try silent PasswordCredential autofill
      if (window.PasswordCredential && entry) {
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
