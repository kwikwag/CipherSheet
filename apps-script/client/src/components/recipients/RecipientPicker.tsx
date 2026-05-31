import { useEffect, useState } from 'react';
import {
  Box, Checkbox, Chip, Collapse, FormControlLabel,
  IconButton, Tooltip, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import GroupIcon from '@mui/icons-material/Group';
import { useApp } from '../../context/AppContext';
import { useCacheOps } from '../../hooks/useCacheOps';
import { useCellOps } from '../../hooks/useCellOps';

interface RecipientPickerProps {
  selectedEmails: string[];
  onSelectionChange: (emails: string[]) => void;
}

const NO_KEY_TOOLTIP = "No registered public key — this person can't receive encrypted data until they open CipherSheet and generate a key.";

export function RecipientPicker({ selectedEmails, onSelectionChange }: RecipientPickerProps) {
  const { ecdhPrivKey, cellIsEncrypted, pubKeyCache, noKeyEditors } = useApp();
  const { getRecipientSummary } = useCellOps();
  const { refreshPubKeyCache } = useCacheOps();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState('');

  const visible = ecdhPrivKey !== null && !cellIsEncrypted && pubKeyCache.length > 0;

  // Initialize all selected when cache changes
  useEffect(() => {
    if (pubKeyCache.length > 0 && selectedEmails.length === 0) {
      onSelectionChange(pubKeyCache.map(e => e.email));
    }
  }, [pubKeyCache]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update summary when selection changes
  useEffect(() => {
    getRecipientSummary(selectedEmails).then(setSummary);
  }, [selectedEmails, getRecipientSummary]);

  if (!visible) return null;

  const handleToggle = (email: string, checked: boolean) => {
    const next = checked
      ? [...selectedEmails, email]
      : selectedEmails.filter(e => e !== email);
    onSelectionChange(next);
  };

  return (
    <Box sx={{ px: 1.5, py: 0.75 }}>
      {/* Header row */}
      <Box
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.5,
          cursor: 'pointer', userSelect: 'none',
        }}
        onClick={() => { if (!open) refreshPubKeyCache(); setOpen(!open); }}
      >
        <GroupIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
        <Typography variant="caption" color="text.secondary">Visible to:</Typography>
        <Chip
          label={summary}
          size="small"
          sx={{ ml: 0.5, height: 20, fontSize: '0.6875rem', bgcolor: 'background.paper' }}
        />
        <IconButton
          size="small"
          sx={{
            ml: 'auto', p: 0.25,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        >
          <ExpandMoreIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>

      {/* Recipient list */}
      <Collapse in={open}>
        <Box sx={{ mt: 0.5, maxHeight: 140, overflowY: 'auto' }}>
          {pubKeyCache.map(({ email }) => (
            <Box
              key={email}
              sx={{
                display: 'flex', alignItems: 'center',
                py: 0.25, borderRadius: 1,
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <FormControlLabel
                sx={{ flex: 1, mr: 0, ml: 0, '& .MuiFormControlLabel-label': { fontSize: '0.75rem', ml: 0.5 } }}
                control={
                  <Checkbox
                    checked={selectedEmails.includes(email)}
                    onChange={e => handleToggle(email, e.target.checked)}
                    size="small"
                  />
                }
                label={email}
              />
            </Box>
          ))}
          {noKeyEditors.map(email => (
            <Box
              key={email}
              sx={{
                display: 'flex', alignItems: 'center',
                py: 0.25, borderRadius: 1,
              }}
            >
              <FormControlLabel
                sx={{ flex: 1, mr: 0, ml: 0, '& .MuiFormControlLabel-label': { fontSize: '0.75rem', ml: 0.5, color: 'text.disabled' } }}
                control={<Checkbox size="small" disabled />}
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Tooltip title={NO_KEY_TOOLTIP} placement="top" arrow>
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'warning.main', flexShrink: 0, cursor: 'help' }} />
                    </Tooltip>
                    {email}
                  </Box>
                }
              />
            </Box>
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}
