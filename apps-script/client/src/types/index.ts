export type KeyType = 'ecdh' | 'preshared';

export type ToastSeverity = 'success' | 'error' | 'warning' | 'info';

export interface ToastState {
  message: string;
  severity: ToastSeverity;
  persistent?: boolean; // stays until dismissed
}

export interface CellData {
  value: string | number | boolean | null;
  cellRef: string;
  sheetName: string;
}

export interface CellViewState {
  cell: CellData | null;
  plaintext: string;
  decrypted: boolean;
  decryptError: string | null;
}

export interface PubKeyCacheEntry {
  email: string;
  pubKey: CryptoKey;
  fp: string;
}

export interface GroupEntry {
  id: string;
  emailHashes: string[];
  label: string;
}

export interface IdbEcdhEntry {
  wrapped: Uint8Array;
  iv: Uint8Array;
  salt: Uint8Array;
  publicKeySpki: Uint8Array;
  credentialId?: number[];
  prfWrappedPassword?: Uint8Array;
  prfPasswordIv?: Uint8Array;
}

export interface DocumentSettings {
  editWarningEnabled?: boolean;
  revertOnEditEnabled?: boolean;
  defaultKeyType?: KeyType;
}

export interface InitialPublicKeyEntry {
  email: string;
  publicKey: string; // base64 SPKI
}

export interface CsConfig {
  feedbackUrl: string;
  donateUrl: string;
  privacyUrl: string;
  passkeyPopupUrl: string;
  appVersion: string;
  initialPublicKeys: InitialPublicKeyEntry[];
}

declare global {
  interface Window {
    CS_CONFIG: CsConfig;
    PasswordCredential?: {
      new(init: { id: string; password: string; name?: string }): Credential;
    };
    google?: {
      script: {
        run: GasRunner;
      };
    };
  }
}

interface GasRunner {
  withSuccessHandler(fn: (result: unknown) => void): GasRunner;
  withFailureHandler(fn: (err: Error) => void): GasRunner;
  [method: string]: unknown;
}
