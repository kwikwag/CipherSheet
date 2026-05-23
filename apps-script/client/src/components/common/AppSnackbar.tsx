import { Button, Snackbar, SnackbarContent } from '@mui/material';
import { useApp } from '../../context/AppContext';

export function AppSnackbar() {
  const { toast, dismissToast } = useApp();
  if (!toast) return null;

  const autoHideDuration = toast.persistent ? null : (
    toast.severity === 'warning' || toast.severity === 'error' ? null : 3200
  );

  const action = (toast.severity === 'warning' || toast.severity === 'error' || toast.persistent)
    ? <Button size="small" onClick={dismissToast} sx={{ color: 'primary.light', fontWeight: 600 }}>Dismiss</Button>
    : undefined;

  return (
    <Snackbar
      open
      autoHideDuration={autoHideDuration}
      onClose={dismissToast}
      sx={{ position: 'fixed', bottom: 8, left: 8, right: 8, width: 'auto' }}
    >
      <SnackbarContent message={toast.message} action={action} />
    </Snackbar>
  );
}
