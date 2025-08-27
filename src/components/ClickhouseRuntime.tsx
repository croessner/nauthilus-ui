import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Paper, Typography, Grid, TextField, Button, MenuItem, Divider, CircularProgress, Alert, IconButton, Menu, Chip, Stack, Pagination, Snackbar, Switch, FormControlLabel, Select, Collapse, Checkbox, InputAdornment } from '@mui/material';
import PublicIcon from '@mui/icons-material/Public';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import LinkIcon from '@mui/icons-material/Link';
import SaveIcon from '@mui/icons-material/Save';
import EventIcon from '@mui/icons-material/Event';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useConfig } from '../contexts/ConfigContext';
import { useRuntime, getCurrentUserId } from '../contexts/RuntimeContext';
import { authenticatedFetch, extractErrorMessage, getProxyOrigin, prepareAuthParams } from '../utils/apiUtils';
import { getKnownHookEndpointSuggestions } from '../utils/hooks';
import { usePersistedAutoRefresh } from '../hooks/usePersistedAutoRefresh';
import { byteLengthUtf8, getEffectiveRawJsonMaxBytes, setRawJsonMaxBytesOverride, RAW_JSON_MIN_BYTES, RAW_JSON_MAX_BYTES } from '../utils/limits';
import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps';

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
  const [rawJsonMaxBytes, setRawJsonMaxBytes] = useState<number>(getEffectiveRawJsonMaxBytes());
  const [showRaw, setShowRaw] = useState<boolean>(false);
  const [rawSql, setRawSql] = useState<string>('');

  // Optional time range filter for ts field
  const [tsStart, setTsStart] = useState<string>(''); // datetime-local string
  const [tsEnd, setTsEnd] = useState<string>('');   // datetime-local string
  const tsStartRef = useRef<HTMLInputElement | null>(null);
  const tsEndRef = useRef<HTMLInputElement | null>(null);
  const openPicker = useCallback((input?: HTMLInputElement | null) => {
    if (!input) return;
    const anyInput = input as any;
    if (typeof anyInput.showPicker === 'function') {
      try { anyInput.showPicker(); return; } catch {}
    }
    try { input.focus(); input.click(); } catch {}
  }, []);

  // Column selection
  const DEFAULT_COLUMNS = useMemo(() => ['ts','client_ip','username','service','proto','geoip_country','authenticated','failed_login_count','gp_attempts','dyn_threat'], []);
  const KNOWN_FIELDS = useMemo(() => [
    'ts','session','service','client_ip','client_port','client_net','client_id','hostname','proto','user_agent','local_ip','local_port','display_name','account','account_field','unique_user_id','username','password_hash','pwnd_info','brute_force_bucket','brute_force_counter','oidc_cid','failed_login_count','failed_login_rank','failed_login_recognized','geoip_guid','geoip_country','geoip_iso_codes','geoip_status','gp_attempts','gp_unique_ips','gp_unique_users','gp_ips_per_user','prot_active','prot_reason','prot_backoff','prot_delay_ms','dyn_threat','dyn_response','debug','repeating','user_found','authenticated','no_auth','xssl_protocol','xssl_cipher','ssl_fingerprint'
  ], []);
  const [availableFields, setAvailableFields] = useState<string[]>(KNOWN_FIELDS);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const sortedAvailableFields = useMemo(() => [...availableFields].sort((a,b)=> a.localeCompare(b, undefined, { sensitivity: 'base' })), [availableFields]);
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
    if (action === 'raw_sql' && rawSql) {
      let sql = rawSql.trim();
      // Strip trailing semicolons to satisfy backend safety checks
      sql = sql.replace(/;+$/, '');
      if (sql) proxyUrl.searchParams.set('sql', sql);
    }
    proxyUrl.searchParams.set('limit', String(limit));
    // Optional ts range
    if (tsStart) {
      const d = new Date(tsStart);
      if (!Number.isNaN(d.getTime())) proxyUrl.searchParams.set('ts_start', d.toISOString());
    }
    if (tsEnd) {
      const d = new Date(tsEnd);
      if (!Number.isNaN(d.getTime())) proxyUrl.searchParams.set('ts_end', d.toISOString());
    }
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

  const runQuery = useCallback(async (force: boolean = false) => {
    // Guard: raw_sql should only execute on explicit Run click
    if (action === 'raw_sql' && !force) {
      return; // do not auto-run or refresh-trigger raw SQL
    }
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
      // Validate optional time range
      if (tsStart && tsEnd) {
        const s = new Date(tsStart).getTime();
        const e = new Date(tsEnd).getTime();
        if (!Number.isNaN(s) && !Number.isNaN(e) && e < s) {
          throw new Error('Invalid time range: end is before start.');
        }
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
        // Try to pretty-print JSON if possible
        try {
          const maybeJson = JSON.parse(ch.raw);
          preview = JSON.stringify(maybeJson, null, 2);
        } catch {
          preview = ch.raw;
        }
        parsed = parseHookResult(ch.raw);
      } else {
        throw new Error('Hook returned no data');
      }
      // Truncate preview according to configured raw JSON byte limit
      const MAX_PREVIEW = rawJsonMaxBytes;
      const encLen = typeof preview === 'string' ? byteLengthUtf8(preview) : 0;
      let previewText = preview;
      if (typeof preview === 'string' && encLen > MAX_PREVIEW) {
        // approximate by substring; try to find a cut that is under limit
        let end = preview.length;
        // quick proportional cut
        end = Math.floor(preview.length * (MAX_PREVIEW / encLen));
        end = Math.max(0, Math.min(preview.length, end));
        let cut = preview.substring(0, end);
        // ensure we don't exceed limits after proportional cut
        while (byteLengthUtf8(cut) > MAX_PREVIEW && end > 0) {
          end -= Math.max(1, Math.floor(end * 0.05));
          cut = preview.substring(0, end);
        }
        previewText = `${cut}\n\n[Note: Output too large – preview has been truncated.]`;
      }
      setRawPreview(previewText);
      setRows(parsed);
      // Auto-expand raw if no tabular rows parsed
      setShowRaw(parsed.length === 0 && Boolean(preview));
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
  }, [getConnection, endpointPath, action, username, ip, limit, hookEnabled, rawSql, tsStart, tsEnd]);

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
    // decorate with index to achieve stable sort
    const decorated = filteredRows.map((r, i) => ({ r, i }));
    const getVal = (row: Row) => row?.[sortBy as keyof Row];
    const toFiniteNumber = (v: any): number | null => {
      if (v == null || v === '') return null;
      if (typeof v === 'number') return Number.isFinite(v) ? v : null;
      if (typeof v === 'boolean') return v ? 1 : 0;
      const n = Number(v);
      if (Number.isFinite(n)) return n;
      const t = Date.parse(String(v));
      return Number.isFinite(t) ? t : null;
    };
    const isMissing = (v: any) => v === null || v === undefined || v === '';

    decorated.sort((a, b) => {
      const av = getVal(a.r);
      const bv = getVal(b.r);

      // Handle missing values deterministically
      const aMiss = isMissing(av);
      const bMiss = isMissing(bv);
      let cmp = 0;
      if (aMiss && bMiss) {
        cmp = 0;
      } else if (aMiss) {
        cmp = 1; // missing last for asc
      } else if (bMiss) {
        cmp = -1;
      } else {
        // Both present: try numeric/date first if both parse to finite numbers
        const an = toFiniteNumber(av);
        const bn = toFiniteNumber(bv);
        if (an !== null && bn !== null) {
          cmp = an < bn ? -1 : an > bn ? 1 : 0;
        } else {
          const as = String(av).toLowerCase();
          const bs = String(bv).toLowerCase();
          cmp = as < bs ? -1 : as > bs ? 1 : 0;
        }
      }

      if (cmp === 0) cmp = a.i - b.i; // stable tie-breaker
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return decorated.map(d => d.r);
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

  // ---- Map helpers/state (for collapsible world map) ----
  // Approximate country centroids (lon, lat) for plotting markers
  const COUNTRY_CENTROIDS: Record<string, { lon: number; lat: number; aliases?: string[] }> = useMemo(() => ({
    US: { lon: -98, lat: 39, aliases: ['USA','United States','United States of America','US'] },
    CA: { lon: -106, lat: 56, aliases: ['Canada','CA'] },
    MX: { lon: -102, lat: 23, aliases: ['Mexico','MX'] },
    BR: { lon: -51, lat: -10, aliases: ['Brazil','BR'] },
    AR: { lon: -64, lat: -34, aliases: ['Argentina','AR'] },
    CL: { lon: -71, lat: -30, aliases: ['Chile','CL'] },
    CO: { lon: -74, lat: 4, aliases: ['Colombia','CO'] },
    VE: { lon: -66, lat: 8, aliases: ['Venezuela','VE'] },
    GB: { lon: -2, lat: 54, aliases: ['UK','United Kingdom','Great Britain','GB','England'] },
    IE: { lon: -8, lat: 53, aliases: ['Ireland','IE'] },
    FR: { lon: 2, lat: 46, aliases: ['France','FR'] },
    ES: { lon: -4, lat: 40, aliases: ['Spain','ES'] },
    PT: { lon: -8, lat: 39.5, aliases: ['Portugal','PT'] },
    DE: { lon: 10, lat: 51, aliases: ['Germany','Deutschland','DE'] },
    AT: { lon: 14, lat: 47.5, aliases: ['Austria','AT'] },
    CH: { lon: 8.2, lat: 46.8, aliases: ['Switzerland','Schweiz','CH'] },
    IT: { lon: 12.5, lat: 42.5, aliases: ['Italy','IT'] },
    NL: { lon: 5.3, lat: 52.2, aliases: ['Netherlands','NL'] },
    BE: { lon: 4.7, lat: 50.8, aliases: ['Belgium','BE'] },
    PL: { lon: 19, lat: 52, aliases: ['Poland','PL'] },
    CZ: { lon: 15.5, lat: 49.8, aliases: ['Czechia','Czech Republic','CZ'] },
    SE: { lon: 15, lat: 62, aliases: ['Sweden','SE'] },
    NO: { lon: 8, lat: 61, aliases: ['Norway','NO'] },
    FI: { lon: 26, lat: 64, aliases: ['Finland','FI'] },
    DK: { lon: 10, lat: 56, aliases: ['Denmark','DK'] },
    RU: { lon: 100, lat: 60, aliases: ['Russia','RU','Russian Federation'] },
    UA: { lon: 31, lat: 49, aliases: ['Ukraine','UA'] },
    RO: { lon: 25, lat: 46, aliases: ['Romania','RO'] },
    HU: { lon: 19, lat: 47, aliases: ['Hungary','HU'] },
    GR: { lon: 22, lat: 39, aliases: ['Greece','GR'] },
    TR: { lon: 35, lat: 39, aliases: ['Turkey','TR','Türkiye'] },
    IL: { lon: 35, lat: 31.5, aliases: ['Israel','IL'] },
    SA: { lon: 45, lat: 24, aliases: ['Saudi Arabia','SA'] },
    AE: { lon: 54, lat: 24, aliases: ['United Arab Emirates','UAE','AE'] },
    IN: { lon: 78, lat: 22, aliases: ['India','IN'] },
    PK: { lon: 70, lat: 30, aliases: ['Pakistan','PK'] },
    CN: { lon: 104, lat: 35, aliases: ['China','CN','PRC'] },
    JP: { lon: 138, lat: 36.2, aliases: ['Japan','JP'] },
    KR: { lon: 127.5, lat: 36.5, aliases: ['South Korea','Republic of Korea','KR','Korea, Republic of'] },
    ID: { lon: 113, lat: -0.8, aliases: ['Indonesia','ID'] },
    AU: { lon: 134, lat: -25, aliases: ['Australia','AU'] },
    NZ: { lon: 170, lat: -42, aliases: ['New Zealand','NZ'] },
    ZA: { lon: 24, lat: -29, aliases: ['South Africa','ZA'] },
    EG: { lon: 30, lat: 27, aliases: ['Egypt','EG'] },
    NG: { lon: 8, lat: 9.6, aliases: ['Nigeria','NG'] },
    KE: { lon: 37.9, lat: 0.2, aliases: ['Kenya','KE'] },
    MA: { lon: -6, lat: 32, aliases: ['Morocco','MA'] },
    TN: { lon: 10, lat: 34, aliases: ['Tunisia','TN'] },
    DZ: { lon: 2.6, lat: 28, aliases: ['Algeria','DZ'] },
  }), []);

  const normalizeCountryKey = useCallback((label: string): string | null => {
    if (!label) return null;
    const v = String(label).trim();
    if ((COUNTRY_CENTROIDS as any)[v]) return v as keyof typeof COUNTRY_CENTROIDS as string;
    const up = v.toUpperCase();
    if ((COUNTRY_CENTROIDS as any)[up]) return up;
    for (const [iso, def] of Object.entries(COUNTRY_CENTROIDS)) {
      if (def.aliases?.some(a => a.toLowerCase() === v.toLowerCase())) return iso;
    }
    return null;
  }, [COUNTRY_CENTROIDS]);

  const mapData = useMemo(() => {
    const mapped: { iso: string; country: string; lon: number; lat: number; success: number; failed: number; total: number }[] = [];
    const unmapped: { country: string; success: number; failed: number; total: number }[] = [];
    for (const c of countryAgg) {
      const iso = normalizeCountryKey(c.country);
      const rec = { success: c.success, failed: c.failed, total: c.total } as const;
      if (iso) {
        const def = COUNTRY_CENTROIDS[iso];
        mapped.push({ iso, country: c.country, lon: def.lon, lat: def.lat, ...rec });
      } else {
        unmapped.push({ country: c.country, ...rec });
      }
    }
    const maxTotal = mapped.reduce((m, x) => Math.max(m, x.total), 1);
    const r = (t: number) => {
      const minR = 4, maxR = 16;
      const f = Math.sqrt(Math.max(0, t) / Math.max(1, maxTotal));
      return Math.max(minR, Math.min(maxR, minR + (maxR - minR) * f));
    };
    return { mapped, unmapped, radius: r };
  }, [countryAgg, normalizeCountryKey, COUNTRY_CENTROIDS]);

  const [mapOpen, setMapOpen] = useState<boolean>(false);

  // Build quick lookup for stats by ISO code for coloring
  const isoStats = useMemo(() => {
    const m = new Map<string, { success: number; failed: number; total: number }>();
    for (const it of mapData.mapped) {
      m.set(it.iso, { success: it.success, failed: it.failed, total: it.total });
    }
    return m;
  }, [mapData]);

  // Color helper: interpolate between orange (failed) and blue (success) — colorblind friendly (Okabe-Ito inspired)
  const ratioToFill = useCallback((ratio: number) => {
    const clamp = (v:number,min=0,max=1)=> Math.max(min, Math.min(max, v));
    const r = clamp(ratio);
    // From failed (orange) to success (blue)
    const from = { r: 213, g: 94,  b: 0   }; // #D55E00 (orange)
    const to   = { r: 0,   g: 114, b: 178 }; // #0072B2 (blue)
    const mix = (a:number,b:number,t:number)=> Math.round(a + (b - a) * t);
    const rr = mix(from.r, to.r, r);
    const gg = mix(from.g, to.g, r);
    const bb = mix(from.b, to.b, r);
    const hex = (n:number)=> n.toString(16).padStart(2,'0');
    return `#${hex(rr)}${hex(gg)}${hex(bb)}`;
  }, []);


  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb:2, flexWrap:'wrap' }}>
        <Typography variant="h6" sx={{ fontWeight:700 }}>ClickHouse</Typography>
        <Box sx={{ flexGrow:1 }} />
        {/* Raw JSON limit control to match other pages */}
        <TextField
          size="small"
          type="number"
          label="Raw JSON limit (bytes)"
          value={rawJsonMaxBytes}
          onChange={(e)=>{
            const v = Number(e.target.value || 0);
            setRawJsonMaxBytesOverride(v);
            const clamped = Math.max(RAW_JSON_MIN_BYTES, Math.min(RAW_JSON_MAX_BYTES, Number.isFinite(v) ? v : RAW_JSON_MIN_BYTES));
            setRawJsonMaxBytes(clamped);
          }}
          inputProps={{ min: RAW_JSON_MIN_BYTES, max: RAW_JSON_MAX_BYTES, step: 256 }}
          helperText={`${RAW_JSON_MIN_BYTES}–${RAW_JSON_MAX_BYTES}`}
          sx={{ mr:1, minWidth: 210 }}
        />
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
          <Grid item xs={12} sm={3}>
            <TextField
              fullWidth
              type="number"
              label="Limit"
              value={limit}
              inputProps={{ min: 1, max: 1000, step: 1 }}
              onChange={(e)=>{
                const v = Number(e.target.value);
                setLimit(Number.isFinite(v) ? v : 0);
              }}
            />
          </Grid>
          <Grid item xs={12} sm={3}>
            <TextField select fullWidth label="Status" value={authFilter} onChange={e=>{ setAuthFilter(e.target.value as any); }}>
              <MenuItem value="all">failed/success</MenuItem>
              <MenuItem value="failed">failed</MenuItem>
              <MenuItem value="success">success</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12} sm={3}>
            <TextField
              fullWidth
              type="datetime-local"
              label="Start (ts)"
              value={tsStart}
              onChange={(e)=>setTsStart(e.target.value)}
              inputRef={tsStartRef}
              InputLabelProps={{ shrink: true }}
              InputProps={{ endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={()=>openPicker(tsStartRef.current)} aria-label="Pick start time">
                    <EventIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) }}
              helperText="Optional"
            />
          </Grid>
          <Grid item xs={12} sm={3}>
            <TextField
              fullWidth
              type="datetime-local"
              label="End (ts)"
              value={tsEnd}
              onChange={(e)=>setTsEnd(e.target.value)}
              inputRef={tsEndRef}
              InputLabelProps={{ shrink: true }}
              InputProps={{ endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={()=>openPicker(tsEndRef.current)} aria-label="Pick end time">
                    <EventIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) }}
              helperText="Optional"
            />
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
            <Button variant="contained" startIcon={<PlayArrowIcon/>} onClick={()=>runQuery(true)} disabled={loading}>
              Run
            </Button>
            <Button sx={{ ml:1 }} variant="outlined" startIcon={<RefreshIcon/>} onClick={()=>{ setRows([]); setRawPreview(''); setError(''); }} disabled={loading}>
              Reset
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {error && <Alert severity="error" sx={{ mb:2 }}>{error}</Alert>}

      {/* World Map (collapsible) */}
      <Paper sx={{ p:2, mb:2 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Stack direction="row" alignItems="center" gap={1}>
            <PublicIcon/>
            <Typography variant="subtitle1">Map (failed/success)</Typography>
          </Stack>
          <IconButton size="small" onClick={()=>setMapOpen(v=>!v)} aria-label={mapOpen ? 'Collapse' : 'Expand'}>
            <ExpandMoreIcon sx={{ transform: mapOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
          </IconButton>
        </Stack>
        <Collapse in={mapOpen} timeout="auto" unmountOnExit>
          {mapData.mapped.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt:1 }}>No data to display.</Typography>
          ) : (
            <Box sx={{ width:'100%', overflowX:'auto', mt:1 }}>
              {/* Using react-simple-maps world-110m TopoJSON */}
              <ComposableMap projection="geoMercator" width={980} height={400} style={{ width: '100%', height: 'auto' }}>
                <Geographies geography="https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json">
                  {({ geographies }) => (
                    <>
                      {geographies.map(geo => {
                        const props: any = (geo as any).properties || {};
                        const name = String(props.name || props.NAME || props.NAME_LONG || '').trim();
                        const iso = name ? normalizeCountryKey(name) : null;
                        let fill = '#f0f0f0';
                        if (iso && isoStats.has(iso)) {
                          const s = isoStats.get(iso)!;
                          const ratio = s.total > 0 ? s.success / s.total : 0;
                          fill = ratioToFill(ratio);
                        }
                        return (
                          <Geography key={geo.rsmKey} geography={geo} fill={fill} stroke="#ccc" />
                        );
                      })}
                      {mapData.mapped.map((pt, idx) => {
                        const R = mapData.radius(pt.total);
                        const total = Math.max(1, pt.total);
                        const succFrac = pt.success / total;
                        const color = ratioToFill(succFrac);
                        return (
                          <Marker key={`b${idx}`} coordinates={[pt.lon, pt.lat]}>
                            <g>
                              <circle cx={0} cy={0} r={R} fill={color} stroke="#333" strokeWidth={0.5} />
                              <title>{`${pt.country}: total ${pt.total}\nsuccess ${pt.success} | failed ${pt.failed}`}</title>
                            </g>
                          </Marker>
                        );
                      })}
                    </>
                  )}
                </Geographies>
              </ComposableMap>
              <Stack direction="row" spacing={2} alignItems="center" sx={{ mt:1, flexWrap:'wrap' }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Box sx={{ width:12, height:12, bgcolor:'#0072B2', borderRadius:0.5 }} />
                  <Typography variant="caption">success (blue)</Typography>
                </Stack>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Box sx={{ width:12, height:12, bgcolor:'#D55E00', borderRadius:0.5 }} />
                  <Typography variant="caption">failed (orange)</Typography>
                </Stack>
                {mapData.unmapped.length > 0 && (
                  <Typography variant="caption" color="text.secondary">Unmapped: {mapData.unmapped.length}</Typography>
                )}
                <Typography variant="caption" color="text.secondary" sx={{ ml:2 }}>
                  Country and circle color encode success ratio (orange = more failed, blue = more success)
                </Typography>
              </Stack>
            </Box>
          )}
        </Collapse>
      </Paper>

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
            <Button size="small" onClick={()=>setSelectedFields(sortedAvailableFields)}>Select all</Button>
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
            {sortedAvailableFields.map((name)=> (
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
          rawPreview ? (
            <>
              <TextField
                label="Raw output"
                variant="outlined"
                fullWidth
                multiline
                minRows={6}
                maxRows={20}
                value={rawPreview}
                InputProps={{ readOnly: true }}
                sx={{ '& .MuiInputBase-input': { fontFamily:'monospace', fontSize:12 } }}
              />
            </>
          ) : (
            <Typography variant="body2" color="text.secondary">No rows.</Typography>
          )
        ) : (
          <>
            <Box sx={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr>
                    {selectedFields.map((h, idx) => {
                      const active = sortBy === h;
                      const indicator = active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
                      return (
                        <th
                          key={h}
                          draggable
                          onDragStart={(e) => {
                            try { e.dataTransfer.setData('text/plain', String(idx)); } catch {}
                            (e.currentTarget as any).dataset.dragging = 'true';
                            // Reduce click triggering after drag
                            (e.currentTarget as any)._dragStartedAt = Date.now();
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            (e.currentTarget as any).style.background = 'rgba(25,118,210,0.08)';
                          }}
                          onDragLeave={(e) => {
                            (e.currentTarget as any).style.background = '';
                          }}
                          onDrop={async (e) => {
                            e.preventDefault();
                            (e.currentTarget as any).style.background = '';
                            let fromIdx = Number(e.dataTransfer.getData('text/plain'));
                            const toIdx = idx;
                            if (!Number.isFinite(fromIdx) || fromIdx === toIdx) return;
                            const next = [...selectedFields];
                            const [moved] = next.splice(fromIdx, 1);
                            next.splice(toIdx, 0, moved);
                            setSelectedFields(next);
                            // Persist new order automatically
                            try {
                              const userId = await getCurrentUserId();
                              const prevCQ: any = (runtimeHooks as any)?.clickhouse_query || {};
                              await saveRuntimeSettings(userId, currentProfileName, runtimeConnection, {
                                ...(runtimeHooks || {}),
                                clickhouse_query: { ...prevCQ, enabled: hookEnabled, endpoint_path: endpointPath, columns: next }
                              } as any);
                              setNotif({ open:true, severity:'success', message:'Column order saved' });
                            } catch(e:any) {
                              setNotif({ open:true, severity:'error', message:`Save failed: ${e?.message || String(e)}` });
                            }
                          }}
                          onClick={() => {
                            // prevent sort if click immediately after drag start
                            const t = (Date.now() - ((document?.activeElement as any)?._dragStartedAt || 0));
                            if (t >= 0 && t < 300) return;
                            if (sortBy === h) {
                              setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
                            } else {
                              setSortBy(h);
                              setSortDir('asc');
                            }
                          }}
                          style={{ textAlign:'left', padding:'6px 8px', borderBottom:'1px solid #ddd', cursor:'grab', userSelect:'none' }}
                          title="Drag & drop to reorder, click to sort"
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
            {rawPreview && (
              <>
                <Divider sx={{ my:2 }} />
                <Stack direction="row" alignItems="center" gap={1}>
                  <Button size="small" onClick={()=>setShowRaw(v=>!v)} sx={{ textTransform:'none' }}>
                    {showRaw ? 'HIDE RAW JSON' : 'SHOW RAW JSON'}
                  </Button>
                </Stack>
                {showRaw && (
                  <TextField
                    variant="outlined"
                    fullWidth
                    multiline
                    minRows={6}
                    maxRows={12}
                    value={rawPreview}
                    InputProps={{ readOnly: true }}
                    sx={{ mt:1, '& .MuiInputBase-input': { fontFamily:'monospace', fontSize:12 } }}
                  />
                )}
              </>
            )}
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
