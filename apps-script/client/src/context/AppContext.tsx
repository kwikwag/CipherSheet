import React, {
  createContext, useCallback, useContext, useMemo, useRef, useState
} from 'react';
import type {
  CellViewState, GroupEntry, KeyType, PubKeyCacheEntry, ToastSeverity, ToastState
} from '../types';

interface AppState {
  ecdhPrivKey: CryptoKey | null;
  ecdhPubKey: CryptoKey | null;
  presharedKey: CryptoKey | null;
  unlockPassword: string | null;
  ecdhFp: string | null;
  keyInStorage: boolean;
  keyHasPasskey: boolean;
  cellView: CellViewState;
  ownEmail: string;
  defaultKeyType: KeyType;
  pubKeyCache: PubKeyCacheEntry[];
  groupCache: GroupEntry[];
  setupPassword: string | null;
  loading: boolean;
  toast: ToastState | null;
}

interface AppContextValue extends AppState {
  setEcdhPrivKey: (key: CryptoKey | null) => void;
  setEcdhPubKey: (key: CryptoKey | null) => void;
  setPresharedKey: (key: CryptoKey | null) => void;
  setUnlockPassword: (pw: string | null) => void;
  setEcdhFp: (fp: string | null) => void;
  setKeyInStorage: (v: boolean) => void;
  setKeyHasPasskey: (v: boolean) => void;
  setCellView: React.Dispatch<React.SetStateAction<CellViewState>>;
  setOwnEmail: (email: string) => void;
  setDefaultKeyType: (t: KeyType) => void;
  setPubKeyCache: (cache: PubKeyCacheEntry[]) => void;
  setGroupCache: (cache: GroupEntry[]) => void;
  setSetupPassword: (pw: string | null) => void;
  setLoading: (v: boolean) => void;
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
  const [presharedKey, setPresharedKey] = useState<CryptoKey | null>(null);
  const [unlockPassword, setUnlockPassword] = useState<string | null>(null);
  const [ecdhFp, setEcdhFp] = useState<string | null>(null);
  const [keyInStorage, setKeyInStorage] = useState(false);
  const [keyHasPasskey, setKeyHasPasskey] = useState(false);
  const [cellView, setCellView] = useState<CellViewState>({
    cell: null, plaintext: '', decrypted: false, decryptError: null,
  });
  const [ownEmail, setOwnEmail] = useState('');
  const [defaultKeyType, setDefaultKeyType] = useState<KeyType>('ecdh');
  const [pubKeyCache, setPubKeyCache] = useState<PubKeyCacheEntry[]>([]);
  const [groupCache, setGroupCache] = useState<GroupEntry[]>([]);
  const [setupPassword, setSetupPassword] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

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

  const canEncrypt = ecdhPrivKey !== null || presharedKey !== null;
  const cellIsEncrypted = cellView.cell
    ? String(cellView.cell.value ?? '').startsWith(VAULT_PFX)
    : false;

  const value = useMemo<AppContextValue>(() => ({
    ecdhPrivKey, setEcdhPrivKey,
    ecdhPubKey, setEcdhPubKey,
    presharedKey, setPresharedKey,
    unlockPassword, setUnlockPassword,
    ecdhFp, setEcdhFp,
    keyInStorage, setKeyInStorage,
    keyHasPasskey, setKeyHasPasskey,
    cellView, setCellView,
    ownEmail, setOwnEmail,
    defaultKeyType, setDefaultKeyType,
    pubKeyCache, setPubKeyCache,
    groupCache, setGroupCache,
    setupPassword, setSetupPassword,
    loading, setLoading,
    toast, showToast, dismissToast,
    canEncrypt, cellIsEncrypted,
    pollTimerRef, pwSaveFormRef, pwSaveUsernameRef, pwSaveInputRef,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [
    ecdhPrivKey, ecdhPubKey, presharedKey, unlockPassword, ecdhFp, keyInStorage, keyHasPasskey,
    cellView, ownEmail, defaultKeyType, pubKeyCache, groupCache,
    setupPassword, loading, toast, canEncrypt, cellIsEncrypted,
    showToast, dismissToast,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
