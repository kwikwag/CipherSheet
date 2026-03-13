# 🔐 CipherSheet — Encrypted Cell Manager for Google Sheets

A client-side encrypted cell manager with a zero-knowledge architecture. Store secrets in a shared Google Sheet without exposing raw values — your encryption key material stays in your browser.

Website: https://kwikwag.github.io/CipherSheet/

---

## Setup

1. Open your Google Sheet
2. Initialize local tooling: `scripts/init-clasp.sh`
3. Edit `.clasp.json` and set your Apps Script `scriptId`
4. Login with `clasp`: `npx clasp login`
5. Build and push: `npm run clasp:push`
6. Reload your Google Sheet — a **🔐 CipherSheet** menu will appear

---

## Usage

### Loading a Key
- **Passphrase**: Type a passphrase → "Load Key". All collaborators must use the same passphrase.
- **Key File**: Drag & drop a `.vaultkey` file, or click the drop zone to browse.

### Generating a Key
- Open the **✨ Generate Key** section
- Choose **Random Key File** (256-bit AES key) or **Passphrase** (6-word memorable phrase)
- **Download** the key file and share it securely with collaborators (Signal, encrypted email, etc.)
- Click **Use This Key** to load it immediately

### Encrypting a Cell
1. Select a cell in the sheet
2. Open the sidebar (**🔐 CipherSheet → Open Vault Sidebar**)
3. Load your key
4. Click **↻** to load the selected cell
5. Type the secret value in the plaintext area
6. Click **🔒 Encrypt & Save**

### Decrypting a Cell
1. Select an encrypted cell (value starts with 🔐)
2. Load the same key used to encrypt
3. Click **↻** then **🔓 Decrypt**

### Protecting Cells
- **🛡 Protect Cell**: Adds a warning-only protection so users are warned before editing manually
- **🔓 Unprotect**: Removes the protection
- The sidebar temporarily lifts protection when writing encrypted values, then re-applies it automatically

---

## Security Architecture

| Layer | Detail |
|-------|--------|
| Algorithm | AES-256-GCM (authenticated encryption) |
| Key derivation | PBKDF2-SHA256, 310,000 iterations (OWASP 2024 recommendation) |
| IV | 96-bit random, unique per encryption |
| Key scope | Passphrase-derived keys are scoped to the spreadsheet ID |
| Ciphertext format | `🔐` + base64(salt[16] \|\| iv[12] \|\| ciphertext+tag) |
| Key storage | In-memory JavaScript only — never sent to any server |
| Audit log | Hidden sheet `CipherSheet_AuditLog` logs operations (not values) |

---

## Important Notes

- **Passphrase security**: Use a strong, unique passphrase (or the generated random key). Anyone with the passphrase can decrypt all vault cells.
- **Key sharing**: Share keys only through secure channels. If a key is compromised, re-encrypt all cells with a new key.
- **Cell protection**: The "warning only" protection model is the maximum available to Apps Script without making the owner the sole editor. It warns users but doesn't cryptographically prevent edits.
- **Backup**: Always keep a backup of your key. If lost, encrypted values are unrecoverable.
- **Reveal behavior**: If you choose "Reveal", plaintext is written back to the spreadsheet via Apps Script so it can appear in the cell.
- **Browser requirement**: Requires a modern browser with Web Crypto API support (all modern browsers qualify).

---

## Files

- `apps-script/src/Code.ts` — Server-side Apps Script source in TypeScript (menu, cell read/write, protection management, audit log)
- `apps-script/src/sidebar.html` — Client-side HTML/CSS/JS with all cryptography

---

## Project Structure

- `docs/` — Static website content served by GitHub Pages.
- `apps-script/src/Code.ts` — TypeScript source for Apps Script server code.
- `apps-script/src/` — Apps Script HTML/manifest assets.
- `apps-script/dist/` — Generated `clasp` push directory.

---

## Build and Deploy Tooling

Install dependencies:

```bash
npm install
```

Build Apps Script bundle:

```bash
npm run build:apps-script
```

Initialize local `clasp` setup (uses Node at `/home/yuval/.nvm/versions/node/v22.15.0/bin/node` by default):

```bash
scripts/init-clasp.sh
```

CI workflows:
- `.github/workflows/deploy-pages.yml` deploys `docs/` to GitHub Pages.
- `.github/workflows/deploy-addon.yml` builds and deploys Apps Script via `clasp` using repository secrets.

---

## License

This project is licensed under **GNU Affero General Public License v3.0** (`AGPL-3.0-only`).
