import { Box, Typography } from '@mui/material';
import { editorDisplayName } from '../../types';
import type { EditorEntry } from '../../types';

interface EmailLabelProps {
  editor: EditorEntry;
  disabled?: boolean;
}

export function EmailLabel({ editor, disabled }: EmailLabelProps) {
  const hasName = Boolean(editor.name);
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
      <Typography
        variant="body2"
        sx={{ color: disabled ? 'text.disabled' : 'text.primary', fontWeight: 500 }}
      >
        {editorDisplayName(editor)}
      </Typography>
      {hasName && (
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {editor.email}
        </Typography>
      )}
    </Box>
  );
}
