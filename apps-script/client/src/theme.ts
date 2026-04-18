import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1B6EF3',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#7C5EFC',
    },
    success: {
      main: '#1E8C45',
      light: '#E6F4EA',
    },
    warning: {
      main: '#E37400',
      light: '#FEF7E0',
    },
    error: {
      main: '#C5221F',
      light: '#FCE8E6',
    },
    info: {
      main: '#1B6EF3',
      light: '#E8F0FE',
    },
    background: {
      default: '#FFFFFF',
      paper: '#F8F9FF',
    },
    text: {
      primary: '#1F1F1F',
      secondary: '#5F6368',
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
        },
        sizeSmall: { minHeight: 28, padding: '2px 12px' },
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
        root: { borderRadius: 8, fontSize: '0.6875rem' },
      },
    },
    MuiPaper: {
      styleOverrides: {
        rounded: { borderRadius: 12 },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 8, padding: '4px 12px' },
        message: { fontSize: '0.75rem' },
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
    MuiIconButton: {
      styleOverrides: {
        sizeSmall: { padding: 4 },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: { borderColor: 'rgba(0,0,0,0.08)' },
      },
    },
  },
});
