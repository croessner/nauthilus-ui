import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, CircularProgress, Container, Stack, TextField, Typography, Alert, Snackbar } from '@mui/material';
import { useUser } from '../contexts/UserContext';
import { authenticatedFetch, extractErrorMessage } from '../utils/apiUtils';
import { useParams } from 'react-router-dom';
import { marked } from 'marked';

interface LegalPageData {
  key: 'imprint' | 'privacy';
  title: string;
  contentMd: string;
  updatedAt?: string;
  updatedBy?: string;
}

const defaultTitles: Record<'imprint' | 'privacy', string> = {
  imprint: 'Imprint',
  privacy: 'Privacy Policy',
};

const LegalPage: React.FC = () => {
  const { key } = useParams<{ key: 'imprint' | 'privacy' }>();
  const pageKey = (key === 'privacy' ? 'privacy' : 'imprint') as 'imprint' | 'privacy';

  const { user } = useUser();
  const isAdmin = !!user && user.roles.includes('admin');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' | 'warning' }>({
    open: false,
    message: '',
    severity: 'info',
  });

  const [data, setData] = useState<LegalPageData>({
    key: pageKey,
    title: defaultTitles[pageKey],
    contentMd: '',
  });

  const [editMode, setEditMode] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [contentInput, setContentInput] = useState('');

  // Load page content
  useEffect(() => {
    let abort = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const resp = await authenticatedFetch(`/api/legal/${pageKey}`);
        if (!resp.ok) {
          const msg = await extractErrorMessage(resp);
          return Promise.reject(new Error(msg));
        }
        const json = await resp.json();
        if (!abort) {
          const payload: LegalPageData = {
            key: pageKey,
            title: json.title || defaultTitles[pageKey],
            contentMd: json.contentMd || '',
            updatedAt: json.updatedAt,
            updatedBy: json.updatedBy,
          };
          setData(payload);
          setTitleInput(payload.title);
          setContentInput(payload.contentMd);
        }
      } catch (e: any) {
        if (!abort) setError(e?.message || 'Failed to load page');
      } finally {
        if (!abort) setLoading(false);
      }
    })();
    return () => {
      abort = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageKey]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      const resp = await authenticatedFetch(`/api/legal/${pageKey}`, {
        method: 'PUT',
        body: JSON.stringify({ title: titleInput, contentMd: contentInput }),
      });
      if (!resp.ok) {
        const msg = await extractErrorMessage(resp);
        return Promise.reject(new Error(msg));
      }
      const json = await resp.json();

      // Notify app to refresh menu titles (may have changed)
      const savedTitle = json.title || titleInput;
      window.dispatchEvent(new CustomEvent('legal:updated', { detail: { key: pageKey, title: savedTitle } }));

      // Refresh the page content from server to reflect canonical saved state
      try {
        const fresh = await authenticatedFetch(`/api/legal/${pageKey}`);
        if (fresh.ok) {
          const freshJson = await fresh.json();
          const refreshed: LegalPageData = {
            key: pageKey,
            title: freshJson.title || savedTitle,
            contentMd: freshJson.contentMd ?? contentInput,
            updatedAt: freshJson.updatedAt,
            updatedBy: freshJson.updatedBy,
          };
          setData(refreshed);
        } else {
          // Fallback to local data if refresh fails
          const updated: LegalPageData = {
            key: pageKey,
            title: savedTitle,
            contentMd: json.contentMd ?? contentInput,
            updatedAt: json.updatedAt,
            updatedBy: json.updatedBy,
          };
          setData(updated);
        }
      } catch {
        // Network or other error during refresh; fall back to local update
        const updated: LegalPageData = {
          key: pageKey,
          title: savedTitle,
          contentMd: json.contentMd ?? contentInput,
          updatedAt: json.updatedAt,
          updatedBy: json.updatedBy,
        };
        setData(updated);
      }

      // Exit edit mode so the user sees the refreshed, persisted content
      setEditMode(false);

      // Show success notification similar to Brute-Force
      setNotification({ open: true, message: 'Erfolgreich gespeichert.', severity: 'success' });
    } catch (e: any) {
      const msg = e?.message || 'Failed to save';
      setError(msg);
      setNotification({ open: true, message: msg, severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const html = useMemo(() => {
    try {
      return marked.parse(data.contentMd || '');
    } catch {
      return '';
    }
  }, [data.contentMd]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ ml: 0, mr: 'auto' }} >
      <Stack spacing={2}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          {editMode ? (
            <TextField
              label="Title"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              fullWidth
            />
          ) : (
            <Typography variant="h4">{data.title || defaultTitles[pageKey]}</Typography>
          )}
          {isAdmin && (
            <Box sx={{ display: 'flex', gap: 1 }}>
              {!editMode ? (
                <Button variant="outlined" onClick={() => setEditMode(true)}>Edit</Button>
              ) : (
                <>
                  <Button disabled={saving} onClick={() => { setEditMode(false); setTitleInput(data.title); setContentInput(data.contentMd); }}>Cancel</Button>
                  <Button variant="contained" disabled={saving} onClick={handleSave}>Save</Button>
                </>
              )}
            </Box>
          )}
        </Box>

        {error && (
          <Alert severity="error" variant="outlined">{error}</Alert>
        )}

        {!editMode ? (
          <Box sx={{ p: { xs: 1, sm: 2, md: 3 }, backgroundColor: 'transparent' }}>
            {data.contentMd ? (
              <div dangerouslySetInnerHTML={{ __html: html }} />
            ) : (
              <Typography variant="body1" color="text.secondary">No content yet.</Typography>
            )}
          </Box>
        ) : (
          <TextField
            label="Content (Markdown)"
            value={contentInput}
            onChange={(e) => setContentInput(e.target.value)}
            fullWidth
            multiline
            minRows={10}
          />
        )}

        {data.updatedAt && (
          <Typography variant="caption" color="text.secondary">
            Last updated: {new Date(data.updatedAt).toLocaleString()} {data.updatedBy ? `by ${data.updatedBy}` : ''}
          </Typography>
        )}
      </Stack>

      {/* Snackbar notifications to align with Brute-Force behavior */}
      <Snackbar
        open={notification.open}
        autoHideDuration={6000}
        onClose={() => setNotification({ ...notification, open: false })}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert onClose={() => setNotification({ ...notification, open: false })} severity={notification.severity} sx={{ width: '100%' }}>
          {notification.message}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default LegalPage;
