import { useEffect, useState } from 'react';
import {
  Box, CircularProgress, Divider, Link,
  List, ListItem, Stack,
  TextField, Typography,
} from '@mui/material';
import type { GroupEntry } from '../types';
import { gasRun } from '../utils/gas';

interface RawPubKey { email: string; publicKey: string; }
interface RawGroup  { id: string; emailHashes: string[]; label?: string; }

const buf2hex = (b: ArrayBuffer) =>
  Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('');

const b64toBuf = (s: string) =>
  Uint8Array.from(atob(s), c => c.charCodeAt(0)).buffer;

async function spkiFingerprint(base64Spki: string): Promise<string> {
  try {
    const h = await crypto.subtle.digest('SHA-256', b64toBuf(base64Spki));
    return buf2hex(h).match(/.{8}/g)!.join('-');
  } catch { return '—'; }
}

export function SettingsApp() {
  const [loading, setLoading] = useState(true);

  const [pubKeys, setPubKeys] = useState<{ email: string; fp: string }[]>([]);
  const [groups,  setGroups]  = useState<GroupEntry[]>([]);

  useEffect(() => {
    gasRun('getDocumentSettings').then(() => {
      setLoading(false);
    }).catch(e => {
      alert('Error loading settings: ' + e.message);
    });

    gasRun<RawPubKey[]>('listPublicKeys').then(async keys => {
      const resolved = await Promise.all(
        keys.map(async ({ email, publicKey }) => ({
          email,
          fp: await spkiFingerprint(publicKey),
        }))
      );
      setPubKeys(resolved);
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
      <Box sx={{ flex: 1, px: 2, pt: 1.5, pb: 1 }}>

        <Divider sx={{ mb: 1.5 }} />

        <Typography variant="overline" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
          Registered public keys
        </Typography>
        {pubKeys.length === 0 ? (
          <Typography variant="caption" color="text.disabled">No registered public keys yet.</Typography>
        ) : (
          <List dense disablePadding>
            {pubKeys.map(({ email, fp }) => (
              <ListItem key={email} disablePadding sx={{ py: 0.25 }}>
                <Typography variant="body2" sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {email}
                </Typography>
                <Typography variant="caption" color="text.disabled" sx={{ fontFamily: 'monospace', ml: 1, flexShrink: 0 }}>
                  {fp.slice(0, 17)}…
                </Typography>
              </ListItem>
            ))}
          </List>
        )}

        <Divider sx={{ my: 1.5 }} />

        <Typography variant="overline" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
          Groups
        </Typography>
        {groups.length === 0 ? (
          <Typography variant="caption" color="text.disabled">
            Groups are automatically created when you protect a cell shared with multiple people.
          </Typography>
        ) : (
          <Stack spacing={1}>
            {groups.map(g => (
              <Box key={g.id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, p: 1 }}>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
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
      <Box sx={{ px: 2, py: 1, borderTop: '1px solid', borderColor: 'divider' }}>
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
