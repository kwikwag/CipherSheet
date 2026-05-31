import { useEffect, useState } from 'react';
import {
  Box, CircularProgress, Divider, Link,
  List, ListItem, Stack,
  TextField, Typography,
} from '@mui/material';
import { FingerprintChip } from '../components/common/FingerprintChip';
import { EmailLabel } from '../components/common/EmailLabel';
import type { EditorEntry, GroupEntry, SerializedEditorEntry } from '../types';
import { fingerprint } from '../utils/crypto';
import { b642buf } from '../utils/encoding';
import { gasRun } from '../utils/gas';

interface RawGroup  { id: string; emailHashes: string[]; label?: string; }

async function spkiFingerprint(base64Spki: string): Promise<string> {
  try {
    return await fingerprint(new Uint8Array(b642buf(base64Spki)));
  } catch { return '—'; }
}

export function SettingsApp() {
  const [loading, setLoading] = useState(true);

  const [editors, setEditors] = useState<EditorEntry[]>([]);
  const [groups,  setGroups]  = useState<GroupEntry[]>([]);

  useEffect(() => {
    gasRun('getDocumentSettings').then(() => {
      setLoading(false);
    }).catch(e => {
      alert('Error loading settings: ' + e.message);
    });

    gasRun<SerializedEditorEntry[]>('listEditors').then(async entries => {
      const resolved: EditorEntry[] = await Promise.all(
        entries.map(async ({ email, name, publicKeyBase64 }) => ({
          email, name,
          fp: publicKeyBase64 ? await spkiFingerprint(publicKeyBase64) : undefined,
        }))
      );
      setEditors(resolved);
    }).catch(() => {});

    gasRun<RawGroup[]>('listGroups').then(gs => {
      setGroups(gs.map(g => ({ id: g.id, emailHashes: g.emailHashes, label: g.label ?? '' })));
    }).catch(() => {});
  }, []);

  function saveGroupLabel(id: string, emailHashes: string[], label: string) {
    gasRun('upsertGroup', id, emailHashes, label).catch(e => {
      alert('Error saving label: ' + e.message);
    });
    setGroups(prev => prev.map(g => g.id === id ? { ...g, label } : g));
  }

  const cfg = window.CS_CONFIG;

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <Box sx={{ flex: 1, pr: 1, pt: 0, pb: 1.5 }}>

        <Typography variant="overline" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
          Registered public keys
        </Typography>
        {editors.filter(e => e.fp).length === 0 ? (
          <Typography variant="body2" color="text.disabled">No registered public keys yet.</Typography>
        ) : (
          <List dense disablePadding>
            {editors.filter(e => e.fp).map(editor => (
              <ListItem key={editor.email} disablePadding sx={{ py: 0.5 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <EmailLabel editor={editor} />
                </Box>
                <FingerprintChip fp={editor.fp!} sx={{ ml: 1, flexShrink: 0 }} />
              </ListItem>
            ))}
          </List>
        )}

        {editors.filter(e => !e.fp).length > 0 && (
          <>
            <Divider sx={{ my: 1.5 }} />
            <Typography variant="overline" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
              Missing public keys
            </Typography>
            <Typography variant="body2" color="text.secondary" display="block" sx={{ mb: 0.75 }}>
              These collaborators have no registered public key — encrypted data cannot be addressed to them until they open CipherSheet and generate one.
            </Typography>
            <List dense disablePadding>
              {editors.filter(e => !e.fp).map(editor => (
                <ListItem key={editor.email} disablePadding sx={{ py: 0.5 }}>
                  <EmailLabel editor={editor} disabled />
                </ListItem>
              ))}
            </List>
          </>
        )}

        <Divider sx={{ my: 1.5 }} />

        <Typography variant="overline" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
          Groups
        </Typography>
        {groups.length === 0 ? (
          <Typography variant="body2" color="text.disabled">
            Groups are automatically created when you protect a cell shared with multiple people.
          </Typography>
        ) : (
          <Stack spacing={1}>
            {groups.map(g => (
              <Box key={g.id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, p: 1 }}>
                <Typography variant="body2" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                  {g.emailHashes.length} member{g.emailHashes.length !== 1 ? 's' : ''}
                </Typography>
                <TextField
                  size="small"
                  fullWidth
                  placeholder="Add a label…"
                  defaultValue={g.label}
                  onBlur={e => saveGroupLabel(g.id, g.emailHashes, e.target.value.trim())}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  sx={{ '& .MuiInputBase-input': { py: 0.5, fontSize: '0.75rem' } }}
                />
              </Box>
            ))}
          </Stack>
        )}
      </Box>

      {/* Footer */}
      <Box sx={{ pr: 1, pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
        <Typography variant="caption" color="text.secondary">
          Open-sourced by an independent developer
          {cfg?.appVersion ? ` · v${cfg.appVersion}` : ''}
          {' · '}
          <Link href="#" variant="caption" color="text.secondary" underline="hover"
            onClick={e => { e.preventDefault(); gasRun('showOnboarding'); }}>
            How to use
          </Link>
          {cfg?.feedbackUrl && <>{' · '}<Link href={cfg.feedbackUrl} target="_blank" rel="noopener" variant="caption" color="text.secondary" underline="hover">Feedback</Link></>}
          {cfg?.donateUrl && <>{' · '}<Link href={cfg.donateUrl} target="_blank" rel="noopener" variant="caption" color="text.secondary" underline="hover">Donate</Link></>}
          {cfg?.privacyUrl && <>{' · '}<Link href={cfg.privacyUrl} target="_blank" rel="noopener" variant="caption" color="text.secondary" underline="hover">Privacy</Link></>}
        </Typography>
      </Box>
    </Box>
  );
}
