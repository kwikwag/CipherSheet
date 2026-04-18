# CipherSheet — Pending Tasks

Work items for the next development session. Read [AGENTS.md](AGENTS.md) first for full project context.

---

## feat/passkey-unlock c1 — WebAuthn PRF via same-project web app popup

**File:** `apps-script/src/Code.ts`, new `apps-script/src/prf-popup.html`, `apps-script/src/sidebar-script.js`

The Apps Script sidebar iframe does not carry `allow="publickey-credentials-create publickey-credentials-get"`, so WebAuthn throws `SecurityError` immediately. A same-project web app deployed alongside the add-on runs as a top-level window (not an iframe), so the browser allows WebAuthn there.

### Flow

1. During keypair setup, open the web app URL as a small popup: `const popup = window.open(WEB_APP_URL + '?action=prf-enroll', 'prf', 'width=500,height=300')`.
2. `prf-popup.html` calls `navigator.credentials.create({ publicKey: { …, extensions: { prf: {} } } })` with `rpId: 'script.google.com'` and a challenge derived from the session.
3. On success, the popup calls `window.opener.postMessage({ type: 'prf-result', credentialId, prfOutput }, origin)` and closes.
4. The sidebar receives the message, validates origin, uses `prfOutput` as the AES-KW key to wrap the ECDH private key in IDB (replacing or supplementing the PBKDF2-based wrap). Stores `credentialId`.
5. On subsequent unlocks, open the popup with `action=prf-get`, pass the stored `credentialId`, get `prfOutput`, unwrap the private key — no password needed.

### Notes

- Validate `event.origin === WEB_APP_ORIGIN` in the `message` listener before using PRF output.
- `rpId: 'script.google.com'` is shared across all Apps Script web apps, but credentials are scoped to the user's authenticator and `credentialId`, so cross-app confusion is not a practical risk.
- The web app deployment must be set to run as the user and accessible to the relevant Google accounts.
- `WEB_APP_URL` can be injected by `Code.ts` at sidebar render time (like `FEEDBACK_URL`), so it tracks the correct deployment automatically.
- The c2 forward-compatible PRF probe is already in place in `sidebar-script.js` (`setupNewKeypair`) and will silently activate if Google ever adds the iframe permission.
