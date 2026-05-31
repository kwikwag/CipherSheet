import { useState } from 'react';
import {
  Box, Button, Checkbox, Chip, Collapse, FormControlLabel,
  IconButton, InputAdornment, TextField, Typography,
} from '@mui/material';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import KeyIcon from '@mui/icons-material/Key';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useApp } from '../../context/AppContext';
import { useKeyOps } from '../../hooks/useKeyOps';

export function KeyLocked() {
  const { ecdhFp, keyHasPasskey, showToast } = useApp();
  const { unlockWithPassword, unlockWithPasskey, forgetKey } = useKeyOps();
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showForget, setShowForget] = useState(false);
  const [keepInDoc, setKeepInDoc] = useState(false);

  const passkeyUrl = window.CS_CONFIG?.passkeyPopupUrl;

  const handleUnlock = async () => {
    if (!password) { showToast('Enter the unlock password', 'warning'); return; }
    await unlockWithPassword(password);
    setPassword('');
  };

  const handleForget = async () => {
    try {
      await forgetKey(!keepInDoc);
    } catch (e) {
      showToast('Could not remove public key from document: ' + (e as Error).message, 'error');
      return;
    }
    setShowForget(false);
    setKeepInDoc(false);
  };

  return (
    <Box sx={{ px: 1.5, pt: 1.5, pb: 1 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Box sx={{
          width: 8, height: 8, borderRadius: '50%',
          bgcolor: 'warning.main', flexShrink: 0,
        }} />
        <Typography variant="subtitle2" sx={{ color: 'warning.main' }}>Keypair locked</Typography>
        {ecdhFp && (
          <Chip
            icon={<FingerprintIcon sx={{ fontSize: '0.75rem !important' }} />}
            label={ecdhFp.slice(0, 9) + '…'}
            size="small"
            sx={{ ml: 'auto', fontSize: '0.6875rem', height: 20 }}
          />
        )}
      </Box>

      {/* Password input — wrapped in a form so browsers offer to save/fill credentials */}
      <Box
        component="form"
        onSubmit={e => { e.preventDefault(); handleUnlock(); }}
        sx={{ mb: 1 }}
      >
        {/* Visually hidden username field — display:none is ignored by many browsers for autofill */}
        <input type="text" name="username" autoComplete="username" value={ecdhFp ?? ''} readOnly
          style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }} />
        <TextField
          fullWidth
          size="small"
          type={showPw ? 'text' : 'password'}
          placeholder="Unlock password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoComplete="current-password"
          slotProps={{
            htmlInput: { id: 'ciphersheet-password-input', name: 'password' },
            input: {
              endAdornment: (
                <InputAdornment position="end" sx={{ mr: -1.75, ml: 0, my: 0, height: '100%' }}>
                  <IconButton
                    onClick={() => setShowPw(!showPw)}
                    type="button"
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
          <Button type="submit" variant="contained" size="small" startIcon={<LockOpenIcon />} sx={{ flex: 1 }}>
            Unlock
          </Button>
          {keyHasPasskey && passkeyUrl && (
            <Button type="button" variant="outlined" size="small" startIcon={<KeyIcon />} onClick={unlockWithPasskey} sx={{ flex: 1 }}>
              Passkey
            </Button>
          )}
        </Box>
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
              Cells encrypted with this key will become undecipherable to you unless you import the key and unlock it.
            </Typography>
          </Box>
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={keepInDoc}
                onChange={e => setKeepInDoc(e.target.checked)}
                color="error"
              />
            }
            label={
              <Typography variant="caption">
                Still allow others to use this key to encrypt values for me.
              </Typography>
            }
            sx={{ mx: 0, mb: 0.5 }}
          />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button size="small" color="error" variant="contained" onClick={handleForget} sx={{ fontSize: '0.6875rem' }}>
              Forget keypair
            </Button>
            <Button size="small" onClick={() => { setShowForget(false); setKeepInDoc(false); }} sx={{ fontSize: '0.6875rem' }}>
              Cancel
            </Button>
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
}
