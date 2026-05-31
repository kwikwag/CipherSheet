import { useEffect, useState } from 'react';
import {
  Alert, Box, Checkbox, Chip, Collapse, FormControlLabel,
  IconButton, Tooltip, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import GroupIcon from '@mui/icons-material/Group';
import { useApp } from '../../context/AppContext';
import { useCacheOps } from '../../hooks/useCacheOps';
import { useCellOps } from '../../hooks/useCellOps';
import { isPubKeyEntry } from '../../types';
import { EmailLabel } from '../common/EmailLabel';

interface RecipientPickerProps {
  selectedEmails: string[];
  onSelectionChange: (emails: string[]) => void;
  unknownRecipientCount: number;
}

const NO_KEY_TOOLTIP = "No registered public key — this person can't receive encrypted data until they open CipherSheet and generate a key.";

export function RecipientPicker({ selectedEmails, onSelectionChange, unknownRecipientCount }: RecipientPickerProps) {
  const { canEncrypt, editors } = useApp();
  const { getRecipientSummary } = useCellOps();
  const { refreshEditors } = useCacheOps();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState('');

  const withKey = editors.filter(isPubKeyEntry);
  const withoutKey = editors.filter(e => !isPubKeyEntry(e));
  const visible = canEncrypt && withKey.length > 0;

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
      {unknownRecipientCount > 0 && (
        <Alert severity="warning" sx={{ mb: 0.75, py: 0.25, fontSize: '0.75rem' }}>
          {unknownRecipientCount === 1
            ? 'This cell was also visible to 1 former collaborator who is no longer in the editor list. Re-encrypting will revoke their access.'
            : `This cell was also visible to ${unknownRecipientCount} former collaborators who are no longer in the editor list. Re-encrypting will revoke their access.`}
        </Alert>
      )}
      {/* Header row */}
      <Box
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.5,
          cursor: 'pointer', userSelect: 'none',
        }}
        onClick={() => { if (!open) refreshEditors(); setOpen(!open); }}
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
          {withKey.map(editor => (
            <Box
              key={editor.email}
              sx={{
                display: 'flex', alignItems: 'center',
                py: 0.25, borderRadius: 1,
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <FormControlLabel
                sx={{ flex: 1, mr: 0, ml: 0, '& .MuiFormControlLabel-label': { ml: 0.5 } }}
                control={
                  <Checkbox
                    checked={selectedEmails.includes(editor.email)}
                    onChange={e => handleToggle(editor.email, e.target.checked)}
                    size="small"
                  />
                }
                label={<EmailLabel editor={editor} />}
              />
            </Box>
          ))}
          {withoutKey.map(editor => (
            <Box
              key={editor.email}
              sx={{
                display: 'flex', alignItems: 'center',
                py: 0.25, borderRadius: 1,
              }}
            >
              <FormControlLabel
                sx={{ flex: 1, mr: 0, ml: 0, '& .MuiFormControlLabel-label': { ml: 0.5 } }}
                control={<Checkbox size="small" disabled />}
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Tooltip title={NO_KEY_TOOLTIP} placement="top" arrow>
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'warning.main', flexShrink: 0, cursor: 'help' }} />
                    </Tooltip>
                    <EmailLabel editor={editor} disabled />
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
