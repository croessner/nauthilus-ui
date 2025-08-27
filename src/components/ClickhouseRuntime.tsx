import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Paper, Typography, Grid, TextField, Button, MenuItem, Divider, CircularProgress, Alert, IconButton, Menu, Chip, Stack, Pagination, Snackbar, Switch, FormControlLabel, Select } from '@mui/material';
import PublicIcon from '@mui/icons-material/Public';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import LinkIcon from '@mui/icons-material/Link';
import SaveIcon from '@mui/icons-material/Save';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import { useConfig } from '../contexts/ConfigContext';
import { useRuntime, getCurrentUserId } from '../contexts/RuntimeContext';
import { authenticatedFetch, extractErrorMessage, getProxyOrigin, prepareAuthParams } from '../utils/apiUtils';
import { getKnownHookEndpointSuggestions } from '../utils/hooks';
import { usePersistedAutoRefresh } from '../hooks/usePersistedAutoRefresh';

// Lightweight world map fallback: show aggregated list if map lib not present
// We keep implementation minimal and dependency-free.

type Row = Record<string, any>;

type Action = 'recent' | 'by_user' | 'by_ip';

const ClickhouseRuntime = (): React.JSX.Element => {
  const { currentProfileName } = useConfig();
  const { connection: runtimeConnection, hooks: runtimeHooks, loadRuntimeSettings, saveRuntimeSettings } = useRuntime();

  // Connection status display similar to DistributedBruteForceTools/ConnectionConfig
  const [connStatus, setConnStatus] = useState<'unknown'|'connected'|'disconnected'|'checking'>('unknown');
  const [statusMessage, setStatusMessage] = useState('');

  // Hook endpoint config like Distributed-BF page
  const [hookEnabled, setHookEnabled] = useState<boolean>(Boolean(runtimeHooks?.clickhouse_query?.enabled));
  const [notif, setNotif] = useState<{open:boolean; message:string; severity:'success'|'error'|'info'|'warning'}>({open:false,message:'',severity:'info'});
  const [endpointPath, setEndpointPath] = useState<string>(runtimeHooks?.clickhouse_query?.endpoint_path || '/hooks/clickhouse-query');
  const endpointSuggestions = useMemo(() => getKnownHookEndpointSuggestions(runtimeHooks), [runtimeHooks]);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const menuOpen = Boolean(anchorEl);

  // Keep latest connection like other pages to avoid stale closures
  const connectionRef = useRef(runtimeConnection);
  useEffect(() => { connectionRef.current = runtimeConnection; }, [runtimeConnection]);
  const getConnection = useCallback(() => connectionRef.current, []);

  // Query controls
  const [action, setAction] = useState<Action>('recent');
  const [username, setUsername] = useState<string>('');
  const [ip, setIp] = useState<string>('');
  const [limit, setLimit] = useState<number>(100);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Data and pagination (client-side)
  const [rows, setRows] = useState<Row[]>([]);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  const [rawPreview, setRawPreview] = useState<string>('');

  // Load runtime on first mount to ensure connection and hooks are loaded like other pages
  const didRunRef = useRef<string | null>(null);
  useEffect(() => {
    if (didRunRef.current === currentProfileName) return;
    didRunRef.current = currentProfileName;
    (async () => {
      try {
        setConnStatus('checking');
        const userId = await getCurrentUserId();
        await loadRuntimeSettings(userId, currentProfileName);
        setConnStatus('connected');
        setStatusMessage('Connected to Nauthilus backend (ping successful)');
        // adopt defaults after runtime loaded
        if (runtimeHooks?.clickhouse_query?.endpoint_path) {
          setEndpointPath(runtimeHooks.clickhouse_query.endpoint_path);
        }
        if (typeof runtimeHooks?.clickhouse_query?.enabled === 'boolean') {
          setHookEnabled(Boolean(runtimeHooks.clickhouse_query.enabled));
        }
      } catch (e:any) {
        setConnStatus('disconnected');
        setStatusMessage(`Failed to load runtime: ${e?.message || String(e)}`);
      }
    })();
  }, [currentProfileName, loadRuntimeSettings]);

  useEffect(() => {
    if (connStatus === 'connected' && statusMessage.includes('Connected')) {
      const t = setTimeout(() => setStatusMessage(''), 4000);
      return () => clearTimeout(t);
    }
  }, [connStatus, statusMessage]);

  const handlePickSuggestion = (ep: string) => { setEndpointPath(ep); setAnchorEl(null); };

  const buildHookUrl = (connectionConfig: any) => {
    const proxyUrl = new URL('/proxy/hooks/any', getProxyOrigin());
    proxyUrl.searchParams.append('url', (connectionConfig?.backend_url || '').toString());
    // The proxy expects 'endpoint_path'
    proxyUrl.searchParams.append('endpoint_path', endpointPath);
    // Add action-specific query params directly
    proxyUrl.searchParams.set('action', action);
    if (action === 'by_user' && username) proxyUrl.searchParams.set('username', username);
    if (action === 'by_ip' && ip) proxyUrl.searchParams.set('ip', ip);
    proxyUrl.searchParams.set('limit', String(limit));
    const { authType, authValue } = prepareAuthParams(connectionConfig || {});
    if (authType && authValue) {
      proxyUrl.searchParams.append('authType', authType);
      proxyUrl.searchParams.append('authValue', authValue);
    }
    return proxyUrl.toString();
  };

  const parseClickHouseJson = (raw: string): Row[] => {
    try {
      const v = JSON.parse(raw);
      if (v && Array.isArray(v.data)) return v.data as Row[];
    } catch {}
    return [];
  };

  const runQuery = useCallback(async () => {
    setLoading(true);
    setError('');
    setRows([]);
    setPage(1);
    try {
      if (!hookEnabled) {
        throw new Error('Hook is disabled. Enable it in Hook Configuration.');
      }
      if (!endpointPath) {
        throw new Error('Hook endpoint path is empty.');
      }
      if (action === 'by_user' && !username) {
        throw new Error('Username is required for action by_user.');
      }
      if (action === 'by_ip' && !ip) {
        throw new Error('IP is required for action by_ip.');
      }
      const conn = getConnection();
      if (!conn?.backend_url) {
        throw new Error('No backend URL configured (Runtime → Connection).');
      }
      const url = buildHookUrl(conn);
      const resp = await authenticatedFetch(url, { method: 'GET' });
      if (!resp.ok) throw new Error(await extractErrorMessage(resp));
      const resJson = await resp.json();
      if (resJson?.status !== 'success' || !resJson?.clickhouse?.raw) {
        throw new Error(resJson?.message || 'Hook returned no data');
      }
      const raw = String(resJson.clickhouse.raw);
      setRawPreview(raw.substring(0, 2000));
      const parsed = parseClickHouseJson(raw);
      setRows(parsed);
    } catch (e:any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [getConnection, endpointPath, action, username, ip, limit, hookEnabled]);

  // Auto-refresh interval like Security page (default 30s)
  const REFRESH_SESSION_KEY = 'clickhouseRuntime.refreshIntervalMs';
  const [refreshMs, setRefreshMs] = usePersistedAutoRefresh(runQuery, REFRESH_SESSION_KEY, 30000);

  // Aggregate countries for top 100; split success/failed by authenticated flag
  const countryAgg = useMemo(() => {
    const map = new Map<string, { success: number; failed: number }>();
    for (const r of rows) {
      const c = (r.geoip_country || '').toString() || 'XX';
      const succ = Boolean(r.authenticated === true);
      const cur = map.get(c) || { success: 0, failed: 0 };
      if (succ) cur.success += 1; else cur.failed += 1;
      map.set(c, cur);
    }
    const arr = Array.from(map.entries()).map(([cc, v]) => ({ country: cc, ...v, total: v.success + v.failed }));
    arr.sort((a,b) => b.total - a.total);
    return arr.slice(0, 100);
  }, [rows]);

  const pagedRows = useMemo(() => {
    const start = (page-1)*pageSize;
    return rows.slice(start, start+pageSize);
  }, [rows, page, pageSize]);

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb:2, flexWrap:'wrap' }}>
        <Typography variant="h6" sx={{ fontWeight:700 }}>ClickHouse</Typography>
        <Box sx={{ flexGrow:1 }} />
        {/* Top-right refresh and interval (like Security) */}
        <Select size="small" value={refreshMs} onChange={(e)=>setRefreshMs(Number(e.target.value))} sx={{ minWidth: 140, mr:1 }} displayEmpty aria-label="Refresh interval">
          <MenuItem value={10000}>10 s</MenuItem>
          <MenuItem value={30000}>30 s</MenuItem>
          <MenuItem value={60000}>1 m</MenuItem>
          <MenuItem value={120000}>2 m</MenuItem>
        </Select>
        <Button variant="outlined" size="small" startIcon={<RefreshIcon/>} onClick={()=>{ void runQuery(); }}>Refresh</Button>
      </Stack>

      {/* Connection status (match other pages) */}
      <Box sx={{ display:'flex', alignItems:'center', mb:2 }}>
        <Typography variant="subtitle1" sx={{ mr:2 }}>Connection Status:</Typography>
        {connStatus === 'checking' && <CircularProgress size={20} sx={{ mr:1 }} />}
        {connStatus === 'connected' && <CheckCircleIcon color="success" sx={{ mr:1 }} />}
        {connStatus === 'disconnected' && <ErrorIcon color="error" sx={{ mr:1 }} />}
        {connStatus === 'unknown' && <Typography color="text.secondary">Not checked</Typography>}
        {connStatus === 'disconnected' && (
          <Typography color="error.main">{statusMessage}</Typography>
        )}
      </Box>

      {/* Hook configuration */}
      <Paper sx={{ p:2, mb:2 }}>
        <Typography variant="subtitle1" gutterBottom>Hook Configuration</Typography>
        <Stack direction="row" spacing={1} sx={{ flexWrap:'wrap', alignItems:'center', mb:1 }}>
          {/* Enabled/Disabled above input */}
          <FormControlLabel control={<Switch checked={hookEnabled} onChange={(e)=>setHookEnabled(e.target.checked)} size="small" />} label={hookEnabled? 'Enabled' : 'Disabled'} />
        </Stack>
        <TextField fullWidth label="Hook endpoint (path)" value={endpointPath} onChange={e=>setEndpointPath(e.target.value)} InputProps={{ endAdornment: (
          <Box sx={{ display:'flex', alignItems:'center' }}>
            <IconButton onClick={(e)=>setAnchorEl(e.currentTarget)} size="small" disabled={!endpointSuggestions.length} aria-label="pick-endpoint"><LinkIcon/></IconButton>
          </Box>
        ) }} />
        <Box sx={{ display:'flex', justifyContent:'flex-end', mt:1 }}>
          <Button size="small" startIcon={<SaveIcon />} variant="contained" onClick={async()=>{
            try {
              const userId = await getCurrentUserId();
              await saveRuntimeSettings(userId, currentProfileName, runtimeConnection, {
                ...(runtimeHooks || {}),
                clickhouse_query: { enabled: hookEnabled, endpoint_path: endpointPath }
              } as any);
              setNotif({ open:true, severity:'success', message:'Hook settings saved' });
            } catch(e:any) {
              setNotif({ open:true, severity:'error', message:`Failed to save: ${e?.message || String(e)}` });
            }
          }}>Save hook settings</Button>
        </Box>
        <Menu anchorEl={anchorEl} open={menuOpen} onClose={()=>setAnchorEl(null)}>
          {(endpointSuggestions || []).map((s)=> (
            <MenuItem key={s} onClick={()=>handlePickSuggestion(s)}>{s}</MenuItem>
          ))}
          {!endpointSuggestions?.length && <MenuItem disabled>No suggestions</MenuItem>}
        </Menu>
      </Paper>

      {/* Query section below hook configuration */}
      <Paper sx={{ p:2, mb:2 }}>
        <Typography variant="subtitle1">Query</Typography>
        <Grid container spacing={1} sx={{ mt:1 }}>
          <Grid item xs={12} sm={4}>
            <TextField select fullWidth label="Action" value={action} onChange={e=>setAction(e.target.value as Action)}>
              <MenuItem value="recent">recent</MenuItem>
              <MenuItem value="by_user">by_user</MenuItem>
              <MenuItem value="by_ip">by_ip</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField fullWidth label="Username" value={username} onChange={e=>setUsername(e.target.value)} disabled={action!=='by_user'} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField fullWidth label="IP" value={ip} onChange={e=>setIp(e.target.value)} disabled={action!=='by_ip'} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField select fullWidth label="Limit" value={limit} onChange={e=>setLimit(Number(e.target.value))}>
              {[50,100,200,500,1000].map(n=> <MenuItem key={n} value={n}>{n}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={8}>
            <Button variant="contained" startIcon={<PlayArrowIcon/>} onClick={runQuery} disabled={loading}>
              Run
            </Button>
            <Button sx={{ ml:1 }} variant="outlined" startIcon={<RefreshIcon/>} onClick={()=>{ setRows([]); setRawPreview(''); setError(''); }} disabled={loading}>
              Reset
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {error && <Alert severity="error" sx={{ mb:2 }}>{error}</Alert>}

      <Paper sx={{ p:2, mb:2 }}>
        <Box display="flex" alignItems="center" gap={1} mb={1}>
          <PublicIcon/>
          <Typography variant="subtitle1">Top countries (success vs failed)</Typography>
        </Box>
        {countryAgg.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No data to display.</Typography>
        ) : (
          <Grid container spacing={1}>
            {countryAgg.map((c)=> (
              <Grid key={c.country} item xs={12} sm={6} md={4} lg={3}>
                <Paper variant="outlined" sx={{ p:1 }}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography fontWeight={600}>{c.country}</Typography>
                    <Typography variant="caption">{c.total}</Typography>
                  </Stack>
                  <Stack direction="row" spacing={1} mt={0.5}>
                    <Chip size="small" label={`success ${c.success}`} color="success" />
                    <Chip size="small" label={`failed ${c.failed}`} color="error" />
                  </Stack>
                </Paper>
              </Grid>
            ))}
          </Grid>
        )}
      </Paper>

      <Paper sx={{ p:2 }}>
        <Typography variant="subtitle1" gutterBottom>Results</Typography>
        {loading ? (
          <Box sx={{ display:'flex', justifyContent:'center', my:3 }}><CircularProgress/></Box>
        ) : rows.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No rows.</Typography>
        ) : (
          <>
            <Box sx={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr>
                    {['ts','client_ip','username','service','proto','geoip_country','authenticated','failed_login_count','gp_attempts','dyn_threat'].map(h => (
                      <th key={h} style={{ textAlign:'left', padding:'6px 8px', borderBottom:'1px solid #ddd' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((r, idx) => (
                    <tr key={idx}>
                      <td style={{ padding:'6px 8px', borderBottom:'1px solid #eee' }}>{String(r.ts||'')}</td>
                      <td style={{ padding:'6px 8px', borderBottom:'1px solid #eee' }}>{String(r.client_ip||'')}</td>
                      <td style={{ padding:'6px 8px', borderBottom:'1px solid #eee' }}>{String(r.username||'')}</td>
                      <td style={{ padding:'6px 8px', borderBottom:'1px solid #eee' }}>{String(r.service||'')}</td>
                      <td style={{ padding:'6px 8px', borderBottom:'1px solid #eee' }}>{String(r.proto||'')}</td>
                      <td style={{ padding:'6px 8px', borderBottom:'1px solid #eee' }}>{String(r.geoip_country||'')}</td>
                      <td style={{ padding:'6px 8px', borderBottom:'1px solid #eee' }}>{String(r.authenticated===true)}</td>
                      <td style={{ padding:'6px 8px', borderBottom:'1px solid #eee' }}>{r.failed_login_count ?? ''}</td>
                      <td style={{ padding:'6px 8px', borderBottom:'1px solid #eee' }}>{r.gp_attempts ?? ''}</td>
                      <td style={{ padding:'6px 8px', borderBottom:'1px solid #eee' }}>{r.dyn_threat ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>
            <Box display="flex" alignItems="center" justifyContent="space-between" mt={2}>
              <TextField select size="small" label="Rows per page" value={pageSize} onChange={e=>{ setPageSize(Number(e.target.value)); setPage(1); }}>
                {[10,25,50,100].map(n=> <MenuItem key={n} value={n}>{n}</MenuItem>)}
              </TextField>
              <Pagination color="primary" page={page} onChange={(_,p)=>setPage(p)} count={Math.max(1, Math.ceil(rows.length / pageSize))} />
            </Box>
          </>
        )}
        {rawPreview && (
          <>
            <Divider sx={{ my:2 }} />
            <Typography variant="caption" color="text.secondary">Raw JSON (preview)</Typography>
            <Paper variant="outlined" sx={{ p:1, mt:1, maxHeight:200, overflow:'auto', fontFamily:'monospace', fontSize:12 }}>
              {rawPreview}
            </Paper>
          </>
        )}
      </Paper>
      <Snackbar
        open={notif.open}
        autoHideDuration={4000}
        onClose={() => setNotif((n)=>({ ...n, open:false }))}
        message={notif.message}
      />
    </Box>
  );
};

export default ClickhouseRuntime;
