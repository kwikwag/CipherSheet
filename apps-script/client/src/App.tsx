import { useState } from 'react';
import { Box, CssBaseline } from '@mui/material';
import { AppProvider } from './context/AppContext';
import { useInitApp } from './hooks/useInitApp';
import { CellMeta } from './components/cell/CellMeta';
import { CellEditor } from './components/cell/CellEditor';
import { RecipientPicker } from './components/recipients/RecipientPicker';
import { KeySection } from './components/key/KeySection';
import { PasswordSetupBox } from './components/key/PasswordSetupBox';
import { Footer } from './components/footer/Footer';
import { LoadingOverlay } from './components/common/LoadingOverlay';
import { AppSnackbar } from './components/common/AppSnackbar';

function AppInner() {
  useInitApp();
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        position: 'relative',
        bgcolor: 'background.default',
        fontFamily: 'typography.fontFamily',
      }}
    >
      <CellMeta />
      <Box sx={{ flex: 1, overflowY: 'auto', pb: 6 }}>
        <CellEditor selectedRecipients={selectedEmails} />
        <RecipientPicker
          selectedEmails={selectedEmails}
          onSelectionChange={setSelectedEmails}
        />
        <KeySection />
        <PasswordSetupBox />
      </Box>
      <Footer />

      {/* Hidden password manager form */}
      <PasswordManagerForm />

      <LoadingOverlay />
      <AppSnackbar />
    </Box>
  );
}

function PasswordManagerForm() {
  // This invisible form exists solely to trigger browser password-save suggestions
  // when we programmatically set its value and submit.
  return (
    <Box
      component="form"
      id="pwSaveForm"
      sx={{ display: 'none' }}
      onSubmit={e => e.preventDefault()}
    >
      <input
        id="pwSaveInput"
        type="password"
        name="password"
        autoComplete="current-password"
      />
    </Box>
  );
}

export function App() {
  return (
    <AppProvider>
      <CssBaseline />
      <AppInner />
    </AppProvider>
  );
}
