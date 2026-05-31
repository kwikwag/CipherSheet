import { useEffect, useState } from 'react';
import {
  Box, Checkbox, Chip, Collapse, FormControlLabel,
  IconButton, Typography,
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

export function RecipientPicker({ selectedEmails, onSelectionChange }: RecipientPickerProps) {
  const { ecdhPrivKey, cellIsEncrypted, pubKeyCache } = useApp();
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
          {pubKeyCache.map(({ email, fp }) => (
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
              <Typography
                variant="caption"
                sx={{ fontFamily: 'monospace', color: 'text.secondary', fontSize: '0.625rem', ml: 0.5 }}
              >
                {fp.slice(0, 9)}…
              </Typography>
            </Box>
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}
