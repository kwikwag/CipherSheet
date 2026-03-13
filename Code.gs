// ╔══════════════════════════════════════════════════════════════╗
// ║  CipherSheet — Server-side Apps Script  (Code.gs)            ║
// ╚══════════════════════════════════════════════════════════════╝

// ── Menu ─────────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🔐 CipherSheet')
    .addItem('Open Vault', 'showSidebar')
    .addToUi();
}

function showSidebar() {
  const html = HtmlService.createHtmlOutputFromFile('sidebar')
    .setTitle('🔐 CipherSheet')
    .setWidth(300);
  SpreadsheetApp.getUi().showSidebar(html);
}

// ── onEdit trigger — vault cell guard ────────────────────────────
//
// Immediately reverts any manual edit to a cell whose previous value
// started with the vault prefix 🔐. Works for ALL users including
// the spreadsheet owner (whom range protection cannot block).
//
// For full coverage across all collaborators, also install as an
// installable trigger:
//   Apps Script editor → Triggers → Add trigger
//   → Function: onEdit, Event: From spreadsheet → On edit

const VAULT_PFX_TRIGGER = '\uD83D\uDD10'; // 🔐

function onEdit(e) {
  if (!e) return;
  const oldVal = e.oldValue !== undefined ? String(e.oldValue) : '';
  if (!oldVal.startsWith(VAULT_PFX_TRIGGER)) return;

  e.range.setValue(oldVal);

  try {
    SpreadsheetApp.getUi().alert(
      '🔐 CipherSheet',
      'This cell contains encrypted data and cannot be edited directly.\n\n' +
      'Use the CipherSheet sidebar (🔐 CipherSheet → Open Vault) to update its value.',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch(_) { /* UI unavailable in some trigger contexts */ }
}

// ── Navigate to a cell ────────────────────────────────────────────

function navigateToCell(cellRef, sheetName) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;
  ss.setActiveSheet(sheet);
  sheet.getRange(cellRef).activate();
}

// ── Read selected cell ────────────────────────────────────────────

function getSelectedCellValue() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const cell  = sheet.getActiveRange().getCell(1, 1);
  return {
    value:     String(cell.getValue()),
    cellRef:   cell.getA1Notation(),
    sheetName: sheet.getName()
  };
}

// ── Write encrypted value ─────────────────────────────────────────

function setEncryptedCellValue(ciphertext, cellRef, sheetName) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet not found: ' + sheetName);

  const range = sheet.getRange(cellRef);
  range.setValue(ciphertext);

  // Stamp a note so onEdit can also identify vault cells
  const note = range.getNote() || '';
  if (!note.includes('[CipherSheet]')) {
    range.setNote((note ? note + '\n' : '') +
      '[CipherSheet] Encrypted — edit via the CipherSheet sidebar only.');
  }

  // Apply warning-only protection so even the owner sees a warning
  // before manually editing. Warning-only is the only mode that works
  // reliably for the owner; the onEdit trigger provides the hard revert.
  _applyWarningProtection(sheet, range);

  return { ok: true, cellRef };
}

function _applyWarningProtection(sheet, range) {
  // Remove any existing CipherSheet protection on this range first
  sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE)
    .filter(p => p.getDescription().startsWith('CipherSheet:'))
    .forEach(p => {
      try {
        const a1 = p.getRange().getA1Notation();
        if (a1 === range.getA1Notation()) p.remove();
      } catch(_) {}
    });

  const protection = range.protect();
  protection.setDescription('CipherSheet:' + range.getA1Notation());
  protection.setWarningOnly(true);
}

// ── Decrypt consent modal ─────────────────────────────────────────
//
// Opens the confirmation dialog in the main Sheet UI.
// Passes ONLY cellRef and sheetName — no plaintext, no key.
// The plaintext never leaves the sidebar's JS context.

function openDecryptConfirm(cellRef, sheetName, keyLoaded) {
  const tpl = HtmlService.createTemplateFromFile('decrypt-confirm');
  tpl.cellRef   = cellRef;
  tpl.sheetName = sheetName;
  tpl.keyLoaded = keyLoaded ? 'true' : 'false';

  const html = tpl.evaluate()
    .setWidth(480)
    .setHeight(keyLoaded ? 430 : 320); // shorter when only Clear is available

  SpreadsheetApp.getUi().showModalDialog(html, '🔓 Unprotect Cell — ' + cellRef);
}

// ── Consent signalling via UserCache ──────────────────────────────
//
// Two keys are used per operation, both user-scoped:
//
//   VAULT_INTENT:{sheet}:{cell}   — written by modal on action/cancel
//   VAULT_ALIVE:{sheet}:{cell}    — heartbeat written by modal every 2s (TTL 4s)
//
// The sidebar polls both. If the ALIVE key disappears without an INTENT
// key appearing, the modal was closed via the X button → treat as cancel.
// This avoids any need for a manual "cancel" UI element in the sidebar.

const CACHE_TTL       = 60; // intent key TTL (seconds)
const HEARTBEAT_TTL   = 4;  // alive key TTL — must be > heartbeat interval (2s)

function _intentKey(cellRef, sheetName) {
  return 'VAULT_INTENT:' + sheetName + ':' + cellRef;
}
function _aliveKey(cellRef, sheetName) {
  return 'VAULT_ALIVE:' + sheetName + ':' + cellRef;
}

/** Modal calls this on load and every 2 s to signal it is still open. */
function heartbeatModalAlive(cellRef, sheetName) {
  CacheService.getUserCache().put(
    _aliveKey(cellRef, sheetName), '1', HEARTBEAT_TTL
  );
  return { ok: true };
}

/**
 * Called by the modal to record the user's decision.
 * intent: 'reveal' | 'clear' | 'cancel'
 * Also removes the alive key so the sidebar stops seeing a heartbeat.
 */
function recordDecryptIntent(cellRef, sheetName, intent) {
  const cache = CacheService.getUserCache();
  cache.put(_intentKey(cellRef, sheetName), intent, CACHE_TTL);
  cache.remove(_aliveKey(cellRef, sheetName));
  return { ok: true };
}

/**
 * Called by the sidebar poll loop.
 * Returns: { intent: string } | { closed: true } | null (still open, no decision)
 * Removes the intent key after reading so it fires exactly once.
 */
function pollDecryptIntent(cellRef, sheetName) {
  const cache      = CacheService.getUserCache();
  const intentKey  = _intentKey(cellRef, sheetName);
  const intentVal  = cache.get(intentKey);

  if (intentVal !== null) {
    cache.remove(intentKey);
    return { intent: intentVal };
  }

  // No intent yet — check if the modal is still alive
  const alive = cache.get(_aliveKey(cellRef, sheetName));
  if (alive === null) {
    // Heartbeat gone without an intent = X button was used
    return { closed: true };
  }

  return null; // still open, waiting
}

// ── Write plaintext to cell (called by sidebar after confirmed) ───
// Only called after the sidebar has verified consent via the cache.
// The plaintext arrives here from the sidebar's in-memory decryption —
// this is the one moment the decrypted value touches the server,
// which is unavoidable since writing to a cell requires server-side
// execution. It is never logged.

function revealCell(plaintext, cellRef, sheetName) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet not found: ' + sheetName);

  const range = sheet.getRange(cellRef);
  _removeWarningProtection(sheet, range);
  range.setValue(plaintext);
  _removeVaultNote(range);

  appendAuditLog('DECRYPT_REVEAL', cellRef, sheetName);
  return { ok: true };
}

// ── Clear vault cell without revealing ───────────────────────────

function clearVaultCell(cellRef, sheetName) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet not found: ' + sheetName);

  const range = sheet.getRange(cellRef);
  _removeWarningProtection(sheet, range);
  range.clearContent();
  _removeVaultNote(range);

  appendAuditLog('DECRYPT_CLEAR', cellRef, sheetName);
  return { ok: true };
}

// ── Internal helpers ──────────────────────────────────────────────

function _removeVaultNote(range) {
  const note = range.getNote() || '';
  if (note.includes('[CipherSheet]')) {
    range.setNote(note.replace(/\n?\[CipherSheet\][^\n]*/g, '').trim() || '');
  }
}

function _removeWarningProtection(sheet, range) {
  const a1 = range.getA1Notation();
  sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE)
    .filter(p => p.getDescription() === 'CipherSheet:' + a1)
    .forEach(p => { try { p.remove(); } catch(_) {} });
}

function showSheetAlert(title, message) {
  SpreadsheetApp.getUi().alert(title, message, SpreadsheetApp.getUi().ButtonSet.OK);
}

// ── Audit log ─────────────────────────────────────────────────────

function appendAuditLog(operation, cellRef, sheetName) {
  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  let   log = ss.getSheetByName('CipherSheet_AuditLog');
  if (!log) {
    log = ss.insertSheet('CipherSheet_AuditLog');
    log.hideSheet();
    log.appendRow(['Timestamp (UTC)', 'Operation', 'Cell', 'Sheet', 'User']);
    log.getRange(1, 1, 1, 5).setFontWeight('bold');
    log.setFrozenRows(1);
  }
  log.appendRow([
    new Date().toISOString(),
    operation,
    cellRef,
    sheetName,
    Session.getActiveUser().getEmail() || 'unknown'
  ]);
}

// ── Key fingerprint storage ───────────────────────────────────────

function storeKeyFingerprint(fingerprint) {
  PropertiesService.getDocumentProperties()
    .setProperty('VAULT_KEY_FINGERPRINT', fingerprint);
  return { ok: true };
}

function getKeyFingerprint() {
  return PropertiesService.getDocumentProperties()
    .getProperty('VAULT_KEY_FINGERPRINT') || null;
}
