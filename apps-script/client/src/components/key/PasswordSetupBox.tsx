import { Box, IconButton, InputAdornment, TextField, Typography } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CloseIcon from '@mui/icons-material/Close';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useApp } from '../../context/AppContext';

export function PasswordSetupBox() {
  const { setupPassword, setSetupPassword, showToast } = useApp();

  if (!setupPassword) return null;

  const copy = () => {
    navigator.clipboard.writeText(setupPassword)
      .then(() => showToast('Password copied', 'success'))
      .catch(() => showToast('Copy failed — select and copy manually', 'warning'));
  };

  return (
    <Box sx={{
      mx: 1.5, mt: 1, p: 1.5, borderRadius: 2,
      bgcolor: 'warning.light',
      border: '1px solid', borderColor: 'warning.main',
      position: 'relative',
    }}>
      <IconButton
        size="small"
        onClick={() => setSetupPassword(null)}
        sx={{ position: 'absolute', top: 4, right: 4, p: 0.25 }}
      >
        <CloseIcon sx={{ fontSize: 14 }} />
      </IconButton>

      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'flex-start', mb: 1 }}>
        <WarningAmberIcon sx={{ fontSize: 16, color: 'warning.dark', mt: 0.25, flexShrink: 0 }} />
        <Typography variant="caption" sx={{ color: 'warning.dark', fontWeight: 600 }}>
          Save this unlock password — you'll need it to use your keypair on this device.
        </Typography>
      </Box>

      <TextField
        value={setupPassword}
        size="small"
        fullWidth
        inputProps={{ readOnly: true, style: { fontFamily: 'monospace', fontSize: '0.6875rem' } }}
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <IconButton size="small" onClick={copy} edge="end">
                <ContentCopyIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </InputAdornment>
          ),
        }}
      />
    </Box>
  );
}
