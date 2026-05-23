import React, { useRef, useState } from 'react';
import { Box, Button, TextField, Typography } from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import KeyIcon from '@mui/icons-material/Key';
import { useApp } from '../../context/AppContext';
import { useCellOps } from '../../hooks/useCellOps';
import { useKeyOps } from '../../hooks/useKeyOps';
import { usePresharedKey } from '../../hooks/usePresharedKey';

interface CellEditorProps {
  selectedRecipients: string[];
}

export function CellEditor({ selectedRecipients }: CellEditorProps) {
  const {
    canEncrypt, cellIsEncrypted, keyInStorage, presharedKey,
    ecdhPrivKey, pubKeyCache,
  } = useApp();
  const { plaintext, setPlaintext, encryptAndSave, requestUnprotect } = useCellOps();
  const { loadKeyFile } = useKeyOps();
  const { activatePresharedKey } = usePresharedKey();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await loadKeyFile(file, activatePresharedKey);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!canEncrypt) { e.preventDefault(); setIsDragOver(true); }
  };
  const handleDragLeave = () => setIsDragOver(false);
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (canEncrypt) return;
    const file = e.dataTransfer.files[0];
    if (file) await loadKeyFile(file, activatePresharedKey);
  };

  const handleProtect = () => {
    const recipients = ecdhPrivKey
      ? pubKeyCache.filter(r => selectedRecipients.includes(r.email))
      : [];
    encryptAndSave(plaintext, recipients);
  };

  const overlayVisible = !canEncrypt;
  const showEncryptedOverlay = overlayVisible && cellIsEncrypted;
  const showPlaintextOverlay = overlayVisible && !cellIsEncrypted;
  const verb = keyInStorage ? 'Unlock' : 'Generate';
  const noKey = !keyInStorage && !presharedKey;

  return (
    <Box sx={{ position: 'relative', px: 1.5, pt: 1 }}>
      <Box
        sx={{ position: 'relative' }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <TextField
          multiline
          minRows={3}
          maxRows={6}
          fullWidth
          value={plaintext}
          onChange={e => setPlaintext(e.target.value)}
          disabled={overlayVisible}
          sx={{
            '& .MuiOutlinedInput-root': {
              filter: overlayVisible ? 'blur(3px)' : 'none',
              transition: 'filter 0.2s',
            },
            '& textarea': { fontSize: '0.8125rem', lineHeight: 1.5 },
          }}
        />

        {/* Encrypted overlay */}
        {showEncryptedOverlay && (
          <FieldOverlay
            icon={<LockIcon sx={{ fontSize: 28, mb: 0.5 }} />}
            text={`${verb} key to decrypt`}
            subtext={noKey ? 'or drop a .ciphersheet-key file' : undefined}
            isDragOver={isDragOver}
            onFileClick={noKey ? () => fileInputRef.current?.click() : undefined}
          />
        )}

        {/* Plaintext overlay */}
        {showPlaintextOverlay && (
          <FieldOverlay
            icon={keyInStorage
              ? <LockOpenIcon sx={{ fontSize: 28, mb: 0.5 }} />
              : <KeyIcon sx={{ fontSize: 28, mb: 0.5 }} />
            }
            text={`${verb} key to encrypt`}
            subtext={noKey ? 'or drop a .ciphersheet-key file' : undefined}
            isDragOver={isDragOver}
            onFileClick={noKey ? () => fileInputRef.current?.click() : undefined}
          />
        )}

        {isDragOver && (
          <Box
            sx={{
              position: 'absolute', inset: 0,
              border: '2px dashed',
              borderColor: 'primary.main',
              borderRadius: 2,
              bgcolor: 'primary.light',
              opacity: 0.15,
              pointerEvents: 'none',
            }}
          />
        )}
      </Box>

      <input
        ref={fileInputRef}
        type="file"
        accept=".ciphersheet-key,.vaultkey,.json,.key,.txt"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Action buttons */}
      <Box sx={{ display: 'flex', gap: 1, mt: 1, mb: 0.5 }}>
        {cellIsEncrypted && (
          <Button
            variant="outlined"
            size="small"
            onClick={requestUnprotect}
            sx={{ flex: 1 }}
          >
            Unprotect
          </Button>
        )}
        <Button
          variant="contained"
          size="small"
          onClick={handleProtect}
          disabled={!canEncrypt}
          sx={{ flex: 1 }}
        >
          {cellIsEncrypted && canEncrypt ? 'Update' : 'Protect'}
        </Button>
      </Box>
    </Box>
  );
}

interface FieldOverlayProps {
  icon: React.ReactNode;
  text: string;
  subtext?: string;
  isDragOver: boolean;
  onFileClick?: () => void;
}

function FieldOverlay({ icon, text, subtext, isDragOver, onFileClick }: FieldOverlayProps) {
  return (
    <Box
      onClick={onFileClick}
      sx={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: onFileClick ? 'pointer' : 'default',
        color: 'text.secondary',
        transition: 'opacity 0.15s',
        opacity: isDragOver ? 0.6 : 1,
        '&:hover': { color: onFileClick ? 'primary.main' : 'text.secondary' },
      }}
    >
      {icon}
      <Typography variant="caption" sx={{ fontWeight: 600 }}>{text}</Typography>
      {subtext && (
        <Typography variant="caption" sx={{ opacity: 0.7, mt: 0.25 }}>{subtext}</Typography>
      )}
    </Box>
  );
}
