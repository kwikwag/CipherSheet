# 🔐 CipherSheet — Encrypted Cell Manager for Google Sheets

A client-side encrypted cell manager with a zero-knowledge architecture. Store secrets in a shared Google Sheet without exposing raw values — all cryptographic operations happen in your browser via the WebCrypto API. No plaintext or key material ever reaches Google's servers.

Website: https://kwikwag.github.io/CipherSheet/
Marketplace: https://workspace.google.com/marketplace/app/ciphersheet/1069746286788

---

## How It Works

CipherSheet uses **asymmetric encryption (ECDH P-256 + AES-GCM)**. Each user generates a personal keypair. When you encrypt a cell, a fresh ephemeral key is derived per recipient, so only the selected collaborators can decrypt — even if everyone shares the same spreadsheet.

The encrypted payload is stored in a dummy formula `=IF(TRUE,"🔒 Encrypted","🔐<payload>")`. The cell displays `🔒 Encrypted`; the ciphertext lives in the unreachable second branch and is retrieved server-side via `getFormula()`.

---

## Setup (end user)

1. Open your Google Sheet
2. Install CipherSheet from the Google Workspace Marketplace
3. Click **🔐 CipherSheet → Open CipherSheet** — a sidebar panel opens
4. Click **Generate key** to create your personal ECDH keypair
5. Save the **unlock password** shown (use a password manager — it cannot be recovered)
6. Optionally set up a **passkey** so you can unlock without typing the password

Each collaborator who needs to read encrypted cells must do the same. Their public key is automatically registered in the spreadsheet's Document Properties so the sidebar can offer them as recipients.

---

## Setup (developer / self-host)

1. Clone the repo and install dependencies: `npm install`
2. Initialise clasp: `scripts/init-clasp.sh`
3. Edit `.clasp.json` and set your Apps Script `scriptId`
4. Login: `npx clasp login`
5. Build and push: `npm run clasp:push`
6. Reload the spreadsheet — a **🔐 CipherSheet** menu will appear

---

## Sidebar Usage

### Key states

| State | Indicator | What you can do |
|---|---|---|
| No key | — | Generate or import a key |
| Key locked | Yellow dot — "Key locked" | Unlock with password or passkey |
| Key active | Green dot — "Key active" | Encrypt / decrypt; Lock; Set up / update passkey |

**Generate key** — Creates a new ECDH P-256 keypair. The private key is encrypted with a generated unlock password (PBKDF2 + AES-GCM) and stored in IndexedDB. The public key is registered in the document so other collaborators can encrypt for you.

**Import key** — Load a previously exported `.ciphersheet-key` file (PKCS#8 JSON). If a key already exists, a conflict dialog lets you decide whether to overwrite.

**Lock** — Clears the in-memory private key. The encrypted private key stays in IndexedDB.

**Forget key** — Permanently removes the keypair from IndexedDB. An option lets you keep the public key registered in the document so others can still encrypt for you.

**Forget public key** (from the setup screen, when no private key is loaded locally) — Removes your public key entry from the document's shared registry. Others will no longer see you as a recipient.

### Encrypting a cell

1. Select a cell in the sheet
2. Open the sidebar
3. With an active key, type (or paste) the secret value in the text area
4. The **Visible to** row shows which collaborators will be able to decrypt; expand it to adjust
5. Click **Protect** — the cell is encrypted and a warning-only sheet protection is applied

If you select a cell that is already encrypted and you hold the active key, the plaintext is decrypted and shown so you can edit it. Click **Update** to re-encrypt.

### Decrypting / revealing a cell

- **In-sidebar view** — if your key matches a recipient entry in the cell, the plaintext appears in the text area automatically. You can copy it from there or edit and re-encrypt with **Update**.

### Recipients

The **Visible to** collapsible row lists every editor of the spreadsheet:
- Editors with a registered public key have a checkbox and are selected by default for new encryptions.
- Editors without a key are shown greyed-out with a warning dot and a tooltip explaining that they need to open CipherSheet and generate a key.
- If a cell was encrypted for recipients no longer in the editor list, a warning banner appears. Re-encrypting will revoke their access.

### Passkey (WebAuthn PRF)

If your browser supports WebAuthn PRF, you can enroll a passkey so that unlocking doesn't require typing the password. The PRF output is run through HKDF-SHA256 (for domain separation) to derive an AES-GCM key, which decrypts a generated unlock password stored in IndexedDB; the passkey secret itself never leaves the authenticator. Enrollment and unlock both go through a top-level GitHub Pages popup (`docs/prf-popup.html`) because the Apps Script iframe origin cannot directly call WebAuthn.

---

## Settings Panel

Open via **🔐 CipherSheet → Settings**:

- **Protection on encrypt** — automatically applies a warning-only cell protection after encrypting
- **Revert on direct edit** — auto-reverts any direct edit to an encrypted cell (requires the `onEdit` installable trigger)
- **Default key type** — choose ECDH (asymmetric, per-recipient) or pre-shared (symmetric, shared secret)
- **Registered public keys** — read-only list of all collaborators with registered keys, with fingerprints
- **Groups** — implicit groups auto-populated from encryption activity; you can add labels inline

---

## Security Architecture

| Property | Detail |
|---|---|
| Algorithm | ECDH P-256 key agreement → HKDF → AES-256-GCM per recipient |
| Cell key | Fresh 256-bit random AES-GCM key per encryption |
| IV | 96-bit random, unique per encryption (per cell + per recipient wrap) |
| Private key storage | IndexedDB (sidebar iframe origin); encrypted with PBKDF2-SHA256 (600 000 iterations) + AES-GCM. The iteration count is stored alongside the wrapped key so it can be raised in future without breaking existing keys. |
| Private key in session | Non-extractable `CryptoKey` after first unlock — resists XSS exfiltration |
| Recipient privacy | SHA-256(lowercase(email)) stored in payload — no plaintext emails |
| Passkey unlock | WebAuthn PRF output → HKDF-SHA256 → AES-256-GCM key that decrypts a generated unlock password; secret never leaves authenticator |
| Version history | Apps Script cannot prevent Google from logging formula history |
| Type binding | `type[1]` byte is AAD for the cell-value AES-GCM ciphertext — type 0x01 (pre-shared) and 0x02 (ECDH) payloads are cryptographically non-interchangeable |

### Cell payload format

```
🔐<base64(
  type[1]        // 0x01 = pre-shared AES-GCM | 0x02 = ECDH P-256 + HKDF
  iv[12]         // AES-GCM IV for the cell value ciphertext
  ct_len[4]      // ciphertext byte length, big-endian uint32
  ct[ct_len]     // AES-GCM ciphertext + 16-byte tag; AAD = type[1]

  --- type 0x02 only ---
  ephemeral_pub[65]  // sender's ephemeral ECDH P-256 public key (uncompressed)
  n_recipients[2]    // number of recipient entries, big-endian uint16
  for each recipient (92 bytes):
    id[32]           // SHA-256(lowercase(email))
    wrap_iv[12]      // AES-GCM IV for this recipient's wrapped cell key
    wrapped_key[32]  // cell key encrypted with ECDH-derived wrapping key
    wrap_tag[16]     // AES-GCM tag for wrapped_key
)>
```

---

## Project Structure

```
apps-script/
  server/   — Apps Script server code (Code.ts) and HTML panel shells
  client/   — React 19 / Vite 6 / MUI v7 source for sidebar and settings UIs
  dist/     — Compiled output pushed to Apps Script via clasp
docs/       — GitHub Pages static site (privacy, terms, donate, prf-popup)
scripts/    — Build orchestrator and clasp helpers
```

See [AGENTS.md](AGENTS.md) for the full architecture reference.

---

## Known Limitations

- **Version History** — Google Sheets records formula history. A user with access to version history and the key can retrieve previously decrypted values.
- **Warning-only protection** — Apps Script cannot enforce edit restrictions without making the owner the sole editor. Protection warns but does not cryptographically prevent edits.
- **Passkey PRF browser support** — WebAuthn PRF is not universally supported; password unlock is always available as a fallback.

---

## Build and Deploy

```bash
npm install
npm run build:apps-script   # clean → tsc → vite → assemble dist/
npm run clasp:push          # build + push to Apps Script
```

Dev server (mock CS_CONFIG, no GAS calls):
```bash
npm run dev:sidebar
```

CI workflows:
- `.github/workflows/deploy-pages.yml` — deploys `docs/` to GitHub Pages on `main`
- `.github/workflows/deploy-addon.yml` — builds and deploys Apps Script via clasp on the `dist` branch

---

## License

GNU Affero General Public License v3.0 (`AGPL-3.0-only`)
