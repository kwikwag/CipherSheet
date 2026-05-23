import { Box, Link, Typography } from '@mui/material';
import { gasRun } from '../../utils/gas';

export function Footer() {
  const cfg = window.CS_CONFIG;
  return (
    <Box
      sx={{
        px: 1.5, py: 1,
        borderTop: '1px solid', borderColor: 'divider',
        bgcolor: 'background.default',
      }}
    >
      <Typography variant="caption" display="block" color="text.secondary" sx={{ mb: 0.5 }}>
        Open-sourced by an independent developer
        {cfg?.appVersion ? ` · v${cfg.appVersion}` : ''}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
        <Link
          href="#"
          variant="caption"
          underline="hover"
          color="text.secondary"
          onClick={(e) => { e.preventDefault(); gasRun('showOnboarding'); }}
        >
          How to use
        </Link>
        {[
          cfg?.feedbackUrl ? { label: 'Feedback', href: cfg.feedbackUrl } : null,
          cfg?.donateUrl ? { label: 'Donate', href: cfg.donateUrl } : null,
          cfg?.privacyUrl ? { label: 'Privacy', href: cfg.privacyUrl } : null,
        ].filter(Boolean).map(item => (
          <Link
            key={item!.label}
            href={item!.href}
            target="_blank"
            rel="noopener"
            variant="caption"
            underline="hover"
            color="text.secondary"
          >
            {item!.label}
          </Link>
        ))}
      </Box>
    </Box>
  );
}
