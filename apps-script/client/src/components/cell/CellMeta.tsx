import { Box, Chip, IconButton, Tooltip, Typography } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SettingsIcon from '@mui/icons-material/Settings';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useApp } from '../../context/AppContext';
import { useCellOps } from '../../hooks/useCellOps';
import { gasRun } from '../../utils/gas';

export function CellMeta() {
  const { currentCell, showToast } = useApp();
  const { refreshCell } = useCellOps();

  const navigateToCell = () => {
    if (!currentCell) return;
    gasRun('navigateToCell', currentCell.cellRef, currentCell.sheetName)
      .catch(e => showToast('Navigation failed: ' + (e as Error).message, 'error'));
  };

  const openSettings = () => {
    gasRun('showSettings')
      .catch(e => showToast('Settings failed: ' + (e as Error).message, 'error'));
  };

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1.5,
        py: 0.75,
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.default',
        minHeight: 40,
      }}
    >
      <Chip
        label={currentCell?.cellRef ?? '—'}
        size="small"
        onClick={navigateToCell}
        icon={<OpenInNewIcon sx={{ fontSize: '0.75rem !important' }} />}
        sx={{
          fontSize: '0.75rem',
          fontWeight: 600,
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          cursor: currentCell ? 'pointer' : 'default',
          '& .MuiChip-icon': { color: 'inherit' },
          '&:hover': { bgcolor: 'primary.dark' },
          transition: 'background-color 0.15s',
        }}
      />
      {currentCell?.sheetName && (
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1, ml: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {currentCell.sheetName}
        </Typography>
      )}
      <Box sx={{ ml: 'auto', display: 'flex' }}>
        <Tooltip title="Settings" placement="bottom">
          <IconButton size="small" onClick={openSettings}>
            <SettingsIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Refresh" placement="bottom">
          <IconButton size="small" onClick={refreshCell}>
            <RefreshIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}
