import { useRef } from 'react';
import { Box, Button, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useKeyOps } from '../../hooks/useKeyOps';
import { usePresharedKey } from '../../hooks/usePresharedKey';
import { useCacheOps } from '../../hooks/useCacheOps';

export function KeySetup() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { generateKey, loadKeyFile } = useKeyOps();
  const { activatePresharedKey } = usePresharedKey();
  const { refreshPubKeyCache } = useCacheOps();

  const handleGenerate = async () => {
    await generateKey(async (bytes) => {
      await activatePresharedKey(bytes);
    });
    await refreshPubKeyCache();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) {
      await loadKeyFile(file, activatePresharedKey);
      await refreshPubKeyCache();
    }
  };

  return (
    <Box sx={{ px: 1.5, pt: 1.5, pb: 1 }}>
      <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
        Encryption key
      </Typography>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button
          variant="contained"
          size="small"
          startIcon={<AddIcon />}
          onClick={handleGenerate}
          sx={{ flex: 1 }}
        >
          Generate key
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
    </Box>
  );
}
