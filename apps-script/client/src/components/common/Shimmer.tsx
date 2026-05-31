import { Box } from '@mui/material';
import { useApp } from '../../context/AppContext';
import type { LoadingPart } from '../../context/AppContext';

interface ShimmerProps {
  part: LoadingPart;
  children: React.ReactNode;
}

export function Shimmer({ part, children }: ShimmerProps) {
  const { loadingSet } = useApp();
  const loading = loadingSet.has(part);

  return (
    <Box sx={{ position: 'relative' }}>
      {children}
      {loading && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            zIndex: 10,
            borderRadius: 1,
            overflow: 'hidden',
            background: theme => `linear-gradient(
              90deg,
              transparent 0%,
              ${theme.palette.action.selected} 50%,
              transparent 100%
            )`,
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.4s infinite',
            '@keyframes shimmer': {
              '0%': { backgroundPosition: '200% 0' },
              '100%': { backgroundPosition: '-200% 0' },
            },
          }}
        />
      )}
    </Box>
  );
}
