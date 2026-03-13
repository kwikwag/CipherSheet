# 🔐 CipherSheet — Encrypted Cell Manager for Google Sheets

A zero-knowledge, client-side encrypted cell manager. Store secrets in a shared Google Sheet without exposing raw values — your encryption key **never leaves your browser**.

---

## Setup

1. Open your Google Sheet
2. Go to **Extensions → Apps Script**
3. Replace the default `Code.gs` content with the contents of `Code.gs`
4. Click **+ New File → HTML** and name it `sidebar` (no extension)
5. Replace its content with the contents of `sidebar.html`
6. **Save** (Ctrl+S / ⌘S)
7. Reload your Google Sheet — a **🔐 CipherSheet** menu will appear

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
| Key fingerprint | SHA-256 of key stored server-side for version checking |

---

## Important Notes

- **Passphrase security**: Use a strong, unique passphrase (or the generated random key). Anyone with the passphrase can decrypt all vault cells.
- **Key sharing**: Share keys only through secure channels. If a key is compromised, re-encrypt all cells with a new key.
- **Cell protection**: The "warning only" protection model is the maximum available to Apps Script without making the owner the sole editor. It warns users but doesn't cryptographically prevent edits.
- **Backup**: Always keep a backup of your key. If lost, encrypted values are unrecoverable.
- **Browser requirement**: Requires a modern browser with Web Crypto API support (all modern browsers qualify).

---

## Files

- `Code.gs` — Server-side Apps Script (menu, cell read/write, protection management, audit log)
- `sidebar.html` — Client-side HTML/CSS/JS with all cryptography (AES-256-GCM via SubtleCrypto)
