import { useRef, useState } from 'react';
import {
  Box, Button, Collapse, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useKeyOps } from '../../hooks/useKeyOps';
import type { KeyConflict } from '../../hooks/useKeyOps';
import { useApp } from '../../context/AppContext';
import { KeyConflictDialog } from './KeyConflictDialog';
import { FingerprintChip } from '../common/FingerprintChip';

export function KeySetup() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { setupNewKeypair, loadKeyFile, removePublicKey } = useKeyOps();
  const { ownEmail, pubKeyCache, showToast } = useApp();
  const [conflict, setConflict] = useState<KeyConflict | null>(null);
  const [showForgetPubKey, setShowForgetPubKey] = useState(false);

  const registeredEntry = pubKeyCache.find(e => e.email === ownEmail);

  const handleGenerate = async () => {
    const c = await setupNewKeypair();
    if (c) setConflict(c);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const c = await loadKeyFile(file);
    if (c) setConflict(c);
  };

  const handleConflictConfirm = async () => {
    if (!conflict) return;
    const proceed = conflict.proceed;
    setConflict(null);
    await proceed();
  };

  const handleForgetPubKey = async () => {
    try {
      await removePublicKey();
    } catch (e) {
      showToast('Could not remove public key from document: ' + (e as Error).message, 'error');
      return;
    }
    setShowForgetPubKey(false);
  };

  return (
    <Box sx={{ px: 1.5, pt: 1.5, pb: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, gap: 1 }}>
        <Typography variant="subtitle2" sx={{ color: 'text.secondary' }}>
          Encryption key
        </Typography>
        {registeredEntry && (
          <FingerprintChip fp={registeredEntry.fp} sx={{ ml: 'auto' }} />
        )}
      </Box>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button
          variant="contained"
          size="small"
          startIcon={<AddIcon />}
          onClick={handleGenerate}
          sx={{ flex: 1 }}
        >
          {registeredEntry ? 'Replace key' : 'Generate key'}
        </Button>
        <Button
          variant="outlined"
          size="small"
          startIcon={<UploadFileIcon />}
          onClick={() => fileInputRef.current?.click()}
          sx={{ flex: 1 }}
        >
          Import key
        </Button>
      </Box>
      <input
        ref={fileInputRef}
        type="file"
        accept=".ciphersheet-key,.vaultkey,.json,.key,.txt"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {registeredEntry && (
        <>
          <Button
            size="small"
            color="error"
            onClick={() => setShowForgetPubKey(!showForgetPubKey)}
            sx={{ mt: 1, fontSize: '0.6875rem', p: 0, minWidth: 'unset', textDecoration: 'underline' }}
          >
            Forget public key
          </Button>
          <Collapse in={showForgetPubKey}>
            <Box sx={{
              mt: 0.5, p: 1, borderRadius: 1,
              bgcolor: 'error.light', borderLeft: '3px solid', borderLeftColor: 'error.main',
            }}>
              <Box sx={{ display: 'flex', gap: 0.5, mb: 0.5 }}>
                <WarningAmberIcon sx={{ fontSize: 14, color: 'error.main', mt: 0.2 }} />
                <Typography variant="caption" color="error.main">
                  Your registered public key (fingerprint{' '}
                  <Box component="span" sx={{ fontFamily: 'monospace' }}>
                    {registeredEntry.fp.slice(0, 9)}…
                  </Box>
                  ) will be removed. Other users won't be able to encrypt new values for you until you register a new key.
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button size="small" color="error" variant="contained" onClick={handleForgetPubKey} sx={{ fontSize: '0.6875rem' }}>
                  Forget public key
                </Button>
                <Button size="small" onClick={() => setShowForgetPubKey(false)} sx={{ fontSize: '0.6875rem' }}>
                  Cancel
                </Button>
              </Box>
            </Box>
          </Collapse>
        </>
      )}

      <KeyConflictDialog
        conflict={conflict}
        onConfirm={handleConflictConfirm}
        onClose={() => setConflict(null)}
      />
    </Box>
  );
}
