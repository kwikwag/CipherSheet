import { Box, Button, Chip, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import KeyIcon from '@mui/icons-material/Key';
import { useApp } from '../../context/AppContext';
import { useKeyOps } from '../../hooks/useKeyOps';

export function KeyUnlocked() {
  const { ownEmail, ecdhFp, keyHasPasskey } = useApp();
  const { lockEcdh, tryPrfEnroll } = useKeyOps();

  const passkeyUrl = window.CS_CONFIG?.passkeyPopupUrl;

  return (
    <Box sx={{ px: 1.5, pt: 1.5, pb: 1 }}>
      <Box sx={{
        borderRadius: 2,
        bgcolor: 'success.light',
        borderLeft: '3px solid',
        borderLeftColor: 'success.main',
        p: 1.5,
        mb: 1,
      }}>
        {/* Status header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Box sx={{
            width: 8, height: 8, borderRadius: '50%',
            bgcolor: 'success.main', flexShrink: 0,
          }} />
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'success.dark', letterSpacing: 0.5 }}>
            KEY ACTIVE
          </Typography>
          <Chip
            label="ECDH P-256"
            size="small"
            sx={{
              ml: 'auto', fontSize: '0.625rem', height: 18,
              bgcolor: 'success.main', color: 'primary.contrastText', fontWeight: 700,
            }}
          />
        </Box>

        {/* Details table */}
        <Table size="small" sx={{ '& td': { border: 0, py: 0.25, px: 0, fontSize: '0.75rem' } }}>
          <TableBody>
            <TableRow>
              <TableCell sx={{ color: 'text.secondary', width: 70 }}>Email</TableCell>
              <TableCell sx={{ wordBreak: 'break-all' }}>{ownEmail || '—'}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell sx={{ color: 'text.secondary' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <FingerprintIcon sx={{ fontSize: 12 }} /> SHA-256
                </Box>
              </TableCell>
              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.6875rem', wordBreak: 'break-all' }}>
                {ecdhFp || '—'}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Box>

      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button variant="outlined" size="small" startIcon={<LockIcon />} onClick={lockEcdh} sx={{ flex: 1 }}>
          Lock
        </Button>
        {passkeyUrl && (
          <Button variant="outlined" size="small" startIcon={<KeyIcon />} onClick={tryPrfEnroll} sx={{ flex: 1, fontSize: '0.6875rem' }}>
            {keyHasPasskey ? 'Re-enroll passkey' : 'Enable passkey'}
          </Button>
        )}
      </Box>
    </Box>
  );
}
