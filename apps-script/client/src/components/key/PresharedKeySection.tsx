import { Box, Button, Chip, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import { useApp } from '../../context/AppContext';
import { usePresharedKey } from '../../hooks/usePresharedKey';
import { fingerprint } from '../../utils/crypto';
import { useEffect, useState } from 'react';

export function PresharedKeySection() {
  const { presharedKey } = useApp();
  const { clearPresharedKey } = usePresharedKey();
  const [fp, setFp] = useState('');

  useEffect(() => {
    if (!presharedKey) { setFp(''); return; }
    crypto.subtle.exportKey('raw', presharedKey)
      .then(raw => fingerprint(new Uint8Array(raw)))
      .then(setFp)
      .catch(() => setFp(''));
  }, [presharedKey]);

  if (!presharedKey) return null;

  return (
    <Box sx={{ px: 1.5, pb: 1 }}>
      <Box sx={{
        borderRadius: 1.5,
        bgcolor: 'background.paper',
        borderLeft: '3px solid',
        borderLeftColor: 'primary.main',
        p: 1.5,
        mb: 1,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
          <VpnKeyIcon sx={{ fontSize: 15, color: 'primary.main' }} />
          <Typography variant="subtitle2" sx={{ color: 'text.primary' }}>
            Pre-shared key
          </Typography>
          <Chip
            label="AES-256-GCM"
            size="small"
            sx={{
              ml: 'auto', height: 18, fontSize: '0.625rem', fontWeight: 600,
              bgcolor: 'primary.light', color: 'success.dark',
            }}
          />
        </Box>

        <Table size="small" sx={{ '& td': { border: 0, py: 0.25, px: 0, fontSize: '0.75rem' } }}>
          <TableBody>
            <TableRow>
              <TableCell sx={{ color: 'text.secondary', width: 70 }}>SHA-256</TableCell>
              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.6875rem', wordBreak: 'break-all' }}>
                {fp || '—'}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Box>

      <Button variant="outlined" size="small" onClick={clearPresharedKey} sx={{ fontSize: '0.6875rem' }}>
        Unload key
      </Button>
    </Box>
  );
}
