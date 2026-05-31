# CipherSheet — Agent Context

CipherSheet is a Google Sheets Add-on that provides **client-side, zero-knowledge cell encryption**. All cryptographic operations run in the user's browser via the WebCrypto API; no plaintext or raw key material ever reaches Google's servers or any third party.

- **License:** AGPL-3.0-only
- **Marketplace:** `https://workspace.google.com/marketplace/app/ciphersheet/1069746286788`
- **GitHub:** `kwikwag/CipherSheet`
- **Docs/Site:** `https://kwikwag.github.io/CipherSheet/`

---

## Keeping This File Current

Update AGENTS.md **whenever you change the architecture, add/remove source files, add server-side functions, change payload formats, or alter security properties**. Specifically:

- **New/removed server function** → update the Code.ts function table.
- **New/changed client function** → update the sidebar.html summary.
- **Payload format change** → update the Cell storage format section.
- **New Document Properties keys** → update the Key naming conventions section.
- **Security property change** → update the Security model table.
- **New source file** → add it to Repository Layout and Key Source Files.
- **Deferred item completed** → move it from "Deferred / Known Gaps" to the relevant section.
- **New deferred item** → add it to "Deferred / Known Gaps".

Prefer editing the existing entry over creating a new paragraph. Keep the file concise — one accurate sentence beats a paragraph that drifts out of date.

---

## TASKS.md

[TASKS.md](TASKS.md) is the backlog of pending work items. Each task has a short token name in the form `category/slug` (e.g., `fix/unlock-loading`, `feat/passkey-unlock`, `refactor/modular-sidebar`).

**When to update TASKS.md:**

- **Before starting a task** — re-read it to understand the full scope; correct any inaccuracies you notice.
- **After completing a task** — remove it entirely from TASKS.md (do not leave a "done" marker; git history is the record).
- **When discovering sub-tasks or blockers** — either refine the existing entry or add a new one.
- **When the user describes new work** — add a new entry with a token name and enough detail that a future agent can implement it without asking follow-up questions: root cause, affected files and approximate line numbers, exact change, and any gotchas.

**What belongs in a task entry:**
- The token name and a one-line summary as the heading.
- The affected files and relevant function/line references.
- The root cause or motivation (not just "do X" but "why X").
- The concrete change — code snippets where the approach is non-obvious.
- Explicit gotchas: things to preserve, things to avoid, backward-compat constraints.

**What does NOT belong:**
- Work that is already complete — remove it.
- Vague items like "improve UX" — make them concrete or leave them out.
- Duplicates of information already in AGENTS.md (architecture, format specs, security model).

---

## Repository Layout

```
apps-script/
  server/                # Apps Script server code + HTML panel shells — copied as-is to dist/
                         # NOTE: despite the name, also contains the HTML files served to the browser;
                         # these are thin shells (inject CS_CONFIG, mount #root) not full UI source
    Code.ts              # Server entry point (compiled with tsc, module: none)
    appsscript.json      # Apps Script manifest (oauthScopes, runtimeVersion)
    sidebar.html         # Shell: injects CS_CONFIG, mounts <div id="root">, includes sidebar-script
    decrypt-confirm.html # Consent modal for revealing plaintext
    onboarding.html      # Welcome carousel (4 slides, screenshot-driven)
    settings.html        # Settings shell: injects CS_CONFIG, mounts #root, includes settings-script
    downloaded/          # Vendored external CSS (Google Add-on stylesheet)
    imgs-encoded/        # Base64-encoded screenshots included by build
  client/                # React/Vite source for sidebar and settings UIs
                         # Vite compiles this into dist/sidebar-script.html + dist/settings-script.html
    index.html           # Dev server entry (sets mock CS_CONFIG)
    vite.config.ts       # Vite: IIFE output → dist-client/sidebar.js
    tsconfig.json        # Client TypeScript config (strict: true, ES2022)
    src/
      main.tsx           # Entry: mounts React app into #root
      App.tsx            # Root component; AppProvider + ThemeProvider
      theme.ts           # MUI Material 3 theme
      types/index.ts     # Shared TypeScript types (CellData, PubKeyCacheEntry, etc.)
      utils/
        encoding.ts      # Base64/hex helpers
        crypto.ts        # All WebCrypto operations (ECDH, AES-GCM, PBKDF2, HKDF, PRF)
        idb.ts           # IndexedDB helpers (open/get/put/delete)
        gas.ts           # google.script.run promisified wrapper
        download.ts      # JSON file download helper
      context/
        AppContext.tsx    # Global React state (keys, cell, caches, toast, loading)
      hooks/
        useKeyOps.ts     # Key generation, import, unlock, lock, PRF/passkey
        usePresharedKey.ts # Pre-shared key activate/clear
        useCellOps.ts    # Cell refresh, encrypt, decrypt, unprotect polling
        useCacheOps.ts   # Public key cache + group cache refresh
        useInitApp.ts    # App initialization (email, settings, key state, cell)
      settings/
        SettingsApp.tsx  # Settings panel (toggles, public keys, groups) — React/MUI
        main.tsx         # Entry: mounts SettingsApp into #root
      components/
        cell/            # CellMeta (header chip), CellEditor (textarea + overlays)
        key/             # KeySection, KeySetup, KeyLocked, KeyUnlocked, KeyConflictDialog, PasswordSetupBox
                         # KeyOnboarding renders the no-key/plaintext first-run CTA
        recipients/      # RecipientPicker (collapsible checkbox list)
        footer/          # Footer (links + version)
        common/          # AppSnackbar, FingerprintChip, EmailLabel, Shimmer
  dist/                  # Compiled output; pushed to Apps Script via clasp
docs/
  index.html, privacy.html, terms.html, donate.html, thank-you.html
  prf-popup.html         # GitHub Pages top-level WebAuthn PRF popup for passkey unlock
  asymmetric-design.md   # Original design doc (superseded by implementation)
  branding/              # SVG/PNG logos
scripts/
  build-apps-script.mjs  # Build orchestrator (clean → tsc → copy assets → wrap sidebar-script)
  init-clasp.sh          # First-time clasp setup
  preview-pages-paths.mjs
.github/workflows/
  deploy-addon.yml       # CI/CD for Apps Script (triggers on dist branch)
  deploy-pages.yml       # CI/CD for GitHub Pages (triggers on main branch)
package.json
tsconfig.apps-script.json
.clasp.json
AGENTS.md                # This file
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Add-on runtime | Google Apps Script (V8) |
| Server language | TypeScript 5.8 (`strict: false` for Apps Script type compatibility) |
| Client language | TypeScript 5.8 (`strict: true`), React 19, MUI v7 (Material 3 theme) |
| Client build | Vite 6 — IIFE bundle → `sidebar-script.html` |
| Client crypto | Browser WebCrypto API — no external crypto libraries |
| Key persistence | `indexedDB` (sidebar iframe origin) |
| Build | Node.js ≥22, `scripts/build-apps-script.mjs` (tsc + vite) |
| Deploy | `@google/clasp` 2.5.0 |
| CI/CD | GitHub Actions |
| Docs hosting | GitHub Pages (`/docs` dir, `main` branch) |

---

## Architecture

### Two-tier execution model

1. **Browser (sidebar iframe)** — All encryption, decryption, and key management. Runs as an isolated `googleusercontent.com` subdomain. Communicates with Apps Script via `google.script.run` RPC (asynchronous, callback-based, no streaming).
2. **Apps Script server** — Storage shuttle only. Reads/writes cell values, Document Properties, and UserCache. Never sees plaintext or unwrapped key material.

### Communication flow for "Reveal Cell"

```
Sidebar             Apps Script (server)         decrypt-confirm.html
  |                         |                              |
  |-- requestUnprotect() -->|                              |
  |                         |-- openDecryptConfirm() ----> |
  |                         |<-- heartbeatModalAlive() ----|  (every 2 s, TTL 4 s)
  |<-- pollDecryptIntent() -|                              |
  |   (polls UserCache)     |                              |
  |                         |<-- recordDecryptIntent() ----|  (user clicks Reveal/Clear)
  |<-- { intent } ----------|                              |
  |-- revealCell(plain) --->|                              |  (only path where plaintext leaves browser)
```

### Cell storage format

Every encrypted cell stores a **self-contained payload** inside a dummy formula: `=IF(TRUE,"🔒 Encrypted","🔐<payload>")`. The cell displays `🔒 Encrypted` as the formula result; `getFormula()` retrieves the raw payload. Document Properties hold only public key registry and group entries — no per-cell data.

```
🔐<base64(
  type[1]       // 0x01 = pre-shared AES-GCM | 0x02 = ECDH P-256 + HKDF | 0xFF+ = unknown
  iv[12]        // AES-GCM IV for the cell value
  ct_len[4]     // ciphertext byte length, big-endian uint32
  ct[ct_len]    // AES-GCM ciphertext + 16-byte tag; AAD = type[1]

  --- type 0x02 only ---
  ephemeral_pub[65]    // sender's ephemeral ECDH P-256 public key (uncompressed)
  n_recipients[2]      // number of recipient entries, big-endian uint16
  for each recipient:
    id[32]             // SHA-256(lowercase(email)) — no plaintext email in payload
    wrap_iv[12]        // AES-GCM IV for this recipient's wrapped cell key
    wrapped_key[32]    // cell key encrypted with ECDH-derived wrapping key
    wrap_tag[16]       // AES-GCM tag for wrapped_key
)>
```

**Per-recipient size:** 92 bytes. Unknown `type` values display a graceful "please update the add-on" error.

### Key naming conventions (Document Properties)

| Key pattern | Content | Set by |
|---|---|---|
| `CIPHERSHEET_SETTINGS` | JSON `DocumentSettings` object (`editWarningEnabled`, `revertOnEditEnabled`, `defaultKeyType`) | `setDocumentSettings()` |
| `pk:<email>` | base64-encoded SPKI of user's ECDH P-256 public key | `storePublicKey()` |
| `grp:<groupId>` | JSON `{ emailHashes: string[], label: string }` where `groupId` = first 16 hex chars of SHA-256(sorted email hashes joined with `\|`) | `upsertGroup()` |

---

## Key Source Files

### [apps-script/server/Code.ts](apps-script/server/Code.ts)

Server-side Apps Script. TypeScript compiled to JS; all Apps Script globals (`SpreadsheetApp`, `PropertiesService`, etc.) are resolved at compile time via `@types/google-apps-script`.

| Function | Purpose |
|---|---|
| `onInstall` / `onOpen` | Build add-on menu; resilient to authorization failures |
| `showSidebar` / `showOnboarding` / `showSettings` | Open HTML panels; `showSidebar` injects the passkey popup URL and initial selected-cell snapshot |
| `getPasskeyPopupUrl` | Returns the GitHub Pages top-level WebAuthn PRF popup URL |
| `getSelectedCellValue()` | Returns `{ value, cellRef, sheetName }` using `cell.getValue()` (not display value) |
| `setEncryptedCellValue(payload, cellRef, sheetName)` | Writes `=IF(TRUE,"🔒 Encrypted","<payload>")` formula, applies warning protection, note |
| `revealCell(plaintext, cellRef, sheetName)` | Writes plaintext (replacing formula), removes protection/note |
| `clearCell(cellRef, sheetName)` | Clears cell content, resets format, removes protection/note |
| `openDecryptConfirm(cellRef, sheetName, keyLoaded)` | Opens consent modal dialog |
| `heartbeatModalAlive(cellRef, sheetName)` | Modal keepalive — called every 2 s (TTL 4 s) |
| `recordDecryptIntent(cellRef, sheetName, intent)` | Modal records `reveal` / `clear` / `cancel` |
| `pollDecryptIntent(cellRef, sheetName)` | Sidebar polls: returns `{ intent }`, `{ closed: true }`, or `null` |
| `getCurrentUserEmail()` | Returns `Session.getActiveUser().getEmail()` |
| `storePublicKey(base64SPKI)` | Derives email server-side, writes `pk:<email>` to Document Properties |
| `listPublicKeys()` | Returns `{ email, publicKey }[]` from all `pk:` properties |
| `upsertGroup(groupId, emailHashes, label)` | Writes `grp:<groupId>` → `{ emailHashes, label }`; preserves existing `emailHashes` on update |
| `listGroups()` | Returns `{ id, emailHashes, label }[]` from all `grp:` properties |
| `getDocumentSettings()` / `setDocumentSettings()` | JSON settings in Document Properties (`editWarningEnabled`, `revertOnEditEnabled`, `defaultKeyType`) |
| `navigateToCell(cellRef, sheetName)` | Activates a cell in the sheet UI |
| `onEdit(e)` | Disabled — encrypted formula cells cannot be restored from `e.oldValue` alone; see comment in Code.ts |
| `removePublicKey()` | Deletes the calling user's `pk:<email>` entry from Document Properties |
| `listEditorsWithoutKeys()` | Returns `string[]` of editor emails that have no registered `pk:` entry |
| `resetDocumentMetadata()` | Interactively deletes all CipherSheet Document Properties (settings, public keys, groups); does not touch cell formulas |

### [apps-script/server/sidebar.html](apps-script/server/sidebar.html)

Thin shell that injects `CS_CONFIG` (feedback/donate/privacy URLs, app version, passkey popup URL, editor public-key cache, and one initial selected-cell snapshot) and mounts `<div id="root">`, then includes the Vite-built `sidebar-script.html`.

All client-side state and logic lives in the React client ([apps-script/client/src/](apps-script/client/src/)). Key entry points: [AppContext.tsx](apps-script/client/src/context/AppContext.tsx) for global state, [useKeyOps.ts](apps-script/client/src/hooks/useKeyOps.ts) for key operations, [useCellOps.ts](apps-script/client/src/hooks/useCellOps.ts) for cell encrypt/decrypt/unprotect, [KeyOnboarding.tsx](apps-script/client/src/components/key/KeyOnboarding.tsx) for the no-key/plaintext first-run CTA, and [crypto.ts](apps-script/client/src/utils/crypto.ts) for all WebCrypto operations.

**IndexedDB schema** (`CipherSheet` db, `keys` store):

| Key | Value shape |
|---|---|
| `'ecdh'` | `{ wrapped: Uint8Array, iv: Uint8Array, salt: Uint8Array, publicKeySpki: Uint8Array, credentialId?: number[], prfWrappedPassword?: Uint8Array, prfPasswordIv?: Uint8Array }` |

The `wrapped` field is the PBKDF2+AES-GCM encrypted JWK of the ECDH private key. `publicKeySpki` and optional passkey metadata are stored unencrypted so the locked UI can start PRF unlock; `prfWrappedPassword` contains only the generated unlock password encrypted under a PRF-derived AES-GCM key. `publicKeyFp` is no longer persisted — fingerprint is derived on demand via `fingerprint(publicKeySpki)`.

**Extractable key audit:**

| Key | Extractable in session | Reason |
|---|---|---|
| ECDH private (session) | No — re-imported as non-extractable after backup export | Resists XSS exfiltration |
| ECDH public | Yes | Not sensitive; SPKI export needed for registration |
| Ephemeral ECDH pair | Yes | Public key bytes required in payload; discarded after encryption |
| Cell key (AES-GCM) | Yes | Raw bytes needed to wrap per recipient; discarded after wrapping |
| ECDH-derived wrapping key | No (`deriveKey` result) | Ephemeral per-recipient |
| Pre-shared key | No | Long-lived; resists XSS |

### [apps-script/server/decrypt-confirm.html](apps-script/server/decrypt-confirm.html)

Consent modal. Displays risk warnings. Requires user to type the cell address to confirm "Reveal". Sends `heartbeatModalAlive` + `recordDecryptIntent` to Apps Script UserCache.

### [docs/prf-popup.html](docs/prf-popup.html)

GitHub Pages top-level popup for WebAuthn PRF enrollment and unlock. It waits for `prf-start` over `postMessage`, validates `returnOrigin` and the random channel token, ignores duplicate starts, calls `navigator.credentials.create()` / `navigator.credentials.get()` with PRF eval input, returns `credentialId` and PRF output to the sidebar, then closes.

### [apps-script/server/settings.html](apps-script/server/settings.html)

Settings toggles (protection, reversion, default key type) + read-only list of registered public keys with fingerprints + implicit group list (auto-populated from encryption activity; user can add labels via inline input saved by `upsertGroup`).

### [apps-script/server/onboarding.html](apps-script/server/onboarding.html)

Welcome carousel, 4 slides, screenshot-driven. Currently describes the pre-shared key flow (slides need updating when the ECDH first-run UX is finalised).

---

## Build & Deploy

### Local development
```bash
npm install
npm run build:apps-script      # clean → tsc → copy assets to apps-script/dist/
npx clasp push --force         # push dist/ to Apps Script project
```

### npm scripts
| Script | What it does |
|---|---|
| `build:apps-script` | Clean + compile + copy assets |
| `clasp:push` | Build + push to Apps Script |
| `clasp:version` | Build + create new AS version |
| `clasp:deploy` | Build + push + deploy |

### Build script ([scripts/build-apps-script.mjs](scripts/build-apps-script.mjs))
1. Deletes `apps-script/dist/` and `apps-script/dist-client/`
2. Runs `tsc` with `tsconfig.apps-script.json` (compiles `server/Code.ts` → `dist/Code.js`)
3. Copies non-TS files from `server/` → `dist/` (HTML, JSON, assets)
4. Runs Vite twice (via `BUILD_ENTRY=sidebar` then `BUILD_ENTRY=settings`) → `dist-client/sidebar.js` + `dist-client/settings.js` (IIFE bundles)
5. Wraps each JS bundle as `<script>…</script>` → `dist/sidebar-script.html` + `dist/settings-script.html`
6. Deletes intermediate `dist-client/`

### Dev server
```bash
npm run dev:sidebar   # Vite dev server at localhost:5173 (mock CS_CONFIG in index.html)
```
GAS calls (`google.script.run`) reject with an error in dev mode.

### TypeScript notes
- **Server** (`tsconfig.apps-script.json`): `strict: false`, `module: none`, `target: ES2020` — required for Apps Script globals
- **Client** (`apps-script/client/tsconfig.json`): `strict: true`, `target: ES2022`, `module: ESNext` — compiled by Vite (not emitted by tsc)
- `Uint8Array` generic issue (TS 5.8+): WebCrypto APIs require `Uint8Array<ArrayBuffer>`. Use the `u8()` cast helper in `utils/crypto.ts` when passing slice results to crypto APIs.

### CI/CD
- **`deploy-pages.yml`** — triggers on `main` branch changes to `docs/**`; deploys GitHub Pages
- **`deploy-addon.yml`** — triggers on `dist` branch; requires secrets `CLASP_CLIENT_ID`, `CLASP_CLIENT_SECRET`, `CLASP_REFRESH_TOKEN`, `CLASP_SCRIPT_ID`, `CLASP_DEPLOYMENT_ID`

### Image pipeline
1. Put screenshots in `imgs/`
2. Run `python3 update_images.py` → generates base64 HTML files in `apps-script/server/imgs-encoded/`
3. Build script copies them to `dist/`

---

## Apps Script Manifest

Minimal scopes: current spreadsheet + container UI only. See [appsscript.json](apps-script/server/appsscript.json)

---

## Security Model

| Threat | Mitigation |
|---|---|
| Google reads plaintext | All crypto in browser; only ciphertext stored server-side |
| Key exfiltration via XSS | ECDH private key non-extractable; pre-shared key non-extractable |
| Passkey secret exposure | WebAuthn PRF output stays in the GitHub Pages popup/sidebar `postMessage` path and only decrypts the generated ECDH unlock password stored in IndexedDB |
| Recipient identity leak | Only SHA-256(lowercase(email)) in cell payload — no plaintext emails |
| Consent spoofing | Modal heartbeat + UserCache polling; sidebar never proceeds without server-confirmed intent |
| Version History exposure | User warned in consent modal; cannot be prevented by the add-on |
| "Reveal" path leakage | Plaintext reaches Apps Script on `revealCell()` — this is the only exception and is explicitly warned |
| Rogue public key substitution | Key fingerprints shown in recipient picker for optional out-of-band verification |
| Type confusion (0x01 vs 0x02) | `type[1]` byte is AAD for cell-value AES-GCM — ciphertext is bound to its encryption scheme |

---

## Deferred / Known Gaps

- **Onboarding slides** — still describe the pre-shared key flow; need updating for the ECDH first-run wizard
- **PRF key rotation** — not yet exposed; would require enrolling a replacement credential and rewrapping the stored unlock password
- **Add/remove recipient on existing cells** — not yet exposed in UI; re-encryption on remove and cheap add-only re-wrap on add are both described in plan
- **Group membership resolution in picker** — groups appear in summary label but picker doesn't expand groups to individual recipients
- **X25519 / Curve25519 support** — type `0x03` reserved; pending wider WebCrypto adoption
- **Threshold / M-of-N decryption**
- **Audit log**
- **Time-boxed access / burn-after-reading**
- **Group key indirection** (shared symmetric group key to avoid per-member ECDH entries)
