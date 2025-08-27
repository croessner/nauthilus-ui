import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Paper, Typography, Grid, TextField, Button, MenuItem, Divider, CircularProgress, Alert, IconButton, Menu, Chip, Stack, Pagination, Snackbar, Switch, FormControlLabel, Select, Collapse, Checkbox } from '@mui/material';
import PublicIcon from '@mui/icons-material/Public';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import LinkIcon from '@mui/icons-material/Link';
import SaveIcon from '@mui/icons-material/Save';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useConfig } from '../contexts/ConfigContext';
import { useRuntime, getCurrentUserId } from '../contexts/RuntimeContext';
import { authenticatedFetch, extractErrorMessage, getProxyOrigin, prepareAuthParams } from '../utils/apiUtils';
import { getKnownHookEndpointSuggestions } from '../utils/hooks';
import { usePersistedAutoRefresh } from '../hooks/usePersistedAutoRefresh';

// Lightweight world map fallback: show aggregated list if map lib not present
// We keep implementation minimal and dependency-free.

type Row = Record<string, any>;

type Action = 'recent' | 'by_user' | 'by_ip' | 'raw_sql';

const ClickhouseRuntime = (): React.JSX.Element => {
  const { currentProfileName } = useConfig();
  const { connection: runtimeConnection, hooks: runtimeHooks, loadRuntimeSettings, saveRuntimeSettings } = useRuntime();

  // Connection status display similar to DistributedBruteForceTools/ConnectionConfig
  const [connStatus, setConnStatus] = useState<'unknown'|'connected'|'disconnected'|'checking'>('unknown');
  const [statusMessage, setStatusMessage] = useState('');

  // Hook endpoint config like Distributed-BF page
  const [hookEnabled, setHookEnabled] = useState<boolean>(Boolean((runtimeHooks as any)?.clickhouse_query?.enabled));
  const [notif, setNotif] = useState<{open:boolean; message:string; severity:'success'|'error'|'info'|'warning'}>({open:false,message:'',severity:'info'});
  const [endpointPath, setEndpointPath] = useState<string>((runtimeHooks as any)?.clickhouse_query?.endpoint_path || '/hooks/clickhouse-query');
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
  const [authFilter, setAuthFilter] = useState<'all'|'failed'|'success'>('all');
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('asc');

  const [rawPreview, setRawPreview] = useState<string>('');
  const [showRaw, setShowRaw] = useState<boolean>(false);
  const [rawSql, setRawSql] = useState<string>('');

  // Column selection
  const DEFAULT_COLUMNS = useMemo(() => ['ts','client_ip','username','service','proto','geoip_country','authenticated','failed_login_count','gp_attempts','dyn_threat'], []);
  const KNOWN_FIELDS = useMemo(() => [
    'ts','session','service','client_ip','client_port','client_net','client_id','hostname','proto','user_agent','local_ip','local_port','display_name','account','account_field','unique_user_id','username','password_hash','pwnd_info','brute_force_bucket','brute_force_counter','oidc_cid','failed_login_count','failed_login_rank','failed_login_recognized','geoip_guid','geoip_country','geoip_iso_codes','geoip_status','gp_attempts','gp_unique_ips','gp_unique_users','gp_ips_per_user','prot_active','prot_reason','prot_backoff','prot_delay_ms','dyn_threat','dyn_response','debug','repeating','user_found','authenticated','no_auth','xssl_protocol','xssl_cipher','ssl_fingerprint'
  ], []);
  const [availableFields, setAvailableFields] = useState<string[]>(KNOWN_FIELDS);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [fieldSelectorOpen, setFieldSelectorOpen] = useState<boolean>(false);

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
        if ((runtimeHooks as any)?.clickhouse_query?.endpoint_path) {
          setEndpointPath((runtimeHooks as any).clickhouse_query.endpoint_path);
        }
        if (typeof (runtimeHooks as any)?.clickhouse_query?.enabled === 'boolean') {
          setHookEnabled(Boolean((runtimeHooks as any).clickhouse_query.enabled));
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

  // Load persisted columns when runtimeHooks changes
  useEffect(() => {
    const cols = (runtimeHooks as any)?.clickhouse_query?.columns;
    if (Array.isArray(cols) && cols.length) {
      setSelectedFields(cols as string[]);
    }
  }, [runtimeHooks]);

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
    if (action === 'raw_sql' && rawSql) proxyUrl.searchParams.set('sql', rawSql);
    proxyUrl.searchParams.set('limit', String(limit));
    const { authType, authValue } = prepareAuthParams(connectionConfig || {});
    if (authType && authValue) {
      proxyUrl.searchParams.append('authType', authType);
      proxyUrl.searchParams.append('authValue', authValue);
    }
    return proxyUrl.toString();
  };

  const parseHookResult = (input: any): Row[] => {
    try {
      // New format: decoded under clickhouse.query_result with data array
      if (input && typeof input === 'object') {
        if (Array.isArray(input.data)) return input.data as Row[];
        // Legacy path: input might be a raw JSON string nested as { raw: '...' }
        if (typeof input.raw === 'string') {
          const v = JSON.parse(input.raw);
          if (v && Array.isArray(v.data)) return v.data as Row[];
        }
      }
      // Legacy direct raw string
      if (typeof input === 'string') {
        const v = JSON.parse(input);
        if (v && Array.isArray(v.data)) return v.data as Row[];
      }
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
      if (action === 'raw_sql' && !rawSql.trim()) {
        throw new Error('SQL is required for action raw_sql.');
      }
      const conn = getConnection();
      if (!conn?.backend_url) {
        throw new Error('No backend URL configured (Runtime → Connection).');
      }
      const url = buildHookUrl(conn);
      const resp = await authenticatedFetch(url, { method: 'POST' });
      if (!resp.ok) throw new Error(await extractErrorMessage(resp));
      const resJson = await resp.json();
      if (resJson?.status !== 'success' || !resJson?.clickhouse) {
        throw new Error(resJson?.message || 'Hook returned no data');
      }
      const ch = resJson.clickhouse;
      let preview = '';
      let parsed: Row[] = [];
      if (ch.query_result && typeof ch.query_result === 'object') {
        preview = JSON.stringify(ch.query_result, null, 2);
        parsed = parseHookResult(ch.query_result);
      } else if (typeof ch.raw === 'string') {
        preview = ch.raw;
        parsed = parseHookResult(ch.raw);
      } else {
        throw new Error('Hook returned no data');
      }
      setRawPreview(preview.substring(0, 2000));
      setRows(parsed);
      // Update available fields using meta if present, otherwise from row keys
      try {
        let metaNames: string[] = [];
        const qr: any = ch.query_result;
        if (qr && Array.isArray(qr.meta)) {
          metaNames = qr.meta.map((m: any) => m?.name).filter(Boolean);
        } else if (Array.isArray((ch as any)?.meta)) {
          metaNames = (ch as any).meta.map((m: any) => m?.name).filter(Boolean);
        }
        if ((!metaNames || metaNames.length === 0) && parsed && parsed.length > 0) {
          metaNames = Object.keys(parsed[0]);
        }
        if (Array.isArray(metaNames) && metaNames.length) {
          setAvailableFields(metaNames);
        }
      } catch {}
    } catch (e:any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [getConnection, endpointPath, action, username, ip, limit, hookEnabled]);

  // Auto-refresh interval like Security page (default 30s)
  const REFRESH_SESSION_KEY = 'clickhouseRuntime.refreshIntervalMs';
  const [refreshMs, setRefreshMs] = usePersistedAutoRefresh(runQuery, REFRESH_SESSION_KEY, 0);

  // Filter rows by authentication status
  const filteredRows = useMemo(() => {
    if (authFilter === 'all') return rows;
    if (authFilter === 'success') return rows.filter(r => r.authenticated === true);
    // failed: anything that is not strictly true
    return rows.filter(r => r.authenticated !== true);
  }, [rows, authFilter]);

  // Sort rows by selected column and direction
  const sortedRows = useMemo(() => {
    if (!sortBy) return filteredRows;
    const arr = [...filteredRows];
    const getVal = (r: Row) => r?.[sortBy as keyof Row];
    const toNum = (v: any): number => {
      if (v == null || v === '') return Number.NaN;
      if (typeof v === 'number') return v;
      if (typeof v === 'boolean') return v ? 1 : 0;
      const n = Number(v);
      if (!Number.isNaN(n)) return n;
      const t = Date.parse(String(v));
      if (!Number.isNaN(t)) return t;
      return Number.NaN;
    };
    arr.sort((a,b) => {
      const av = getVal(a);
      const bv = getVal(b);
      // Try numeric/date compare first
      const an = toNum(av);
      const bn = toNum(bv);
      let cmp = 0;
      if (!Number.isNaN(an) || !Number.isNaN(bn)) {
        cmp = (an < bn ? -1 : an > bn ? 1 : 0);
      } else {
        const as = String(av ?? '');
        const bs = String(bv ?? '');
        cmp = as.localeCompare(bs);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filteredRows, sortBy, sortDir]);

  // Aggregate countries for top 100; split success/failed by authenticated flag
  const countryAgg = useMemo(() => {
    const map = new Map<string, { success: number; failed: number }>();
    for (const r of filteredRows) {
      const c = (r.geoip_country || '').toString() || 'XX';
      const succ = Boolean(r.authenticated === true);
      const cur = map.get(c) || { success: 0, failed: 0 };
      if (succ) cur.success += 1; else cur.failed += 1;
      map.set(c, cur);
    }
    const arr = Array.from(map.entries()).map(([cc, v]) => ({ country: cc, ...v, total: v.success + v.failed }));
    arr.sort((a,b) => b.total - a.total);
    return arr.slice(0, 100);
  }, [filteredRows]);

  const pagedRows = useMemo(() => {
    const start = (page-1)*pageSize;
    return sortedRows.slice(start, start+pageSize);
  }, [sortedRows, page, pageSize]);

  // Reset to first page when filter or sort changes
  useEffect(() => {
    setPage(1);
  }, [authFilter, sortBy, sortDir]);

  // When availableFields arrive and no selection yet, pick sensible defaults
  useEffect(() => {
    if (availableFields.length === 0) return;
    if (selectedFields.length === 0) {
      const persisted = ((runtimeHooks as any)?.clickhouse_query?.columns || []) as string[];
      const intersect = (a: string[], b: string[]) => a.filter(x => b.includes(x));
      let next = Array.isArray(persisted) && persisted.length ? intersect(persisted, availableFields) : [];
      if (next.length === 0) next = intersect(DEFAULT_COLUMNS, availableFields);
      if (next.length === 0) next = availableFields.slice(0, Math.min(10, availableFields.length));
      setSelectedFields(next);
    }
  }, [availableFields]);

  // If sorted column becomes invisible, clear sortBy
  useEffect(() => {
    if (sortBy && !selectedFields.includes(sortBy)) {
      setSortBy(null);
    }
  }, [selectedFields, sortBy]);

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb:2, flexWrap:'wrap' }}>
        <Typography variant="h6" sx={{ fontWeight:700 }}>ClickHouse</Typography>
        <Box sx={{ flexGrow:1 }} />
        {/* Top-right refresh and interval (like Security) */}
        <Select size="small" value={refreshMs} onChange={(e)=>setRefreshMs(Number(e.target.value))} sx={{ minWidth: 140, mr:1 }} displayEmpty aria-label="Refresh interval">
          <MenuItem value={0}>OFF</MenuItem>
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
              const prevCQ: any = (runtimeHooks as any)?.clickhouse_query || {};
              const colsToSave = (selectedFields && selectedFields.length) ? selectedFields : (prevCQ?.columns || []);
              await saveRuntimeSettings(userId, currentProfileName, runtimeConnection, {
                ...(runtimeHooks || {}),
                clickhouse_query: { ...prevCQ, enabled: hookEnabled, endpoint_path: endpointPath, columns: colsToSave }
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
              <MenuItem value="raw_sql">raw_sql</MenuItem>
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
          <Grid item xs={12} sm={4}>
            <TextField select fullWidth label="Status" value={authFilter} onChange={e=>{ setAuthFilter(e.target.value as any); }}>
              <MenuItem value="all">failed/success</MenuItem>
              <MenuItem value="failed">failed</MenuItem>
              <MenuItem value="success">success</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              multiline
              minRows={3}
              maxRows={12}
              label="SQL (SELECT ...)"
              placeholder="SELECT ... FROM ... WHERE ..."
              value={rawSql}
              onChange={(e)=>setRawSql(e.target.value)}
              disabled={action !== 'raw_sql'}
            />
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

      <Paper sx={{ p:2, mb:2 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="subtitle1" gutterBottom>Field Selection</Typography>
          <IconButton size="small" onClick={()=>setFieldSelectorOpen(v=>!v)} aria-label={fieldSelectorOpen ? 'Collapse' : 'Expand'}>
            <ExpandMoreIcon sx={{ transform: fieldSelectorOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
          </IconButton>
        </Stack>
        <Collapse in={fieldSelectorOpen} unmountOnExit>
          <Typography variant="body2" color="text.secondary" sx={{ mb:1 }}>Choose the columns to display in the results table.</Typography>
          <Stack direction="row" spacing={1} sx={{ mb:1, flexWrap:'wrap', alignItems:'center' }}>
            <Button size="small" onClick={()=>setSelectedFields(availableFields)}>Select all</Button>
            <Button size="small" onClick={()=>setSelectedFields([])}>Clear</Button>
            <Box sx={{ flexGrow:1 }} />
            <Button size="small" startIcon={<SaveIcon/>} variant="contained" onClick={async()=>{
              try {
                const userId = await getCurrentUserId();
                const prevCQ: any = (runtimeHooks as any)?.clickhouse_query || {};
                await saveRuntimeSettings(userId, currentProfileName, runtimeConnection, {
                  ...(runtimeHooks || {}),
                  clickhouse_query: { ...prevCQ, enabled: hookEnabled, endpoint_path: endpointPath, columns: selectedFields }
                } as any);
                setNotif({ open:true, severity:'success', message:'Column selection saved' });
              } catch(e:any) {
                setNotif({ open:true, severity:'error', message:`Save failed: ${e?.message || String(e)}` });
              }
            }}>Save settings</Button>
          </Stack>
          <Grid container spacing={1}>
            {availableFields.map((name)=> (
              <Grid item xs={12} sm={6} md={4} lg={3} key={name}>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={selectedFields.includes(name)}
                      onChange={(e)=>{
                        if (e.target.checked) setSelectedFields(prev => Array.from(new Set([...(prev||[]), name])));
                        else setSelectedFields(prev => (prev||[]).filter(n => n !== name));
                      }}
                    />
                  }
                  label={name}
                />
              </Grid>
            ))}
          </Grid>
        </Collapse>
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
                    {selectedFields.map(h => {
                      const active = sortBy === h;
                      const indicator = active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
                      return (
                        <th
                          key={h}
                          onClick={() => {
                            if (sortBy === h) {
                              setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
                            } else {
                              setSortBy(h);
                              setSortDir('asc');
                            }
                          }}
                          style={{ textAlign:'left', padding:'6px 8px', borderBottom:'1px solid #ddd', cursor:'pointer', userSelect:'none' }}
                          title="Sort by this column"
                        >
                          {h}{indicator}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((r, idx) => (
                    <tr key={idx}>
                      {selectedFields.map((h) => (
                        <td key={h} style={{ padding:'6px 8px', borderBottom:'1px solid #eee' }}>{String((r as any)?.[h] ?? '')}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>
            <Box display="flex" alignItems="center" justifyContent="space-between" mt={2}>
              <TextField select size="small" label="Rows per page" value={pageSize} onChange={e=>{ setPageSize(Number(e.target.value)); setPage(1); }}>
                {[10,25,50,100].map(n=> <MenuItem key={n} value={n}>{n}</MenuItem>)}
              </TextField>
              <Pagination color="primary" page={page} onChange={(_,p)=>setPage(p)} count={Math.max(1, Math.ceil(sortedRows.length / pageSize))} />
            </Box>
          </>
        )}
        {rawPreview && (
          <>
            <Divider sx={{ my:2 }} />
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="caption" color="text.secondary">Raw JSON (preview)</Typography>
              <IconButton size="small" onClick={()=>setShowRaw(v=>!v)} aria-label={showRaw ? 'Collapse' : 'Expand'}>
                <ExpandMoreIcon sx={{ transform: showRaw ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
              </IconButton>
            </Stack>
            <Collapse in={showRaw} unmountOnExit>
              <Paper variant="outlined" sx={{ p:1, mt:1, maxHeight:200, overflow:'auto', fontFamily:'monospace', fontSize:12 }}>
                {rawPreview}
              </Paper>
            </Collapse>
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
