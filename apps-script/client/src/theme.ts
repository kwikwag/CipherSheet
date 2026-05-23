import { createTheme } from '@mui/material/styles';

// Brand greens derived from logo gradient: #056A46 → #19B457
// Neutrals derived from logo background: #032C36 (deep teal-black)

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#0E8040',   // darkened from #19B457 to guarantee ≥4.5:1 on white
      dark: '#096B34',
      light: '#D6F5E3',
      contrastText: '#FFFFFF',
    },
    error: {
      main: '#BA1A1A',
      light: '#FFDAD6',
      dark: '#410002',
      contrastText: '#FFFFFF',
    },
    warning: {
      main: '#B45309',
      light: '#FEF3C7',
      dark: '#431407',
      contrastText: '#FFFFFF',
    },
    // success = primary (key active) — same brand green
    success: {
      main: '#0E8040',
      light: '#D6F5E3',
      dark: '#056A46',
      contrastText: '#FFFFFF',
    },
    background: {
      default: '#FFFFFF',
      paper: '#F4F8F6',  // very subtly teal-tinted white; used for header/footer
    },
    text: {
      primary: '#032C36',
      secondary: '#4D7066',  // readable teal-green; enough contrast on both white and paper
    },
    divider: '#D0DDD9',
    action: {
      // MD3: disabled content = onSurface @ 38%, disabled container = onSurface @ 12%
      // #32514A is dark enough for 4.5:1 on #E8EFED (light teal-gray container)
      disabled: '#32514A',
      disabledBackground: '#E8EFED',
    },
  },
  shape: {
    borderRadius: 12,
  },
  typography: {
    fontFamily: '"Google Sans", "Roboto", "Arial", sans-serif',
    fontSize: 13,
    body1: { fontSize: '0.8125rem', lineHeight: 1.5 },
    body2: { fontSize: '0.75rem', lineHeight: 1.4 },
    caption: { fontSize: '0.6875rem', lineHeight: 1.3 },
    h6: { fontSize: '0.875rem', fontWeight: 600, lineHeight: 1.4 },
    subtitle1: { fontSize: '0.8125rem', fontWeight: 600 },
    subtitle2: { fontSize: '0.75rem', fontWeight: 600 },
    button: { fontSize: '0.8125rem', textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        '*': { boxSizing: 'border-box' },
        html: { fontSize: 16 },
        body: { margin: 0, padding: 0 },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 20,
          fontWeight: 600,
          minHeight: 32,
          padding: '4px 16px',
          backgroundImage: 'none',  // override Google Apps Script iframe's injected gradient
          transition: 'background-color 0.15s, color 0.15s, border-color 0.15s',
        },
        sizeSmall: { minHeight: 28, padding: '2px 12px' },
        // MD3 outlined: primary label + visible outline border (not divider-light)
        outlined: {
          borderColor: '#79918C',   // mid-tone teal — MD3 "outline" role, visible on white
          '&:hover': {
            borderColor: '#0E8040',
            backgroundColor: 'rgba(14, 128, 64, 0.08)',
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          transition: 'background-color 0.15s, color 0.15s',
        },
        sizeSmall: { padding: 4 },
      },
    },
    MuiTextField: {
      defaultProps: { size: 'small', variant: 'outlined' },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { borderRadius: 8 },
      },
    },
    MuiChip: {
      styleOverrides: {
        // Pill shape for interactive chips (cell ref, recipient summary)
        // Rectangle with radius for label chips (tech spec badges)
        root: { borderRadius: 8, fontSize: '0.6875rem' },
        sizeSmall: { height: 22 },
      },
    },
    MuiPaper: {
      styleOverrides: {
        rounded: { borderRadius: 12 },
      },
    },
    MuiCheckbox: {
      defaultProps: { size: 'small' },
    },
    MuiListItem: {
      styleOverrides: {
        root: { paddingTop: 2, paddingBottom: 2 },
      },
    },
    MuiSnackbar: {
      defaultProps: { anchorOrigin: { vertical: 'bottom', horizontal: 'center' } },
    },
    MuiSnackbarContent: {
      styleOverrides: {
        root: { borderRadius: 8, fontSize: '0.8125rem', minWidth: 'unset' },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: { borderRadius: 4 },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: { borderColor: 'var(--mui-palette-divider)' },
      },
    },
  },
});
