import { Backdrop, Box, LinearProgress } from '@mui/material';
import { useApp } from '../../context/AppContext';

export function LoadingOverlay() {
  const { loading } = useApp();
  return (
    <>
      <Backdrop
        open={loading}
        sx={{ position: 'absolute', zIndex: 1000, bgcolor: 'rgba(255,255,255,0.6)' }}
      />
      {loading && (
        <Box
          sx={{
            position: 'fixed',
            bottom: 40,
            left: 0,
            right: 0,
            px: 2,
            zIndex: 1001,
          }}
        >
          <LinearProgress sx={{ borderRadius: 4, height: 3 }} />
        </Box>
      )}
    </>
  );
}
