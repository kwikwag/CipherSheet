import { Alert, Snackbar } from '@mui/material';
import { useApp } from '../../context/AppContext';

export function AppSnackbar() {
  const { toast, dismissToast } = useApp();
  if (!toast) return null;

  const autoHideDuration = toast.persistent ? null : (
    toast.severity === 'warning' || toast.severity === 'error' ? null : 3200
  );

  return (
    <Snackbar
      open
      autoHideDuration={autoHideDuration}
      onClose={dismissToast}
      sx={{ position: 'fixed', bottom: 8, left: 8, right: 8, width: 'auto' }}
    >
      <Alert
        severity={toast.severity}
        onClose={dismissToast}
        sx={{ width: '100%', fontSize: '0.75rem', py: 0 }}
      >
        {toast.message}
      </Alert>
    </Snackbar>
  );
}
