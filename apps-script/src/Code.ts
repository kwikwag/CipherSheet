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

interface OnEditEvent {
  oldValue?: unknown;
  range: GoogleAppsScript.Spreadsheet.Range;
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

interface SetEncryptedCellValueResponse extends OkResponse {
  cellRef: string;
}

interface DocumentSettings {
  editWarningEnabled: boolean;
  noteEnabled: boolean;
  onEditEnabled: boolean;
}

interface CommonTemplateVars {
  appVersion: string;
  feedbackUrl: string;
  donateUrl: string;
  privacyUrl: string;
}

interface SidebarTemplate
  extends GoogleAppsScript.HTML.HtmlTemplate,
    CommonTemplateVars {}

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

const VAULT_PFX_TRIGGER = '\uD83D\uDD10'; // 🔐
const PROTECTION_DESC_PREFIX = 'CipherSheet:';
const SETTINGS_KEY = 'CIPHERSHEET_SETTINGS';
const APP_VERSION = '1.0.0';
const FEEDBACK_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLScRT2LRVGqDcpENJ2fYaqIOr0fE9XUsEk9tJLZUtSa4i4dleQ/viewform';
const DONATE_URL =
  'https://kwikwag.github.io/CipherSheet/donate';
const PRIVACY_URL =
  'https://kwikwag.github.io/CipherSheet/privacy';

const CACHE_TTL = 60; // intent key TTL (seconds)
const HEARTBEAT_TTL = 4; // alive key TTL — must be > heartbeat interval (2s)

const DEFAULT_SETTINGS: DocumentSettings = {
  editWarningEnabled: true,
  noteEnabled: true,
  onEditEnabled: true
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
      .addItem('Open Vault', 'showSidebar')
      .addSeparator()
      .addItem('How to use', 'showOnboarding');
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

function showSidebar(): void {
  const tpl = HtmlService.createTemplateFromFile('sidebar') as SidebarTemplate;
  applyCommonTemplateVars(tpl);

  const html = tpl
    .evaluate()
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

function onEdit(e?: OnEditEvent): void {
  if (!e) return;

  const settings = getDocumentSettings();
  if (!settings.onEditEnabled) return;

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
  } catch (_) {
    // UI unavailable in some trigger contexts
  }
}

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

  return {
    value: String(cell.getValue()),
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
  range.setValue(ciphertext);

  const settings = getDocumentSettings();

  // Stamp a note so onEdit can also identify vault cells
  if (settings.noteEnabled) {
    const note = range.getNote() || '';
    if (!note.includes('[CipherSheet]')) {
      range.setNote(
        (note ? note + '\n' : '') +
          '[CipherSheet] Encrypted — edit via the CipherSheet sidebar only.'
      );
    }
  }

  // Apply warning-only protection so even the owner sees a warning
  // before manually editing. Warning-only is the only mode that works
  // reliably for the owner; the onEdit trigger provides the hard revert.
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
//   VAULT_INTENT:{sheet}:{cell}   — written by modal on action/cancel
//   VAULT_ALIVE:{sheet}:{cell}    — heartbeat written by modal every 2s (TTL 4s)
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
  return `VAULT_${kind}:${sheetName}:${cellRef}`;
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
  removeVaultNote_(range);

  return { ok: true };
}

// ── Clear vault cell without revealing ───────────────────────────

function clearVaultCell(cellRef: string, sheetName: string): OkResponse {
  const sheet = getSheetOrThrow(sheetName);
  const range = sheet.getRange(cellRef);

  removeWarningProtection_(sheet, range);
  range.clearContent();
  removeVaultNote_(range);

  return { ok: true };
}

// ── Internal helpers ──────────────────────────────────────────────

function removeVaultNote_(range: GoogleAppsScript.Spreadsheet.Range): void {
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
    editWarningEnabled:
      settings?.editWarningEnabled ?? DEFAULT_SETTINGS.editWarningEnabled,
    noteEnabled: settings?.noteEnabled ?? DEFAULT_SETTINGS.noteEnabled,
    onEditEnabled: settings?.onEditEnabled ?? DEFAULT_SETTINGS.onEditEnabled
  };
}

function isDecryptIntent(value: unknown): value is DecryptIntent {
  return typeof value === 'string' && VALID_DECRYPT_INTENTS.has(value as DecryptIntent);
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

function invalidateAuth_() {
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
