import { Box, Button, Chip, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material';
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
        borderRadius: 2,
        bgcolor: 'info.light',
        border: '1px solid',
        borderColor: 'primary.main',
        p: 1.5,
        mb: 1,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Box sx={{
            width: 8, height: 8, borderRadius: '50%',
            bgcolor: 'primary.main', flexShrink: 0,
          }} />
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.main', letterSpacing: 0.5 }}>
            PRE-SHARED KEY
          </Typography>
          <Chip
            label="AES-256-GCM"
            size="small"
            sx={{
              ml: 'auto', fontSize: '0.625rem', height: 18,
              bgcolor: 'primary.main', color: '#fff', fontWeight: 700,
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

      <Button
        variant="outlined"
        size="small"
        onClick={clearPresharedKey}
        color="inherit"
        sx={{ fontSize: '0.6875rem' }}
      >
        Unload
      </Button>
    </Box>
  );
}
