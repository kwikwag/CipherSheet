import { useState } from 'react';
import { useApp } from './context/AppContext';
import { Box, CssBaseline } from '@mui/material';
import { AppProvider } from './context/AppContext';
import { useInitApp } from './hooks/useInitApp';
import { CellMeta } from './components/cell/CellMeta';
import { CellEditor } from './components/cell/CellEditor';
import { RecipientPicker } from './components/recipients/RecipientPicker';
import { KeySection } from './components/key/KeySection';
import { PasswordSetupBox } from './components/key/PasswordSetupBox';
import { Footer } from './components/footer/Footer';
import { Shimmer } from './components/common/Shimmer';
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
      <Shimmer part="cell"><CellMeta /></Shimmer>
      <Box sx={{ flex: 1, overflowY: 'auto', pb: 6 }}>
        <Shimmer part="cell">
          <CellEditor selectedRecipients={selectedEmails} />
        </Shimmer>
        <RecipientPicker
          selectedEmails={selectedEmails}
          onSelectionChange={setSelectedEmails}
        />
        <Shimmer part="key"><KeySection /></Shimmer>
        <PasswordSetupBox />
      </Box>
      <Footer />

      {/* Hidden password manager form */}
      <PasswordManagerForm />

      <AppSnackbar />
    </Box>
  );
}

function PasswordManagerForm() {
  // This invisible form exists solely to trigger browser password-save suggestions
  // when we programmatically set its value and submit.
  const { pwSaveFormRef, pwSaveUsernameRef, pwSaveInputRef } = useApp();
  return (
    <Box
      component="form"
      ref={pwSaveFormRef}
      sx={{ display: 'none' }}
      onSubmit={e => e.preventDefault()}
    >
      <input ref={pwSaveUsernameRef} type="text" name="username" autoComplete="username" />
      <input ref={pwSaveInputRef} type="password" name="password" autoComplete="current-password" />
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
