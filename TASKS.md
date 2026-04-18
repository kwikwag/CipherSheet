# CipherSheet — Pending Tasks

Work items for the next development session. Read [AGENTS.md](AGENTS.md) first for full project context. Each task is self-contained; they can be tackled in any order unless otherwise noted (task 4 depends on task 3 for the settings change).

---

## Task 1 — Toast: warnings and errors stay until dismissed

**File:** `apps-script/src/sidebar.html` — `toast()` function (~line 534)

Currently all toasts auto-dismiss after a fixed `duration`. Warnings (`type='warn'`) and errors (`type='err'`) should persist until the user explicitly dismisses them (clicks ✕ or calls `dismissToast()`). Info/success toasts (`type='ok'` or no type) can keep the current auto-dismiss behaviour.

**Change:** In `toast()`, only start the `setTimeout` when `type` is not `'warn'` and not `'err'`.

---

## Task 2 — Sidebar does not read plaintext cell values

**File:** `apps-script/src/sidebar.html` — `renderField()` and `autoDecrypt()`

Currently, when a non-encrypted cell is selected, its plaintext content is mirrored into the textarea. This blurs the purpose of the sidebar — the textarea should be a write-only scratchpad for secrets the user is about to protect, not a mirror of whatever is in the cell.

**New behaviour:**
- **Plaintext cell selected:** leave the textarea empty (or show placeholder text). Do not copy the cell's raw value into the textarea.
- **Encrypted cell selected (no key):** keep the existing overlay behaviour ("Unlock key to decrypt").
- **Encrypted cell selected (key loaded):** auto-decrypt into the textarea as now — this is the one legitimate read-from-sheet path.

The "Update" button (re-encrypt an existing encrypted cell) remains valid: the decrypted value is typed by the user or auto-decrypted from the ciphertext; it never originates from a plaintext cell read.

In `renderField()`, remove the `field.value = raw` assignment in the `!cryptoKey` / non-encrypted branch. In `autoDecrypt()`, the non-encrypted branch (`else { field.value = raw; ... }`) should set `field.value = ''` instead.

---

## Task 3 — Unified key file format

**Files:** `apps-script/src/sidebar.html` — `loadKeyFile()`, `generateAndLoadKey()` (preshared path), `setupNewKeypair()`, `handleKeypairImport()`

Both key types currently use different file extensions and slightly different JSON layouts. Standardise them:

**Single extension:** `.ciphersheet-key` for all key files.

**Unified JSON structure:**
```json
{
  "type": "CipherSheet-ECDH-P256",   // or "CipherSheet-AES256"
  "version": 1,
  "key": "<base64-raw-bytes>"        // for AES-256 pre-shared
  // OR
  "jwk": { ... }                     // for ECDH private key
}
```

Update:
- The download filename for pre-shared keys to use `.ciphersheet-key` instead of `.vaultkey`.
- `loadKeyFile()` (the drop/click file loader) to accept `.ciphersheet-key` files and detect type from the `type` field:
  - `CipherSheet-AES256` → load as pre-shared key (existing `activatePresharedKey` path)
  - `CipherSheet-ECDH-P256` → load as ECDH keypair (existing `handleKeypairImport` path)
- `handleKeypairImport()` to also fall through to `loadKeyFile()` (or merge them) so there is a single file-loading entry point.
- Keep accepting the old `.vaultkey` extension for backward compatibility on import.

---

## Task 4 — Default key type setting; simplified "generate key" UX

**Files:** `apps-script/src/Code.ts`, `apps-script/src/sidebar.html`, `apps-script/src/settings.html`

### 4a — Settings: new `defaultKeyType` field

Add `defaultKeyType: 'ecdh' | 'preshared'` to the `DocumentSettings` interface and `DEFAULT_SETTINGS` (default: `'ecdh'`). Persist and restore it alongside the other settings.

In `settings.html`, add a new settings row with a toggle or radio button for the key type. Include a brief explainer for each option (keep it non-technical):

> **Keypair** — each user has their own key. You can share encrypted cells with specific people. Best for teams.
>
> **Shared key** — everyone uses the same key file. Simpler to set up, but everyone with the file can read all encrypted cells.

### 4b — Sidebar: simplified single "Generate key" button

The `#ks-setup` section currently shows three buttons with technical labels ("Generate ECDH keypair", "Import keypair backup (.ciphersheet-key)", "Load .vaultkey (pre-shared key)"). Replace with:

- **One primary button:** `Generate key` — label stays simple regardless of the key type setting. The behavior (generate ECDH keypair or generate pre-shared key) is determined by the `defaultKeyType` setting loaded at sidebar init.
- **One secondary link/button:** `Import existing key` — opens a single file picker that accepts `.ciphersheet-key` (and legacy `.vaultkey`) and auto-detects the type via the `type` field (see Task 3).

The key section overlay on the textarea (the "Unlock key to encrypt/decrypt" overlay) should remain as-is.

---

## Task 5 — Allow forgetting/removing a stored key

**File:** `apps-script/src/sidebar.html` — `#ks-locked` section

When the ECDH key is locked and the user cannot supply the unlock password, there is currently no escape — the UI is stuck on the locked state. Add a small "Forget this key" link below the password field in `#ks-locked`. Clicking it:
1. Shows a brief inline confirmation ("This will permanently delete the stored key. You will need to generate or import a new one.")
2. On confirm: calls `idbDelete(IDB_ECDH_KEY)` and then `showKeyState()` to return to the setup state.

---

## Task 6 — Save unlock password via passkey or browser password manager

**File:** `apps-script/src/sidebar.html` — `setupNewKeypair()`, `handleKeypairImport()`, `unlockEcdh()`

The goal is to make the unlock password automatically available in future sessions without the user having to store it manually.

### 6a — WebAuthn PRF (preferred; may not work in the Apps Script iframe)

Attempt WebAuthn registration with the PRF extension during key setup. Apps Script sidebars run in a cross-origin iframe without `allow="publickey-credentials-create"`, so this will likely throw a `SecurityError`. Catch it silently and fall through to 6b.

If it does work (e.g. if run outside an iframe, or if Google adds the permission in future):
- On setup (`create`): register a passkey, get the PRF output from the registration response (Chrome 132+ returns `prf.results.first` during `create`; otherwise issue an immediate `get` assertion to obtain the first PRF output).
- Store `credentialId` alongside the wrapped key in IndexedDB.
- On unlock: issue a WebAuthn `get` assertion with `prf: { eval: { first: storedPrfSalt, second: newPrfSalt } }`, use `first` to decrypt, re-encrypt with `second`, rotate the stored salt atomically.
- "Use another device" transport: include `transports: ['hybrid', 'internal', 'usb']` in the `get` call; WebAuthn handles the cross-device (caBLE/hybrid) UI natively in the browser.

If WebAuthn is unavailable or throws, show a non-blocking informational tooltip explaining why ("Passkey storage is not available in this sidebar environment").

### 6b — Browser password manager via PasswordCredential + form submission

Two complementary approaches, both worth trying:

**`PasswordCredential` API (Chrome only):** After generating the password, call:
```js
if (window.PasswordCredential) {
  const cred = new PasswordCredential({
    id: 'ciphersheet-unlock',
    password: generatedPassword,
    name: 'CipherSheet — unlock password'
  });
  await navigator.credentials.store(cred);
}
```
The `mediation` parameter on the `get` call for autofill should be `'optional'` (not `'silent'`) so the browser actually shows the credential picker to the user.

**Password form heuristic (cross-browser fallback):** Browsers save passwords when a form containing a password field is submitted. Add a hidden form to the page:
```html
<form id="pwSaveForm" method="post" action="" style="display:none">
  <input type="text"     name="username" autocomplete="username"         value="ciphersheet-unlock">
  <input type="password" name="password" autocomplete="current-password" id="pwSaveInput">
</form>
```
After generating the password, set `#pwSaveInput.value = generatedPassword` and call `document.getElementById('pwSaveForm').requestSubmit()`. Intercept the submit event with `e.preventDefault()` so the page doesn't navigate. The browser's heuristic should detect the password field submission and prompt the user to save.

Use both: try `PasswordCredential.store()` first; also trigger the form submit for browsers that respond to the heuristic but not the API.

On unlock, call `navigator.credentials.get({ password: true, mediation: 'optional' })` to retrieve. If the browser returns a credential use it automatically; if not (user dismissed or credentials API not available) fall through to the manual password input.

---

## Task 7 — Single unlock button, positioned below the password field

**File:** `apps-script/src/sidebar.html` — `#ks-locked` HTML section

Currently there are two unlock controls: a blue `btn-unlock` button above the password row, and a `btn-pw-unlock` button beside the password input. Remove the top button entirely. The single unlock action is the `btn-pw-unlock` beside the input. Style it as the primary blue button (same style as `btn-unlock`). Layout should be:

```
[ Recovery password input field ] [ Unlock ← blue button ]
```

The `unlockEcdh()` function (which previously drove the top button) is no longer needed as a standalone action; fold its `PasswordCredential` silent-autofill attempt into the page load / init sequence instead (try silently on sidebar open; if it succeeds, unlock automatically; if not, show the password row ready for input).

---

## Task 8 — Fix: unlock always fails with "The key is not of the expected type"

**File:** `apps-script/src/sidebar.html` — `_doUnlockWithPassword()` (around line 953)

### Root cause

`_doUnlockWithPassword` imports the private key JWK and immediately tries to export it as `'spki'`:

```js
const spki = new Uint8Array(await crypto.subtle.exportKey(
  'spki',
  await crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
));
```

`'spki'` (SubjectPublicKeyInfo) is a **public-key-only** export format. Passing a private key throws `"The key is not of the expected type"` every time, regardless of whether the password is correct. The decryption itself (`unwrapData`) likely succeeds — the error fires immediately after.

### Fix

The SPKI bytes are already stored in IndexedDB as `entry.publicKeySpki` (written by `setupNewKeypair` and `handleKeypairImport`). Use them directly:

```js
async function _doUnlockWithPassword(password) {
  const entry = await idbGet(IDB_ECDH_KEY);
  if (!entry) throw new Error('No stored keypair found');

  const jwkBytes = await unwrapData(entry, password);
  const jwk      = JSON.parse(new TextDecoder().decode(jwkBytes));

  // Use the stored SPKI bytes — do NOT try to exportKey('spki', privateKey),
  // which always throws because SPKI is a public-key format.
  const spki = new Uint8Array(entry.publicKeySpki);

  ecdhPrivKey = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']
  );
  ecdhPubKey  = await crypto.subtle.importKey(
    'spki', spki, { name: 'ECDH', namedCurve: 'P-256' }, true, []
  );
  unlockPassword = password;

  await refreshPubKeyCache();
  showKeyState();
  renderField(currentCell);
  await autoDecrypt();
  updateButtons();
  toast('Key unlocked', 'ok');
}
```

This is a one-file, minimal change. Fix this first — all unlock-related UX changes (Tasks 6 and 7) depend on unlock actually working.

---

## Task 9 — Rename "recovery password" → "unlock password"

**File:** `apps-script/src/sidebar.html`

Replace all user-visible occurrences of "recovery password" with "unlock password". This includes button labels, placeholder text, toast messages, and the password setup box text. Keep technical comments (which use "password" generically) unchanged.

Specific strings to change:
- Placeholder: `"Recovery password"` → `"Unlock password"`
- Toast: `'Enter the recovery password'` → `'Enter the unlock password'`
- Setup box heading: `"⚠ Save your recovery password"` → `"⚠ Save your unlock password"`
- Setup box body: update to match
- Toast after generation: update to match

---

## Suggested implementation order

1. **Task 8** (fix unlock crash) — everything else is moot while unlock is broken
2. **Task 9** (rename) — trivial, do alongside Task 8
3. **Task 7** (single unlock button) — small HTML/JS change
4. **Task 1** (sticky toasts) — small JS change
5. **Task 5** (forget key) — small HTML/JS change
6. **Task 3** (unified file format) — refactor, no new functionality
7. **Task 2** (no plaintext read) — behaviour change, test carefully
8. **Task 4** (settings + simplified UX) — depends on Task 3
9. **Task 6** (passkey / password manager) — most complex; implement WebAuthn attempt + PasswordCredential + form heuristic
