import { Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Typography } from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import type { KeyConflict } from '../../hooks/useKeyOps';

interface KeyConflictDialogProps {
  conflict: KeyConflict | null;
  onConfirm: () => void;
  onClose: () => void;
}

export function KeyConflictDialog({ conflict, onConfirm, onClose }: KeyConflictDialogProps) {
  return (
    <Dialog open={!!conflict} onClose={onClose}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <WarningAmberIcon color="warning" fontSize="small" />
        Replace registered key?
      </DialogTitle>
      <DialogContent>
        <DialogContentText component="div">
          {conflict?.isGenerate ? (
            <>
              <Typography variant="body2" gutterBottom>
                You already have a key registered with this document (fingerprint{' '}
                <Box component="span" sx={{ fontFamily: 'monospace' }}>
                  {conflict.registeredFp.slice(0, 9)}…
                </Box>
                ). Generating a new key will replace it.
              </Typography>
              <Typography variant="body2" color="error">
                Cells previously encrypted for you will be unreadable with this new key.
                To read those cells, import the key associated with this document.
              </Typography>
            </>
          ) : (
            <>
              <Typography variant="body2" gutterBottom>
                The key you are importing (fingerprint{' '}
                <Box component="span" sx={{ fontFamily: 'monospace' }}>
                  {conflict?.incomingFp.slice(0, 9)}…
                </Box>
                ) is different from the one registered with this document (fingerprint{' '}
                <Box component="span" sx={{ fontFamily: 'monospace' }}>
                  {conflict?.registeredFp.slice(0, 9)}…
                </Box>
                ).
              </Typography>
              <Typography variant="body2" gutterBottom>
                If you meant to restore your existing key, cancel and import the correct backup file.
              </Typography>
              <Typography variant="body2" color="error">
                Confirming will register the new key — cells encrypted with the old key will not
                be readable using this key.
              </Typography>
            </>
          )}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button color="error" variant="contained" onClick={onConfirm}>
          {conflict?.isGenerate ? 'Generate new key' : 'Import anyway'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
