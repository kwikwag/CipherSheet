import { useCallback } from 'react';
import { useApp } from '../context/AppContext';
import {
  decrypt, encryptECDH,
  sha256hex, computeGroupId, VAULT_PFX, getPayloadType,
  TYPE_ECDH, parseRecipientHashes,
} from '../utils/crypto';
import { gasRun } from '../utils/gas';
import type { CellData, CellViewState } from '../types';

const POLL_MS = 800;
const POLL_MAX = 75;

const EMPTY_VIEW: CellViewState = { cell: null, plaintext: '', decrypted: false, decryptError: null, recipientHashes: new Set() };

export function useCellOps() {
  const {
    ecdhPrivKey, ownEmail, cellView, setCellView,
    editors, groupCache, canEncrypt, cellIsEncrypted,
    startLoading, stopLoading, showToast, pollTimerRef,
  } = useApp();
  const { cell: currentCell, plaintext, decrypted, decryptError } = cellView;

  // ── Render cell (compute and set all view state atomically) ────
  const renderCell = useCallback(async (data: CellData | null) => {
    if (!data) { setCellView(EMPTY_VIEW); return; }
    const raw = String(data.value ?? '');
    if (!raw.startsWith(VAULT_PFX) || raw.length <= VAULT_PFX.length) {
      setCellView({ cell: data, plaintext: raw, decrypted: false, decryptError: null, recipientHashes: new Set() });
      return;
    }
    const type = getPayloadType(raw);
    const recipientHashes = type === TYPE_ECDH ? parseRecipientHashes(raw) : new Set<string>();
    if (type === TYPE_ECDH && ecdhPrivKey !== null) {
      try {
        const pt = await decrypt(raw, ecdhPrivKey, ownEmail);
        setCellView({ cell: data, plaintext: pt, decrypted: true, decryptError: null, recipientHashes });
      } catch (e) {
        setCellView({ cell: data, plaintext: '', decrypted: false, decryptError: classifyDecryptError(e as Error), recipientHashes });
      }
    } else {
      const decryptError = (type === null && ecdhPrivKey !== null)
        ? 'This cell appears corrupted or uses an unrecognized format.'
        : null;
      setCellView({ cell: data, plaintext: '', decrypted: false, decryptError, recipientHashes });
    }
  }, [ecdhPrivKey, ownEmail, setCellView]);

  // ── Refresh cell ───────────────────────────────────────────────
  const refreshCell = useCallback(async () => {
    stopPolling();
    startLoading('cell');
    try {
      const data = await gasRun<CellData>('getSelectedCellValue');
      await renderCell(data);
    } catch (e) {
      showToast('Could not read cell: ' + (e as Error).message, 'error');
    } finally {
      stopLoading('cell');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startLoading, stopLoading, showToast, renderCell]);

  // ── Protect (encrypt and save) ─────────────────────────────────
  const encryptAndSave = useCallback(async (
    text: string,
    selectedRecipients: { email: string; pubKey: CryptoKey }[]
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

    startLoading('cell');
    try {
      if (!ecdhPrivKey) { showToast('No key loaded', 'warning'); return; }
      if (selectedRecipients.length === 0) { showToast('Select at least one person', 'warning'); return; }
      const ct = await encryptECDH(text, selectedRecipients);
      const recipientHashes = new Set(
        await Promise.all(selectedRecipients.map(r => sha256hex(r.email.toLowerCase())))
      );
      if (selectedRecipients.length > 1) {
        const hashes = [...recipientHashes];
        const groupId = await computeGroupId(hashes);
        gasRun('upsertGroup', groupId, hashes, '').catch(() => { /* fire-and-forget */ });
      }

      await Promise.all([
        gasRun('navigateToCell', currentCell.cellRef, currentCell.sheetName).catch(() => {}),
        gasRun('setEncryptedCellValue', ct, currentCell.cellRef, currentCell.sheetName),
      ]);
      // We just encrypted `text`, so we know the view state without re-decrypting
      setCellView({ cell: { ...currentCell, value: ct }, plaintext: text, decrypted: true, decryptError: null, recipientHashes });
      showToast('Protected', 'success');
    } catch (e) {
      showToast('Save failed: ' + (e as Error).message, 'error');
    } finally {
      stopLoading('cell');
    }
  }, [
    canEncrypt, currentCell, cellIsEncrypted,
    ecdhPrivKey, setCellView, startLoading, stopLoading, showToast,
  ]);

  // ── Unprotect flow ─────────────────────────────────────────────
  const requestUnprotect = useCallback(async () => {
    if (!currentCell || !cellIsEncrypted) return;
    const raw = String(currentCell.value ?? '');
    const keyLoaded = raw.startsWith(VAULT_PFX) && getPayloadType(raw) === TYPE_ECDH && ecdhPrivKey !== null;
    startLoading('cell');
    try {
      await gasRun('openDecryptConfirm', currentCell.cellRef, currentCell.sheetName, keyLoaded);
      startPolling(currentCell.cellRef, currentCell.sheetName);
    } catch (e) {
      showToast('Could not open dialog: ' + (e as Error).message, 'error');
      stopLoading('cell');
    }
  }, [currentCell, cellIsEncrypted, ecdhPrivKey, startLoading, stopLoading, showToast]);

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
      if (attempts > POLL_MAX) { stopPolling(); stopLoading('cell'); return; }
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
        else stopLoading('cell');
      } catch { /* ignore poll errors */ }
    }, POLL_MS);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollTimerRef, stopPolling, stopLoading]);

  const doReveal = useCallback(async (cellRef: string, sheetName: string) => {
    try {
      const raw = String(currentCell?.value ?? '');
      const pt = await decrypt(raw, ecdhPrivKey!, ownEmail);
      await gasRun('revealCell', pt, cellRef, sheetName);
      setCellView(prev => ({ ...prev, cell: prev.cell ? { ...prev.cell, value: pt } : null, plaintext: pt, decrypted: false }));
      showToast('Cell revealed', 'warning', true);
    } catch (e) {
      showToast('Reveal failed: ' + (e as Error).message, 'error');
    } finally {
      stopLoading('cell');
    }
  }, [currentCell, ecdhPrivKey, ownEmail, setCellView, startLoading, stopLoading, showToast]);

  const doClear = useCallback(async (cellRef: string, sheetName: string) => {
    try {
      await gasRun('clearVaultCell', cellRef, sheetName);
      setCellView(prev => ({ ...prev, cell: prev.cell ? { ...prev.cell, value: '' } : null, plaintext: '', decrypted: false }));
      showToast('Cell cleared', 'success');
    } catch (e) {
      showToast('Clear failed: ' + (e as Error).message, 'error');
    } finally {
      stopLoading('cell');
    }
  }, [setCellView, startLoading, stopLoading, showToast]);

  // ── Recipient summary ──────────────────────────────────────────
  const getRecipientSummary = useCallback(async (selectedEmails: string[]): Promise<string> => {
    const total = editors.filter(e => e.pubKey !== undefined).length;
    const n = selectedEmails.length;
    if (total === 0) return 'No registered users';
    if (n === total) return `Everyone (${total})`;
    if (n === 0) return 'Nobody';
    if (n === 1) return editors.find(e => e.email === selectedEmails[0])?.name ?? selectedEmails[0];
    const hashes = await Promise.all(selectedEmails.map(e => sha256hex(e.toLowerCase())));
    const sorted = [...hashes].sort();
    const match = groupCache.find(g => {
      const gh = [...g.emailHashes].sort();
      return gh.length === sorted.length && gh.every((h, i) => h === sorted[i]);
    });
    return match?.label || `${n} people`;
  }, [editors, groupCache]);

  return {
    plaintext, setPlaintext: (v: string) => setCellView(prev => ({ ...prev, plaintext: v })),
    decrypted, decryptError,
    refreshCell, renderCell, encryptAndSave,
    requestUnprotect, stopPolling,
    getRecipientSummary,
  };
}

function classifyDecryptError(e: Error): string {
  const msg = e.message || '';
  if (msg.includes('not a recipient')) return 'This cell was not encrypted for you.';
  if (msg.includes('Unknown encryption type')) return msg;
  if (msg === '' || e.name === 'OperationError') return 'Decryption failed — this cell may have been encrypted with a different key.';
  return 'Decryption failed: ' + msg;
}
