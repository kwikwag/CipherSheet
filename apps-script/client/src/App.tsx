import { useState, useEffect } from 'react';
import { useApp } from './context/AppContext';
import { sha256hex } from './utils/crypto';
import { Box, CssBaseline } from '@mui/material';
import { AppProvider } from './context/AppContext';
import { useInitApp } from './hooks/useInitApp';
import { useCellOps } from './hooks/useCellOps';
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
  const { cellView, editors, ecdhPrivKey } = useApp();
  const { renderCell } = useCellOps();
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [unknownRecipientCount, setUnknownRecipientCount] = useState(0);

  // Re-render the current cell whenever the key changes (lock/unlock/forget/load).
  // renderCell handles the null-key case by clearing plaintext and decryptError.
  useEffect(() => {
    renderCell(cellView.cell);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ecdhPrivKey]);

  useEffect(() => {
    const { recipientHashes } = cellView;
    if (recipientHashes.size === 0) {
      // Plaintext or empty cell: default to all editors with keys
      const withKey = editors.filter(e => e.pubKey !== undefined);
      setSelectedEmails(withKey.map(e => e.email));
      setUnknownRecipientCount(0);
      return;
    }
    (async () => {
      const editorHashes = await Promise.all(editors.map(e => sha256hex(e.email.toLowerCase())));
      const matched = editors.filter((_, i) => recipientHashes.has(editorHashes[i]));
      setSelectedEmails(matched.map(e => e.email));
      setUnknownRecipientCount(recipientHashes.size - matched.length);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cellView.recipientHashes, editors]);

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
          unknownRecipientCount={unknownRecipientCount}
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
