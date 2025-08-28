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
  FormControlLabel,
  Menu
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import LinkIcon from '@mui/icons-material/Link';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { useConfig } from '../contexts/ConfigContext';
import { useRuntime, getCurrentUserId } from '../contexts/RuntimeContext';
import { authenticatedFetch, extractErrorMessage, getProxyOrigin, prepareAuthParams, getAuthToken } from '../utils/apiUtils';
import { getKnownHookEndpointSuggestions } from '../utils/hooks';
import { byteLengthUtf8, getEffectiveRawJsonMaxBytes, setRawJsonMaxBytesOverride, RAW_JSON_MIN_BYTES, RAW_JSON_MAX_BYTES, applyPreviewLimit } from '../utils/limits';

const METHODS = ['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'] as const;

type Method = typeof METHODS[number];

type KV = { key: string; value: string; id: string };

const pretty = (v: any) => {
  try { return JSON.stringify(typeof v === 'string' ? JSON.parse(v) : v, null, 2); } catch { return String(v); }
};


const storageKey = (username: string) => `ui:hooktester:last:${username}`;

const HookTester = (): React.JSX.Element => {
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
  const [rawJsonMaxBytes, setRawJsonMaxBytes] = useState<number>(getEffectiveRawJsonMaxBytes());
  const bodyBytes = useMemo(() => byteLengthUtf8(body), [body]);
  const bodyTooLarge = useMemo(() => bodyBytes > rawJsonMaxBytes, [bodyBytes, rawJsonMaxBytes]);
  const bodyTooLargeJson = useMemo(() => /json/i.test(contentType) && bodyTooLarge, [contentType, bodyTooLarge]);
  const [status, setStatus] = useState<{code:number;text:string}|null>(null);
  const [respHeaders, setRespHeaders] = useState<[string,string][]>([]);
  const [reqHeaders, setReqHeaders] = useState<[string,string][]>([]);
  const [respBody, setRespBody] = useState<string>('');
  const [notif, setNotif] = useState<{open:boolean;severity:'success'|'error'|'info'|'warning';message:string}>({open:false,severity:'info',message:''});
  // ClickHouse-like limited raw preview state for response
  const [rawLimitInput, setRawLimitInput] = useState<string>(String(getEffectiveRawJsonMaxBytes()));
  const [respRawPreviewFull, setRespRawPreviewFull] = useState<string>('');
  const [respRawPreview, setRespRawPreview] = useState<string>('');
  // Collapsible panels
  const [showRequestPanel, setShowRequestPanel] = useState<boolean>(true);
  // Collapsible headers in response
  const [showReqHeaders, setShowReqHeaders] = useState<boolean>(true);
  const [showRespHeaders, setShowRespHeaders] = useState<boolean>(true);
  // Connection status state (match other pages)
  const [connStatus, setConnStatus] = useState<'unknown'|'connected'|'disconnected'|'checking'>('unknown');
  const [statusMessage, setStatusMessage] = useState<string>('');
  // endpoint suggestions menu anchor
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const menuOpen = Boolean(anchorEl);
  const closeMenu = () => setAnchorEl(null);
  const pickEndpoint = (ep: string) => { setEndpointPath(ep); closeMenu(); };

  // Keep a ref with latest runtimeConnection
  const connectionRef = useRef(runtimeConnection);
  useEffect(() => { connectionRef.current = runtimeConnection; }, [runtimeConnection]);
  const getConnection = useCallback(() => connectionRef.current, []);

  // Connection check (similar to Distributed BF and Connection pages)
  const checkConnection = useCallback(async () => {
    const conn = getConnection();
    if (!conn?.backend_url) {
      setConnStatus('unknown');
      setStatusMessage('No backend URL configured');
      return;
    }
    setConnStatus('checking');
    setStatusMessage('Checking connection...');
    try {
      const proxyUrl = new URL('/proxy/ping', getProxyOrigin());
      proxyUrl.searchParams.append('url', conn.backend_url!);
      const resp = await authenticatedFetch(proxyUrl.toString(), { method: 'GET' });
      if (resp.ok) {
        setConnStatus('connected');
        setStatusMessage('Connected to Nauthilus backend (ping successful)');
      } else {
        const msg = await extractErrorMessage(resp);
        setConnStatus('disconnected');
        setStatusMessage(`Failed to connect: ${msg}`);
      }
    } catch (e: any) {
      setConnStatus('disconnected');
      setStatusMessage(`Connection error: ${e?.message || String(e)}`);
    }
  }, [getConnection]);

  // Bootstrap: load runtime settings on mount/profile change and then check connection
  useEffect(() => {
    (async () => {
      const userId = await getCurrentUserId();
      await loadRuntimeSettings(userId, currentProfileName);
      await checkConnection();
    })().catch(() => { /* ignore */ });
  }, [currentProfileName, loadRuntimeSettings, /* eslint-disable-line react-hooks/exhaustive-deps */]);

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

  // Keep raw limit input in sync with applied limit
  useEffect(() => {
    setRawLimitInput(String(rawJsonMaxBytes));
  }, [rawJsonMaxBytes]);

  // Recompute limited response preview when inputs change
  useEffect(() => {
    if (respRawPreviewFull) setRespRawPreview(applyPreviewLimit(respRawPreviewFull, rawJsonMaxBytes));
  }, [respRawPreviewFull, rawJsonMaxBytes]);

  const hasBody = useMemo(() => !['GET','HEAD','OPTIONS'].includes(method), [method]);

  const addRow = () => setQuery((rows) => [...rows, { key: '', value: '', id: crypto.randomUUID() }]);
  const removeRow = (id: string) => setQuery((rows) => rows.filter(r => r.id !== id));
  const updateRow = (id: string, patch: Partial<KV>) => setQuery((rows) => rows.map(r => r.id === id ? { ...r, ...patch } : r));

  const addHeaderRow = () => setHeadersRows((rows) => [...rows, { key: '', value: '', id: crypto.randomUUID() }]);
  const removeHeaderRow = (id: string) => setHeadersRows((rows) => rows.filter(r => r.id !== id));
  const updateHeaderRow = (id: string, patch: Partial<KV>) => setHeadersRows((rows) => rows.map(r => r.id === id ? { ...r, ...patch } : r));

  const effectiveEndpointSuggestions = useMemo(() => getKnownHookEndpointSuggestions(runtimeHooks), [runtimeHooks]);

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
      // Clear raw previews at start
      setRespRawPreviewFull('');
      setRespRawPreview('');

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

      let text: string;
      try { text = await resp.text(); } catch { text = ''; }
      setRespBody(text);
      // Update ClickHouse-style raw previews
      const prettyText = pretty(text);
      setRespRawPreviewFull(prettyText);
      setRespRawPreview(applyPreviewLimit(prettyText, rawJsonMaxBytes));

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
      setEndpointPath('/api/v1/custom/hooks/distributed-brute-force-test');
      setQuery([{ key: 'action', value: 'get_metrics', id: crypto.randomUUID() }]);
    } else {
      setEndpointPath('/api/v1/custom/hooks/distributed-brute-force-test');
      setBody(pretty({ action: 'run_test', username: 'alice', num_ips: 10 }));
    }
  };

  const copyCurl = async () => {
    try {
      // Build direct backend URL (not the proxy)
      const conn = getConnection();
      const baseUrl = conn?.backend_url || '';
      if (!baseUrl) { setNotif({ open: true, severity: 'error', message: 'No backend URL configured in Runtime > Connection' }); return; }

      // Ensure endpoint path is applied relative to backend_url
      const path = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
      const target = new URL(path, baseUrl);

      // Append query params
      for (const row of query) {
        if (row.key && row.value !== undefined) {
          target.searchParams.append(row.key, row.value);
        }
      }

      const { authType, authValue } = prepareAuthParams(conn || {});
      const parts: string[] = ['curl', '-i', '-X', method, `'${target.toString()}'`];

      // Add Authorization header for direct backend access
      if (authType && authValue) {
        if (authType.toLowerCase() === 'bearer') {
          parts.push('-H', `'Authorization: Bearer ${authValue}'`);
        } else if (authType.toLowerCase() === 'basic') {
          parts.push('-H', `'Authorization: Basic ${authValue}'`);
        }
      }

      // Include user-provided custom headers (skip Authorization to avoid duplicates)
      for (const row of headersRows) {
        if (!row.key) continue;
        if (row.key.toLowerCase() === 'authorization') continue;
        parts.push('-H', `'${row.key}: ${row.value || ''}'`);
      }

      // Include content type and body for methods that support a body
      if (hasBody) {
        parts.push('-H', `'Content-Type: ${contentType}'`, '--data', `'${(body || '').replace(/'/g, "'\\''")}'`);
      }

      await navigator.clipboard.writeText(parts.join(' '));
      setNotif({ open: true, severity: 'success', message: 'cURL copied to clipboard' });
    } catch (e) {
      setNotif({ open: true, severity: 'error', message: e instanceof Error ? e.message : 'Failed to copy cURL' });
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

      {/* Connection status (match Connection/Distributed BF pages) */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Typography variant="subtitle1" sx={{ mr: 2 }}>Connection Status:</Typography>
        {connStatus === 'checking' && <CircularProgress size={20} sx={{ mr: 1 }} />}
        {connStatus === 'connected' && <CheckCircleIcon color="success" sx={{ mr: 1 }} />}
        {connStatus === 'disconnected' && <ErrorIcon color="error" sx={{ mr: 1 }} />}
        {connStatus === 'unknown' && <Typography color="text.secondary">Not checked</Typography>}
        {connStatus === 'disconnected' && (
          <Typography color="error.main">{statusMessage}</Typography>
        )}
        <Tooltip title="Check connection">
          <span>
            <IconButton onClick={checkConnection} disabled={connStatus === 'checking' || !connectionOk} sx={{ ml: 1 }}>
              <RefreshIcon />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {!connectionOk && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          No backend configured. Please set a Backend URL first under Runtime → Connection.
        </Alert>
      )}

      <Paper sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>Request</Typography>
          <IconButton size="small" aria-label={showRequestPanel ? 'collapse request panel' : 'expand request panel'} onClick={() => setShowRequestPanel(v => !v)}>
            {showRequestPanel ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        </Box>
        {showRequestPanel && (
          <Grid container spacing={2}>
            <Grid item xs={12} md={2}>
              <TextField select fullWidth label="Method" value={method} onChange={(e) => setMethod(e.target.value as Method)}>
                {METHODS.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} md={10}>
              <TextField
                fullWidth
                label="Endpoint Path (e.g., /api/v1/custom/hooks/distributed-brute-force-test)"
                value={endpointPath}
                onChange={(e) => setEndpointPath(e.target.value)}
                placeholder="/api/v1/custom/..."
                InputProps={{ endAdornment: (
                  <Tooltip title={effectiveEndpointSuggestions.length ? 'Pick from known hook paths detected in runtime settings' : 'No known hook paths detected'}>
                    <span>
                      <IconButton size="small" disabled={effectiveEndpointSuggestions.length === 0} onClick={(e) => setAnchorEl(e.currentTarget)} aria-label="pick-endpoint">
                        <LinkIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                )}}
                helperText={'Path relative to the Backend URL'}
              />
              <Menu anchorEl={anchorEl} open={menuOpen} onClose={closeMenu}>
                {effectiveEndpointSuggestions.map((ep) => (
                  <MenuItem key={ep} onClick={() => pickEndpoint(ep)}>{ep}</MenuItem>
                ))}
              </Menu>
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
                    error={bodyTooLargeJson}
                    helperText={/json/i.test(contentType) ? `${bodyBytes} / ${rawJsonMaxBytes} bytes${bodyTooLargeJson ? ' — exceeds limit' : ''}` : undefined}
                  />
                </Grid>
              </>
            )}

            <Grid item xs={12}>
              <Divider sx={{ my: 1 }} />
              <Stack direction="row" spacing={1}>
                <Button variant="contained" startIcon={<PlayArrowIcon />} onClick={send} disabled={loading || !endpointPath || !connectionOk || bodyTooLargeJson}>
                  Send
                </Button>
                <Button variant="outlined" onClick={resetForm} disabled={loading}>Reset</Button>
                <Button variant="text" startIcon={<ContentCopyIcon />} onClick={copyCurl} disabled={!endpointPath}>Copy cURL</Button>
              </Stack>
            </Grid>
          </Grid>
        )}
      </Paper>

      {/* Response */}
      <Paper sx={{ p: 2, mt: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
          <Typography variant="h6">Response</Typography>
          {loading && <CircularProgress size={18} />}
          <Box flexGrow={1} />
          {status && <Chip color={status.code >= 200 && status.code < 300 ? 'success' : 'error'} label={`Status: ${status.code} ${status.text}`} />}
        </Box>
        {reqHeaders.length > 0 && (
          <Box sx={{ mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>Request Headers</Typography>
              <IconButton size="small" aria-label={showReqHeaders ? 'collapse request headers' : 'expand request headers'} onClick={() => setShowReqHeaders(v => !v)}>
                {showReqHeaders ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
              </IconButton>
            </Box>
            {showReqHeaders && (
              <Box component="pre" sx={{ m: 0, p: 1, bgcolor: 'background.default', borderRadius: 1, overflow: 'auto' }}>
                {reqHeaders.map(([k,v]) => `${k}: ${v}`).join('\n')}
              </Box>
            )}
          </Box>
        )}
        {respHeaders.length > 0 && (
          <Box sx={{ mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>Response Headers</Typography>
              <IconButton size="small" aria-label={showRespHeaders ? 'collapse response headers' : 'expand response headers'} onClick={() => setShowRespHeaders(v => !v)}>
                {showRespHeaders ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
              </IconButton>
            </Box>
            {showRespHeaders && (
              <Box component="pre" sx={{ m: 0, p: 1, bgcolor: 'background.default', borderRadius: 1, overflow: 'auto' }}>
                {respHeaders.map(([k,v]) => `${k}: ${v}`).join('\n')}
              </Box>
            )}
          </Box>
        )}
        <Typography variant="subtitle2">Body</Typography>
        <Stack direction="row" alignItems="center" gap={1}>
          <Box sx={{ flexGrow: 1 }} />
          <TextField
            size="small"
            type="number"
            label="Raw JSON limit (bytes)"
            value={rawLimitInput}
            onChange={(e)=>{ setRawLimitInput(e.target.value); }}
            onKeyDown={(e)=>{ if ((e as any).key === 'Enter') {
              const v = Number((rawLimitInput || '').trim());
              const clamped = Math.max(RAW_JSON_MIN_BYTES, Math.min(RAW_JSON_MAX_BYTES, Number.isFinite(v) ? v : RAW_JSON_MIN_BYTES));
              setRawJsonMaxBytesOverride(clamped);
              setRawJsonMaxBytes(clamped);
              if (respRawPreviewFull) setRespRawPreview(applyPreviewLimit(respRawPreviewFull, clamped));
            } }}
            inputProps={{ min: RAW_JSON_MIN_BYTES, max: RAW_JSON_MAX_BYTES, step: 256 }}
            sx={{ minWidth: 210 }}
          />
          <Button size="small" variant="outlined" onClick={()=>{
            const v = Number((rawLimitInput || '').trim());
            const clamped = Math.max(RAW_JSON_MIN_BYTES, Math.min(RAW_JSON_MAX_BYTES, Number.isFinite(v) ? v : RAW_JSON_MIN_BYTES));
            setRawJsonMaxBytesOverride(clamped);
            setRawJsonMaxBytes(clamped);
            if (respRawPreviewFull) setRespRawPreview(applyPreviewLimit(respRawPreviewFull, clamped));
          }}>Apply</Button>
        </Stack>
        <TextField
          variant="outlined"
          fullWidth
          multiline
          minRows={8}
          value={respRawPreview || pretty(respBody)}
          InputProps={{ readOnly: true }}
          sx={{ mt:1, '& .MuiInputBase-input': { fontFamily:'monospace', fontSize:12 } }}
        />
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
