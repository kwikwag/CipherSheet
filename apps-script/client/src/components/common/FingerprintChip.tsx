import { Chip } from '@mui/material';
import FingerprintIcon from '@mui/icons-material/Fingerprint';

interface FingerprintChipProps {
  fp: string;
  /** Prepended to the full fingerprint in the tooltip. Defaults to 'ECDH P-256'. */
  tooltipPrefix?: string;
  sx?: object;
}

/**
 * Compact fingerprint chip: shows first 9 chars (8 hex + dash) via CSS ellipsis.
 * The full text is selectable and the title provides a hover tooltip.
 */
export function FingerprintChip({ fp, tooltipPrefix = 'ECDH P-256', sx }: FingerprintChipProps) {
  const tooltip = `${tooltipPrefix}\n${fp}`;
  return (
    <Chip
      icon={<FingerprintIcon sx={{ fontSize: '0.75rem !important' }} />}
      label={fp}
      size="small"
      title={tooltip}
      sx={{
        fontSize: '0.6875rem',
        height: 20,
        flexShrink: 0,
        '& .MuiChip-label': {
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: 'block',
          whiteSpace: 'nowrap',
          fontFamily: 'monospace',
          userSelect: 'text',
          cursor: 'text',
          padding: '0 1ch',
          // 8 first hex digits of fingerprint + 1 character dash + 1 character ellipsis + compensate for 2x1ch padding
          width: '12ch',
        },
        ...sx,
      }}
    />
  );
}
