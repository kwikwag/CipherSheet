/**
 * @OnlyCurrentDoc
 */

// ╔══════════════════════════════════════════════════════════════╗
// ║  CipherSheet — Server-side Apps Script  (Code.gs)            ║
// ╚══════════════════════════════════════════════════════════════╝

// ── Shared types/constants ───────────────────────────────────────

type DecryptIntent = 'reveal' | 'clear' | 'cancel';

type DecryptIntentPollResult =
  | { intent: DecryptIntent }
  | { closed: true }
  | null;

interface AddonOpenEvent {
  authMode?: GoogleAppsScript.Script.AuthMode;
}

interface CellRef {
  cellRef: string;
  sheetName: string;
}

interface SelectedCellValue extends CellRef {
  value: string;
}

interface OkResponse {
  ok: true;
}

interface SerializedEditorEntry {
  email: string;
  name?: string;
  publicKeyBase64?: string;
}

interface GroupEntry {
  id: string;
  emailHashes: string[];
  label: string;
}

interface SetEncryptedCellValueResponse extends OkResponse {
  cellRef: string;
}

interface DocumentSettings {
  editWarningEnabled: boolean;
  revertOnEditEnabled: boolean;
}

interface CommonTemplateVars {
  appVersion: string;
  feedbackUrl: string;
  donateUrl: string;
  privacyUrl: string;
}

interface SidebarTemplate
  extends GoogleAppsScript.HTML.HtmlTemplate,
    CommonTemplateVars {
  passkeyPopupUrl: string;
  editors: SerializedEditorEntry[];
  initialCell: SelectedCellValue | null;
}

interface OnboardingTemplate
  extends GoogleAppsScript.HTML.HtmlTemplate,
    CommonTemplateVars {}

interface SettingsTemplate
  extends GoogleAppsScript.HTML.HtmlTemplate,
    CommonTemplateVars {}

interface DecryptConfirmTemplate
  extends GoogleAppsScript.HTML.HtmlTemplate,
    CommonTemplateVars {
  cellRef: string;
  sheetName: string;
  keyLoaded: string;
}

const PK_PREFIX  = 'pk:';
const GRP_PREFIX = 'grp:';
const PROTECTION_DESC_PREFIX = 'CipherSheet:';
// Matches the dummy formula used to display "🔒 Encrypted" while hiding the ciphertext
// as the unreachable second branch. Group 1 captures the raw ciphertext.
// TODO : can we have one central place this logic is defined everybody uses
const ENCRYPTED_FORMULA_RE = /^=IF\(TRUE,"🔒 Encrypted","(🔐[^"]*)"\)$/;
const SETTINGS_KEY = 'CIPHERSHEET_SETTINGS';
const APP_VERSION = '1.0.0';
const HOST_PREFIX = 'https://www.yuvalsadan.com/CipherSheet';
const FEEDBACK_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLScRT2LRVGqDcpENJ2fYaqIOr0fE9XUsEk9tJLZUtSa4i4dleQ/viewform';
const DONATE_URL = HOST_PREFIX + '/donate';
const PRIVACY_URL = HOST_PREFIX + '/privacy';

const CACHE_TTL = 60; // intent key TTL (seconds)
// HEARTBEAT_TTL must be strictly greater than the modal's heartbeat interval (2 s).
// If it were ≤ 2 s the key could expire between beats, causing a false "modal closed" read.
const HEARTBEAT_TTL = 4;

const DEFAULT_SETTINGS: DocumentSettings = {
  editWarningEnabled: false,
  revertOnEditEnabled: false,
};

const VALID_DECRYPT_INTENTS: ReadonlySet<DecryptIntent> = new Set([
  'reveal',
  'clear',
  'cancel'
]);

// ── Add-on Lifecycle & Menu ────────────────────────────────────────

function onInstall(e?: AddonOpenEvent): void {
  safeSetupAddonMenu(e);
}

function onOpen(e?: AddonOpenEvent): void {
  safeSetupAddonMenu(e);
}

function safeSetupAddonMenu(e?: AddonOpenEvent): void {
  // Keep trigger entrypoints resilient: menu setup must succeed even when
  // the add-on is installed but not yet authorized.
  try {
    buildAddonMenu(e);
  } catch (err) {
    // Last-resort fallback so the user still gets a menu entry to authorize.
    const ui = SpreadsheetApp.getUi();
    ui.createAddonMenu().addItem('Start CipherSheet', 'showSidebar').addToUi();
    console.error('Failed to build full CipherSheet menu:', err);
  }
}

function buildAddonMenu(e?: AddonOpenEvent): void {
  const ui = SpreadsheetApp.getUi();
  const menu = ui.createAddonMenu();

  if (isAuthModeNone(e)) {
    // The add-on is installed but not yet enabled for this document.
    // The user must click this to trigger the authorization flow.
    menu.addItem('Start CipherSheet', 'showSidebar');
  } else {
    // The add-on is enabled and authorized.
    menu
      .addItem('Open CipherSheet', 'showSidebar')
      .addSeparator()
      .addItem('How to use', 'showOnboarding')
      .addSeparator()
      .addItem('Reset metadata', 'resetDocumentMetadata');
  }
  menu.addToUi();
}

function isAuthModeNone(e?: AddonOpenEvent): boolean {
  return e?.authMode === ScriptApp.AuthMode.NONE;
}

function showOnboarding(): void {
  const tpl = HtmlService.createTemplateFromFile('onboarding') as OnboardingTemplate;
  applyCommonTemplateVars(tpl);

  const html = tpl
    .evaluate()
    .setWidth(600)
    .setHeight(575);
  SpreadsheetApp.getUi().showModalDialog(html, '🔐 Welcome to CipherSheet');
}

const PASSKEY_POPUP_URL =
  'https://ciphersheet-passkey.yuvalsadan.com/';

function getPasskeyPopupUrl(): string {
  return PASSKEY_POPUP_URL;
}

function showSidebar(): void {
  const tpl = HtmlService.createTemplateFromFile('sidebar') as SidebarTemplate;
  applyCommonTemplateVars(tpl);
  tpl.passkeyPopupUrl = getPasskeyPopupUrl();
  tpl.editors = listEditors();
  tpl.initialCell = getSelectedCellValueSafe_();

  const html = tpl
    .evaluate()
    .setTitle('🔐 CipherSheet')
    .setWidth(300);
  SpreadsheetApp.getUi().showSidebar(html);
}

function getSelectedCellValueSafe_(): SelectedCellValue | null {
  try {
    return getSelectedCellValue();
  } catch (err) {
    console.error('Failed to read initial CipherSheet cell:', err);
    return null;
  }
}

function jsonForScript_(value: unknown): string {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, ch => {
    switch (ch) {
      case '<': return '\\u003c';
      case '>': return '\\u003e';
      case '&': return '\\u0026';
      case '\u2028': return '\\u2028';
      case '\u2029': return '\\u2029';
      default: return ch;
    }
  });
}

// ── onEdit trigger — encrypted cell guard (DISABLED) ─────────────────
//
// NOTE: onEdit-based reversion is not currently supported. Encrypted cells are stored
// as =IF(TRUE,"🔒 Encrypted","🔐...") formulas. When a user edits such a cell,
// e.oldValue is the computed display value ("🔒 Encrypted"), not the formula, so
// there is no way to restore the original formula from the event alone. Reversion
// via onEdit would require storing the formula externally, which adds complexity.
// For this release, revertOnEditEnabled is disabled and onEdit is a no-op.
// The warning-only protection (editWarningEnabled) remains the primary guard.


// ── Navigate to a cell ────────────────────────────────────────────

function navigateToCell(cellRef: string, sheetName: string): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;

  ss.setActiveSheet(sheet);
  sheet.getRange(cellRef).activate();
}

// ── Read selected cell ────────────────────────────────────────────

function getSelectedCellValue(): SelectedCellValue {
  const sheet = SpreadsheetApp.getActiveSheet();
  const cell = sheet.getActiveRange().getCell(1, 1);

  // Encrypted cells store the ciphertext in the formula's unreachable second branch.
  // Extract it from there; fall back to getValue() for plain (non-encrypted) cells.
  const formula = cell.getFormula();
  const match = ENCRYPTED_FORMULA_RE.exec(formula);
  return {
    value: match ? match[1] : String(cell.getValue()),
    cellRef: cell.getA1Notation(),
    sheetName: sheet.getName()
  };
}

// ── Write encrypted value ─────────────────────────────────────────

function setEncryptedCellValue(
  ciphertext: string,
  cellRef: string,
  sheetName: string
): SetEncryptedCellValueResponse {
  const sheet = getSheetOrThrow(sheetName);
  const range = sheet.getRange(cellRef);
  // Store ciphertext in the unreachable branch of an IF formula so the cell displays
  // "🔒 Encrypted" without needing a custom number format. getFormula() retrieves the
  // ciphertext; getDisplayValue() / getValue() never expose the raw payload to the user.
  range.setFormula(`=IF(TRUE,"🔒 Encrypted","${ciphertext}")`);

  const settings = getDocumentSettings();

  // Apply warning-only protection so even the owner sees a warning before manually editing.
  if (settings.editWarningEnabled) {
    applyWarningProtection_(sheet, range);
  }

  return { ok: true, cellRef };
}

function applyWarningProtection_(
  sheet: GoogleAppsScript.Spreadsheet.Sheet,
  range: GoogleAppsScript.Spreadsheet.Range
): void {
  // Remove any existing CipherSheet protection on this range first
  sheet
    .getProtections(SpreadsheetApp.ProtectionType.RANGE)
    .filter((p) => p.getDescription().startsWith(PROTECTION_DESC_PREFIX))
    .forEach((p) => {
      try {
        const a1 = p.getRange().getA1Notation();
        if (a1 === range.getA1Notation()) p.remove();
      } catch (_) {
        // Ignore orphaned or inaccessible protections.
      }
    });

  const protection = range.protect();
  protection.setDescription(PROTECTION_DESC_PREFIX + range.getA1Notation());
  protection.setWarningOnly(true);
}

// ── Decrypt consent modal ─────────────────────────────────────────
//
// Opens the confirmation dialog in the main Sheet UI.
// Passes ONLY cellRef and sheetName — no plaintext, no key.
// The plaintext never leaves the sidebar's JS context.

function openDecryptConfirm(
  cellRef: string,
  sheetName: string,
  keyLoaded: boolean
): void {
  const tpl = HtmlService.createTemplateFromFile(
    'decrypt-confirm'
  ) as DecryptConfirmTemplate;
  applyCommonTemplateVars(tpl);

  tpl.cellRef = cellRef;
  tpl.sheetName = sheetName;
  tpl.keyLoaded = keyLoaded ? 'true' : 'false';

  const html = tpl
    .evaluate()
    .setWidth(480)
    .setHeight(keyLoaded ? 490 : 380); // includes donate footer

  SpreadsheetApp.getUi().showModalDialog(html, '🔓 Unprotect Cell — ' + cellRef);
}

// ── Consent signalling via UserCache ──────────────────────────────
//
// Two keys are used per operation, both user-scoped:
//
//   CS_INTENT:{sheet}:{cell}   — written by modal on action/cancel
//   CS_ALIVE:{sheet}:{cell}    — heartbeat written by modal every 2s (TTL 4s)
//
// The sidebar polls both. If the ALIVE key disappears without an INTENT
// key appearing, the modal was closed via the X button → treat as cancel.
// This avoids any need for a manual "cancel" UI element in the sidebar.

function intentKey_(cellRef: string, sheetName: string): string {
  return cacheKey_('INTENT', cellRef, sheetName);
}

function aliveKey_(cellRef: string, sheetName: string): string {
  return cacheKey_('ALIVE', cellRef, sheetName);
}

function cacheKey_(
  kind: 'INTENT' | 'ALIVE',
  cellRef: string,
  sheetName: string
): string {
  return `CS_${kind}:${sheetName}:${cellRef}`;
}

/** Modal calls this on load and every 2 s to signal it is still open. */
function heartbeatModalAlive(cellRef: string, sheetName: string): OkResponse {
  CacheService.getUserCache().put(aliveKey_(cellRef, sheetName), '1', HEARTBEAT_TTL);
  return { ok: true };
}

/**
 * Called by the modal to record the user's decision.
 * intent: 'reveal' | 'clear' | 'cancel'
 * Also removes the alive key so the sidebar stops seeing a heartbeat.
 */
function recordDecryptIntent(
  cellRef: string,
  sheetName: string,
  intent: string
): OkResponse {
  if (!isDecryptIntent(intent)) {
    throw new Error(`Invalid intent: ${intent}`);
  }

  const cache = CacheService.getUserCache();
  cache.put(intentKey_(cellRef, sheetName), intent, CACHE_TTL);
  // Proactively remove the heartbeat key so the sidebar detects modal closure immediately
  // rather than waiting up to HEARTBEAT_TTL seconds for the key to expire on its own.
  cache.remove(aliveKey_(cellRef, sheetName));
  return { ok: true };
}

/**
 * Called by the sidebar poll loop.
 * Returns: { intent: string } | { closed: true } | null (still open, no decision)
 * Removes the intent key after reading so it fires exactly once.
 */
function pollDecryptIntent(
  cellRef: string,
  sheetName: string
): DecryptIntentPollResult {
  const cache = CacheService.getUserCache();
  const intentKey = intentKey_(cellRef, sheetName);
  const intentVal = cache.get(intentKey);

  if (intentVal !== null) {
    // Remove immediately so subsequent polls don't see the same intent twice.
    cache.remove(intentKey);
    if (isDecryptIntent(intentVal)) {
      return { intent: intentVal };
    }
    return { closed: true };
  }

  // No intent yet — check if the modal is still alive
  const alive = cache.get(aliveKey_(cellRef, sheetName));
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

function revealCell(plaintext: string, cellRef: string, sheetName: string): OkResponse {
  const sheet = getSheetOrThrow(sheetName);
  const range = sheet.getRange(cellRef);

  removeWarningProtection_(sheet, range);
  range.setValue(plaintext);
  removeCellNote_(range);

  return { ok: true };
}

// ── Clear encrypted cell without revealing ───────────────────────────

function clearCell(cellRef: string, sheetName: string): OkResponse {
  const sheet = getSheetOrThrow(sheetName);
  const range = sheet.getRange(cellRef);

  removeWarningProtection_(sheet, range);
  range.clearContent();
  removeCellNote_(range);

  return { ok: true };
}

// ── Internal helpers ──────────────────────────────────────────────

function removeCellNote_(range: GoogleAppsScript.Spreadsheet.Range): void {
  const note = range.getNote() || '';
  if (note.includes('[CipherSheet]')) {
    range.setNote(note.replace(/\n?\[CipherSheet\][^\n]*/g, '').trim() || '');
  }
}

function removeWarningProtection_(
  sheet: GoogleAppsScript.Spreadsheet.Sheet,
  range: GoogleAppsScript.Spreadsheet.Range
): void {
  const a1 = range.getA1Notation();
  sheet
    .getProtections(SpreadsheetApp.ProtectionType.RANGE)
    .filter((p) => p.getDescription() === PROTECTION_DESC_PREFIX + a1)
    .forEach((p) => {
      try {
        p.remove();
      } catch (_) {
        // Ignore protection removal failures.
      }
    });
}

function getSheetOrThrow(sheetName: string): GoogleAppsScript.Spreadsheet.Sheet {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('Sheet not found: ' + sheetName);
  }
  return sheet;
}

function showSheetAlert(title: string, message: string): void {
  SpreadsheetApp.getUi().alert(title, message, SpreadsheetApp.getUi().ButtonSet.OK);
}

function showSheetConfirm(title: string, message: string): boolean {
  const ui = SpreadsheetApp.getUi();
  return ui.alert(title, message, ui.ButtonSet.YES_NO) === ui.Button.YES;
}


// ── Settings ──────────────────────────────────────────────────────

function getDocumentSettings(): DocumentSettings {
  const props = PropertiesService.getDocumentProperties();
  const raw = props.getProperty(SETTINGS_KEY);

  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<DocumentSettings>;
      return normalizeDocumentSettings(parsed);
    } catch (_e) {
      // Fall through to defaults when settings are malformed.
    }
  }

  return { ...DEFAULT_SETTINGS };
}

function setDocumentSettings(settings: Partial<DocumentSettings>): OkResponse {
  const normalized = normalizeDocumentSettings(settings);
  PropertiesService.getDocumentProperties().setProperty(
    SETTINGS_KEY,
    JSON.stringify(normalized)
  );
  return { ok: true };
}

function normalizeDocumentSettings(
  settings: Partial<DocumentSettings> | null | undefined
): DocumentSettings {
  return {
    editWarningEnabled: settings?.editWarningEnabled ?? DEFAULT_SETTINGS.editWarningEnabled,
    revertOnEditEnabled: settings?.revertOnEditEnabled ?? DEFAULT_SETTINGS.revertOnEditEnabled,
  };
}

function isDecryptIntent(value: unknown): value is DecryptIntent {
  return typeof value === 'string' && VALID_DECRYPT_INTENTS.has(value as DecryptIntent);
}

// ── Public key registry ───────────────────────────────────────────

function getCurrentUserEmail(): string {
  return Session.getActiveUser().getEmail();
}

function storePublicKey(base64SPKI: string): OkResponse {
  // Email is derived server-side, never from the client parameter.
  // If the client supplied the email, any user could register a key under a different identity.
  const email = Session.getActiveUser().getEmail();
  if (!email) throw new Error('Cannot determine user email — please re-authorize the add-on.');
  PropertiesService.getDocumentProperties().setProperty(PK_PREFIX + email, base64SPKI);
  return { ok: true };
}

function removePublicKey(): OkResponse {
  const email = Session.getActiveUser().getEmail();
  if (!email) throw new Error('Cannot determine user email — please re-authorize the add-on.');
  PropertiesService.getDocumentProperties().deleteProperty(PK_PREFIX + email);
  return { ok: true };
}

function listEditors(): SerializedEditorEntry[] {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const editorEmails = new Set<string>(ss.getEditors().map(u => u.getEmail()).filter(Boolean));
  const props = PropertiesService.getDocumentProperties().getProperties();
  const keyByEmail = new Map<string, string>(
    Object.keys(props)
      .filter(k => k.startsWith(PK_PREFIX))
      .map(k => [k.slice(PK_PREFIX.length), props[k]] as [string, string])
  );
  const all = new Set([...editorEmails, ...keyByEmail.keys()]);
  return [...all].map(email => {
    const entry: SerializedEditorEntry = { email };
    const publicKeyBase64 = keyByEmail.get(email);
    if (publicKeyBase64) entry.publicKeyBase64 = publicKeyBase64;
    return entry;
  });
}

// ── Group management ──────────────────────────────────────────────

function upsertGroup(groupId: string, emailHashes: string[], label: string): OkResponse {
  const docProps = PropertiesService.getDocumentProperties();
  const key = GRP_PREFIX + groupId;
  let existing: { emailHashes: string[]; label: string } | null = null;
  const raw = docProps.getProperty(key);
  if (raw) {
    try { existing = JSON.parse(raw); } catch (_) {}
  }
  const entry = {
    emailHashes: existing?.emailHashes ?? emailHashes,
    label: label || existing?.label || '',
  };
  docProps.setProperty(key, JSON.stringify(entry));
  return { ok: true };
}

function listGroups(): GroupEntry[] {
  const props = PropertiesService.getDocumentProperties().getProperties();
  const result: GroupEntry[] = [];
  for (const k of Object.keys(props)) {
    if (!k.startsWith(GRP_PREFIX)) continue;
    try {
      const v = JSON.parse(props[k]);
      if (!Array.isArray(v?.emailHashes)) continue;
      result.push({ id: k.slice(GRP_PREFIX.length), emailHashes: v.emailHashes, label: v.label || '' });
    } catch (_) {}
  }
  return result;
}


// ── Reset metadata ────────────────────────────────────────────────
// Removes all non-sheet-stored data written by the add-on: document settings,
// registered public keys (pk:*), and group entries (grp:*). Does NOT touch
// cell formulas or range protections — those are sheet-stored.

function resetDocumentMetadata(): void {
  const confirmed = showSheetConfirm(
    '🔐 Reset CipherSheet Metadata',
    'This will permanently delete all CipherSheet metadata for this document:\n\n' +
      '• Settings\n' +
      '• Registered public keys\n' +
      '• Recipient groups\n\n' +
      'Encrypted cell contents are NOT affected.\n\n' +
      'Continue?'
  );
  if (!confirmed) return;

  PropertiesService.getDocumentProperties().deleteAllProperties();

  showSheetAlert('🔐 CipherSheet', 'Metadata cleared.');
}

function showSettings(): void {
  const tpl = HtmlService.createTemplateFromFile('settings') as SettingsTemplate;
  applyCommonTemplateVars(tpl);

  const html = tpl
    .evaluate()
    .setWidth(460)
    .setHeight(280);
  SpreadsheetApp.getUi().showModalDialog(html, '🔐 CipherSheet Settings');
}

// ── Include ──────────────────────────────────────────────────────
function include(filename: string): string {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function applyCommonTemplateVars<T extends CommonTemplateVars>(tpl: T): void {
  tpl.appVersion = APP_VERSION;
  tpl.feedbackUrl = FEEDBACK_URL;
  tpl.donateUrl = DONATE_URL;
  tpl.privacyUrl = PRIVACY_URL;
}

function invalidateAuth() {
  ScriptApp.invalidateAuth();
}

function h_(str: string) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
