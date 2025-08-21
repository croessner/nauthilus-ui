import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  TextField,
  Button,
  MenuItem,
  Divider,
  Alert,
  Tooltip,
  IconButton,
  Chip,
  Stack,
  CircularProgress,
  Snackbar,
  Switch,
  FormControlLabel
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import LinkIcon from '@mui/icons-material/Link';
import { useConfig } from '../contexts/ConfigContext';
import { useRuntime, getCurrentUserId } from '../contexts/RuntimeContext';
import { authenticatedFetch, extractErrorMessage, getProxyOrigin, prepareAuthParams, getAuthToken } from '../utils/apiUtils';

const METHODS = ['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'] as const;

type Method = typeof METHODS[number];

type KV = { key: string; value: string; id: string };

const pretty = (v: any) => {
  try { return JSON.stringify(typeof v === 'string' ? JSON.parse(v) : v, null, 2); } catch { return String(v); }
};

const parseMaybe = (text: string) => {
  try { return JSON.parse(text); } catch { return text; }
};

const storageKey = (username: string) => `ui:hooktester:last:${username}`;

const HookTester: React.FC = () => {
  const { currentProfileName } = useConfig();
  const { connection: runtimeConnection, hooks: runtimeHooks, loadRuntimeSettings } = useRuntime();

  const [method, setMethod] = useState<Method>('POST');
  const [endpointPath, setEndpointPath] = useState<string>('');
  const [query, setQuery] = useState<KV[]>([{ key: '', value: '', id: crypto.randomUUID() }]);
  const [headersRows, setHeadersRows] = useState<KV[]>([{ key: '', value: '', id: crypto.randomUUID() }]);
  const [body, setBody] = useState<string>('{}');
  const [contentType, setContentType] = useState<string>('application/json');
  const [useJsonPretty, setUseJsonPretty] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [status, setStatus] = useState<{code:number;text:string}|null>(null);
  const [respHeaders, setRespHeaders] = useState<[string,string][]>([]);
  const [reqHeaders, setReqHeaders] = useState<[string,string][]>([]);
  const [respBody, setRespBody] = useState<string>('');
  const [showRaw, setShowRaw] = useState<boolean>(false);
  const [notif, setNotif] = useState<{open:boolean;severity:'success'|'error'|'info'|'warning';message:string}>({open:false,severity:'info',message:''});

  // Keep a ref with latest runtimeConnection
  const connectionRef = useRef(runtimeConnection);
  useEffect(() => { connectionRef.current = runtimeConnection; }, [runtimeConnection]);
  const getConnection = useCallback(() => connectionRef.current, []);

  // Bootstrap: load runtime settings on mount/profile change
  useEffect(() => {
    (async () => {
      const userId = await getCurrentUserId();
      await loadRuntimeSettings(userId, currentProfileName);
    })().catch(() => { /* ignore */ });
  }, [currentProfileName, loadRuntimeSettings]);

  // Load last session from localStorage
  const username = 'default-user'; // aligned with getCurrentUserId()
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey(username));
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.method) setMethod(saved.method);
        if (saved.endpointPath) setEndpointPath(saved.endpointPath);
        if (Array.isArray(saved.query)) setQuery(saved.query);
        if (Array.isArray(saved.headersRows)) setHeadersRows(saved.headersRows);
        if (typeof saved.body === 'string') setBody(saved.body);
        if (saved.contentType) setContentType(saved.contentType);
        if (typeof saved.useJsonPretty === 'boolean') setUseJsonPretty(saved.useJsonPretty);
      }
    } catch { /* ignore */ }
  }, []);

  // Persist to localStorage
  useEffect(() => {
    const payload = { method, endpointPath, query, headersRows, body, contentType, useJsonPretty };
    try { window.localStorage.setItem(storageKey(username), JSON.stringify(payload)); } catch {}
  }, [method, endpointPath, query, headersRows, body, contentType, useJsonPretty]);

  const hasBody = useMemo(() => !['GET','HEAD','OPTIONS'].includes(method), [method]);

  const addRow = () => setQuery((rows) => [...rows, { key: '', value: '', id: crypto.randomUUID() }]);
  const removeRow = (id: string) => setQuery((rows) => rows.filter(r => r.id !== id));
  const updateRow = (id: string, patch: Partial<KV>) => setQuery((rows) => rows.map(r => r.id === id ? { ...r, ...patch } : r));

  const addHeaderRow = () => setHeadersRows((rows) => [...rows, { key: '', value: '', id: crypto.randomUUID() }]);
  const removeHeaderRow = (id: string) => setHeadersRows((rows) => rows.filter(r => r.id !== id));
  const updateHeaderRow = (id: string, patch: Partial<KV>) => setHeadersRows((rows) => rows.map(r => r.id === id ? { ...r, ...patch } : r));

  const effectiveEndpointSuggestions = useMemo(() => {
    const opts: string[] = [];
    // collect from runtimeHooks if available
    const h: any = runtimeHooks || {};
    for (const key of Object.keys(h)) {
      const ep = h[key]?.endpoint_path;
      if (ep && typeof ep === 'string') opts.push(ep);
    }
    // ensure unique
    return Array.from(new Set(opts));
  }, [runtimeHooks]);

  const resetForm = () => {
    setMethod('POST');
    setEndpointPath('');
    setQuery([{ key: '', value: '', id: crypto.randomUUID() }]);
    setHeadersRows([{ key: '', value: '', id: crypto.randomUUID() }]);
    setBody('{}');
    setContentType('application/json');
    setUseJsonPretty(true);
    setStatus(null);
    setRespBody('');
    setRespHeaders([]);
    setReqHeaders([]);
  };

  const buildURL = () => {
    const base = new URL('/proxy/hooks/any', getProxyOrigin());
    const conn = getConnection();
    const target = conn?.backend_url || '';
    if (!target) throw new Error('No backend URL configured in Runtime > Connection');

    const params = new URLSearchParams();
    params.set('url', target);
    if (endpointPath) params.set('endpoint_path', endpointPath);
    // add query rows
    for (const row of query) {
      if (row.key && row.value) params.append(row.key, row.value);
    }

    base.search = params.toString();
    return base.toString();
  };

  const send = async () => {
    try {
      setLoading(true);
      setStatus(null);
      setRespHeaders([]);
      setReqHeaders([]);
      setRespBody('');

      const url = buildURL();
      const conn = getConnection();
      const { authType, authValue } = prepareAuthParams(conn || {});

      const headers: Record<string, string> = {
        'x-auth-type': authType || '',
        'x-auth-value': authValue || '',
      };
      if (hasBody) headers['Content-Type'] = contentType || 'application/json';

      // Merge custom headers (user provided)
      for (const row of headersRows) {
        if (!row.key) continue;
        // Avoid letting user override Authorization (handled by authenticatedFetch) but allow other headers including x-auth-* overrides if desired
        if (row.key.toLowerCase() === 'authorization') continue;
        headers[row.key] = row.value ?? '';
      }

      // Capture request headers for display (mask Authorization token)
      const reqList: [string, string][] = Object.entries(headers).map(([k, v]) => [k, String(v)]);
      const token = getAuthToken?.();
      if (token) {
        const masked = token.length <= 12 ? '***' : `${token.slice(0, 6)}…${token.slice(-4)}`;
        reqList.push(['Authorization', `Bearer ${masked}`]);
      }
      setReqHeaders(reqList);

      const init: RequestInit = { method };
      init.headers = headers;
      if (hasBody) {
        // If JSON, keep as entered (user can break it), we do not auto-stringify
        init.body = body || '';
      }

      const t0 = performance.now();
      const resp = await authenticatedFetch(url, init);
      const dt = performance.now() - t0;

      const hdrs: [string,string][] = [];
      resp.headers.forEach((v, k) => hdrs.push([k, v]));
      setRespHeaders(hdrs);
      setStatus({ code: resp.status, text: `${resp.statusText} (${dt.toFixed(0)} ms)` });

      let text = '';
      try { text = await resp.text(); } catch { text = ''; }
      setRespBody(text);

      if (!resp.ok) {
        let msg = text;
        try { msg = await extractErrorMessage(resp); } catch { /* ignore */ }
        setNotif({ open: true, severity: 'error', message: msg || `HTTP ${resp.status}` });
      } else {
        setNotif({ open: true, severity: 'success', message: `OK (${resp.status})` });
      }
    } catch (e: any) {
      setNotif({ open: true, severity: 'error', message: e?.message || String(e) });
    } finally {
      setLoading(false);
    }
  };

  const pasteExample = () => {
    // Provide a small example based on method
    if (method === 'GET') {
      setEndpointPath('/hooks/distributed-brute-force-test');
      setQuery([{ key: 'action', value: 'get_metrics', id: crypto.randomUUID() }]);
    } else {
      setEndpointPath('/hooks/distributed-brute-force-test');
      setBody(pretty({ action: 'run_test', username: 'alice', num_ips: 10 }));
    }
  };

  const copyCurl = async () => {
    try {
      const url = buildURL();
      const conn = getConnection();
      const { authType, authValue } = prepareAuthParams(conn || {});
      const parts: string[] = ['curl', '-i', '-X', method, `'${url}'`];
      if (authType && authValue) parts.push('-H', `'x-auth-type: ${authType}'`, '-H', `'x-auth-value: ${authValue}'`);
      for (const row of headersRows) {
        if (!row.key) continue;
        if (row.key.toLowerCase() === 'authorization') continue;
        parts.push('-H', `'${row.key}: ${row.value || ''}'`);
      }
      if (hasBody) parts.push('-H', `'Content-Type: ${contentType}'`, '--data', `'${body.replace(/'/g, "'\\''")}'`);
      await navigator.clipboard.writeText(parts.join(' '));
      setNotif({ open: true, severity: 'success', message: 'cURL copied to clipboard' });
    } catch {
      setNotif({ open: true, severity: 'error', message: 'Failed to copy cURL' });
    }
  };

  const formatBody = () => {
    if (!body) return;
    try {
      const j = JSON.parse(body);
      setBody(JSON.stringify(j, null, 2));
    } catch {
      // ignore non-JSON
    }
  };

  const connectionOk = Boolean(runtimeConnection?.backend_url);

  return (
    <Box>
      <Typography variant="h5" gutterBottom>Hook Tester</Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        Test arbitrary hooks of your Nauthilus backend. Choose the HTTP method and endpoint path, optionally send a body or query parameters, and inspect status code, headers, and response body.
      </Typography>

      {!connectionOk && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          No backend configured. Please set a Backend URL first under Runtime → Connection.
        </Alert>
      )}

      <Paper sx={{ p: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={2}>
            <TextField select fullWidth label="Method" value={method} onChange={(e) => setMethod(e.target.value as Method)}>
              {METHODS.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} md={10}>
            <TextField
              fullWidth
              label="Endpoint Path (e.g., /hooks/distributed-brute-force-test)"
              value={endpointPath}
              onChange={(e) => setEndpointPath(e.target.value)}
              placeholder="/hooks/..."
              InputProps={{ endAdornment: (
                <Tooltip title="Known hook paths from runtime settings">
                  <span>
                    <IconButton size="small" disabled={effectiveEndpointSuggestions.length === 0}>
                      <LinkIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              )}}
              helperText={effectiveEndpointSuggestions.length ? `Known endpoints: ${effectiveEndpointSuggestions.join(', ')}` : 'Path relative to the Backend URL'}
            />
          </Grid>

          {/* Query Params */}
          <Grid item xs={12}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Typography variant="subtitle1">Query Parameters</Typography>
              <Chip size="small" label={`${query.filter(q => q.key).length}`} />
              <Box flexGrow={1} />
              <Button size="small" onClick={addRow}>Add param</Button>
            </Box>
            <Grid container spacing={1}>
              {query.map((row) => (
                <React.Fragment key={row.id}>
                  <Grid item xs={5} md={3}>
                    <TextField size="small" fullWidth label="key" value={row.key} onChange={(e) => updateRow(row.id, { key: e.target.value })} />
                  </Grid>
                  <Grid item xs={7} md={7}>
                    <TextField size="small" fullWidth label="value" value={row.value} onChange={(e) => updateRow(row.id, { value: e.target.value })} />
                  </Grid>
                  <Grid item xs={12} md={2} sx={{ display: 'flex', alignItems: 'center' }}>
                    <IconButton onClick={() => removeRow(row.id)} aria-label="remove"><DeleteIcon fontSize="small" /></IconButton>
                  </Grid>
                </React.Fragment>
              ))}
            </Grid>
          </Grid>

          {/* Custom Request Headers */}
          <Grid item xs={12}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, mt: 2 }}>
              <Typography variant="subtitle1">Request Headers</Typography>
              <Chip size="small" label={`${headersRows.filter(h => h.key).length}`} />
              <Box flexGrow={1} />
              <Button size="small" onClick={addHeaderRow}>Add header</Button>
            </Box>
            <Grid container spacing={1}>
              {headersRows.map((row) => (
                <React.Fragment key={row.id}>
                  <Grid item xs={5} md={3}>
                    <TextField size="small" fullWidth label="Header name" value={row.key} onChange={(e) => updateHeaderRow(row.id, { key: e.target.value })} />
                  </Grid>
                  <Grid item xs={7} md={7}>
                    <TextField size="small" fullWidth label="Header value" value={row.value} onChange={(e) => updateHeaderRow(row.id, { value: e.target.value })} />
                  </Grid>
                  <Grid item xs={12} md={2} sx={{ display: 'flex', alignItems: 'center' }}>
                    <IconButton onClick={() => removeHeaderRow(row.id)} aria-label="remove"><DeleteIcon fontSize="small" /></IconButton>
                  </Grid>
                </React.Fragment>
              ))}
            </Grid>
          </Grid>

          {/* Body */}
          {hasBody && (
            <>
              <Grid item xs={12} md={4}>
                <TextField select fullWidth label="Content-Type" value={contentType} onChange={(e) => setContentType(e.target.value)}>
                  <MenuItem value="application/json">application/json</MenuItem>
                  <MenuItem value="text/plain">text/plain</MenuItem>
                  <MenuItem value="application/x-www-form-urlencoded">application/x-www-form-urlencoded</MenuItem>
                </TextField>
                <FormControlLabel control={<Switch checked={useJsonPretty} onChange={(e)=>setUseJsonPretty(e.target.checked)} />} label="Format JSON on paste" />
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                  <Button size="small" startIcon={<RefreshIcon />} onClick={formatBody}>Format JSON</Button>
                  <Button size="small" onClick={pasteExample}>Insert example</Button>
                </Stack>
              </Grid>
              <Grid item xs={12} md={8}>
                <TextField
                  fullWidth
                  multiline
                  minRows={8}
                  label="Request Body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={contentType === 'application/json' ? '{\n  "action": "..."\n}' : ''}
                />
              </Grid>
            </>
          )}

          <Grid item xs={12}>
            <Divider sx={{ my: 1 }} />
            <Stack direction="row" spacing={1}>
              <Button variant="contained" startIcon={<PlayArrowIcon />} onClick={send} disabled={loading || !endpointPath || !connectionOk}>
                Send
              </Button>
              <Button variant="outlined" onClick={resetForm} disabled={loading}>Reset</Button>
              <Button variant="text" startIcon={<ContentCopyIcon />} onClick={copyCurl} disabled={!endpointPath}>Copy cURL</Button>
            </Stack>
          </Grid>
        </Grid>
      </Paper>

      {/* Response */}
      <Paper sx={{ p: 2, mt: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
          <Typography variant="h6">Response</Typography>
          {loading && <CircularProgress size={18} />}
          <Box flexGrow={1} />
          {status && <Chip color={status.code >= 200 && status.code < 300 ? 'success' : 'error'} label={`Status: ${status.code} ${status.text}`} />}
          <FormControlLabel control={<Switch checked={showRaw} onChange={(e) => setShowRaw(e.target.checked)} />} label="Show raw" />
        </Box>
        {reqHeaders.length > 0 && (
          <Box sx={{ mb: 1 }}>
            <Typography variant="subtitle2">Request Headers</Typography>
            <Box component="pre" sx={{ m: 0, p: 1, bgcolor: 'background.default', borderRadius: 1, overflow: 'auto' }}>
              {reqHeaders.map(([k,v]) => `${k}: ${v}`).join('\n')}
            </Box>
          </Box>
        )}
        {respHeaders.length > 0 && (
          <Box sx={{ mb: 1 }}>
            <Typography variant="subtitle2">Response Headers</Typography>
            <Box component="pre" sx={{ m: 0, p: 1, bgcolor: 'background.default', borderRadius: 1, overflow: 'auto' }}>
              {respHeaders.map(([k,v]) => `${k}: ${v}`).join('\n')}
            </Box>
          </Box>
        )}
        <Typography variant="subtitle2">Body</Typography>
        <Box component="pre" sx={{ m: 0, p: 1, bgcolor: 'background.default', borderRadius: 1, overflow: 'auto', maxHeight: 400 }}>
          {showRaw ? respBody : pretty(respBody)}
        </Box>
      </Paper>

      <Snackbar open={notif.open} autoHideDuration={4000} onClose={() => setNotif({ ...notif, open: false })}>
        <Alert severity={notif.severity} onClose={() => setNotif({ ...notif, open: false })}>
          {notif.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default HookTester;
