import { useCallback, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  decrypt, encryptECDH, encryptPreshared,
  sha256hex, computeGroupId, VAULT_PFX, getPayloadType,
  TYPE_ECDH, TYPE_PRESHARED,
} from '../utils/crypto';
import { gasRun } from '../utils/gas';
import type { CellData, PubKeyCacheEntry } from '../types';

const POLL_MS = 800;
const POLL_MAX = 75;

export function useCellOps() {
  const {
    ecdhPrivKey, presharedKey, ownEmail, currentCell,
    pubKeyCache, groupCache, canEncrypt, cellIsEncrypted,
    setCurrentCell, setLoading, showToast, pollTimerRef,
  } = useApp();

  const [plaintext, setPlaintext] = useState('');
  const [decrypted, setDecrypted] = useState(false);

  // ── Refresh cell ───────────────────────────────────────────────
  const refreshCell = useCallback(async () => {
    stopPolling();
    setLoading(true);
    try {
      const data = await gasRun<CellData>('getSelectedCellValue');
      setCurrentCell(data);
      await renderCell(data);
    } catch (e) {
      showToast('Could not read cell: ' + (e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setLoading, setCurrentCell, showToast, ecdhPrivKey, presharedKey, ownEmail]);

  // ── Render cell (set plaintext state) ─────────────────────────
  const renderCell = useCallback(async (data: CellData | null) => {
    if (!data) { setPlaintext(''); setDecrypted(false); return; }
    const raw = String(data.value ?? '');
    if (!raw.startsWith(VAULT_PFX) || raw.length <= VAULT_PFX.length) {
      setPlaintext(raw);
      setDecrypted(false);
      return;
    }
    // Encrypted cell
    const type = getPayloadType(raw);
    const canDec = (type === TYPE_ECDH && ecdhPrivKey !== null) ||
                   (type === TYPE_PRESHARED && presharedKey !== null);
    if (canDec) {
      try {
        const pt = await decrypt(raw, ecdhPrivKey, presharedKey, ownEmail);
        setPlaintext(pt);
        setDecrypted(true);
      } catch {
        setPlaintext('');
        setDecrypted(false);
        showToast('Cannot decrypt this cell with the loaded key', 'error');
      }
    } else {
      setPlaintext('');
      setDecrypted(false);
    }
  }, [ecdhPrivKey, presharedKey, ownEmail, showToast]);

  // ── Protect (encrypt and save) ─────────────────────────────────
  const encryptAndSave = useCallback(async (
    text: string,
    selectedRecipients: PubKeyCacheEntry[]
  ) => {
    if (!canEncrypt) { showToast('No key loaded', 'warning'); return; }
    if (!currentCell) { showToast('Refresh cell selection first', 'warning'); return; }
    if (!text) { showToast('Value is empty', 'warning'); return; }

    if (!cellIsEncrypted && currentCell.value && currentCell.value === text) {
      try {
        const proceed = await gasRun<boolean>(
          'showSheetConfirm',
          '🔏 Wait! This text was already saved in this spreadsheet.',
          'Google Sheets permanently records all edits in its Version History. ' +
          'Even though we will replace the cell with ciphertext now, anyone with edit access ' +
          'can look back at the history to see the original unencrypted text.\n\n' +
          'Are you sure you want to proceed?'
        );
        if (!proceed) return;
      } catch { /* user cancelled dialog */ return; }
    }

    setLoading(true);
    try {
      let ct: string;
      if (ecdhPrivKey) {
        if (selectedRecipients.length === 0) {
          showToast('Select at least one person', 'warning');
          return;
        }
        ct = await encryptECDH(text, selectedRecipients);
        if (selectedRecipients.length > 1) {
          const hashes = await Promise.all(
            selectedRecipients.map(r => sha256hex(r.email.toLowerCase()))
          );
          const groupId = await computeGroupId(hashes);
          gasRun('upsertGroup', groupId, hashes, '').catch(() => { /* fire-and-forget */ });
        }
      } else {
        ct = await encryptPreshared(text, presharedKey!);
      }

      await gasRun('setEncryptedCellValue', ct, currentCell.cellRef, currentCell.sheetName);
      const updated: CellData = { ...currentCell, value: ct };
      setCurrentCell(updated);
      gasRun('navigateToCell', currentCell.cellRef, currentCell.sheetName).catch(() => {});
      showToast('Protected', 'success');
    } catch (e) {
      showToast('Save failed: ' + (e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [
    canEncrypt, currentCell, cellIsEncrypted,
    ecdhPrivKey, presharedKey,
    setCurrentCell, setLoading, showToast,
  ]);

  // ── Unprotect flow ─────────────────────────────────────────────
  const requestUnprotect = useCallback(async () => {
    if (!currentCell || !cellIsEncrypted) return;
    const raw = String(currentCell.value ?? '');
    let keyLoaded = false;
    if (raw.startsWith(VAULT_PFX)) {
      const type = getPayloadType(raw);
      keyLoaded = (type === TYPE_ECDH && ecdhPrivKey !== null) ||
                  (type === TYPE_PRESHARED && presharedKey !== null);
    }
    setLoading(true);
    try {
      await gasRun('openDecryptConfirm', currentCell.cellRef, currentCell.sheetName, keyLoaded);
      startPolling(currentCell.cellRef, currentCell.sheetName);
    } catch (e) {
      showToast('Could not open dialog: ' + (e as Error).message, 'error');
      setLoading(false);
    }
  }, [currentCell, cellIsEncrypted, ecdhPrivKey, presharedKey, setLoading, showToast]);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, [pollTimerRef]);

  const startPolling = useCallback((cellRef: string, sheetName: string) => {
    let attempts = 0;
    let graceRemaining = 15;

    pollTimerRef.current = setInterval(async () => {
      attempts++;
      if (attempts > POLL_MAX) { stopPolling(); setLoading(false); return; }
      try {
        const result = await gasRun<{ intent?: string; closed?: boolean } | null>(
          'pollDecryptIntent', cellRef, sheetName
        );
        if (result === null || (result?.closed && graceRemaining > 0)) {
          if (graceRemaining > 0) graceRemaining--;
          return;
        }
        stopPolling();
        const intent = result?.intent ?? (result?.closed ? 'cancel' : null);
        if (intent === 'reveal') await doReveal(cellRef, sheetName);
        else if (intent === 'clear') await doClear(cellRef, sheetName);
        else setLoading(false);
      } catch { /* ignore poll errors */ }
    }, POLL_MS);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollTimerRef, stopPolling, setLoading]);

  const doReveal = useCallback(async (cellRef: string, sheetName: string) => {
    try {
      const raw = String(currentCell?.value ?? '');
      const pt = await decrypt(raw, ecdhPrivKey, presharedKey, ownEmail);
      await gasRun('revealCell', pt, cellRef, sheetName);
      setCurrentCell(prev => prev ? { ...prev, value: pt } : null);
      setPlaintext(pt);
      setDecrypted(false);
      showToast('Cell revealed', 'warning', true);
    } catch (e) {
      showToast('Reveal failed: ' + (e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [currentCell, ecdhPrivKey, presharedKey, ownEmail, setCurrentCell, setLoading, showToast]);

  const doClear = useCallback(async (cellRef: string, sheetName: string) => {
    try {
      await gasRun('clearVaultCell', cellRef, sheetName);
      setCurrentCell(prev => prev ? { ...prev, value: '' } : null);
      setPlaintext('');
      setDecrypted(false);
      showToast('Cell cleared', 'success');
    } catch (e) {
      showToast('Clear failed: ' + (e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [setCurrentCell, setLoading, showToast]);

  // ── Recipient summary ──────────────────────────────────────────
  const getRecipientSummary = useCallback(async (selectedEmails: string[]): Promise<string> => {
    const total = pubKeyCache.length;
    const n = selectedEmails.length;
    if (total === 0) return 'No registered users';
    if (n === total) return `Everyone (${total})`;
    if (n === 0) return 'Nobody';
    if (n === 1) return selectedEmails[0];
    const hashes = await Promise.all(selectedEmails.map(e => sha256hex(e.toLowerCase())));
    const sorted = [...hashes].sort();
    const match = groupCache.find(g => {
      const gh = [...g.emailHashes].sort();
      return gh.length === sorted.length && gh.every((h, i) => h === sorted[i]);
    });
    return match?.label || `${n} people`;
  }, [pubKeyCache, groupCache]);

  return {
    plaintext, setPlaintext, decrypted,
    refreshCell, renderCell, encryptAndSave,
    requestUnprotect, stopPolling,
    getRecipientSummary,
  };
}
