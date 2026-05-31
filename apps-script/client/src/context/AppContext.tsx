import React, {
  createContext, useCallback, useContext, useMemo, useRef, useState
} from 'react';
import type {
  CellViewState, GroupEntry, PubKeyCacheEntry, ToastSeverity, ToastState
} from '../types';

export type LoadingPart = 'cell' | 'key';

interface AppState {
  ecdhPrivKey: CryptoKey | null;
  ecdhPubKey: CryptoKey | null;
  unlockPassword: string | null;
  ecdhFp: string | null;
  keyInStorage: boolean;
  keyHasPasskey: boolean;
  cellView: CellViewState;
  ownEmail: string;
  pubKeyCache: PubKeyCacheEntry[];
  noKeyEditors: string[];
  groupCache: GroupEntry[];
  setupPassword: string | null;
  loadingSet: Set<LoadingPart>;
  toast: ToastState | null;
}

interface AppContextValue extends AppState {
  setEcdhPrivKey: (key: CryptoKey | null) => void;
  setEcdhPubKey: (key: CryptoKey | null) => void;
  setUnlockPassword: (pw: string | null) => void;
  setEcdhFp: (fp: string | null) => void;
  setKeyInStorage: (v: boolean) => void;
  setKeyHasPasskey: (v: boolean) => void;
  setCellView: React.Dispatch<React.SetStateAction<CellViewState>>;
  setOwnEmail: (email: string) => void;
  setPubKeyCache: (cache: PubKeyCacheEntry[]) => void;
  setNoKeyEditors: (emails: string[]) => void;
  setGroupCache: (cache: GroupEntry[]) => void;
  setSetupPassword: (pw: string | null) => void;
  startLoading: (part: LoadingPart) => void;
  stopLoading: (part: LoadingPart) => void;
  showToast: (message: string, severity?: ToastSeverity, persistent?: boolean) => void;
  dismissToast: () => void;
  // Derived
  canEncrypt: boolean;
  cellIsEncrypted: boolean;
  // Poll timer ref (not state — no re-render needed)
  pollTimerRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>;
  // Password manager form refs
  pwSaveFormRef: React.RefObject<HTMLFormElement | null>;
  pwSaveUsernameRef: React.RefObject<HTMLInputElement | null>;
  pwSaveInputRef: React.RefObject<HTMLInputElement | null>;
}

const AppContext = createContext<AppContextValue | null>(null);

const VAULT_PFX = '\uD83D\uDD10';

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ecdhPrivKey, setEcdhPrivKey] = useState<CryptoKey | null>(null);
  const [ecdhPubKey, setEcdhPubKey] = useState<CryptoKey | null>(null);
  const [unlockPassword, setUnlockPassword] = useState<string | null>(null);
  const [ecdhFp, setEcdhFp] = useState<string | null>(null);
  const [keyInStorage, setKeyInStorage] = useState(false);
  const [keyHasPasskey, setKeyHasPasskey] = useState(false);
  const [cellView, setCellView] = useState<CellViewState>({
    cell: null, plaintext: '', decrypted: false, decryptError: null,
  });
  const [ownEmail, setOwnEmail] = useState('');
  const [pubKeyCache, setPubKeyCache] = useState<PubKeyCacheEntry[]>([]);
  const [noKeyEditors, setNoKeyEditors] = useState<string[]>([]);
  const [groupCache, setGroupCache] = useState<GroupEntry[]>([]);
  const [setupPassword, setSetupPassword] = useState<string | null>(null);
  const [loadingSet, setLoadingSet] = useState<Set<LoadingPart>>(new Set());
  const [toast, setToast] = useState<ToastState | null>(null);

  const startLoading = useCallback((part: LoadingPart) => {
    setLoadingSet(prev => new Set(prev).add(part));
  }, []);
  const stopLoading = useCallback((part: LoadingPart) => {
    setLoadingSet(prev => { const s = new Set(prev); s.delete(part); return s; });
  }, []);

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pwSaveFormRef = useRef<HTMLFormElement | null>(null);
  const pwSaveUsernameRef = useRef<HTMLInputElement | null>(null);
  const pwSaveInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = useCallback((
    message: string,
    severity: ToastSeverity = 'info',
    persistent = false
  ) => {
    setToast({ message, severity, persistent });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  const canEncrypt = ecdhPrivKey !== null;
  const cellIsEncrypted = cellView.cell
    ? String(cellView.cell.value ?? '').startsWith(VAULT_PFX)
    : false;

  const value = useMemo<AppContextValue>(() => ({
    ecdhPrivKey, setEcdhPrivKey,
    ecdhPubKey, setEcdhPubKey,
    unlockPassword, setUnlockPassword,
    ecdhFp, setEcdhFp,
    keyInStorage, setKeyInStorage,
    keyHasPasskey, setKeyHasPasskey,
    cellView, setCellView,
    ownEmail, setOwnEmail,
    pubKeyCache, setPubKeyCache,
    noKeyEditors, setNoKeyEditors,
    groupCache, setGroupCache,
    setupPassword, setSetupPassword,
    loadingSet, startLoading, stopLoading,
    toast, showToast, dismissToast,
    canEncrypt, cellIsEncrypted,
    pollTimerRef, pwSaveFormRef, pwSaveUsernameRef, pwSaveInputRef,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [
    ecdhPrivKey, ecdhPubKey, unlockPassword, ecdhFp, keyInStorage, keyHasPasskey,
    cellView, ownEmail, pubKeyCache, noKeyEditors, groupCache,
    setupPassword, loadingSet, toast, canEncrypt, cellIsEncrypted,
    showToast, dismissToast, startLoading, stopLoading,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
