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
  recipientHashes: Set<string>;
}

export interface SerializedEditorEntry {
  email: string;
  name?: string;
  publicKeyBase64?: string;
}

export interface EditorEntry {
  email: string;
  name?: string;
  pubKey?: CryptoKey;
  fp?: string;
}

export interface PubKeyEntry extends EditorEntry {
  pubKey: CryptoKey;
  fp: string;
}

export function isPubKeyEntry(e: EditorEntry): e is PubKeyEntry {
  return e.pubKey !== undefined && e.fp !== undefined;
}

export function editorDisplayName(e: EditorEntry): string {
  return e.name || e.email;
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
}

export interface CsConfig {
  feedbackUrl: string;
  donateUrl: string;
  privacyUrl: string;
  passkeyPopupUrl: string;
  appVersion: string;
  editors: SerializedEditorEntry[];
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
        host: {
          close(): void;
        };
      };
    };
  }
}

interface GasRunner {
  withSuccessHandler(fn: (result: unknown) => void): GasRunner;
  withFailureHandler(fn: (err: Error) => void): GasRunner;
  [method: string]: unknown;
}
