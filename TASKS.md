# CipherSheet — Pending Tasks

Work items for the next development session. Read [AGENTS.md](AGENTS.md) first for full project context.

---

## fix/unlock-loading — Loading indicator during unlock

**File:** `apps-script/src/sidebar.html` — `unlockWithPassword()`

Pressing Unlock gives no feedback. PBKDF2 at 310,000 iterations takes 1–3 s on a slow device, then `refreshPubKeyCache()` makes a server round-trip. The UI appears frozen.

**Fix:** Wrap `unlockWithPassword()` with the existing `setLoading` pattern:

```js
async function unlockWithPassword() {
  const pw = document.getElementById('unlockPassword').value.trim();
  if (!pw) { toast('Enter the unlock password', 'warn'); return; }
  const btn = document.querySelector('.btn-pw-unlock');
  btn.disabled = true;
  setLoading(true);
  try {
    await _doUnlockWithPassword(pw);
    document.getElementById('unlockPassword').value = '';
  } catch(e) {
    toast('Wrong password or corrupted key: ' + e.message, 'err');
  } finally {
    btn.disabled = false;
    setLoading(false);
  }
}
```

`setLoading(true)` shows the pulsing overlay on the textarea area and disables the action buttons, which is consistent with the rest of the UI. The `finally` block always restores state.

**More notes:** Other places, such as generating the key, also have this problem of hanging the UI without a loading indicator. Fix those as well.

---

## fix/remove-notes — Remove note-based vault cell labelling

**Files:** `apps-script/src/Code.ts`, `apps-script/src/settings.html`

The `noteEnabled` setting stamps `[CipherSheet] Encrypted …` as a cell note. The custom number format (`;;;"🔒 Encrypted"`) already serves as a reliable visual indicator, making the note redundant.

**Changes:**

1. **`Code.ts`**:
   - Remove `noteEnabled` from the `DocumentSettings` interface and `DEFAULT_SETTINGS`.
   - Remove the `if (settings.noteEnabled) { … }` block in `setEncryptedCellValue` (lines ~263–272).
   - Keep `removeVaultNote_()` and its calls in `revealCell` and `clearVaultCell` — these clean up notes left by older versions of the add-on.
   - Remove `noteEnabled` from `normalizeDocumentSettings`.

2. **`settings.html`**: Remove the "Add a note" settings row (the `#cb-note` checkbox block).

Do **not** remove `removeVaultNote_` — it is still needed for backward compatibility on cells encrypted by older versions.

---

## feat/passkey-unlock — Password manager / passkey autofill for unlock

**File:** `apps-script/src/sidebar.html`

Partially implemented: `PasswordCredential.store()` is called during keypair generation (`setupNewKeypair`), and a silent `credentials.get` is attempted at page load. Remaining work:

### Still missing

**a) Store credential after keypair import too**
`_importEcdhFromJwk` does not call `PasswordCredential.store()`. Add the same try/catch block that `setupNewKeypair` already has:
```js
if (window.PasswordCredential) {
  try {
    const cred = new PasswordCredential({ id: 'ciphersheet-key', password, name: 'CipherSheet Keypair' });
    await navigator.credentials.store(cred);
  } catch (_) {}
}
```

**b) Hidden form submission fallback (cross-browser)**
Browsers that don't implement `PasswordCredential` but do watch for form-submit save passwords. Add a hidden form to the HTML body:
```html
<form id="pwSaveForm" method="post" action="" style="display:none">
  <input type="text"     name="username" autocomplete="username"         value="ciphersheet-unlock">
  <input type="password" name="password" autocomplete="current-password" id="pwSaveInput">
</form>
```
After setting `unlockPassword`, set `#pwSaveInput.value = password` and call `document.getElementById('pwSaveForm').requestSubmit()`, intercepting `submit` with `e.preventDefault()`.

**c) WebAuthn PRF unlock — two viable paths**

The Apps Script sidebar iframe does not carry `allow="publickey-credentials-create publickey-credentials-get"`, so WebAuthn throws `SecurityError` immediately. Two options to be implemented together - we need to figure the best course of action for the specific browser context and try them one by one starting with the most seamless:

**c1 — Same-project web app popup (implementable today)**

A single Apps Script project can be deployed as both an add-on *and* a web app. Adding a `doGet()` handler to `Code.ts` and a new `prf-popup.html` template requires no new project or repo — just a second deployment entry in the Apps Script console and the same `clasp push`.

The popup is a top-level window (not an iframe), so the browser's Permissions Policy allows WebAuthn there.

Flow:
1. During keypair setup, open the web app URL as a small popup: `const popup = window.open(WEB_APP_URL + '?action=prf-enroll', 'prf', 'width=500,height=300')`.
2. `prf-popup.html` calls `navigator.credentials.create({ publicKey: { …, extensions: { prf: {} } } })` with `rpId: 'script.google.com'` and a challenge derived from the session.
3. On success, the popup calls `window.opener.postMessage({ type: 'prf-result', credentialId, prfOutput }, origin)` and closes.
4. The sidebar receives the message, validates origin, uses `prfOutput` as the AES-KW key to wrap the ECDH private key in IDB (replacing or supplementing the PBKDF2-based wrap). Stores `credentialId`.
5. On subsequent unlocks, open the popup with `action=prf-get`, pass the stored `credentialId`, get `prfOutput`, unwrap the private key — no password needed.

**Notes:**
- Validate `event.origin === WEB_APP_ORIGIN` in the `message` listener before using PRF output.
- `rpId: 'script.google.com'` is shared across all Apps Script web apps, but credentials are scoped to the user's authenticator and `credentialId`, so cross-app confusion is not a practical risk.
- The web app deployment must be set to run as the user and accessible to the relevant Google accounts.
- `WEB_APP_URL` can be injected by `Code.ts` at sidebar render time (like `FEEDBACK_URL`), so it tracks the correct deployment automatically.

**c2 — Forward-compatible iframe probe (zero-effort, future-facing)**

Keep a `try/catch` block around a direct `navigator.credentials.create(…, { extensions: { prf: {} } })` call in the sidebar. It throws `SecurityError` immediately today. If Google ever adds the iframe permission header (a one-line change on their side), the block will silently start working without any change to this codebase. Store `credentialId` in IDB alongside the keypair entry and gate the use path on its presence. Show a non-blocking tooltip ("Unlock with passkey") only when `credentialId` is set.

---

## refactor/modular-sidebar — Split sidebar.html into included parts

**Files:** `apps-script/src/sidebar.html`, `scripts/build-apps-script.mjs`, new tsconfig

`sidebar.html` is ~1,470 lines (≈480 CSS, ≈160 HTML, ≈830 JS). The `<?!= include('filename') ?>` mechanism already used for `downloaded/stylesheet` can be used to split it. The build script needs to compile the script part from TypeScript.

### Split plan

| Part | Source file | Dist file | How included |
|---|---|---|---|
| Styles | `src/sidebar-styles.html` | `dist/sidebar-styles.html` | `<?!= include('sidebar-styles'); ?>` in `<head>` |
| Body HTML | `src/sidebar-body.html` | `dist/sidebar-body.html` | `<?!= include('sidebar-body'); ?>` in `<body>` |
| Script | `src/sidebar-script.ts` | `dist/sidebar-script.html` | `<?!= include('sidebar-script'); ?>` at end of `<body>` |

After the split, `sidebar.html` becomes a thin shell:
```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CipherSheet</title>
<?!= include('downloaded/stylesheet'); ?>
<?!= include('sidebar-styles'); ?>
</head>
<body>
<?!= include('sidebar-body'); ?>
<?!= include('sidebar-script'); ?>
</body>
</html>
```

### TypeScript compilation for the sidebar script

Add `tsconfig.sidebar-script.json` at the repo root:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "none",
    "lib": ["ES2020", "DOM"],
    "outFile": "apps-script/dist/sidebar-script.js",
    "strict": false,
    "noEmitOnError": true
  },
  "include": ["apps-script/src/sidebar-script.ts"]
}
```

The build script (`scripts/build-apps-script.mjs`) needs two additional steps after the existing `tsc` run:
1. Run `tsc --project tsconfig.sidebar-script.json` to compile `sidebar-script.ts` → `dist/sidebar-script.js`.
2. Read `dist/sidebar-script.js`, wrap it as `<script>…</script>`, and write it to `dist/sidebar-script.html`. Then delete `dist/sidebar-script.js`.

`sidebar-styles.html` and `sidebar-body.html` are plain HTML files copied by the existing copy step — no extra build logic needed.

### Notes

- The `src/sidebar-script.ts` file will initially contain the exact JS from the current `<script>` block, renamed to `.ts`. TypeScript type errors from browser globals are expected and suppressed by `strict: false` and the `DOM` lib. Incrementally add types as a separate cleanup.
- Do not move template variables (`<?= feedbackUrl ?>` etc.) into `sidebar-script.ts` — they belong in `sidebar.html` or `sidebar-body.html` and can be passed as constants injected into the page before the script runs (e.g., written into a `<script>const FEEDBACK_URL = '<?= feedbackUrl ?>';</script>` block in `sidebar-body.html`).
- The `downloaded/stylesheet` include already proves this pattern works end-to-end in the deployed add-on.

---

## fix/dismiss-password-box — Dismiss button on "Save your unlock password" box

**File:** `apps-script/src/sidebar.html` — `#passwordSetupBox` (~line 449)

The password setup notification has no way to close it once the user has copied or noted the password. It stays visible until the page reloads, which is distracting.

**Change:** Add a ✕ dismiss button in the top-right corner of `#passwordSetupBox`. Clicking it sets `display: none` on the box.

```html
<div id="passwordSetupBox" class="password-setup-box" style="display:none; margin-top:10px">
  <div style="display:flex; justify-content:space-between; align-items:flex-start">
    <strong>⚠ Save your unlock password</strong>
    <button onclick="document.getElementById('passwordSetupBox').style.display='none'"
            style="background:none;border:none;cursor:pointer;font-size:14px;color:#80868b;padding:0;line-height:1">✕</button>
  </div>
  Store this in your password manager. …
  …
</div>
```

No JS function needed — the inline `onclick` is sufficient.

---

## fix/remove-import-button — Remove "Import existing key" button from setup section

**File:** `apps-script/src/sidebar.html` — `#ks-setup` (~line 383)

The "Import existing key" button is redundant: both overlays (`#encOverlay` and `#plainOverlay`) already show "or drop a .ciphersheet-key / .vaultkey file" and route dropped/picked files through `handleFileInput` → `loadKeyFile`. The button is a second path to the same `#keyFileInput`, creating visual noise in the setup section.

**Change:** Remove the `<button class="btn-generate btn-secondary">Import existing key</button>` element. Keep the hidden `#keyFileInput` input — it is still used by the overlay drag-and-drop and click handler.

After this change, `#ks-setup` contains only:
```html
<div id="ks-setup">
  <div class="setup-title">Encryption key</div>
  <div class="setup-actions">
    <button class="btn-generate" id="btnGenKey" onclick="generateKey()">Generate key</button>
  </div>
</div>
```

Also update the overlay subtext from `"or drop a .ciphersheet-key / .vaultkey file"` to `"or drop a .ciphersheet-key file"` (the `.vaultkey` extension is a legacy format, no need to advertise it).

---

## fix/overlay-flow — Context-aware overlay text and key-state flow

**File:** `apps-script/src/sidebar.html` — overlays, `renderField()`, `showKeyState()`, `#ks-setup`/`#ks-locked` sections

### Problem

Both overlays say "Unlock key to encrypt/decrypt" regardless of whether the user has a key at all or just a locked one. The setup section is disconnected from the overlay — the overlay gives no hint that the path forward is to generate a key.

### Desired flow

**(a) No key in IndexedDB** — `showKeyState()` finds no IDB entry, `ecdhPrivKey` null:
- Overlay: "Generate key to encrypt" (plain cell) / "Generate key to decrypt" (encrypted cell)
- Key section: shows `#ks-setup` with "Generate key" button (already correct)
- Overlay subtext: "or drop a key file to import"

**(b) Key locked** — IDB entry exists, `ecdhPrivKey` null:
- Overlay: "Unlock key to encrypt" (plain cell) / "Unlock key to decrypt" (encrypted cell)
- Key section: shows `#ks-locked` with password input (already correct)
- Overlay subtext: unchanged or hidden

**(c) Key unlocked** — `ecdhPrivKey` set:
- No overlay (already correct)
- Key section: shows `#ks-unlocked` with key info

### Implementation

Add a global state variable:
```js
let keyInStorage = false;  // set by showKeyState(); true when IDB entry exists
```

In `showKeyState()`, after the `idbGet` call:
```js
keyInStorage = !!entry;
```

In `renderField()`, when showing an overlay, dynamically set its text based on `keyInStorage`:
```js
const verb = keyInStorage ? 'Unlock' : 'Generate';
document.getElementById('encOverlay').querySelector('.ov-text').textContent  = verb + ' key to decrypt';
document.getElementById('plainOverlay').querySelector('.ov-text').textContent = verb + ' key to encrypt';
```

Update the overlay icon for the no-key case: `#plainOverlay` currently shows 🔓 — when no key exists, 🔑 is more appropriate. Toggle with a CSS class or inline update in `renderField`.

The overlay subtext "or drop a key file to import" should be visible in both (a) and (b) since importing a file always works. No change needed there.

---

## refactor/implicit-groups — Implicit groups from recipient sets; label-only settings UI

**Files:** `apps-script/src/Code.ts`, `apps-script/src/sidebar.html`, `apps-script/src/settings.html`

### Concept

Currently groups are explicitly named and created in settings. Instead: every time an ECDH cell is encrypted for more than one person, that exact set of recipients implicitly defines a group. Groups acquire an optional user-defined label but are identified by their membership, not by name.

Encrypting to a single person is not a group — no group record is created.

### Storage format change

Group key: `grp:<groupId>` where `groupId` is the first 16 hex chars of SHA-256(sorted email hashes joined with `|`). Short enough to be readable in property keys, collision-resistant enough for this use.

Group value: `{ "emailHashes": ["<sha256>", …], "label": "optional display name" }` (JSON).

This replaces the old format where the value was a bare JSON array of hashes. No migration needed (old entries are ignored — they have no `emailHashes` field).

### Server-side changes (`Code.ts`)

Rename `storeGroupDefinition(name, emailHashes)` → `upsertGroup(groupId, emailHashes, label)`:
- Writes `grp:<groupId>` → `JSON.stringify({ emailHashes, label })`.
- If the key already exists, merge: preserve `emailHashes` from the existing record (they are ground truth), only update `label` if the caller passes a non-empty string.

Update `listGroups()` → returns `{ id: string, emailHashes: string[], label: string }[]` by reading all `grp:*` keys and parsing the new format. Skip entries that don't parse cleanly.

Keep `storeGroupDefinition` as a thin alias of `upsertGroup` for one release if cleaner, or just rename.

### Client-side changes (`sidebar.html`)

Add `computeGroupId(emailHashes)`:
```js
async function computeGroupId(emailHashes) {
  const sorted  = [...emailHashes].sort().join('|');
  const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sorted));
  return buf2hex(hashBuf).slice(0, 16);
}
```

In `encryptAndSave()`, after successful ECDH encryption with >1 recipient, fire-and-forget:
```js
if (recipients.length > 1) {
  const emailHashes = recipients.map(r => sha256hex(r.email)); // already computed during encrypt
  const groupId = await computeGroupId(emailHashes);
  google.script.run.upsertGroup(groupId, emailHashes, '');
}
```

Note: the email hashes are already computed in `encryptECDH` (as `SHA-256(lowercase(email))`). Thread them back out or recompute here. No toast or error handling needed — this is a best-effort background write.

Load groups at init (alongside `refreshPubKeyCache`): add a `groupCache = []` variable and a `refreshGroupCache()` function that calls `listGroups()`.

In `updateRecipientSummary()`, after determining the checked set, look up the set in `groupCache`:
```js
function updateRecipientSummary() {
  const checked = [...document.querySelectorAll('#recipientList input:checked')].map(cb => cb.dataset.email);
  if (checked.length === pubKeyCache.length) {
    document.getElementById('recipientSummary').textContent = 'Everyone';
    return;
  }
  if (checked.length === 0) {
    document.getElementById('recipientSummary').textContent = 'Nobody';
    return;
  }
  if (checked.length === 1) {
    document.getElementById('recipientSummary').textContent = checked[0];
    return;
  }
  // Look up in group cache by matching emailHashes
  const checkedHashes = checked.map(e => sha256hex(e)).sort();
  const match = groupCache.find(g => {
    const gh = [...g.emailHashes].sort();
    return gh.length === checkedHashes.length && gh.every((h, i) => h === checkedHashes[i]);
  });
  document.getElementById('recipientSummary').textContent =
    match?.label || checked.length + ' people';
}
```

### Settings UI changes (`settings.html`)

Remove the "Create group" form (`#newGroupName` input + "Add" button). Groups are now read-only in settings — they appear as a result of encryption activity.

Each group row shows:
- Member emails (resolved from pubKey list by matching hashes, falling back to hash prefix if unknown)
- An inline editable label field (text input, saves on blur/Enter via `upsertGroup(id, emailHashes, newLabel)`)
- Member count

If no groups have been created yet (no encryption to >1 person), show: "Groups appear here automatically when you protect a cell shared with multiple people."

Remove the `deleteGroup` function and its button. Groups persist as long as there are cells encrypted to that set; there is no meaningful way to delete a group without re-encrypting cells.

---

## fix/sanitize-group-names — Sanitize group names and email addresses before innerHTML insertion

**Files:** `apps-script/src/settings.html` (~line 260), `apps-script/src/sidebar.html` (~line 1157)

Group names and email addresses from server data are interpolated directly into `innerHTML`, allowing a malicious collaborator to inject HTML/script payloads that execute in the add-on UI alongside crypto state and `google.script.run`.

**Fix:** Add a simple escape helper and apply it at both injection points:

```js
function escHtml(s) {
  return String(s).slice(0, 200).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])
  );
}
```

In `settings.html` `renderGroups()`, replace the three interpolated values:
```js
row.innerHTML =
  `<span class="group-name">${escHtml(g.name)}</span>` +
  `<span class="group-count">${g.emailHashes.length} member(s)</span>` +
  `<button class="btn-sm danger" onclick="deleteGroup('${escHtml(g.name)}')">Delete</button>`;
```

In `sidebar.html` `renderRecipientList()`:
```js
item.innerHTML =
  `<input type="checkbox" checked data-email="${escHtml(email)}">` +
  `<span class="recipient-email">${escHtml(email)}</span>` +
  `<span class="recipient-fp">${escHtml(fp.slice(0, 9))}…</span>`;
```

The 200-char slice caps pathological input before it reaches the DOM.

---

## fix/overlay-visibility — Fix encrypted overlay always hidden; fix overlay pointer-events when unlocked

**File:** `apps-script/src/sidebar.html` — `renderField()` (~line 1370), overlay CSS

Two bugs:

**Bug 1:** Line 1383 makes `encOverlay` visible for an undecryptable cell, but lines 1389-1390 unconditionally remove `visible` from both overlays immediately after — so the encrypted overlay is never shown to the user when the loaded key cannot decrypt the cell.

**Fix:** Move the unconditional hide lines to run only in the branches where hiding is appropriate, not after all branches:

```js
if (raw.startsWith(VAULT_PFX) && raw.length > 2) {
  const type = b642buf(raw.slice(VAULT_PFX.length))[0];
  if (canDecrypt(type)) {
    try {
      field.value = await decrypt(raw);
      field.classList.remove('blurred'); field.disabled = false;
    } catch(_) {
      field.value = ''; toast('Cannot decrypt this cell with the loaded key', 'err');
      field.classList.add('blurred'); field.disabled = true;
    }
    document.getElementById('encOverlay').classList.remove('visible');
    document.getElementById('plainOverlay').classList.remove('visible');
  } else {
    field.value = raw; field.classList.add('blurred'); field.disabled = true;
    document.getElementById('encOverlay').classList.add('visible');
  }
} else {
  field.value = '';
  field.classList.remove('blurred'); field.disabled = false;
  document.getElementById('encOverlay').classList.remove('visible');
  document.getElementById('plainOverlay').classList.remove('visible');
}
```

**Bug 2:** When a keypair is unlocked and the overlays are hidden (`.visible` removed), the overlay `<div>` elements are still in the layout and intercept pointer events, blocking interaction with the textarea.

**Fix:** Add `pointer-events: none` to the overlay base style and `pointer-events: auto` only when `.visible`:

```css
.enc-overlay, .plain-overlay {
  /* existing styles */
  pointer-events: none;
}
.enc-overlay.visible, .plain-overlay.visible {
  pointer-events: auto;
}
```

---

## fix/delete-group — Implement real group deletion via deleteProperty

**Files:** `apps-script/src/Code.ts`, `apps-script/src/settings.html`

`deleteGroup()` in `settings.html` currently calls `storeGroupDefinition('__deleted__' + name, [])`, which stores a `grp:__deleted__<name>` property that `listGroups()` returns as a live group. Groups are never actually removed.

**Fix:** Expose `deleteProperty` on the server:

```ts
function deleteGroup(name: string): OkResponse {
  PropertiesService.getDocumentProperties().deleteProperty(GRP_PREFIX + name);
  return { ok: true };
}
```

Update `settings.html` `deleteGroup()` to call the new server function:
```js
google.script.run
  .withSuccessHandler(() => {
    groups = groups.filter(g => g.name !== name);
    renderGroups();
  })
  .withFailureHandler(e => alert('Error: ' + e.message))
  .deleteGroup(name);
```

Remove the stale comment about `deleteProperty` not being available.

---

## fix/email-race — Gate ECDH auto-decrypt on ownEmail being set

**File:** `apps-script/src/sidebar.html` — `window.addEventListener('load', …)` (~line 1443), `autoDecrypt()`

`getCurrentUserEmail()` is fired as a fire-and-forget `google.script.run` call. If the sidebar auto-decrypts an ECDH cell before the RPC callback sets `ownEmail`, `decryptECDH()` throws `"Own email not available"` and the cell fails to load on first paint.

**Fix:** Wrap the email RPC in a promise and await it before calling `autoDecrypt()` (or any ECDH path at init):

```js
const emailReady = new Promise(resolve =>
  google.script.run
    .withSuccessHandler(email => { ownEmail = email || ''; resolve(); })
    .withFailureHandler(() => resolve())
    .getCurrentUserEmail()
);
```

Then in the init sequence, await `emailReady` before the cell-read path calls `renderField()` / `autoDecrypt()`. The other concurrent RPCs (settings, pubkey cache) can still fire in parallel — only the ECDH decrypt path needs the email to be present first.

---

## refactor/rename-recipients — Rename "Recipients" to "Visible to" in UI strings

**Files:** `apps-script/src/sidebar.html`

The term "recipients" is email-speak and feels out of place in a spreadsheet tool. Replace user-visible strings only — do not rename JS variables, function names, CSS classes, or code comments.

**Strings to change:**

| Location | Old text | New text |
|---|---|---|
| `<span class="recipient-label">` (~line 363) | `Recipients:` | `Visible to:` |
| `toast(…)` (~line 1420) | `'No recipients selected'` | `'Select at least one person'` |
| Implicit in `updateRecipientSummary` | (no label change needed) | — |

**Do not change:**
- JS variable names: `recipients`, `getSelectedRecipients`, `recipientList`, `recipientSummary`, etc.
- CSS class names: `.recipient-section`, `.recipient-item`, etc.
- Code comments referencing "recipient"
- The `encryptECDH(plaintext, recipients)` function signature

**Alternative phrasings** (decide before implementing): "Shared with:", "People with access:", "Collaborators:" — the user expressed a preference for Google's own "People with access" wording but found it verbose. "Visible to:" is the recommended default as it is concise and describes the cryptographic meaning accurately.
