import { useState } from 'react';
import { Box, Chip, IconButton, Menu, MenuItem, ListItemIcon, ListItemText, Tooltip, Typography } from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import PinDropIcon from '@mui/icons-material/PinDrop';
import { useApp } from '../../context/AppContext';
import { useCellOps } from '../../hooks/useCellOps';
import { gasRun } from '../../utils/gas';

export function CellMeta() {
  const { currentCell, showToast } = useApp();
  const { refreshCell } = useCellOps();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  const handleChipClick = (e: React.MouseEvent<HTMLElement>) => {
    if (!currentCell) return;
    setMenuAnchor(e.currentTarget);
  };

  const handleClose = () => setMenuAnchor(null);

  const handleGoToAddress = () => {
    handleClose();
    if (!currentCell) return;
    gasRun('navigateToCell', currentCell.cellRef, currentCell.sheetName)
      .catch(e => showToast('Navigation failed: ' + (e as Error).message, 'error'));
  };

  const handleSyncFromSelection = () => {
    handleClose();
    refreshCell();
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
        bgcolor: 'background.paper',
        minHeight: 40,
      }}
    >
      <Chip
        label={currentCell?.cellRef ?? '—'}
        size="small"
        onClick={currentCell ? handleChipClick : undefined}
        icon={<PinDropIcon sx={{ fontSize: '0.75rem !important' }} />}
        sx={{
          fontWeight: 600,
          borderRadius: 20,
          cursor: currentCell ? 'pointer' : 'default',
          bgcolor: 'primary.light',
          color: 'success.dark',
          '& .MuiChip-icon': { color: 'success.dark' },
          transition: 'background-color 0.15s',
          '&:hover': currentCell ? { bgcolor: 'primary.main', color: 'primary.contrastText', '& .MuiChip-icon': { color: 'primary.contrastText' } } : {},
        }}
      />
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: { elevation: 2, sx: { borderRadius: 2, minWidth: 200 } } }}
      >
        <MenuItem onClick={handleGoToAddress} dense>
          <ListItemIcon><PinDropIcon fontSize="small" /></ListItemIcon>
          <ListItemText
            primary={`Go to ${currentCell?.cellRef ?? ''}`}
            secondary="Navigate sheet to this cell"
          />
        </MenuItem>
        <MenuItem onClick={handleSyncFromSelection} dense>
          <ListItemIcon><MyLocationIcon fontSize="small" /></ListItemIcon>
          <ListItemText
            primary="Sync from selection"
            secondary="Update to current sheet selection"
          />
        </MenuItem>
      </Menu>
      {currentCell?.sheetName && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ flex: 1, ml: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {currentCell.sheetName}
        </Typography>
      )}
      <Box sx={{ ml: 'auto', display: 'flex' }}>
        <Tooltip title="Settings" placement="bottom">
          <IconButton size="small" onClick={openSettings} color="inherit">
            <SettingsIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}
