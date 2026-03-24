import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Paper, Typography, TextField, Button, MenuItem, Divider, Alert, Tooltip, IconButton, Chip, Stack, CircularProgress, Snackbar, Switch, FormControlLabel, Menu, Dialog } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import LinkIcon from '@mui/icons-material/Link';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CodeIcon from '@mui/icons-material/Code';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import CloseIcon from '@mui/icons-material/Close';
import { useConfig } from '../contexts/ConfigContext';
import { useRuntime, getCurrentUserId } from '../contexts/RuntimeContext';
import { authenticatedFetch, extractErrorMessage, getProxyOrigin, loadSettings as loadSettingsUtil, checkConnection as checkConnectionUtil } from '../utils/apiUtils';
import { getKnownHookEndpointSuggestions } from '../utils/hooks';
import { byteLengthUtf8, getEffectiveRawJsonMaxBytes, setRawJsonMaxBytesOverride, RAW_JSON_MIN_BYTES, RAW_JSON_MAX_BYTES, applyPreviewLimit } from '../utils/limits';
import Grid from '@mui/material/Grid';

const METHODS = ['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'] as const;

type Method = typeof METHODS[number];

type KV = { key: string; value: string; id: string };
type HookTesterHeaderPreview = { name: string; value: string };
type HookTesterExecuteResponse = {
    request: {
        method: string;
        url: string;
        endpointPath: string;
        headers: HookTesterHeaderPreview[];
    };
    response: {
        status: number;
        statusText: string;
        contentType?: string;
        headers: HookTesterHeaderPreview[];
        body: string;
        bodyTruncated: boolean;
        durationMs: number;
    };
};

const pretty = (v: any) => {
  try { return JSON.stringify(typeof v === 'string' ? JSON.parse(v) : v, null, 2); } catch { return String(v); }
};

function isConnectionConfig(value: unknown): value is { backend_url?: string } {
  return Boolean(value) && typeof value === 'object' && 'backend_url' in (value as Record<string, unknown>);
}


const storageKey = (username: string) => `ui:hooktester:last:${username}`;

// Ensure rendered HTML in iframe uses a light theme with readable defaults
function ensureLightHtml(html: string): string {
  const css = `:root{color-scheme: light;} html,body{background:#fff !important;color:#111 !important;} body{margin:8px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif;line-height:1.5;font-size:14px;} img,video,svg,canvas{max-width:100%;height:auto;} pre{background:#f6f8fa;border-radius:4px;padding:8px;overflow:auto;} code{font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;} table{border-collapse:collapse;} th,td{border:1px solid #ddd;padding:4px 6px;} a{color:#0645ad;}`;
  const injection = `<meta name="color-scheme" content="light"><style>${css}</style>`;
  let s = html || '';
  if (!s) {
    return `<!doctype html><html lang="en"><head>${injection}</head><body></body></html>`;
  }
  if (/<head[\s>]/i.test(s)) {
    return s.replace(/<head([^>]*)>/i, `<head$1>${injection}`);
  }
  if (/<html[\s>]/i.test(s)) {
    // noinspection HtmlRequiredLangAttribute
      return s.replace(/<html([^>]*)>/i, `<html$1><head>${injection}</head>`);
  }
  if (/<body[\s>]/i.test(s)) {
    return `<!doctype html><html lang="en"><head>${injection}</head>${s}</html>`;
  }
  // Fragment
  return `<!doctype html><html lang="en"><head>${injection}</head><body>${s}</body></html>`;
}

const HookTester = (): React.JSX.Element => {
  const { currentProfileName } = useConfig();
  const { connection: runtimeConnection, hooks: runtimeHooks, loadRuntimeSettings } = useRuntime();
  const [storageUsername, setStorageUsername] = useState('anonymous');

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
  // Response content-type and view mode
  const [respContentType, setRespContentType] = useState<string | null>(null);
  const [respViewMode, setRespViewMode] = useState<'raw'|'rendered'>('raw');
  const [respFullscreen, setRespFullscreen] = useState<boolean>(false);
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

  // Connection check via shared utility (DRY)
  const checkConnection = useCallback(async (connParam?: any) => {
    const connectionToCheck = isConnectionConfig(connParam) ? connParam : getConnection();
    await checkConnectionUtil(connectionToCheck, setConnStatus, setStatusMessage);
  }, [getConnection]);

  // Bootstrap: load runtime settings and check connection via shared helper
  useEffect(() => {
    (async () => {
      await loadSettingsUtil(
        getCurrentUserId,
        loadRuntimeSettings,
        currentProfileName,
        async (conn) => { await checkConnection(conn); },
        getConnection
      );
    })().catch(() => { /* ignore */ });
  }, [currentProfileName, loadRuntimeSettings, getConnection, checkConnection]);

  useEffect(() => {
    getCurrentUserId()
      .then((username) => setStorageUsername(username))
      .catch(() => setStorageUsername('anonymous'));
  }, []);

  // Load last session from localStorage
  const username = storageUsername;
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

  // Apply raw JSON limit changes (DRY for Enter key and Apply button)
  const applyRawLimitChange = useCallback(() => {
    const v = Number((rawLimitInput || '').trim());
    const clamped = Math.max(
      RAW_JSON_MIN_BYTES,
      Math.min(RAW_JSON_MAX_BYTES, Number.isFinite(v) ? v : RAW_JSON_MIN_BYTES)
    );
    setRawJsonMaxBytesOverride(clamped);
    setRawJsonMaxBytes(clamped);
    if (respRawPreviewFull) setRespRawPreview(applyPreviewLimit(respRawPreviewFull, clamped));
  }, [rawLimitInput, respRawPreviewFull]);

  const hasBody = useMemo(() => !['GET','HEAD','OPTIONS'].includes(method), [method]);

  // Response content-type helpers
  const normalizedRespCT = useMemo(() => (respContentType || '').toLowerCase(), [respContentType]);
  const isHtmlResp = useMemo(() => /^(text\/html|application\/xhtml\+xml)$/.test(normalizedRespCT), [normalizedRespCT]);
  const isTextResp = useMemo(() => /^text\//.test(normalizedRespCT), [normalizedRespCT]);
        useMemo(() => Boolean(normalizedRespCT) && (isHtmlResp || isTextResp), [normalizedRespCT, isHtmlResp, isTextResp]);
        // Heuristic fallback when Content-Type header is missing or unhelpful
        const bodyLooksHtml = useMemo(() => {
            const s = (respBody || '').trim().slice(0, 500).toLowerCase();
            if (!s) return false;
            return s.startsWith('<!doctype html') || s.startsWith('<html') || (s.startsWith('<') && s.includes('</'));
        }, [respBody]);
        const bodyLooksText = useMemo(() => {
            if (bodyLooksHtml) return false;
            const s = (respBody || '');
            if (!s) return false;
            // Consider as generic text if first 1000 chars are printable (allowing tab, CR, LF)
            const max = Math.min(1000, s.length);
            for (let i = 0; i < max; i++) {
                const c = s.charCodeAt(i);
                if (c < 32 && c !== 9 && c !== 10 && c !== 13) return false;
            }
            return true;
        }, [respBody, bodyLooksHtml]);
        const isHtmlEffective = useMemo(() => isHtmlResp || bodyLooksHtml, [isHtmlResp, bodyLooksHtml]);
        const canRenderEffective = useMemo(() => isHtmlEffective || isTextResp || bodyLooksText, [isHtmlEffective, isTextResp, bodyLooksText]);

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

        const buildExecuteURL = () => {
            const base = new URL('/proxy/hooks/execute', getProxyOrigin());
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
                // Reset response content-type and view mode
                setRespContentType(null);
                setRespViewMode('raw');
                setRespFullscreen(false);

                const url = buildExecuteURL();
                const payload = {
                    method,
                    endpointPath,
                    query: query
                        .filter((row) => row.key)
                        .map((row) => ({ key: row.key, value: row.value ?? '' })),
                    headers: headersRows
                        .filter((row) => row.key)
                        .map((row) => ({ key: row.key, value: row.value ?? '' })),
                    body: hasBody ? (body || '') : '',
                    contentType: hasBody ? (contentType || 'application/json') : '',
                };

                const t0 = performance.now();
                const resp = await authenticatedFetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                const dt = performance.now() - t0;
                const respForError = !resp.ok ? resp.clone() : null;

                if (!resp.ok) {
                    let msg = '';
                    if (respForError) {
                        try { msg = await extractErrorMessage(respForError); } catch { /* ignore */ }
                    }
                    throw new Error(msg || `HTTP ${resp.status}`);
                }

                const data = await resp.json() as HookTesterExecuteResponse;

                const requestHeaders: [string, string][] = (data.request?.headers || []).map((h) => [h.name, h.value]);
                const responseHeaders: [string, string][] = (data.response?.headers || []).map((h) => [h.name, h.value]);
                setReqHeaders(requestHeaders);
                setRespHeaders(responseHeaders);

                const responseContentType = data.response?.contentType || '';
                const ctMain = responseContentType.split(';')[0]?.trim().toLowerCase() || '';
                setRespContentType(ctMain || null);

                const responseStatus = Number.isFinite(data.response?.status) ? data.response.status : 0;
                const responseStatusText = data.response?.statusText || '';
                const durationFromProxy = Number.isFinite(data.response?.durationMs) ? data.response.durationMs : Math.round(dt);
                setStatus({ code: responseStatus, text: `${responseStatusText} (${durationFromProxy} ms)` });

                const text = data.response?.body || '';
                setRespBody(text);
                // Update ClickHouse-style raw previews
                const prettyText = pretty(text);
                setRespRawPreviewFull(prettyText);
                setRespRawPreview(applyPreviewLimit(prettyText, rawJsonMaxBytes));

                if (responseStatus >= 400) {
                    const truncatedMsg = data.response?.bodyTruncated ? ' (response truncated)' : '';
                    setNotif({ open: true, severity: 'error', message: `${responseStatus} ${responseStatusText}${truncatedMsg}`.trim() });
                } else {
                    const truncatedMsg = data.response?.bodyTruncated ? ' (response truncated)' : '';
                    setNotif({ open: true, severity: 'success', message: `OK (${responseStatus})${truncatedMsg}` });
                }
            } catch (e: any) {
                const message = e?.message || String(e);
                setStatus({ code: 0, text: 'Request failed' });
                setRespHeaders([]);
                setRespContentType('text/plain');
                setRespBody(message);
                const prettyText = pretty(message);
                setRespRawPreviewFull(prettyText);
                setRespRawPreview(applyPreviewLimit(prettyText, rawJsonMaxBytes));
                setNotif({ open: true, severity: 'error', message });
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
                if (!endpointPath.trim()) { setNotif({ open: true, severity: 'error', message: 'Endpoint path is required' }); return; }

                // Ensure endpoint path is applied relative to backend_url
                const path = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
                const target = new URL(path, baseUrl);

                // Append query params
                for (const row of query) {
                    if (row.key && row.value !== undefined) {
                        target.searchParams.append(row.key, row.value);
                    }
                }

                const parts: string[] = ['curl', '-i', '-X', method, `'${target.toString()}'`];

                // Never expose runtime credentials in generated previews.
                if (conn?.oidc_auth?.enabled && conn?.oidc_auth?.token) {
                    parts.push('-H', '\'Authorization: Bearer REDACTED\'');
                } else if (conn?.basic_auth?.enabled && conn?.basic_auth?.username && conn?.basic_auth?.password) {
                    parts.push('-H', '\'Authorization: Basic REDACTED\'');
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

        const connectionOk = Boolean(runtimeConnection?.backend_url || getConnection()?.backend_url);

        // Ensure connection check runs immediately when backend_url becomes available (bypass navigation debounce)
        useEffect(() => {
            if (runtimeConnection?.backend_url) {
                void checkConnection(runtimeConnection);
            }
        }, [runtimeConnection?.backend_url, checkConnection]);

        return (
            <Box>
                <Typography variant="h5" sx={{ fontWeight: 700 }} gutterBottom>Hook Tester</Typography>
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
            <IconButton onClick={() => { void checkConnection(); }} disabled={connStatus === 'checking' || !connectionOk} sx={{ ml: 1 }}>
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
                            <Grid size={{ xs: 12, md: 2 }}>
                                <TextField select fullWidth label="Method" value={method} onChange={(e) => setMethod(e.target.value as Method)}>
                                    {METHODS.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
                                </TextField>
                            </Grid>
                            <Grid size={{ xs: 12, md: 10 }}>
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
                            <Grid size={12}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                    <Typography variant="subtitle1">Query Parameters</Typography>
                                    <Chip size="small" label={`${query.filter(q => q.key).length}`} />
                                    <Box flexGrow={1} />
                                    <Button size="small" onClick={addRow}>Add param</Button>
                                </Box>
                                <Grid container spacing={1}>
                                    {query.map((row) => (
                                        <React.Fragment key={row.id}>
                                            <Grid size={{ xs: 5, md: 3 }}>
                                                <TextField size="small" fullWidth label="key" value={row.key} onChange={(e) => updateRow(row.id, { key: e.target.value })} />
                                            </Grid>
                                            <Grid size={{ xs: 7, md: 7 }}>
                                                <TextField size="small" fullWidth label="value" value={row.value} onChange={(e) => updateRow(row.id, { value: e.target.value })} />
                                            </Grid>
                                            <Grid sx={{ display: 'flex', alignItems: 'center' }} size={{ xs: 12, md: 2 }}>
                                                <IconButton onClick={() => removeRow(row.id)} aria-label="remove"><DeleteIcon fontSize="small" /></IconButton>
                                            </Grid>
                                        </React.Fragment>
                                    ))}
                                </Grid>
                            </Grid>

                            {/* Custom Request Headers */}
                            <Grid size={12}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, mt: 2 }}>
                                    <Typography variant="subtitle1">Request Headers</Typography>
                                    <Chip size="small" label={`${headersRows.filter(h => h.key).length}`} />
                                    <Box flexGrow={1} />
                                    <Button size="small" onClick={addHeaderRow}>Add header</Button>
                                </Box>
                                <Grid container spacing={1}>
                                    {headersRows.map((row) => (
                                        <React.Fragment key={row.id}>
                                            <Grid size={{ xs: 5, md: 3 }}>
                                                <TextField size="small" fullWidth label="Header name" value={row.key} onChange={(e) => updateHeaderRow(row.id, { key: e.target.value })} />
                                            </Grid>
                                            <Grid size={{ xs: 7, md: 7 }}>
                                                <TextField size="small" fullWidth label="Header value" value={row.value} onChange={(e) => updateHeaderRow(row.id, { value: e.target.value })} />
                                            </Grid>
                                            <Grid sx={{ display: 'flex', alignItems: 'center' }} size={{ xs: 12, md: 2 }}>
                                                <IconButton onClick={() => removeHeaderRow(row.id)} aria-label="remove"><DeleteIcon fontSize="small" /></IconButton>
                                            </Grid>
                                        </React.Fragment>
                                    ))}
                                </Grid>
                            </Grid>

                            {/* Body */}
                            {hasBody && (
                                <>
                                    <Grid size={{ xs: 12, md: 4 }}>
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
                                    <Grid size={{ xs: 12, md: 8 }}>
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

                            <Grid size={12}>
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
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1, flexWrap: 'wrap' }}>
                        <Typography variant="h6" sx={{ mr: 1 }}>Response</Typography>
                        {loading && <CircularProgress size={18} />}
                        {/* Right-side controls container: on small screens it wraps to next line */}
                        <Box sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          // On small screens, take full width and start on next line; on md+ keep inline to the right
                          flexBasis: { xs: '100%', sm: 'auto' },
                          flexGrow: { xs: 1, sm: 0 },
                          justifyContent: { xs: 'flex-start', sm: 'flex-end' },
                          ml: { sm: 'auto' }
                        }}>
                          {(() => {
                              const label = respContentType ? `CT: ${respContentType}` : (bodyLooksHtml ? 'CT: text/html (derived)' : (bodyLooksText ? 'CT: text/plain (derived)' : null));
                              return label ? <Chip variant="outlined" label={label} /> : null;
                          })()}
                          {canRenderEffective && (
                              <Tooltip title={respViewMode === 'raw' ? 'Show rendered content' : 'Show raw'}>
                  <span>
                    <IconButton size="small" onClick={() => setRespViewMode(v => v === 'raw' ? 'rendered' : 'raw')} aria-label="toggle-rendered-view">
                      {respViewMode === 'raw' ? <VisibilityIcon fontSize="small" /> : <CodeIcon fontSize="small" />}
                    </IconButton>
                  </span>
                              </Tooltip>
                          )}
                          {status && <Chip color={status.code >= 200 && status.code < 300 ? 'success' : 'error'} label={`Status: ${status.code} ${status.text}`} />}
                        </Box>
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
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
                        <Typography variant="subtitle2" sx={{ mr: 1 }}>Body</Typography>
                        {/* Keep controls aligned with the Response header on wide screens and wrap below on small */}
                        <Box sx={{
                          display: 'flex', alignItems: 'center', gap: 1,
                          flexBasis: { xs: '100%', sm: 'auto' },
                          flexGrow: { xs: 1, sm: 0 },
                          justifyContent: { xs: 'flex-start', sm: 'flex-end' },
                          ml: { sm: 'auto' }
                        }}>
                          {/* Raw JSON limit controls for raw preview mode; align with Body header on wide, wrap under on narrow */}
                          {!(canRenderEffective && respViewMode === 'rendered') && (
                            <Stack direction="row" alignItems="center" gap={1} sx={{ width: { xs: '100%', sm: 'auto' }, pt: 1, pb: 0.5 }}>
                              <TextField
                                size="small"
                                type="number"
                                label="Raw JSON limit (bytes)"
                                value={rawLimitInput}
                                onChange={(e)=>{ setRawLimitInput(e.target.value); }}
                                onKeyDown={(e)=>{ if ((e as any).key === 'Enter') { applyRawLimitChange(); } }}
                                inputProps={{ min: RAW_JSON_MIN_BYTES, max: RAW_JSON_MAX_BYTES, step: 256 }}
                                sx={{ minWidth: { xs: 160, sm: 210 } }}
                              />
                              <Button size="small" variant="outlined" onClick={applyRawLimitChange}>Apply</Button>
                            </Stack>
                          )}
                        </Box>
                    </Box>
                    {canRenderEffective && respViewMode === 'rendered' ? (
                        isHtmlEffective ? (
                            <Box sx={{ mt: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden', position: 'relative' }}>
                                <Tooltip title="Fullscreen">
                                    <IconButton size="small" aria-label="open-full-view" onClick={() => setRespFullscreen(true)}
                                                sx={{ position: 'absolute', top: 6, right: 6, bgcolor: 'rgba(255,255,255,0.9)', color: '#111', border: '1px solid', borderColor: 'divider', boxShadow: 1, '&:hover': { bgcolor: '#fff' }, zIndex: 1 }}>
                                        <OpenInFullIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                                <Box component="iframe"
                                     sandbox="allow-same-origin allow-scripts"
                                     srcDoc={ensureLightHtml(respBody || '')}
                                     title="Rendered HTML"
                                     style={{ width: '100%', height: 400, border: 'none', backgroundColor: '#fff' }} />
                            </Box>
                        ) : (
                            <Box sx={{ m: 0, mt: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1, position: 'relative', overflow: 'hidden' }}>
                                <Tooltip title="Fullscreen">
                                    <IconButton size="small" aria-label="open-full-view" onClick={() => setRespFullscreen(true)}
                                                sx={{ position: 'absolute', top: 6, right: 6, bgcolor: 'background.paper', zIndex: 1 }}>
                                        <OpenInFullIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                                <Box component="pre" sx={{ m: 0, p: 1, bgcolor: 'background.default', borderRadius: 1, overflow: 'auto', fontFamily: 'monospace', fontSize: 12 }}>
                                    {respBody}
                                </Box>
                            </Box>
                        )
                    ) : (
                        <>
                            <TextField
                                variant="outlined"
                                fullWidth
                                multiline
                                minRows={8}
                                value={respRawPreview || pretty(respBody)}
                                InputProps={{ readOnly: true }}
                                sx={{ mt:1, '& .MuiInputBase-input': { fontFamily:'monospace', fontSize:12 } }}
                            />
                        </>
                    )}
                </Paper>

                <Dialog open={respFullscreen} onClose={() => setRespFullscreen(false)} fullScreen>
                    <Box sx={{ position: 'fixed', inset: 0, bgcolor: '#fff', display: 'flex', flexDirection: 'column' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', p: 1, borderBottom: '1px solid', borderColor: 'divider', color: '#111' }}>
                            <Typography variant="subtitle1" sx={{ flexGrow: 1, color: '#111' }}>Fullscreen</Typography>
                            <Tooltip title="Close fullscreen">
                                <IconButton onClick={() => setRespFullscreen(false)} aria-label="close-full-view" sx={{ color: '#111' }}>
                                    <CloseIcon />
                                </IconButton>
                            </Tooltip>
                        </Box>
                        {isHtmlEffective ? (
                            <Box component="iframe"
                                 sandbox="allow-same-origin allow-scripts"
                                 srcDoc={ensureLightHtml(respBody || '')}
                                 title="Rendered HTML Full"
                                 style={{ width: '100%', height: '100%', border: 'none', backgroundColor: '#fff' }} />
                        ) : (
                            <Box component="pre" sx={{ m: 0, p: 2, flex: 1, overflow: 'auto', fontFamily: 'monospace', fontSize: 14, bgcolor: 'background.default' }}>
                                {respBody}
                            </Box>
                        )}
                    </Box>
                </Dialog>

                <Snackbar open={notif.open} autoHideDuration={4000} onClose={() => setNotif({ ...notif, open: false })}>
                    <Alert severity={notif.severity} onClose={() => setNotif({ ...notif, open: false })}>
                        {notif.message}
                    </Alert>
                </Snackbar>
            </Box>
        );
    }
;

export default HookTester;
