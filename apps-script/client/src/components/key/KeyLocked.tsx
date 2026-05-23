import { useState } from 'react';
import {
  Box, Button, Chip, Collapse, IconButton, InputAdornment,
  TextField, Typography,
} from '@mui/material';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import KeyIcon from '@mui/icons-material/Key';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useApp } from '../../context/AppContext';
import { useKeyOps } from '../../hooks/useKeyOps';
import { idbGet, IDB_ECDH_KEY } from '../../utils/idb';
import type { IdbEcdhEntry } from '../../types';

export function KeyLocked() {
  const { showToast } = useApp();
  const { unlockWithPassword, unlockWithPasskey, forgetKey } = useKeyOps();
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showForget, setShowForget] = useState(false);
  const [fp, setFp] = useState('');
  const [hasPasskey, setHasPasskey] = useState(false);

  useState(() => {
    idbGet<IdbEcdhEntry>(IDB_ECDH_KEY).then(entry => {
      if (entry) {
        setFp(entry.publicKeyFp || '');
        setHasPasskey(!!(entry.credentialId && entry.prfWrappedPassword));
      }
    });
  });

  const handleUnlock = async () => {
    if (!password) { showToast('Enter the unlock password', 'warning'); return; }
    await unlockWithPassword(password);
    setPassword('');
  };

  const handleForget = async () => {
    await forgetKey();
    setShowForget(false);
  };

  const passkeyUrl = window.CS_CONFIG?.passkeyPopupUrl;

  return (
    <Box sx={{ px: 1.5, pt: 1.5, pb: 1 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Box sx={{
          width: 8, height: 8, borderRadius: '50%',
          bgcolor: 'warning.main', flexShrink: 0,
        }} />
        <Typography variant="subtitle2" sx={{ color: 'warning.main' }}>Keypair locked</Typography>
        {fp && (
          <Chip
            icon={<FingerprintIcon sx={{ fontSize: '0.75rem !important' }} />}
            label={fp.slice(0, 9) + '…'}
            size="small"
            sx={{ ml: 'auto', fontSize: '0.6875rem', height: 20 }}
          />
        )}
      </Box>

      {/* Password input */}
      <TextField
        fullWidth
        size="small"
        type={showPw ? 'text' : 'password'}
        placeholder="Unlock password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleUnlock()}
        autoComplete="current-password"
        slotProps={{
          htmlInput: { id: 'ciphersheet-password-input' },
          input: {
            endAdornment: (
              <InputAdornment position="end" sx={{ mr: -1.75, ml: 0, my: 0, height: '100%' }}>
                <IconButton
                  onClick={() => setShowPw(!showPw)}
                  sx={{ borderRadius: 0, width: 36, height: 30, p: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  {showPw ? <VisibilityOffIcon sx={{ fontSize: 16 }} /> : <VisibilityIcon sx={{ fontSize: 16 }} />}
                </IconButton>
              </InputAdornment>
            ),
          },
        }}
        sx={{ mb: 1, '& .MuiOutlinedInput-root': { overflow: 'hidden' } }}
      />

      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button variant="contained" size="small" startIcon={<LockOpenIcon />} onClick={handleUnlock} sx={{ flex: 1 }}>
          Unlock
        </Button>
        {hasPasskey && passkeyUrl && (
          <Button variant="outlined" size="small" startIcon={<KeyIcon />} onClick={unlockWithPasskey} sx={{ flex: 1 }}>
            Passkey
          </Button>
        )}
      </Box>

      {/* Forget key */}
      <Button
        size="small"
        color="error"
        onClick={() => setShowForget(!showForget)}
        sx={{ mt: 1, fontSize: '0.6875rem', p: 0, minWidth: 'unset', textDecoration: 'underline' }}
      >
        Forget this key
      </Button>
      <Collapse in={showForget}>
        <Box sx={{
          mt: 0.5, p: 1, borderRadius: 1,
          bgcolor: 'error.light', borderLeft: '3px solid', borderLeftColor: 'error.main',
        }}>
          <Box sx={{ display: 'flex', gap: 0.5, mb: 0.5 }}>
            <WarningAmberIcon sx={{ fontSize: 14, color: 'error.main', mt: 0.2 }} />
            <Typography variant="caption" color="error.main">
              This will delete the stored keypair. Encrypted cells using this key will be unrecoverable.
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button size="small" color="error" variant="contained" onClick={handleForget} sx={{ fontSize: '0.6875rem' }}>
              Delete keypair
            </Button>
            <Button size="small" onClick={() => setShowForget(false)} sx={{ fontSize: '0.6875rem' }}>
              Cancel
            </Button>
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
}
