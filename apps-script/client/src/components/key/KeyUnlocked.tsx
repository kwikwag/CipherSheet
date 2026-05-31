import { Box, Button, Typography } from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import KeyIcon from '@mui/icons-material/Key';
import { useApp } from '../../context/AppContext';
import { useKeyOps } from '../../hooks/useKeyOps';
import { FingerprintChip } from '../common/FingerprintChip';

export function KeyUnlocked() {
  const { ecdhFp, keyHasPasskey } = useApp();
  const { lockEcdh, tryPrfEnroll } = useKeyOps();

  const passkeyUrl = window.CS_CONFIG?.passkeyPopupUrl;

  return (
    <Box sx={{ px: 1.5, pt: 1.5, pb: 1 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Box sx={{
          width: 8, height: 8, borderRadius: '50%',
          bgcolor: 'success.main', flexShrink: 0,
        }} />
        <Typography variant="subtitle2" sx={{ color: 'success.main' }}>Key active</Typography>
        {ecdhFp && (
          <FingerprintChip fp={ecdhFp} sx={{ ml: 'auto' }} />
        )}
      </Box>

      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button variant="outlined" size="small" startIcon={<LockIcon />} onClick={lockEcdh} sx={{ flex: 1 }}>
          Lock
        </Button>
        {passkeyUrl && (
          <Button variant="outlined" size="small" startIcon={<KeyIcon />} onClick={tryPrfEnroll} sx={{ flex: 1, fontSize: '0.6875rem' }}>
            {keyHasPasskey ? 'Update passkey' : 'Set up passkey'}
          </Button>
        )}
      </Box>
    </Box>
  );
}
