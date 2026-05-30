import { useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { validatePresharedKey } from '../utils/crypto';

export function usePresharedKey() {
  const {
    cellView, setPresharedKey, showToast,
  } = useApp();

  const activatePresharedKey = useCallback(async (keyBytes: Uint8Array) => {
    const cellValue = String(cellView.cell?.value ?? '');
    const valid = await validatePresharedKey(keyBytes, cellValue);
    if (!valid) { showToast('Wrong key — cannot decrypt this cell', 'error'); return; }

    const key = await crypto.subtle.importKey(
      'raw', keyBytes as unknown as ArrayBuffer, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']
    );
    setPresharedKey(key);
    showToast('Pre-shared key loaded', 'success');
  }, [cellView, setPresharedKey, showToast]);

  const clearPresharedKey = useCallback(() => {
    setPresharedKey(null);
    showToast('Pre-shared key unloaded');
  }, [setPresharedKey, showToast]);

  return { activatePresharedKey, clearPresharedKey };
}
