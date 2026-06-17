import { Box, Button, InputAdornment, IconButton, TextField, Typography } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
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
      borderLeft: '3px solid', borderLeftColor: 'warning.main',
    }}>
      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'flex-start', mb: 1 }}>
        <WarningAmberIcon sx={{ fontSize: 16, color: 'warning.dark', mt: 0.25, flexShrink: 0 }} />
        <Typography variant="caption" sx={{ color: 'warning.dark', fontWeight: 600 }}>
          Save this unlock password — anyone who has it can unlock your key and read your data, so keep it safe. A password manager is the easiest way.
        </Typography>
      </Box>

      <TextField
        value={setupPassword}
        size="small"
        fullWidth
        slotProps={{
          htmlInput: { readOnly: true, style: { fontFamily: 'monospace', fontSize: '0.6875rem' } },
          input: {
            endAdornment: (
              <InputAdornment position="end" sx={{ mr: -1.75, ml: 0, my: 0, height: '100%' }}>
                <IconButton
                  onClick={copy}
                  sx={{ borderRadius: 0, width: 36, height: 30, p: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <ContentCopyIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </InputAdornment>
            ),
          },
        }}
        sx={{ '& .MuiOutlinedInput-root': { overflow: 'hidden' } }}
      />

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
        <Button
          size="small"
          onClick={() => setSetupPassword(null)}
          sx={{ color: 'warning.dark', fontSize: '0.6875rem' }}
        >
          Got it
        </Button>
      </Box>
    </Box>
  );
}
