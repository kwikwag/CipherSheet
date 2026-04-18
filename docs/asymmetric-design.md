# Future plan for Zero-Knowledge Asymmetric Encryption for Google Sheets

## Design Document — Implementation Guide

---

## 1. Core Principles

1. **Zero-knowledge**: Google never sees plaintext values or any material sufficient to decrypt them. All cryptographic operations happen in the browser.
2. **Hybrid encryption**: Cell values are encrypted once with a symmetric AES key; that key is then "wrapped" (encrypted) per-recipient using their public key. This keeps storage compact and audience changes cheap.
3. **Minimal cell footprint**: Cells contain only a short reference token. All crypto payloads live in Document Properties as flat key-value pairs.
4. **Three protection tiers**: Targeted encryption, group-based encryption, and lightweight obfuscation ("veil mode").

---

## 2. Architecture Overview

### Responsibility Split

| Layer | Runs Where | Responsibilities |
|-------|-----------|-----------------|
| **Sidebar / Dialog UI** | Browser (HTML + JS) | All crypto via WebCrypto API, plaintext display, key generation, user interaction |
| **Apps Script backend** | Google servers | Storage shuttle only — reads/writes ciphertext, wrapped keys, public keys, ref tokens. **Never touches plaintext or unwrapped keys.** |

### Data Stored on Google (all opaque to Google)

- **Cell content**: Short reference token, e.g. `🔒{a3f2}`
- **Document Properties**: Flat key-value pairs — per-cell encrypted entries, per-user wrapped keys, public keys, group definitions. Each stored as an independent property.

### Data That Never Leaves the Browser

- Private keys (stored encrypted in IndexedDB)
- Unwrapped AES session keys
- Plaintext cell values
- User passphrases

---

## 3. Key Lifecycle

### 3.1 First-Time Key Generation

This happens once per user, in the browser sidebar.

```
Step 1: Generate RSA-OAEP key pair (extractable: true)
        → crypto.subtle.generateKey(
            { name: "RSA-OAEP", modulusLength: 4096, publicExponent: new Uint8Array([1,0,1]), hash: "SHA-256" },
            true,  // extractable — temporarily
            ["encrypt", "decrypt", "wrapKey", "unwrapKey"]
          )

Step 2: Export private key as JWK
        → crypto.subtle.exportKey("jwk", keyPair.privateKey)

Step 3: Trigger browser download of the JWK file
        → This is the user's offline backup
        → Optionally encrypt the file itself with a passphrase before download

Step 4: Prompt user for a passphrase

Step 5: Derive a wrapping key from the passphrase
        → crypto.subtle.deriveKey(
            { name: "PBKDF2", salt: randomSalt, iterations: 600000, hash: "SHA-256" },
            passphraseKey,
            { name: "AES-GCM", length: 256 },
            false, ["wrapKey", "unwrapKey"]
          )

Step 6: Wrap (encrypt) the private key with the passphrase-derived key
        → crypto.subtle.wrapKey("jwk", keyPair.privateKey, derivedKey, { name: "AES-GCM", iv: randomIV })

Step 7: Store in IndexedDB:
        {
          wrappedPrivateKey: <ArrayBuffer>,   // encrypted private key
          salt: <Uint8Array>,                  // PBKDF2 salt
          iv: <Uint8Array>,                    // AES-GCM IV
          publicKey: <JWK>                     // public key (not sensitive)
        }

Step 8: Re-import the private key as NON-EXTRACTABLE for session use
        → crypto.subtle.importKey("jwk", exportedJWK, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["decrypt", "unwrapKey"])
        → Discard the extractable version (let it be garbage collected)

Step 9: Export public key and send to Apps Script
        → Apps Script stores it in Document Properties: pk:<email> → base64 SPKI
```

### 3.2 Subsequent Session Unlock

```
Step 1: Load encrypted blob from IndexedDB (wrappedPrivateKey, salt, iv)

Step 2: Prompt user for passphrase

Step 3: Derive the same wrapping key using PBKDF2 with stored salt

Step 4: Unwrap (decrypt) the private key, importing as NON-EXTRACTABLE
        → crypto.subtle.unwrapKey(
            "jwk",
            wrappedPrivateKey,
            derivedKey,
            { name: "AES-GCM", iv: storedIV },
            { name: "RSA-OAEP", hash: "SHA-256" },
            false,  // non-extractable
            ["decrypt", "unwrapKey"]
          )

Step 5: Private key CryptoKey is now in memory for the session
        → Cannot be exported by any JavaScript (including XSS)
```

### 3.3 Key Recovery from Backup File

```
Step 1: User selects their backup JWK file

Step 2: Read file contents

Step 3: Import as NON-EXTRACTABLE
        → crypto.subtle.importKey("jwk", jwkData, ..., false, ["decrypt", "unwrapKey"])

Step 4: Optionally prompt for a new passphrase
        → Wrap the key and store in IndexedDB for future sessions (same as steps 5–7 above)
```

### 3.4 IndexedDB Security Layers

| Layer | Protects Against |
|-------|-----------------|
| **Browser origin isolation** | Other Sheets add-ons (each gets a unique googleusercontent.com subdomain) |
| **Passphrase encryption (AES-GCM)** | Anything that breaches IndexedDB — rogue extensions, XSS, compromised browser storage |
| **Non-extractable CryptoKey flag** | In-memory exfiltration via script injection during a session |

---

## 4. Document Properties Storage Layout

All encrypted data is stored as flat key-value pairs in `PropertiesService.getDocumentProperties()`. Each property is independent — no monolithic JSON blob. This eliminates parse-and-rewrite overhead, avoids concurrency conflicts between simultaneous users, and naturally distributes data across the per-key size limit.

### 4.1 Key Naming Convention

```
enc:<stableId>          → Cell encryption entry (JSON, see 4.2)
wk:<stableId>:<email>   → Wrapped AES key for a specific user on a specific cell
wk:<stableId>:g:<group> → Wrapped AES key with a group key for a specific cell
pk:<email>              → User's public key (base64 SPKI)
grp:<group>:<email>     → Group key wrapped for a specific user
```

### 4.2 Cell Encryption Entry

The `enc:<stableId>` property holds a small JSON object with the cell's crypto payload — everything except the per-recipient wrapped keys:

```json
{
  "ct": "<base64 AES-GCM ciphertext>",
  "iv": "<base64 AES-GCM IV, 12 bytes>",
  "t": 1,
  "cell": "B7",
  "by": "alice@example.com",
  "at": "2026-04-15T10:30:00Z"
}
```

Field reference:
- `ct` — base64-encoded ciphertext (the encrypted cell value)
- `iv` — base64-encoded AES-GCM initialization vector
- `t` — tier (1 = targeted, 2 = group, 3 = veil)
- `cell` — current cell address (display only, updated on structural changes)
- `by` — email of the user who encrypted the cell
- `at` — ISO timestamp of encryption

Short field names are intentional — this JSON is stored as a property value, so every byte counts.

### 4.3 Wrapped Key Entries

Each recipient's wrapped key is a separate property. The value is the raw base64-encoded wrapped AES key — no JSON wrapping needed.

```
wk:a3f2:alice@example.com  → "S2V5RGF0YUhl..." (base64, ~684 chars for RSA-4096)
wk:a3f2:bob@example.com    → "UmVjaXBpZW50..." (base64)
```

For group-encrypted cells (Tier 2), the session key is wrapped with the group key:

```
wk:a3f2:g:finance-team     → "R3JvdXBXcmFw..." (base64)
```

### 4.4 Public Key Entries

```
pk:alice@example.com  → "MIIBIjANBgkq..." (base64 SPKI public key)
pk:bob@example.com    → "MIIBIjANBgkq..."
```

### 4.5 Group Key Entries

Each member's copy of the group key, wrapped with their public key:

```
grp:finance-team:alice@example.com  → "V3JhcHBlZEdL..." (base64)
grp:finance-team:bob@example.com    → "R3JvdXBLZXlC..." (base64)
```

### 4.6 Why This Layout Works

| Concern | How flat keys solve it |
|---------|----------------------|
| **Encrypt a cell** | Write 1 `enc:` key + 1 `wk:` key per recipient. Independent writes, no read-modify-write. |
| **Add a recipient** | Write 1 new `wk:` key. Nothing else changes. |
| **Revoke a recipient** | Delete 1 `wk:` key. Nothing else changes. |
| **Decrypt a cell** | Read 1 `enc:` key + 1 `wk:` key for current user. Two small reads. |
| **Concurrent users** | Two users encrypting different cells write to different keys — no conflict. |
| **Size management** | Each property is small. No single blob to compress or shard. |
| **Listing all encrypted cells** | Apps Script: `getProperties()` then filter keys starting with `enc:`. |
| **Listing recipients for a cell** | Apps Script: `getProperties()` then filter keys starting with `wk:<stableId>:`. |

### 4.7 Size Budget

| Component | Storage location | Size |
|-----------|-----------------|------|
| Cell token `🔒{a3f2}` | Sheet cell | ~12 bytes |
| `enc:<id>` entry | Document Property | ~150–300 bytes (depends on plaintext length) |
| `wk:<id>:<email>` entry | Document Property | ~684 bytes per recipient (RSA-4096 base64) |
| `pk:<email>` entry | Document Property | ~736 bytes per user |

Example: 100 cells, average 50-char values, 3 recipients each:
- 100 `enc:` entries × ~250 bytes = ~25 KB
- 300 `wk:` entries × ~684 bytes = ~205 KB
- Total: ~230 KB — fits comfortably in the ~500 KB Document Properties limit

### 4.8 Apps Script Helper Functions

```javascript
// ---- Low-level property access ----

function setProperty(key, value) {
  PropertiesService.getDocumentProperties().setProperty(key, value);
}

function getProperty(key) {
  return PropertiesService.getDocumentProperties().getProperty(key);
}

function deleteProperty(key) {
  PropertiesService.getDocumentProperties().deleteProperty(key);
}

function getPropertiesByPrefix(prefix) {
  const all = PropertiesService.getDocumentProperties().getProperties();
  const result = {};
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith(prefix)) result[k] = v;
  }
  return result;
}

// ---- Cell encryption entry ----

function storeEncEntry(stableId, entryJson) {
  setProperty('enc:' + stableId, entryJson);
}

function getEncEntry(stableId) {
  return getProperty('enc:' + stableId);
}

// ---- Wrapped keys ----

function storeWrappedKey(stableId, email, wrappedKeyB64) {
  setProperty('wk:' + stableId + ':' + email, wrappedKeyB64);
}

function getWrappedKey(stableId, email) {
  return getProperty('wk:' + stableId + ':' + email);
}

function deleteWrappedKey(stableId, email) {
  deleteProperty('wk:' + stableId + ':' + email);
}

function getRecipientsForCell(stableId) {
  return getPropertiesByPrefix('wk:' + stableId + ':');
}

// ---- Public keys ----

function storePublicKey(email, publicKeyB64) {
  setProperty('pk:' + email, publicKeyB64);
}

function getPublicKey(email) {
  return getProperty('pk:' + email);
}

// ---- Group keys ----

function storeGroupMemberKey(group, email, wrappedGroupKeyB64) {
  setProperty('grp:' + group + ':' + email, wrappedGroupKeyB64);
}

function getGroupMemberKey(group, email) {
  return getProperty('grp:' + group + ':' + email);
}

// ---- Batch operations ----

function storeEncryptionBatch(stableId, encEntryJson, wrappedKeys) {
  // wrappedKeys: { "email1": "b64...", "email2": "b64..." }
  const props = PropertiesService.getDocumentProperties();
  const batch = {};
  batch['enc:' + stableId] = encEntryJson;
  for (const [email, wk] of Object.entries(wrappedKeys)) {
    batch['wk:' + stableId + ':' + email] = wk;
  }
  props.setProperties(batch);  // atomic write of all keys at once
}
```

Note: `setProperties()` writes multiple keys atomically in a single call, which is useful for the encrypt flow where you need to write the `enc:` entry and all `wk:` entries together.

### 4.9 Scaling Beyond Document Properties

The ~500 KB total limit covers most real-world sheets. If a sheet exceeds this:

- **Option A**: Spill to a hidden sheet (`__enc_store__`) using cells as key-value pairs (column A = key, column B = value). Less performant but much higher capacity.
- **Option B**: Use an external store (Firebase, a lightweight API) for the wrapped keys, which are the bulk of the data. Keep `enc:` entries in Document Properties for speed.

---

## 5. The Three Tiers

### Tier 1 — Targeted Encryption (Full Asymmetric)

- User selects specific recipients from a list of registered users.
- A unique random AES-256-GCM key is generated per cell.
- The cell value is encrypted with that AES key.
- The AES key is wrapped individually with each recipient's RSA public key.
- Wrapped keys stored as separate `wk:<stableId>:<email>` properties.
- **Only those recipients can decrypt.** Not even the document owner can read it unless they are in the recipient list.

**Use case**: Salary figures visible only to HR and the employee.

### Tier 2 — Group-Based Encryption

- Same crypto mechanism as Tier 1, but the AES session key is wrapped with a **group key** rather than individual public keys.
- Each group has its own AES-256 key. That group key is wrapped per-member with their public key, stored as `grp:<group>:<email>` properties.
- The cell's session key is wrapped with the group key, stored as `wk:<stableId>:g:<group>`.
- **Adding a member to a group**: Write one new `grp:<group>:<newEmail>` property. No cell re-encryption needed.
- **Removing a member**: Delete their `grp:<group>:<email>` property. For true forward secrecy, rotate the group key and re-wrap for remaining members, then re-encrypt affected cells.

**Use case**: All cells tagged "finance-team" are readable by anyone in that group.

### Tier 3 — Veil Mode (Obfuscation)

- The cell value is still encrypted with AES-GCM, but the AES key is **derived deterministically** in the browser from the document ID plus a public salt.
- `veil_key = HKDF(documentId, salt="veil-mode-v1", info=stableId)`
- The derivation happens in the browser. Anyone with the add-on installed and access to the document can compute the key.
- Google cannot decrypt because the derivation requires running the add-on's client-side code — the key is never stored anywhere.
- No `wk:` properties needed — the tier field (`"t": 3`) in the `enc:` entry signals the browser to derive the key.

**Use case**: Hiding values from casual view, screenshots, accidental CSV exports. Revealing requires the add-on and a deliberate click.

**Tier selection is per-cell.** A single sheet can mix all three tiers.

---

## 6. Detailed Flows

### 6.1 Encrypting a Cell

```
User Action: Selects cell B7, clicks "Encrypt" in sidebar, types the sensitive value,
             selects recipients (or group, or veil mode), clicks "Confirm"

Browser Sidebar:
  1. Generate random AES-256-GCM key
     → crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"])

  2. Generate random IV (12 bytes)
     → crypto.getRandomValues(new Uint8Array(12))

  3. Encrypt the plaintext
     → crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, plaintextBytes)
     → Result: ciphertext (ArrayBuffer)

  4. Export AES key as raw bytes
     → crypto.subtle.exportKey("raw", aesKey)

  5. For each recipient (Tier 1):
     a. Fetch their public key via google.script.run.getPublicKey(email)
     b. Import their public key as CryptoKey
     c. Wrap the AES key:
        → crypto.subtle.encrypt({ name: "RSA-OAEP" }, recipientPublicKey, aesKeyBytes)
     d. Collect: { email: base64(wrappedKey) }

     For group (Tier 2):
     a. Fetch the group key (wrapped for current user) via google.script.run.getGroupMemberKey(group, myEmail)
     b. Unwrap the group key using current user's private key
     c. Wrap the AES session key with the group key (AES-GCM)
     d. Collect: { "g:<group>": base64(wrappedKey) }

     For veil (Tier 3):
     a. Derive veil key from documentId + stableId using HKDF
     b. Use derived key directly as AES key — no wrapping needed

  6. Generate a stable 4-char hex ID
     → crypto.getRandomValues(new Uint8Array(2)) → hex string

  7. Build the enc entry JSON:
     { "ct": base64(ciphertext), "iv": base64(iv), "t": 1, "cell": "B7",
       "by": "alice@example.com", "at": "2026-04-15T10:30:00Z" }

  8. Send to Apps Script via google.script.run.storeEncryptionBatch(stableId, encJson, wrappedKeys)
     → wrappedKeys = { "alice@example.com": "...", "bob@example.com": "..." }

Apps Script:
  9. storeEncryptionBatch writes atomically:
     - enc:a3f2                     → encJson
     - wk:a3f2:alice@example.com    → wrappedKey
     - wk:a3f2:bob@example.com      → wrappedKey

  10. Write "🔒{a3f2}" to cell B7
```

### 6.2 Decrypting a Cell

```
User Action: Selects cell B7 (which shows "🔒{a3f2}"), clicks "Decrypt" in sidebar

Apps Script:
  1. Read cell B7 → extract stableId "a3f2"
  2. Read property enc:a3f2 → the cell entry JSON
  3. Read property wk:a3f2:<currentUserEmail> → wrapped AES key for this user
     (or for Tier 2: read wk:a3f2:g:<group> + grp:<group>:<currentUserEmail>)
  4. Return both values to the browser

Browser Sidebar:
  5. Parse the enc entry JSON

  6. Tier 1:
     → crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, wrappedKeyBytes)
     → Result: raw AES key bytes

     Tier 2:
     → Unwrap group key using private key
     → Unwrap session key using group key

     Tier 3:
     → Derive veil key via HKDF(documentId, "veil-mode-v1", stableId)

  7. Import AES key
     → crypto.subtle.importKey("raw", aesKeyBytes, "AES-GCM", false, ["decrypt"])

  8. Decrypt ciphertext
     → crypto.subtle.decrypt({ name: "AES-GCM", iv: base64decode(entry.iv) }, aesKey, base64decode(entry.ct))
     → Result: plaintext bytes → decode to string

  9. Display plaintext in sidebar overlay
     → NEVER write plaintext back to the cell
```

### 6.3 Adding a Recipient to an Existing Cell

```
Browser Sidebar:
  1. Fetch enc:a3f2 and wk:a3f2:<myEmail> from Apps Script
  2. Unwrap the AES session key (current user must be an existing recipient)
  3. Fetch new recipient's public key via google.script.run.getPublicKey(newEmail)
  4. Wrap the AES key with the new recipient's public key
  5. Send to Apps Script: google.script.run.storeWrappedKey("a3f2", newEmail, base64WrappedKey)

Apps Script:
  6. Writes one new property: wk:a3f2:newuser@example.com → wrappedKey

→ No re-encryption of the cell value
→ No modification of any existing properties
→ Cost: one new ~684-byte property
```

### 6.4 Revoking a Recipient

```
Soft revocation (if they haven't cached the key):
  Apps Script: google.script.run.deleteWrappedKey("a3f2", "bob@example.com")
  → Deletes one property: wk:a3f2:bob@example.com

Hard revocation (if they may have cached the AES key):
  Browser Sidebar:
    1. Current user decrypts the cell value (they must be an existing recipient)
    2. Generate a new random AES key
    3. Re-encrypt the cell value with the new key
    4. Re-wrap the new AES key for all REMAINING recipients
    5. Send to Apps Script: updated enc entry + new wrapped keys

  Apps Script:
    6. Delete old wk:a3f2:bob@example.com
    7. Overwrite enc:a3f2 with new ciphertext
    8. Overwrite remaining wk:a3f2:* properties with new wrapped keys
    → Use setProperties() for atomic batch write
```

### 6.5 Registering a New User

```
User opens a sheet with the add-on for the first time:

  1. Add-on sidebar checks IndexedDB for an existing key
  2. If no key found:
     a. Generate key pair (see Section 3.1)
     b. Download backup file
     c. Set passphrase
     d. Store encrypted private key in IndexedDB
     e. Send public key to Apps Script → stored as pk:<email>
  3. If key found:
     a. Prompt for passphrase
     b. Unlock private key (see Section 3.2)
  4. Apps Script stores/confirms public key:
     pk:alice@example.com → base64(publicKey)
```

---

## 7. Ephemeral Display (Never Pollute the Sheet)

Decrypted values are **never written to cells**. They are displayed in one of these ways:

- **Sidebar panel**: The default. Shows the decrypted value in a read-only text area within the add-on sidebar. The user can copy it manually if needed.
- **Floating overlay**: A dialog positioned near the cell, showing the value. Closes on click-outside or after a timeout.
- **Temporary in-cell display with undo**: Write the plaintext to the cell temporarily, then automatically revert to the token after N seconds or when the user clicks away. This is the riskiest option (the plaintext briefly exists in Google's infrastructure) and should only be offered if the user explicitly opts in and understands the tradeoff.

**Recommendation**: Use sidebar display as default. It never puts plaintext on Google's servers.

---

## 8. Handling Structural Changes (Row/Column Insertion)

Because cells use stable IDs (`a3f2`) rather than cell addresses, inserting rows or columns doesn't break encryption. However, the `cell` field in the `enc:` entry (used for display) becomes stale.

**Solution**: Register an `onEdit` or `onChange` trigger in Apps Script that:
1. Scans for cells matching the `🔒{...}` pattern
2. Updates the `cell` field in the relevant `enc:<stableId>` property to match the cell's new address
3. This is purely cosmetic — crypto is never affected

If a cell with an encrypted token is deleted, the `enc:` and `wk:` entries become orphaned. A periodic cleanup function can scan for orphaned stable IDs:

```javascript
function cleanupOrphans() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet();
  const allValues = sheet.getDataRange().getValues().flat().join(' ');
  const props = PropertiesService.getDocumentProperties();
  const allProps = props.getProperties();

  for (const key of Object.keys(allProps)) {
    if (key.startsWith('enc:')) {
      const stableId = key.substring(4);
      if (!allValues.includes('🔒{' + stableId + '}')) {
        // Orphaned — delete enc: and all wk: entries for this stableId
        props.deleteProperty(key);
        Object.keys(allProps)
          .filter(k => k.startsWith('wk:' + stableId + ':'))
          .forEach(k => props.deleteProperty(k));
      }
    }
  }
}
```

---

## 9. Communication Between Browser and Apps Script

The sidebar communicates with Apps Script via `google.script.run`:

```javascript
// Browser → Apps Script (encrypt flow)
google.script.run
  .withSuccessHandler(onSuccess)
  .withFailureHandler(onError)
  .storeEncryptionBatch(stableId, encEntryJson, wrappedKeys);

// Browser → Apps Script (decrypt flow)
google.script.run
  .withSuccessHandler(({encEntry, wrappedKey}) => {
    // All decryption happens here in the browser
    decryptCell(encEntry, wrappedKey);
  })
  .getDecryptionData(stableId, userEmail);

// Apps Script: returns only encrypted material
function getDecryptionData(stableId, email) {
  return {
    encEntry: getProperty('enc:' + stableId),
    wrappedKey: getProperty('wk:' + stableId + ':' + email)
  };
}
```

**Critical**: Every parameter crossing the `google.script.run` boundary must contain ONLY encrypted material. The browser must never send plaintext or unwrapped keys through this channel, because the call transits Google's servers.

---

## 10. Advanced Features

### 10.1 Threshold Decryption (M-of-N)

For highly sensitive cells, split the AES session key using Shamir's Secret Sharing:
- Split the 32-byte AES key into N shares, requiring M to reconstruct
- Wrap each share with a different recipient's public key
- Store as `wk:<stableId>:<email>` — each value is a wrapped share, not the full key
- Add `"m": 3` to the `enc:` entry to indicate the threshold
- Decryption requires M recipients to each unwrap their share and combine

**Implementation**: Use a JavaScript SSS library (e.g., `secrets.js`) in the browser sidebar.

### 10.2 Time-Boxed Access

Add an `exp` field (ISO timestamp) to the `enc:` entry. The browser-side code checks this before decrypting and refuses if expired. This is client-enforced (a determined user could bypass it), but it creates an audit trail and raises the bar.

### 10.3 Burn After Reading

On first successful decryption, the browser calls `google.script.run.deleteWrappedKey(stableId, myEmail)`. The user can view the value once, then their `wk:` entry is gone.

### 10.4 QR-Code Key Exchange

For onboarding a new user face-to-face:
1. New user generates their key pair
2. Their public key is displayed as a QR code on their screen
3. Existing user scans it with their phone camera
4. The public key is registered without ever traversing Google's servers

### 10.5 Audit Log

Store an encrypted audit trail in Document Properties using a similar flat key pattern:
- `log:<timestamp>:<email>` → encrypted log entry (encrypted with document owner's public key)
- Each decrypt/encrypt event logs: who, when, which stableId, which tier, what action
- Useful for compliance without compromising zero-knowledge

---

## 11. Document Properties Size Management

### Per-Property Sizes

| Property pattern | Typical size | Notes |
|-----------------|-------------|-------|
| `enc:<id>` | 150–300 bytes | Depends on plaintext length |
| `wk:<id>:<email>` | ~684 bytes | RSA-4096 wrapped key, base64-encoded |
| `pk:<email>` | ~736 bytes | RSA-4096 public key, base64 SPKI |
| `grp:<group>:<email>` | ~684 bytes | Same as wrapped key |

### Capacity Estimates

| Scenario | Estimated total | Fits in 500 KB? |
|----------|----------------|-----------------|
| 50 cells, 3 recipients each | ~120 KB | Yes |
| 100 cells, 3 recipients each | ~230 KB | Yes |
| 200 cells, 5 recipients each | ~720 KB | Needs overflow |
| 50 cells, 20 recipients each | ~700 KB | Needs overflow |

### Overflow Strategy

If the property count or total size approaches the limit:

- **Hidden sheet overflow**: Create a hidden sheet `__enc_store__` with column A = key, column B = value. Move `wk:` entries (the bulk of the data) there while keeping `enc:` entries in Document Properties for fast access.
- **External store**: For very large sheets, offload wrapped keys to Firebase or a lightweight API endpoint. The `enc:` entry can include a flag indicating where wrapped keys are stored.

---

## 12. Technology Choices

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Asymmetric algorithm | RSA-OAEP 4096-bit | Widely supported in WebCrypto, no patent issues, well-understood. ECDH is more compact but adds key-agreement complexity. |
| Symmetric algorithm | AES-256-GCM | Authenticated encryption (integrity + confidentiality). Native WebCrypto support. |
| Key derivation (passphrase) | PBKDF2 with 600K iterations | WebCrypto-native. Argon2 would be better but requires a WASM library. |
| Key derivation (veil mode) | HKDF-SHA256 | Deterministic, fast, WebCrypto-native. |
| Key wrapping | RSA-OAEP direct encryption of 32-byte AES key | Simpler than AES-KW for this use case. RSA-4096 can encrypt up to 446 bytes with OAEP/SHA-256. |
| Private key storage | IndexedDB (encrypted with passphrase-derived key) | Browser-native, origin-isolated, persists across sessions. |
| Private key session form | Non-extractable CryptoKey | Cannot be read by JS, only used for crypto operations. |
| Server-side storage | Document Properties (flat key-value) | No monolithic blob, no concurrency conflicts, atomic batch writes via setProperties(). |

---

## 13. Security Threat Model Summary

| Threat | Mitigation |
|--------|-----------|
| Google reads Document Properties | All values are encrypted or wrapped. No plaintext or unwrapped keys stored. |
| Google inspects Apps Script execution | All crypto happens in browser. Apps Script only shuttles encrypted blobs. |
| Other Sheets add-ons read IndexedDB | Browser origin isolation (unique subdomain per add-on). |
| Malicious browser extension reads IndexedDB | Private key is encrypted with user's passphrase. Encrypted blob is useless without it. |
| XSS in the sidebar tries to exfiltrate session key | Private key imported as non-extractable CryptoKey. Cannot be exported by any JS. |
| User loses their device / clears browser | Backup JWK file + passphrase recovery path. |
| Recipient caches AES key then gets revoked | Hard revocation: re-encrypt cell with new AES key, re-wrap for remaining recipients. |
| Row/column insertion shifts cell addresses | Stable IDs (not cell addresses) used for all crypto references. |
| Document Properties size exceeded | Overflow to hidden sheet or external store for wrapped keys. |
| Concurrent users encrypting simultaneously | Flat key-value writes target different properties — no read-modify-write conflicts. |
| Man-in-the-middle during key registration | Public keys are not secret — interception doesn't help an attacker. Optionally verify fingerprints out-of-band. |
