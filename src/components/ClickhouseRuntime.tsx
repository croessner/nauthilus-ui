import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import { Alert, Box, Button, Checkbox, Chip, CircularProgress, Collapse, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Divider, FormControlLabel, IconButton, InputAdornment, LinearProgress, Menu, MenuItem, Paper, Select, Slider, Snackbar, Stack, Switch, TextField, Tooltip, Typography } from '@mui/material';
import {useTheme} from '@mui/material/styles';
import AnalysisPanel from './AnalysisPanel';
import CollapsibleFormSection from './common/CollapsibleFormSection';
import InfoTooltip from './common/InfoTooltip';
import PublicIcon from '@mui/icons-material/Public';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import LinkIcon from '@mui/icons-material/Link';
import SaveIcon from '@mui/icons-material/Save';
import EventIcon from '@mui/icons-material/Event';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ClearIcon from '@mui/icons-material/Clear';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import BookmarkAddIcon from '@mui/icons-material/BookmarkAdd';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import {useConfig} from '../contexts/ConfigContext';
import {getCurrentUserId, useRuntime} from '../contexts/RuntimeContext';
import {
    authenticatedFetch,
    buildBackendAuthHeaders,
    checkConnection as checkConnectionUtil,
    extractErrorMessage,
    getProxyOrigin,
    loadSettings as loadSettingsUtil
} from '../utils/apiUtils';
import {getKnownHookEndpointSuggestions} from '../utils/hooks';
import {usePersistedAutoRefresh} from '../hooks/usePersistedAutoRefresh';
import {
    applyPreviewLimit,
    getEffectiveRawJsonMaxBytes,
    RAW_JSON_MAX_BYTES,
    RAW_JSON_MIN_BYTES,
    setRawJsonMaxBytesOverride
} from '../utils/limits';
import {fetchIpapiStatus} from '../utils/ipapiStatus';
import {ClientIpCell} from './ClientIpCell';
import {ComposableMap, Geographies, Geography, Marker, ZoomableGroup} from '../lib/reactSimpleMaps';
import Grid from '@mui/material/Grid';

type Row = Record<string, any>;

type Action = 'recent' | 'by_user' | 'by_account' | 'by_ip' | 'raw_sql';

type Bookmark = { id: string; name: string; value: string; createdAt?: number; updatedAt?: number };

type BookmarkState = { raw_sql: Bookmark[]; search: Bookmark[] };

const MAX_BOOKMARKS = 5;

const ClickhouseRuntime = (): React.JSX.Element => {
  const theme = useTheme();
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
  const [account, setAccount] = useState<string>('');
  const [ip, setIp] = useState<string>('');
  const [limit, setLimit] = useState<number>(100);
  const [pageSize, setPageSize] = useState<number>(100);
  // IPAPI feature flag from server
  const [ipapiEnabled, setIpapiEnabled] = useState<boolean>(false);
  useEffect(() => { fetchIpapiStatus().then(setIpapiEnabled).catch(() => setIpapiEnabled(false)); }, []);
  const [loading, setLoading] = useState<boolean>(false);
  // Debounced busy state: only show loading indicators if loading persists >150ms
  const [busy, setBusy] = useState<boolean>(false);
  useEffect(() => {
    let t: any;
    if (loading) {
      t = setTimeout(() => setBusy(true), 150);
    } else {
      setBusy(false);
    }
    return () => { if (t) clearTimeout(t); };
  }, [loading]);
  
  // Visual pulse only when new data actually arrives during auto-refresh
  const [changePulse, setChangePulse] = useState<boolean>(false);
  const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [error, setError] = useState<string>('');
  // Auto-dismiss error after a timeout and allow manual dismiss
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // Clear any previous timer
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
      errorTimerRef.current = null;
    }
    if (error) {
      // Auto-hide after 8 seconds
      errorTimerRef.current = setTimeout(() => {
        setError('');
        errorTimerRef.current = null;
      }, 8000);
    }
    return () => {
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current);
        errorTimerRef.current = null;
      }
    };
  }, [error]);
  const queryAbortRef = useRef<AbortController | null>(null);
  const lastReqIdRef = useRef(0);

  // Data and pagination
  const [rows, setRows] = useState<Row[]>([]);
  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [authFilter, setAuthFilter] = useState<'all'|'failed'|'success'>('all');
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('asc');
  // Search-as-you-type for results table
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchDraft, setSearchDraft] = useState<string>('');
  // Column widths (px), persisted in runtime settings under clickhouse_query.columnWidths
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});

  const [rawPreview, setRawPreview] = useState<string>('');
  const [rawPreviewFull, setRawPreviewFull] = useState<string>('');
  const [rawJsonMaxBytes, setRawJsonMaxBytes] = useState<number>(getEffectiveRawJsonMaxBytes());
  const [rawLimitInput, setRawLimitInput] = useState<string>(String(getEffectiveRawJsonMaxBytes()));
  const [showRaw, setShowRaw] = useState<boolean>(false);

  // Helper to apply raw JSON limit consistently (DRY)
  const applyRawLimitFromInput = useCallback(() => {
    const v = Number((rawLimitInput || '').trim());
    const clamped = Math.max(
      RAW_JSON_MIN_BYTES,
      Math.min(RAW_JSON_MAX_BYTES, Number.isFinite(v) ? v : RAW_JSON_MIN_BYTES)
    );
    setRawJsonMaxBytesOverride(clamped);
    setRawJsonMaxBytes(clamped);
    if (rawPreviewFull) setRawPreview(applyPreviewLimit(rawPreviewFull, clamped));
  }, [rawLimitInput, rawPreviewFull]);
  const [rawSql, setRawSql] = useState<string>('');
  // Row identity and expansion state (key-based, robust to reordering)
  const rowKey = useCallback((r: Row) => {
    // Prefer explicit IDs if available
    const cand = (r as any)?.id || (r as any)?.event_id || (r as any)?.uuid;
    if (cand) return String(cand);
    try {
      return JSON.stringify(r);
    } catch {
      const ts = String((r as any)?.ts ?? '');
      const ipk = String((r as any)?.client_ip ?? '');
      const user = String((r as any)?.username ?? (r as any)?.unique_user_id ?? '');
      const svc = String((r as any)?.service ?? '');
      return `${ts}|${ipk}|${user}|${svc}`;
    }
  }, []);

  // Track expanded rows by stable key
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const isExpanded = useCallback((k: string) => expandedKeys.has(k), [expandedKeys]);
  // Keep a snapshot of row data when expanded to avoid flicker during refresh
  const expandedSnapshotsRef = useRef<Map<string, Row>>(new Map());
  const toggleExpanded = useCallback((k:string, row?: Row)=>{
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(k)) {
        next.delete(k);
        try { expandedSnapshotsRef.current.delete(k); } catch {}
      } else {
        next.add(k);
        if (row) {
          try { expandedSnapshotsRef.current.set(k, row); } catch {}
        }
      }
      return next;
    });
  }, []);

  // Track seen rows (for dimming during auto-refresh)
  const seenKeysRef = useRef<Set<string>>(new Set());
  // Quick boolean ref for auto-refresh status to avoid TDZ with refreshMs
  const autoRefreshingRef = useRef<boolean>(false);

  // Row DOM refs for scroll stabilization
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const isEmptyValue = useCallback((v:any)=>{
    if (v === null || v === undefined) return true;
    if (typeof v === 'string') return v.trim() === '';
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === 'object') return Object.keys(v).length === 0;
    return false;
  }, []);
  // Bookmarks (persisted per user/runtime)
  const [bookmarks, setBookmarks] = useState<BookmarkState>({ raw_sql: [], search: [] });
  const [bmMenuAnchorSql, setBmMenuAnchorSql] = useState<null | HTMLElement>(null);
  const [bmMenuAnchorSearch, setBmMenuAnchorSearch] = useState<null | HTMLElement>(null);
  // Bookmark dialogs (use same style as Profile-Management)
  const [bmDialogOpen, setBmDialogOpen] = useState(false);
  const [bmDialogMode, setBmDialogMode] = useState<'create'|'rename'|'delete'>('create');
  const [bmDialogKind, setBmDialogKind] = useState<keyof BookmarkState>('raw_sql');
  const [bmDialogTargetId, setBmDialogTargetId] = useState<string|undefined>(undefined);
  const [bmDialogName, setBmDialogName] = useState<string>('');
  const [bmDialogError, setBmDialogError] = useState<string>('');


  // Keep text input in sync when the applied limit changes
  useEffect(() => { setRawLimitInput(String(rawJsonMaxBytes)); }, [rawJsonMaxBytes]);

  // Optional time range filter for ts field
  const [tsStart, setTsStart] = useState<string>(''); // datetime-local string (user-entered)
  const [tsEnd, setTsEnd] = useState<string>('');   // datetime-local string (user-entered)
  // Time zone handling: full list of IANA zones plus UTC. Selected zone controls conversion of inputs and display
  // deprecated tsTzMode replaced by tsTimeZone
  const [tsTimeZone, setTsTimeZone] = useState<string>(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const tzList = useMemo(() => {
    const zones: string[] = (Intl as any).supportedValuesOf ? (Intl as any).supportedValuesOf('timeZone') : [];
    const withUtc = Array.from(new Set(['UTC', ...zones])).filter(Boolean);
    // Build label with current offset
    const now = new Date();
    const formatter = (tz: string) => {
      try {
        const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset', year:'numeric' });
        // shortOffset like GMT+2
        const parts = f.formatToParts(now);
        const tzn = parts.find(p=>p.type==='timeZoneName')?.value || '';
        const off = tzn.replace(/^GMT/, '') || '+00';
        const offNorm = /[+-]\d/.test(off) ? (off.length===2? off+':00' : off.replace('−','-')) : '+00:00';
        return `${offNorm} ${tz}`;
      } catch { return `+00:00 ${tz}`; }
    };
    return withUtc.map(z => ({ id: z, label: formatter(z) }))
      .sort((a,b)=> a.label.localeCompare(b.label));
  }, []);

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
  const DEFAULT_COLUMNS = useMemo(() => ['ts','client_ip','username','service','features','proto','method','authenticated','latency','http_status','dyn_threat'], []);
  const KNOWN_FIELDS = useMemo(() => [
    'ts','session','service','features','client_ip','client_port','client_net','client_id','hostname','proto','method','user_agent','local_ip','local_port','display_name','account','username','password_hash','pwnd_info','brute_force_bucket','brute_force_counter','oidc_cid','failed_login_count','failed_login_rank','failed_login_recognized','geoip_guid','geoip_country','geoip_iso_codes','geoip_status','gp_attempts','gp_unique_ips','gp_unique_users','gp_ips_per_user','prot_active','prot_reason','prot_backoff','prot_delay_ms','dyn_threat','dyn_response','repeating','user_found','authenticated','xssl_protocol','xssl_cipher','ssl_fingerprint','latency','http_status','status_msg'
  ], []);
  const [availableFields, setAvailableFields] = useState<string[]>(KNOWN_FIELDS);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  // Track if the user explicitly reordered columns during this session; do not auto-adjust after that
  const [userReorderedCols, setUserReorderedCols] = useState<boolean>(false);
  // Default normalization: if 'ts' is part of the selection, make it the leftmost column by default
  const normalizeColumnsDefault = useCallback((cols: string[]): string[] => {
    try {
      if (!Array.isArray(cols) || cols.length === 0) return cols;
      if (!cols.includes('ts')) return cols;
      if (cols[0] === 'ts') return cols;
      const rest = cols.filter(c => c !== 'ts');
      return ['ts', ...rest];
    } catch {
      return cols;
    }
  }, []);
  const sortedAvailableFields = useMemo(() => [...availableFields].sort((a,b)=> a.localeCompare(b, undefined, { sensitivity: 'base' })), [availableFields]);

  // Search input autocomplete (ghost text) for field names
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [caretAtEnd, setCaretAtEnd] = useState(true);
  // Computed typography and paddings from the actual input to perfectly align ghost text
  const [ghostStyle, setGhostStyle] = useState<Record<string, any>>({});
  useEffect(() => {
    const input = searchInputRef.current;
    if (!input) return;
    const sync = () => {
      try {
        const cs = window.getComputedStyle(input);
        setGhostStyle({
          fontFamily: cs.fontFamily,
          fontSize: cs.fontSize,
          fontWeight: cs.fontWeight,
          lineHeight: cs.lineHeight,
          letterSpacing: cs.letterSpacing,
          paddingLeft: cs.paddingLeft,
          paddingRight: cs.paddingRight,
        });
      } catch {}
    };
    sync();
    window.addEventListener('resize', sync);
    return () => { window.removeEventListener('resize', sync); };
  }, [searchInputRef]);

  const completionSuffix = useMemo(() => {
    const value = searchDraft || '';
    if (!caretAtEnd || !value) return '';
    // Extract last token consisting of letters, digits, underscore or dot
    let i = value.length - 1;
    while (i >= 0 && /[A-Za-z0-9_.]/.test(value[i])) i--;
    const tokenStart = i + 1;
    const token = value.slice(tokenStart);
    if (!token) return '';

    // Suppress completion when typing a value (RHS of a comparison) within the current clause.
    // Heuristic: look at the text after the last logical reset (AND/OR/NOT or '(') and before the current token.
    // If that window contains any comparison operator, treat the current token as a value and do not suggest field names.
    const before = value.slice(0, tokenStart);
    const beforeLower = before.toLowerCase();
    const lastAnd = beforeLower.lastIndexOf(' and ');
    const lastOr = beforeLower.lastIndexOf(' or ');
    const lastNot = beforeLower.lastIndexOf(' not ');
    const lastLParen = before.lastIndexOf('(');
    const resetIdx = Math.max(lastAnd, lastOr, lastNot, lastLParen, -1);
    const windowStr = before.slice(resetIdx + 1);
    const hasComparator = ['==','!=','<=','>=','<','>'].some(op => windowStr.includes(op));
    if (hasComparator) return '';

    const lower = token.toLowerCase();
    const candidate = sortedAvailableFields.find(f => f.toLowerCase().startsWith(lower) && f !== token);
    if (!candidate) return '';
    return candidate.slice(token.length);
  }, [searchDraft, caretAtEnd, sortedAvailableFields]);

  const updateCaretAtEnd = useCallback(() => {
    const el = searchInputRef.current;
    if (!el) { setCaretAtEnd(true); return; }
    try {
      setCaretAtEnd(el.selectionStart === el.value.length && el.selectionEnd === el.value.length);
    } catch {
      setCaretAtEnd(true);
    }
  }, []);

  // Resizing state
  const resizingRef = useRef<{ col: string | null; startX: number; startW: number } | null>(null);
  const colWidthsRef = useRef<Record<string, number>>({});
  // Any drag/resize should temporarily suppress header click-to-sort to avoid accidental sorting
  const suppressSortUntilRef = useRef<number>(0);
  useEffect(() => { colWidthsRef.current = columnWidths; }, [columnWidths]);
  const MIN_COL_W = 60;
  const MAX_COL_W = 800;
  const getDefaultColWidth = useCallback((h: string) => {
    // Heuristic default width
    const short = ['ts','authenticated','failed_login_count','gp_attempts','dyn_threat','latency','http_status'];
    if (short.includes(h)) return 120;
    if (/ip|port|iso|tz|proto|method/i.test(h)) return 140;
    if (/user|account|service|host/i.test(h)) return 180;
    return 220;
  }, []);
  const getColWidth = useCallback((h: string) => (colWidthsRef.current[h] || getDefaultColWidth(h)), [getDefaultColWidth]);
  // Keep a snapshot of non-raw_sql widths to restore when leaving raw_sql
  const normalWidthsRef = useRef<Record<string, number> | null>(null);

  const persistColumnWidths = useCallback(async (next: Record<string, number>) => {
    try {
      const userId = await getCurrentUserId();
      const prevCQ: any = (runtimeHooks as any)?.clickhouse_query || {};
      const ui = { action, username, account, ip, limit, pageSize, authFilter, tsStart, tsEnd, tsTimeZone, rawSql, searchQuery } as any;
      if (action === 'raw_sql') {
        // Do not persist column widths for ad-hoc raw SQL results
        setNotif({ open:true, severity:'info', message:'Column width change not persisted for raw SQL results' });
        return;
      }
      await saveRuntimeSettings(userId, currentProfileName, runtimeConnection, {
        ...(runtimeHooks || {}),
        clickhouse_query: { ...prevCQ, enabled: hookEnabled, endpoint_path: endpointPath, columns: selectedFields, columnWidths: next, ui }
      } as any);
      setNotif({ open:true, severity:'success', message:'Column width saved' });
    } catch(e:any) {
      setNotif({ open:true, severity:'error', message:`Save failed: ${e?.message || String(e)}` });
    }
  }, [runtimeHooks, action, username, account, ip, limit, pageSize, authFilter, tsStart, tsEnd, tsTimeZone, rawSql, searchQuery, currentProfileName, runtimeConnection, hookEnabled, endpointPath, selectedFields, saveRuntimeSettings]);

  const onResizeStart = useCallback((col: string, clientX: number) => {
    const startW = getColWidth(col);
    // Immediately suppress sorting for a short period; mouseup may occur over a different header
    suppressSortUntilRef.current = Date.now() + 800;
    resizingRef.current = { col, startX: clientX, startW };
    const onMove = (ev: MouseEvent | TouchEvent) => {
      const x = (ev as TouchEvent).touches ? (ev as TouchEvent).touches[0].clientX : (ev as MouseEvent).clientX;
      if (!resizingRef.current) return;
      const dx = x - resizingRef.current.startX;
      const w = Math.max(MIN_COL_W, Math.min(MAX_COL_W, Math.round(resizingRef.current.startW + dx)));
      const next = { ...colWidthsRef.current, [resizingRef.current.col!]: w };
      setColumnWidths(next);
    };
    const onEnd = async () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      const st = resizingRef.current; resizingRef.current = null;
      // Extend suppression a bit to cover the click synthesized on mouseup
      suppressSortUntilRef.current = Date.now() + 400;
      if (st) await persistColumnWidths(colWidthsRef.current);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove, { passive: false } as any);
    window.addEventListener('touchend', onEnd);
  }, [getColWidth, persistColumnWidths]);

  // --- Bookmarks helpers ---
  const persistBookmarks = useCallback(async (next: BookmarkState) => {
    try {
      const userId = await getCurrentUserId();
      const prevCQ: any = (runtimeHooks as any)?.clickhouse_query || {};
      const ui = { action, username, account, ip, limit, pageSize, authFilter, tsStart, tsEnd, tsTimeZone, rawSql, searchQuery } as any;
      const cols = action === 'raw_sql' ? ((prevCQ?.columns) || []) : selectedFields;
      await saveRuntimeSettings(userId, currentProfileName, runtimeConnection, {
        ...(runtimeHooks || {}),
        clickhouse_query: { ...prevCQ, enabled: hookEnabled, endpoint_path: endpointPath, columns: cols, bookmarks: next, ui }
      } as any);
      setBookmarks(next);
      setNotif({ open:true, severity:'success', message:'Bookmarks saved' });
    } catch(e:any) {
      setNotif({ open:true, severity:'error', message:`Save failed: ${e?.message || String(e)}` });
    }
  }, [runtimeHooks, action, username, account, ip, limit, pageSize, authFilter, tsStart, tsEnd, tsTimeZone, rawSql, searchQuery, currentProfileName, runtimeConnection, hookEnabled, endpointPath, selectedFields, columnWidths, saveRuntimeSettings]);


  const loadBookmark = useCallback((kind: keyof BookmarkState, id: string) => {
    const list = bookmarks[kind] || [];
    const bm = list.find(b => b.id === id);
    if (!bm) return;
    if (kind === 'raw_sql') setRawSql(bm.value);
    else { setSearchQuery(bm.value); setSearchDraft(bm.value); }
    setNotif({ open:true, severity:'success', message:'Bookmark loaded' });
  }, [bookmarks]);


  const deleteBookmark = useCallback(async (kind: keyof BookmarkState, id: string) => {
    const list = bookmarks[kind] || [];
    const bm = list.find(b => b.id === id);
    if (!bm) return;
    const next = { ...bookmarks, [kind]: list.filter(b => b.id !== id) } as BookmarkState;
    await persistBookmarks(next);
  }, [bookmarks, persistBookmarks]);

  // New helpers used by dialogs (no prompt/confirm)
  const createBookmark = useCallback(async (kind: keyof BookmarkState, value: string, name: string) => {
    const trimmed = (value || '').trim();
    const nm = (name || '').trim();
    if (!trimmed || !nm) return;
    const list = bookmarks[kind] || [];
    const now = Date.now();
    const id = `${now.toString(36)}-${Math.random().toString(36).slice(2,6)}`;
    const next: BookmarkState = { ...bookmarks, [kind]: [...list, { id, name: nm, value: trimmed, createdAt: now, updatedAt: now }] } as BookmarkState;
    await persistBookmarks(next);
  }, [bookmarks, persistBookmarks]);

  const applyRenameBookmark = useCallback(async (kind: keyof BookmarkState, id: string, name: string) => {
    const nm = (name || '').trim();
    if (!nm) return;
    const list = bookmarks[kind] || [];
    const idx = list.findIndex(b => b.id === id);
    if (idx < 0) return;
    const current = list[idx];
    const now = Date.now();
    const updated = { ...current, name: nm, updatedAt: now };
    const nextList = [...list]; nextList.splice(idx,1,updated);
    const next = { ...bookmarks, [kind]: nextList } as BookmarkState;
    await persistBookmarks(next);
  }, [bookmarks, persistBookmarks]);

  const handleBmDialogConfirm = useCallback(async () => {
    setBmDialogError('');
    if (bmDialogMode === 'create') {
      const value = bmDialogKind === 'raw_sql' ? rawSql : searchDraft;
      const list = bookmarks[bmDialogKind] || [];
      if (!value.trim()) { setBmDialogError('Content is empty.'); return; }
      if (!bmDialogName.trim()) { setBmDialogError('Please enter a name.'); return; }
      if (list.length >= MAX_BOOKMARKS) { setBmDialogError(`Maximum ${MAX_BOOKMARKS} bookmarks allowed.`); return; }
      await createBookmark(bmDialogKind, value, bmDialogName);
      setBmDialogOpen(false);
    } else if (bmDialogMode === 'rename') {
      if (!bmDialogTargetId) return;
      if (!bmDialogName.trim()) { setBmDialogError('Please enter a new name.'); return; }
      await applyRenameBookmark(bmDialogKind, bmDialogTargetId, bmDialogName);
      setBmDialogOpen(false);
    } else if (bmDialogMode === 'delete') {
      if (!bmDialogTargetId) return;
      await deleteBookmark(bmDialogKind, bmDialogTargetId);
      setBmDialogOpen(false);
    }
  }, [bmDialogMode, bmDialogKind, bmDialogTargetId, bmDialogName, rawSql, searchQuery, bookmarks, createBookmark, applyRenameBookmark, deleteBookmark]);

  const handleBmDialogClose = useCallback(() => {
    setBmDialogOpen(false);
  }, []);

  // Connection check via shared utility (DRY)
  const checkConnection = useCallback(async (connParam?: any) => {
    await checkConnectionUtil(connParam ?? getConnection(), setConnStatus, setStatusMessage);
  }, [getConnection]);

  // Load runtime settings and check connection on mount/profile change
  useEffect(() => {
    (async () => {
      await loadSettingsUtil(
        getCurrentUserId,
        loadRuntimeSettings,
        currentProfileName,
        async (conn) => { await checkConnection(conn); },
        getConnection
      );
    })();
  }, [currentProfileName, loadRuntimeSettings, getConnection, checkConnection]);

  // Ensure connection check runs immediately when backend_url becomes available (bypass navigation debounce)
  useEffect(() => {
    if (runtimeConnection?.backend_url) {
      void checkConnection(runtimeConnection);
    }
  }, [runtimeConnection?.backend_url, checkConnection]);

  useEffect(() => {
    if (connStatus === 'connected' && statusMessage.includes('Connected')) {
      const t = setTimeout(() => setStatusMessage(''), 4000);
      return () => clearTimeout(t);
    }
  }, [connStatus, statusMessage]);

  // Load persisted columns when runtimeHooks changes
  useEffect(() => {
    const cq: any = (runtimeHooks as any)?.clickhouse_query;
    const cols = cq?.columns;
    if (Array.isArray(cols) && cols.length) {
      setSelectedFields(cols as string[]);
    }
    const savedWidths = cq?.columnWidths;
    if (savedWidths && typeof savedWidths === 'object') {
      setColumnWidths(savedWidths as Record<string, number>);
    }
  }, [runtimeHooks]);

  // Ensure hook configuration (enabled + endpoint_path) syncs once runtimeHooks are loaded
  const didSyncHookConfigRef = useRef<string | null>(null);
  useEffect(() => {
    // Reset guard when profile changes
    if (didSyncHookConfigRef.current !== currentProfileName) {
      didSyncHookConfigRef.current = null;
    }
    if (didSyncHookConfigRef.current) return;
    const cq: any = (runtimeHooks as any)?.clickhouse_query;
    if (!cq || typeof cq !== 'object') return;
    // Mark as synced for this profile
    didSyncHookConfigRef.current = currentProfileName;
    // Only update if values are present in runtime settings
    if (typeof cq.enabled === 'boolean') setHookEnabled(Boolean(cq.enabled));
    if (typeof cq.endpoint_path === 'string' && cq.endpoint_path) setEndpointPath(cq.endpoint_path);
  }, [runtimeHooks, currentProfileName]);

  // Initialize UI state from persisted runtime settings (once per profile, after hooks have data)
  const didInitUiForProfileRef = useRef<string | null>(null);
  useEffect(() => {
    // If we already initialized for this profile, skip
    if (didInitUiForProfileRef.current === currentProfileName) return;
    const cq: any = (runtimeHooks as any)?.clickhouse_query || {};
    const hasData = cq && typeof cq === 'object' && Object.keys(cq).length > 0;
    if (!hasData) return; // wait until runtimeHooks deliver data
    const ui = cq?.ui || {};
    if (ui && typeof ui === 'object') {
      // Default UX: on first load or revisit, prefer "recent" over persisted "raw_sql"
      // Rationale: raw_sql is an ad-hoc mode; users expect the page to open on the overview (recent)
      const persistedAction = ui.action as Action | undefined;
      if (persistedAction && persistedAction !== 'raw_sql') {
        setAction(persistedAction);
      }
      if (typeof ui.username === 'string') setUsername(ui.username);
      if (typeof ui.account === 'string') setAccount(ui.account);
      if (typeof ui.ip === 'string') setIp(ui.ip);
      const lim = Number((ui as any).limit);
      if (Number.isFinite(lim)) setLimit(lim);
      const ps = Number((ui as any).pageSize);
      if (Number.isFinite(ps) && ps > 0) setPageSize(ps);
      if (ui.authFilter === 'all' || ui.authFilter === 'failed' || ui.authFilter === 'success') setAuthFilter(ui.authFilter);
      if (typeof ui.tsStart === 'string') setTsStart(ui.tsStart);
      if (typeof ui.tsEnd === 'string') setTsEnd(ui.tsEnd);
      if (typeof ui.tsTimeZone === 'string') setTsTimeZone(ui.tsTimeZone);
      if (typeof ui.rawSql === 'string') setRawSql(ui.rawSql);
      if (typeof ui.mapOpen === 'boolean') setMapOpen(Boolean(ui.mapOpen));
      if (typeof (ui as any).searchQuery === 'string') { setSearchQuery((ui as any).searchQuery); setSearchDraft((ui as any).searchQuery); }
      const r = Number((ui as any).refreshMs);
      if (Number.isFinite(r)) {
        try { setRefreshMs(r); } catch {}
      }
    }
    // Load bookmarks if present
    const bm = cq?.bookmarks;
    if (bm && typeof bm === 'object') {
      const rs = Array.isArray((bm as any).raw_sql) ? (bm as any).raw_sql : [];
      const ss = Array.isArray((bm as any).search) ? (bm as any).search : [];
      setBookmarks({ raw_sql: rs, search: ss });
    }
    // Mark initialized for this profile (only after we saw some data)
    didInitUiForProfileRef.current = currentProfileName;
  }, [runtimeHooks, currentProfileName]);

  // Trigger an initial data load once when entering the page after login/profile load
  // Only auto-run for the default 'recent' action to avoid firing expensive or invalid queries
  const didInitialRunRef = useRef<boolean>(false);
  useEffect(() => {
    if (didInitialRunRef.current) return;
    // Ensure we have a connected backend, hook settings are loaded, and querying is enabled
    const cqAny: any = (runtimeHooks as any)?.clickhouse_query;
    const hooksReady = cqAny && typeof cqAny === 'object';
    if (connStatus === 'connected' && hooksReady && hookEnabled && action === 'recent') {
      didInitialRunRef.current = true;
      void runQueryRef.current?.(true, { keepPage: true });
    }
  }, [connStatus, runtimeHooks, hookEnabled, action]);

  const handlePickSuggestion = (ep: string) => { setEndpointPath(ep); setAnchorEl(null); };

  const buildHookUrl = useCallback((connectionConfig: any, overrideOffset?: number, overrideLimit?: number, includeSearchFilter: boolean = true) => {
    const proxyUrl = new URL('/proxy/hooks/any', getProxyOrigin());
    proxyUrl.searchParams.append('url', (connectionConfig?.backend_url || '').toString());
    // The proxy expects 'endpoint_path'
    proxyUrl.searchParams.append('endpoint_path', endpointPath);
    // Add action-specific query params directly
    proxyUrl.searchParams.set('action', action);
    if (action === 'by_user' && username) proxyUrl.searchParams.set('username', username);
    if (action === 'by_account' && account) proxyUrl.searchParams.set('account', account);
    if (action === 'by_ip' && ip) proxyUrl.searchParams.set('ip', ip);
    if (action === 'raw_sql' && rawSql) {
      let sql = rawSql.trim();
      // Strip trailing semicolons to satisfy backend safety checks
      sql = sql.replace(/;+$/, '');
      if (sql) proxyUrl.searchParams.set('sql', sql);
    }
    // Limit + Offset (server side)
    const effectiveLimit = (overrideLimit != null && Number.isFinite(overrideLimit) && overrideLimit > 0) ? Number(overrideLimit) : pageSize;
    proxyUrl.searchParams.set('limit', String(effectiveLimit));
    // Compute server-side offset based on current page (1-based) or override
    const serverOffset = overrideOffset != null ? Math.max(0, overrideOffset) : Math.max(0, (page - 1) * pageSize);
    proxyUrl.searchParams.set('offset', String(serverOffset));
    // Server-side status filter
    if (authFilter === 'failed' || authFilter === 'success') {
      proxyUrl.searchParams.set('status', authFilter);
    } else {
      proxyUrl.searchParams.set('status', 'all');
    }
    // Server-side search filter (debounced by UI); backend enforces safety caps
    if (includeSearchFilter && searchQuery && searchQuery.trim()) {
      // Soft client-side cap to avoid excessive URL size; server will enforce harder limits
      const sq = searchQuery.trim();
      proxyUrl.searchParams.set('filter', sq.length > 600 ? sq.slice(0, 600) : sq);
    }
    // Optional ts range
    const parseLocalInput = (v: string) => {
      const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2})(?::([0-9]{2}))?$/.exec(v);
      if (!m) return null;
      const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3]);
      const h = Number(m[4]); const mi = Number(m[5]); const s = Number(m[6] || '0');
      return { y, mo, d, h, mi, s };
    };
    const utcIsoFromWallInZone = (input: string, tz: string): string | null => {
      const parts = parseLocalInput(input);
      if (!parts) return null;
      const targetUtcMs = Date.UTC(parts.y, parts.mo-1, parts.d, parts.h, parts.mi, parts.s);
      const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12:false, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' });
      const partsFromMs = (ms: number) => {
        const p = fmt.formatToParts(new Date(ms));
        const get = (type: string) => Number(p.find(q=>q.type===type)?.value || 0);
        return { y:get('year'), mo:get('month'), d:get('day'), h:get('hour'), mi:get('minute'), s:get('second') };
      };
      const toMs = (p: any) => Date.UTC(p.y, p.mo-1, p.d, p.h, p.mi, p.s);
      const wantMs = Date.UTC(parts.y, parts.mo-1, parts.d, parts.h, parts.mi, parts.s);
      const p0 = partsFromMs(targetUtcMs);
      const msFormatted0 = toMs(p0);
      let guess = targetUtcMs + (wantMs - msFormatted0);
      const p1 = partsFromMs(guess);
      const msFormatted1 = toMs(p1);
      guess = guess + (wantMs - msFormatted1);
      return new Date(guess).toISOString().replace(/\.\d{3}Z$/, 'Z');
    };
    const utcIsoFromUtcWall = (input: string): string | null => {
      const parts = parseLocalInput(input);
      if (!parts) return null;
      const ms = Date.UTC(parts.y, parts.mo-1, parts.d, parts.h, parts.mi, parts.s);
      return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
    };
    if (tsStart) {
      if (tsTimeZone === 'UTC') {
        const iso = utcIsoFromUtcWall(tsStart);
        if (iso) proxyUrl.searchParams.set('ts_start', iso);
      } else {
        const iso = utcIsoFromWallInZone(tsStart, tsTimeZone);
        if (iso) proxyUrl.searchParams.set('ts_start', iso);
      }
    }
    if (tsEnd) {
      if (tsTimeZone === 'UTC') {
        const iso = utcIsoFromUtcWall(tsEnd);
        if (iso) proxyUrl.searchParams.set('ts_end', iso);
      } else {
        const iso = utcIsoFromWallInZone(tsEnd, tsTimeZone);
        if (iso) proxyUrl.searchParams.set('ts_end', iso);
      }
    }
    return proxyUrl.toString();
  }, [endpointPath, action, username, account, ip, rawSql, pageSize, page, authFilter, tsStart, tsEnd, tsTimeZone, searchQuery]);

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


  const runQuery = useCallback(async (force: boolean = false, opts?: { keepPage?: boolean }) => {
    // Guard: all actions except 'recent' should only execute on explicit Run click
    if (action !== 'recent' && !force) {
      return; // do not auto-run for passive actions
    }
    setLoading(true);
    setError('');
    // Keep previous rows during loading to avoid flicker and preserve map data
    if (!opts?.keepPage) setPage(1);
    // Prepare request-scoped variables accessible from finally
    let controller: AbortController | null = null;
    let reqId = 0;
    try {
      if (!hookEnabled) {
        setError('Hook is disabled. Enable it in Hook Configuration.');
        return;
      }
      if (!endpointPath) {
        setError('Hook endpoint path is empty.');
        return;
      }
      if (action === 'by_user' && !username) {
        setError('Username is required for action by_user.');
        return;
      }
      if (action === 'by_account' && !account) {
          setError('Account is required for action by_account.');
          return;
      }
      if (action === 'by_ip' && !ip) {
        setError('IP is required for action by_ip.');
        return;
      }
      if (action === 'raw_sql' && !rawSql.trim()) {
        setError('SQL is required for action raw_sql.');
        return;
      }
      // Validate optional time range
      if (tsStart && tsEnd) {
        const s = new Date(tsStart).getTime();
        const e = new Date(tsEnd).getTime();
        if (!Number.isNaN(s) && !Number.isNaN(e) && e < s) {
          setError('Invalid time range: end is before start.');
          return;
        }
      }
      const conn = getConnection();
      if (!conn?.backend_url) {
        setError('No backend URL configured (Runtime → Connection).');
        return;
      }
      const url = buildHookUrl(conn, autoRefreshingRef.current ? 0 : undefined, pageSize + 1);
      // Abort any in-flight request and start a new one for this run
      try { queryAbortRef.current?.abort(); } catch {}
      controller = new AbortController();
      queryAbortRef.current = controller;
      reqId = ++lastReqIdRef.current;
      const UI_TIMEOUT_MS = 120_000; // 120s
      const timer = setTimeout(() => controller?.abort(), UI_TIMEOUT_MS);
      let resp: Response | null = null;
      try {
        resp = await authenticatedFetch(url, {
          method: 'POST',
          headers: await buildBackendAuthHeaders(conn),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      if (!resp || !resp.ok) {
        const msg = await extractErrorMessage(resp as Response);
        setError(msg);
        return;
      }
      const resJson = await (resp as Response).json();
      if (resJson?.status !== 'success' || !resJson?.clickhouse) {
        setError(resJson?.message || 'Hook returned no data');
        return;
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
        setError('Hook returned no data');
        return;
      }
      // Ignore if a newer request has started
      if (reqId !== lastReqIdRef.current) return;
      // Store full preview and apply current limit for display
      setRawPreviewFull(preview);
      setRawPreview(applyPreviewLimit(preview, rawJsonMaxBytes));
      // Determine if there are actually new rows; only then mark previous rows as seen (for dimming)
      let hasNew = false;
      if (autoRefreshingRef.current) {
        try {
          const tsOf = (x: Row) => String((x as any)?.ts ?? '');
          const prevTopTs = rows.length ? tsOf(rows[0]) : '';
          const nextTopTs = parsed.length ? tsOf(parsed[0]) : '';
          if (nextTopTs && prevTopTs) {
            if (nextTopTs > prevTopTs) {
              hasNew = true;
            } else if (nextTopTs === prevTopTs) {
              const prevCnt = rows.reduce((n, r) => n + (tsOf(r) === prevTopTs ? 1 : 0), 0);
              const nextCnt = parsed.reduce((n, r) => n + (tsOf(r) === nextTopTs ? 1 : 0), 0);
              if (nextCnt > prevCnt) hasNew = true;
            }
          } else if (nextTopTs && !prevTopTs) {
            hasNew = true; // there were no previous rows
          }
          if (hasNew) {
            const s = seenKeysRef.current;
            rows.forEach(r => s.add(rowKey(r)));
          }
        } catch {}
      }

      // Compute next page worth of rows and prune expansion to visible rows
      const nextRows = parsed.length > pageSize ? parsed.slice(0, pageSize) : parsed;
      const present = new Set(nextRows.map(r => rowKey(r)));
      let removedCount = 0;
      setExpandedKeys(prev => {
        const keep = new Set<string>();
        for (const k of prev) { if (present.has(k)) keep.add(k); }
        removedCount = prev.size - keep.size;
        return keep;
      });
      if (removedCount > 0) {
        setNotif({ open:true, severity:'info', message:'Expanded row moved out of current page' });
      }

      if (parsed.length > pageSize) {
        setHasMore(true);
        setRows(nextRows);
      } else {
        setHasMore(false);
        setRows(parsed);
      }

      // Trigger a short visual pulse only when auto-refresh is on and new data arrived
      if (autoRefreshingRef.current) {
        if (pulseTimerRef.current) { clearTimeout(pulseTimerRef.current); pulseTimerRef.current = null; }
        if (hasNew) {
          setChangePulse(true);
          pulseTimerRef.current = setTimeout(() => { setChangePulse(false); pulseTimerRef.current = null; }, 180);
        } else {
          setChangePulse(false);
        }
      }

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
          // In raw_sql mode, always display exactly the columns returned by SQL (no mixing with defaults/persisted)
          if (action === 'raw_sql') {
            setSelectedFields(metaNames);
            // Save current normal widths once before overriding for raw_sql
            if (!normalWidthsRef.current) {
              normalWidthsRef.current = { ...colWidthsRef.current };
            }
            // Auto-size widths to fit header names for raw_sql (not persisted)
            const approxChar = 8; // px per char
            const padding = 24; // left+right padding and sort indicator
            const nextWidths: Record<string, number> = { ...colWidthsRef.current };
            for (const name of metaNames) {
                nextWidths[name] = Math.max(MIN_COL_W, Math.min(MAX_COL_W, Math.round(name.length * approxChar + padding)));
            }
            setColumnWidths(nextWidths);
          }
        }
      } catch {}
    } catch (e:any) {
      if (e?.name === 'AbortError') {
        // ignore aborts
      } else {
        setError(e?.message || String(e));
      }
    } finally {
      // Only clear loading if this is the latest request
      if (!controller) {
        // No request was started (validation/early return) — clear loading
        setLoading(false);
      } else if (queryAbortRef.current === null || controller === queryAbortRef.current) {
        if (lastReqIdRef.current === reqId) {
          setLoading(false);
          if (queryAbortRef.current === controller) {
            queryAbortRef.current = null;
          }
        }
      }
    }
  }, [getConnection, endpointPath, action, username, account, ip, pageSize, hookEnabled, rawSql, tsStart, tsEnd, authFilter, buildHookUrl, searchQuery, rows, rowKey]);

  // Stable reference to runQuery to avoid effects re-firing on its identity changes
  const runQueryRef = useRef(runQuery);
  useEffect(() => { runQueryRef.current = runQuery; }, [runQuery]);

  // Auto-refresh interval like Security page (default 30s)
  const REFRESH_SESSION_KEY = 'clickhouseRuntime.refreshIntervalMs';
  const refreshRunner = useCallback(() => {
    if (action !== 'recent') return Promise.resolve(); // do not auto-run passive actions
    return runQueryRef.current(true, { keepPage: true });
  }, [action]);
  const [refreshMs, setRefreshMs] = usePersistedAutoRefresh(refreshRunner, REFRESH_SESSION_KEY, 0);
  // Sync boolean ref to avoid TDZ when runQuery is defined above
  useEffect(() => { autoRefreshingRef.current = refreshMs > 0; }, [refreshMs]);

  // Initialize/clear seen set when auto-refresh is toggled: do NOT pre-mark current rows.
  useEffect(() => {
    seenKeysRef.current.clear();
  }, [refreshMs]);

  // When enabling auto-refresh, reset to page 1 for consistency
  useEffect(() => {
    if (refreshMs > 0 && page !== 1) setPage(1);
  }, [refreshMs, page]);

  // Clear expansion and history on major context changes
  useEffect(() => {
    setExpandedKeys(new Set());
    seenKeysRef.current.clear();
  }, [action, username, account, ip, rawSql, tsStart, tsEnd, authFilter]);

  // Scroll stabilization: keep expanded row roughly in view
  useEffect(() => {
    if (!expandedKeys.size) return;
    const present = new Set(rows.map(r => rowKey(r)));
    for (const k of expandedKeys) {
      if (!present.has(k)) continue;
      const el = rowRefs.current[k];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      const partiallyVisible = rect.top < vh && rect.bottom > 0;
      if (!partiallyVisible) {
        try { el.scrollIntoView({ block: 'nearest' }); } catch {}
      }
      break; // only the first expanded row
    }
  }, [rows, expandedKeys, rowKey]);

  // Rows after server-side filters; keep reference for search/sort
  const filteredRows = useMemo(() => rows, [rows]);

  // Search filter on top of authFilter for the table only (not affecting map/aggregates)
  // Supports boolean logic: AND/OR/NOT, parentheses, symbols (&&, ||, !), quoted phrases, and field comparisons (key==value, !=, <, >, <=, >=).
  const searchFilteredRows = useMemo(() => {
    const raw = (searchQuery || '').trim();
    if (!raw) return filteredRows;

    type TokType = 'WORD'|'AND'|'OR'|'NOT'|'LPAREN'|'RPAREN'|'CMP';
    type Tok = { t: TokType; v?: string };

    const normalizeOp = (s: string): TokType | null => {
      const x = s.toLowerCase();
      if (x === 'and' || x === '&&' || x === '&') return 'AND';
      if (x === 'or'  || x === '||' || x === '|') return 'OR';
      if (x === 'not' || x === '!' ) return 'NOT';
      return null;
    };

    // Limits/guards (mirror backend)
    const FILTER_MAX_LEN = 600;
    const FILTER_MAX_TOKENS = 200;
    const REGEX_MAX_LEN = 256;
    const MAX_NESTING = 16;

    // Column type knowledge (mirror backend)
    const TEXT_COLS = [
      'session','service','features','client_ip','client_net','client_id',
      'hostname','proto','method','user_agent','local_ip',
      'display_name','account','username','password_hash',
      'pwnd_info','brute_force_bucket','oidc_cid',
      'geoip_guid','geoip_country','geoip_iso_codes','geoip_status',
      'dyn_threat','dyn_response','xssl_protocol','xssl_cipher','ssl_fingerprint','status_msg','prot_reason'
    ];
    const BOOL_COL: Record<string, true> = { repeating:true, user_found:true, authenticated:true, prot_active:true, failed_login_recognized:true };
    const NUM_COL: Record<string, true> = { client_port:true, local_port:true, brute_force_counter:true, failed_login_count:true, failed_login_rank:true, gp_attempts:true, gp_unique_ips:true, gp_unique_users:true, gp_ips_per_user:true, prot_backoff:true, prot_delay_ms:true, latency:true, http_status:true };
    const isAllowedKey = (k?: string) => !!(k && (BOOL_COL[k] || NUM_COL[k] || TEXT_COLS.includes(k)));
    const isCmpStart = (c: string) => c === '=' || c === '!' || c === '<' || c === '>';

    // Parse JS-like regex literal: /pattern/flags (supports escaped / as \/)
    const parseRegexLiteral = (s: string): RegExp | null => {
      if (!s || s[0] !== '/' || s.length < 2) return null;
      let i = 1;
      let end = -1;
      while (i < s.length) {
        const ch = s[i];
        if (ch === '/' && s[i-1] !== '\\') { end = i; break; }
        i++;
      }
      if (end <= 1) return null; // need at least one char for pattern
      const pattern = s.slice(1, end);
      if (pattern.length > REGEX_MAX_LEN) return null;
      let flags = s.slice(end + 1).replace(/[^i]/g, '');
      try { return new RegExp(pattern, flags); } catch { return null; }
    };

    const tokenize = (input: string): Tok[] => {
      const out: Tok[] = [];
      let tokenCount = 0;
      let depth = 0;
      let i = 0;
      const n = Math.min(input.length, FILTER_MAX_LEN);
      const pushTok = (t: Tok) => { tokenCount++; if (tokenCount > FILTER_MAX_TOKENS) throw new Error('too many tokens'); out.push(t); };
      while (i < n) {
        const ch = input[i];
        if (/\s/.test(ch)) { i++; continue; }
        if (ch === '(') { depth++; if (depth > MAX_NESTING) throw new Error('too deep'); pushTok({ t: 'LPAREN' }); i++; continue; }
        if (ch === ')') { depth = Math.max(0, depth-1); pushTok({ t: 'RPAREN' }); i++; continue; }
        if (ch === '"' || ch === '\'') {
          const q = ch; i++;
          let buf = '';
          while (i < n && input[i] !== q) { buf += input[i++]; }
          if (i < n && input[i] === q) i++; // skip closing quote
          pushTok({ t: 'WORD', v: buf });
          continue;
        }
        // Comparison operators by symbol: ==, !=, <=, >=, <, >, =
        if (isCmpStart(ch)) {
          const two = input.slice(i, i+2);
          if (two === '==' || two === '!=' || two === '<=' || two === '>=') { pushTok({ t: 'CMP', v: two }); i += 2; continue; }
          if (ch === '<' || ch === '>' || ch === '=') { pushTok({ t: 'CMP', v: ch }); i += 1; continue; }
        }
        // Logical operators by symbol
        if (ch === '&' || ch === '|' || ch === '!') {
          const two = input.slice(i, i+2);
          const op2 = normalizeOp(two);
          if (op2) { pushTok({ t: op2 }); i += 2; continue; }
          const op1 = normalizeOp(ch);
          if (op1) { pushTok({ t: op1 }); i += 1; continue; }
        }
        // Word or keyword
        let j = i;
        while (j < n && !/\s|\(|\)|&|\||!|"|'|=|<|>/.test(input[j])) j++;
        const word = input.slice(i, j);
        const op = normalizeOp(word);
        if (op) pushTok({ t: op });
        else if (word.length) pushTok({ t: 'WORD', v: word });
        i = j;
      }
      return out;
    };

    // Insert implicit AND for EXPRESSION NOT EXPRESSION only.
    // Left EXPRESSION ends either with RPAREN or the pattern WORD CMP WORD (infix), i.e., tokens [..., CMP, WORD]
    // Right EXPRESSION starts with LPAREN or WORD CMP ... (infix), i.e., tokens [WORD, CMP, ...]
    const rewriteImplicitAndBetweenExpressions = (toks: Tok[]): Tok[] => {
      if (toks.length < 3) return toks;
      const out: Tok[] = [];
      for (let i = 0; i < toks.length; i++) {
        const prev2 = toks[i-2];
        const prev1 = toks[i-1];
        const cur   = toks[i];
        const next1 = toks[i+1];
        const next2 = toks[i+2];
        const leftOK = (prev1 && ((prev1.t === 'WORD' && prev2 && prev2.t === 'CMP') || prev1.t === 'RPAREN'));
        const rightOK = ((next1 && next1.t === 'LPAREN') || (next1 && next2 && next1.t === 'WORD' && next2.t === 'CMP'));
        if (cur && cur.t === 'NOT' && leftOK && rightOK) {
          // Emit AND before this NOT to read as: (left) AND NOT (right)
          out.push({ t: 'AND' });
          out.push(cur);
        } else {
          out.push(cur);
        }
      }
      return out;
    };

    const toRpn = (toks: Tok[]): Tok[] => {
      const out: Tok[] = [];
      const ops: Tok[] = [];
      const prec = (t: TokType) => t === 'NOT' ? 3 : t === 'CMP' ? 3 : t === 'AND' ? 2 : t === 'OR' ? 1 : 0;
      const isOp = (t: Tok): boolean => t.t === 'AND' || t.t === 'OR' || t.t === 'NOT' || t.t === 'CMP';
      for (let i = 0; i < toks.length; i++) {
        const tk = toks[i];
        if (tk.t === 'WORD') { out.push(tk); continue; }
        if (tk.t === 'LPAREN') { ops.push(tk); continue; }
        if (tk.t === 'RPAREN') {
          while (ops.length && ops[ops.length-1].t !== 'LPAREN') out.push(ops.pop()!);
          if (ops.length && ops[ops.length-1].t === 'LPAREN') ops.pop();
          continue;
        }
        if (isOp(tk)) {
          const p = prec(tk.t);
          while (ops.length && isOp(ops[ops.length-1]) && prec(ops[ops.length-1].t) >= p) {
            out.push(ops.pop()!);
          }
          ops.push(tk);
        }
      }
      while (ops.length) out.push(ops.pop()!);
      return out;
    };

    let toks: Tok[];
    try { toks = tokenize(raw); } catch { toks = []; }
    toks = rewriteImplicitAndBetweenExpressions(toks);
    let rpn: Tok[] = [];
    try { rpn = toRpn(toks); } catch { rpn = []; }

    const parseLiteral = (s: string): any => {
      // Regex literal support
      const re = parseRegexLiteral(s);
      if (re) return re;
      const v = s;
      const low = (v || '').toLowerCase();
      if (low === 'true') return true;
      if (low === 'false') return false;
      if (low === 'null' || low === 'undefined') return '';
      // number
      const num = Number(v);
      if (!Number.isNaN(num) && v !== '') return num;
      return v;
    };

    const compareField = (row: any, key: string, op: string, rhs: any): boolean => {
      if (!isAllowedKey(key)) return true; // neutral like server
      const val = row?.[key];
      if (BOOL_COL[key]) {
        const toBool = (x: any): boolean | null => {
          if (typeof x === 'boolean') return x;
          if (x === 1 || x === '1' || (typeof x === 'string' && x.toLowerCase() === 'true')) return true;
          if (x === 0 || x === '0' || (typeof x === 'string' && x.toLowerCase() === 'false')) return false;
          return null;
        };
        const lv = toBool(val); const rv = toBool(rhs);
        if (lv == null || rv == null) return true;
        if (op === '==') return lv === rv;
        if (op === '!=') return lv !== rv;
        return true;
      }
      if (NUM_COL[key]) {
        const ln = Number(val); const rn = Number(rhs);
        if (!Number.isFinite(ln) || !Number.isFinite(rn)) return true;
        if (op === '==') return ln === rn;
        if (op === '!=') return ln !== rn;
        if (op === '<') return ln < rn;
        if (op === '>') return ln > rn;
        if (op === '<=') return ln <= rn;
        if (op === '>=') return ln >= rn;
        return true;
      }
      // text
      if (rhs instanceof RegExp) {
        const s = val == null ? '' : String(val);
        if (op === '==') return rhs.test(s);
        if (op === '!=') return !rhs.test(s);
        return true;
      }
      const ls = val == null ? '' : String(val);
      const rs = rhs == null ? '' : String(rhs);
      if (op === '==') return ls === rs; // case-sensitive like server
      if (op === '!=') return ls !== rs;
      return true;
    };

    return filteredRows.filter((row) => {
      if (!rpn.length) {
        // Strict mode: without explicit comparisons we do not filter client-side
        return true;
      }

      const st: any[] = [];
      let invalid = false;
      const asBool = (val: any): boolean => {
        if (typeof val === 'boolean') return val;
        invalid = true; return false;
      };
      for (const tk of rpn) {
        if (tk.t === 'WORD') {
          // Interpret WORD either as regex literal or plain string
          const maybeRe = parseRegexLiteral(tk.v ?? '');
          st.push(maybeRe || (tk.v ?? ''));
        } else if (tk.t === 'NOT') {
          const a = asBool(st.pop()); st.push(!a);
        } else if (tk.t === 'AND') {
          const b = asBool(st.pop()); const a = asBool(st.pop()); st.push(a && b);
        } else if (tk.t === 'OR') {
          const b = asBool(st.pop()); const a = asBool(st.pop()); st.push(a || b);
        } else if (tk.t === 'CMP') {
          const rightRaw = st.pop();
          const leftRaw = st.pop();
          const field = String(leftRaw || '');
          const value = (rightRaw instanceof RegExp) ? rightRaw : parseLiteral(String(rightRaw ?? ''));
          st.push(compareField(row, field, tk.v || '==', value));
        }
      }

      // Reduce remaining stack entries by AND
      const res = st.reduce((acc, it) => acc && asBool(it), true);
      return invalid ? true : !!res;
    });
  }, [filteredRows, searchQuery, selectedFields]);

  // Sort rows by selected column and direction
  const sortedRows = useMemo(() => {
    // decorate with index to achieve stable sort
    const decorated = searchFilteredRows.map((r, i) => ({ r, i }));
    const getVal = (row: Row, field?: string | null) => field ? (row as any)?.[field] : undefined;
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

    const compareBy = (a: any, b: any, field: string, dir: 'asc'|'desc') => {
      const av = getVal(a, field);
      const bv = getVal(b, field);
      const aMiss = isMissing(av);
      const bMiss = isMissing(bv);
      let cmp: number;
      if (aMiss && bMiss) cmp = 0;
      else if (aMiss) cmp = 1;
      else if (bMiss) cmp = -1;
      else {
        const an = toFiniteNumber(av);
        const bn = toFiniteNumber(bv);
        if (an !== null && bn !== null) cmp = an < bn ? -1 : an > bn ? 1 : 0;
        else {
          const as = String(av).toLowerCase();
          const bs = String(bv).toLowerCase();
          cmp = as < bs ? -1 : as > bs ? 1 : 0;
        }
      }
      return dir === 'asc' ? cmp : -cmp;
    };

    const liveMode = action === 'recent' && refreshMs > 0;

    decorated.sort((a, b) => {
      let cmp = 0;
      if (liveMode) {
        // Primary: ts desc to keep newest on top
        cmp = compareBy(a.r, b.r, 'ts', 'desc');
        // Secondary: user's sort choice, if any and not ts
        if (cmp === 0 && sortBy && sortBy !== 'ts') {
          cmp = compareBy(a.r, b.r, String(sortBy), sortDir);
        }
      } else if (sortBy) {
        cmp = compareBy(a.r, b.r, String(sortBy), sortDir);
      }
      if (cmp === 0) cmp = a.i - b.i; // stable tie-breaker
      return cmp;
    });

    return decorated.map(d => d.r);
  }, [searchFilteredRows, sortBy, sortDir, action, refreshMs]);

  // Aggregate countries for top 100; split success/failed by authenticated flag
  const countryAgg = useMemo(() => {
    const map = new Map<string, { success: number; failed: number }>();
    const pickCountry = (r: Row): string => {
      // Prefer explicit country label; otherwise fall back to ISO codes list
      const raw = (r.geoip_country || r.geoip_iso_codes || '').toString();
      let c = raw.trim();
      if (!c) return 'XX';
      // Split multi-values and pick the first plausible token
      const toks = c.split(/[\s,;|\/]+/).filter(Boolean);
      if (toks.length > 1) {
        const two = toks.find((t: string) => /^[A-Za-z]{2}$/.test(t));
        c = two || toks[0];
      }
      // Normalize simple 2-letter iso
      if (/^[A-Za-z]{2}$/.test(c)) c = c.toUpperCase();
      return c || 'XX';
    };
    for (const r of filteredRows) {
      const c = pickCountry(r);
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
    return sortedRows;
  }, [sortedRows]);


  // Re-run query when applied search filter changes
  useEffect(() => {
    if (action === 'recent') {
      void runQueryRef.current?.(true, { keepPage: true });
    }
  }, [searchQuery, action]);

  // Track previous page and action to distinguish which one changed
  const prevActionRef = useRef<Action>(action);
  const prevPageRef = useRef<number>(page);

  // When navigating pages or changing action, request data from server with rules:
  // - For passive actions (all except 'recent'): only run on page changes (action change is passive)
  // - For 'recent': run on either page or action change
  useEffect(() => {
    const prevAction = prevActionRef.current;
    const prevPage = prevPageRef.current;

    const pageChanged = page !== prevPage;
    const actionChanged = action !== prevAction;

    // Update refs for next render
    prevActionRef.current = action;
    prevPageRef.current = page;

    if (action !== 'recent') {
      if (pageChanged) {
        void runQueryRef.current?.(true, { keepPage: true });
      }
      return;
    }

    if (pageChanged || actionChanged) {
      void runQueryRef.current?.(true, { keepPage: true });
    }
  }, [page, action]);

  const formatTsForZone = useCallback((val: any, tz: string): string => {
    if (val == null) return '';
    const s = String(val).trim();
    if (!s) return '';
    // Detect if already has timezone info
    const hasTz = /[zZ]$/.test(s) || /[+-]\d{2}:?\d{2}$/.test(s);
    let isoLike = s;
    if (!hasTz) {
      // Assume ClickHouse returned UTC like 'YYYY-MM-DD HH:MM:SS[.ffffff]'
      isoLike = s.replace(' ', 'T');
      // Trim microseconds to milliseconds to avoid parse issues
      isoLike = isoLike.replace(/\.(\d{3})\d+$/, '.$1');
      isoLike += 'Z';
    }
    let d: Date | null;
    try { d = new Date(isoLike); } catch { d = null; }
    if (!d || isNaN(d.getTime())) return s;
    if (tz === 'UTC') return String(val);
    try {
      const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false });
      const parts = fmt.formatToParts(d);
      const get = (t:string) => parts.find(p=>p.type===t)?.value || '';
      const yyyy = get('year');
      const mm = get('month');
      const dd = get('day');
      const hh = get('hour');
      const mi = get('minute');
      const ss = get('second');
      // Also add offset label
      const offFmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' });
      const off = offFmt.formatToParts(d).find(p=>p.type==='timeZoneName')?.value?.replace(/^GMT/, '') || '';
      const offNorm = /[+-]\d/.test(off) ? (off.length===2? off+':00' : off.replace('−','-')) : '+00:00';
      return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss} ${offNorm}`;
    } catch {
      return d.toISOString().replace(/\.(\d{3})Z$/, 'Z');
    }
  }, []);

  // Export dialog state
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<'csv' | 'json'>('csv');
  const [exportFields, setExportFields] = useState<string[]>([]);
  const [exportScope, setExportScope] = useState<'page' | 'filtered' | 'all'>('filtered');
  const [csvDelimiter, setCsvDelimiter] = useState<string>(',');
  const [csvWithHeader, setCsvWithHeader] = useState<boolean>(true);
  const [exporting, setExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<{ pages: number; rows: number }>({ pages: 0, rows: 0 });

  // Analysis dialog state
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [analysisRows, setAnalysisRows] = useState<Row[]>([]);
  const [analysisLoading, setAnalysisLoading] = useState<boolean>(false);
  const [analysisProgress, setAnalysisProgress] = useState<{ pages: number; rows: number }>({ pages: 0, rows: 0 });
  const analysisAbortRef = useRef<AbortController | null>(null);

  // Fixed chunk sizes for background paging (independent from UI limit)
  const ANALYSIS_CHUNK_DEFAULT = 10000;
  const EXPORT_CHUNK_DEFAULT = 10000;

  // Safety caps for background operations
  const MAX_ANALYSIS_ROWS = 500000;
  const MAX_EXPORT_ROWS = 500000;

  // Reset analysis cache when query parameters change
  useEffect(() => {
    setAnalysisRows([]);
    setAnalysisProgress({ pages: 0, rows: 0 });
    if (analysisLoading && analysisAbortRef.current) {
      try { analysisAbortRef.current.abort(); } catch {}
    }
  }, [action, username, account, ip, authFilter, tsStart, tsEnd, rawSql, limit]);

  // Background loader to fetch all pages for analysis
  const loadAllForAnalysis = useCallback(async () => {
    if (analysisLoading) return;
    try {
      setAnalysisLoading(true);
      setAnalysisRows([]);
      setAnalysisProgress({ pages: 0, rows: 0 });

      const conn = getConnection();
      if (!conn?.backend_url) {
        setError('No backend URL configured (Runtime → Connection).');
        setAnalysisLoading(false);
        return;
      }

      const controller = new AbortController();
      analysisAbortRef.current = controller;

      const chunkSize = ANALYSIS_CHUNK_DEFAULT; // fixed chunk size for analysis
      const targetTotal = Math.min((Number(limit) > 0 ? Number(limit) : MAX_ANALYSIS_ROWS), MAX_ANALYSIS_ROWS);

      let offsetLocal = 0;
      let totalRows = 0;
      let pageCount = 0;

      for (;;) {
        const remaining = targetTotal - totalRows;
        if (remaining <= 0) break;
        const perReqLimit = Math.min(chunkSize, remaining);

        // When starting analysis, respect the CURRENT text in the search box.
        // If the user cleared the text (empty), do NOT apply any stale searchQuery filter.
        // buildHookUrl allows us to opt-out of including the search filter.
        const includeSearch = Boolean((searchDraft || '').trim());
        const url = buildHookUrl(conn, offsetLocal, perReqLimit, includeSearch);
        const resp = await authenticatedFetch(url, {
          method: 'POST',
          headers: await buildBackendAuthHeaders(conn),
          signal: controller.signal,
        });
        if (!resp.ok) {
          const msg = await extractErrorMessage(resp);
          setError(msg);
          break;
        }
        const resJson = await resp.json();
        if (resJson?.status !== 'success' || !resJson?.clickhouse) {
          setError(resJson?.message || 'Hook returned no data');
          break;
        }
        const ch = resJson.clickhouse;
        let pageRows: Row[] = [];
        if (ch.query_result && typeof ch.query_result === 'object') {
          pageRows = parseHookResult(ch.query_result);
        } else if (typeof ch.raw === 'string') {
          pageRows = parseHookResult(ch.raw);
        }
        if (!Array.isArray(pageRows)) pageRows = [];

        // Respect targetTotal by slicing the last page if necessary
        let toAppend = pageRows;
        if (toAppend.length > remaining) toAppend = toAppend.slice(0, remaining);

        if (toAppend.length) {
          setAnalysisRows(prev => prev.concat(toAppend));
        }
        totalRows += toAppend.length;
        pageCount += 1;
        setAnalysisProgress({ pages: pageCount, rows: totalRows });

        // Stop if last page or target reached
        if (pageRows.length < perReqLimit || totalRows >= targetTotal) {
          break;
        }

        offsetLocal += perReqLimit;
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        // cancelled by user
      } else {
        console.error('Analysis loading failed', e);
        setError('Analysis loading failed: ' + (e?.message || String(e)));
      }
    } finally {
      setAnalysisLoading(false);
      analysisAbortRef.current = null;
    }
  }, [limit, action, username, account, ip, authFilter, tsStart, tsEnd, rawSql, searchDraft]);

  const cancelAnalysisLoad = useCallback(() => {
    if (analysisAbortRef.current) {
      try { analysisAbortRef.current.abort(); } catch {}
    }
  }, []);

  // Auto-start analysis loading when dialog opens, and cancel when it closes
  useEffect(() => {
    if (analysisOpen) {
      // Do not auto-start; only ensure any in-flight job is cancelled when dialog closes
      return () => { cancelAnalysisLoad(); };
    }
    return;
  }, [analysisOpen, cancelAnalysisLoad]);


  // Helper: determine available fields for export (mirrors table display)
  const availableExportFields = useMemo(() => {
    return selectedFields && selectedFields.length > 0
      ? selectedFields
      : (rows[0] ? Object.keys(rows[0]) : []);
  }, [selectedFields, rows]);

  useEffect(() => {
    // Default to currently visible columns
    setExportFields(availableExportFields);
  }, [availableExportFields]);

  // CSV Escaping gemäß RFC4180
  const csvEscape = (value: any, delimiter: string) => {
    if (value === null || value === undefined) return '';
    const s = typeof value === 'string' ? value : JSON.stringify(value);
    const mustQuote = s.includes('"') || s.includes('\n') || s.includes('\r') || s.includes(delimiter);
    const escaped = s.replace(/"/g, '""');
    return mustQuote ? `"${escaped}"` : escaped;
  };

  const rowsToCsv = (data: Row[], fields: string[], delimiter: string, header: boolean): string => {
    const lines: string[] = [];
    if (header) lines.push(fields.map(f => csvEscape(f, delimiter)).join(delimiter));
    for (const row of data) {
      const vals = fields.map(f => {
        const rawVal = (f === 'ts') ? formatTsForZone(row?.[f], tsTimeZone) : row?.[f];
        return csvEscape(rawVal, delimiter);
      });
      lines.push(vals.join(delimiter));
    }
    return lines.join('\n');
  };

  const rowsToJson = (data: Row[], fields: string[]): string => {
    const trimmed = data.map(r => {
      const o: any = {};
      for (const f of fields) o[f] = (f === 'ts') ? formatTsForZone(r?.[f], tsTimeZone) : r?.[f];
      return o;
    });
    return JSON.stringify(trimmed, null, 2);
  };

  const downloadBlob = (content: Blob | string | Uint8Array, mime: string, filename: string) => {
    // Normalize content to a BlobPart compatible with DOM typings
    // Note: Creating a fresh Uint8Array ensures its generic parameter resolves to ArrayBuffer (not ArrayBufferLike),
    // which satisfies BlobPart typings across TS/lib.dom versions.
    const blob = content instanceof Blob
      ? content
      : new Blob([
          typeof content === 'string'
            ? content
            : (content instanceof Uint8Array ? new Uint8Array(content) : String(content))
        ], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const nowForName = () => new Date().toISOString().replace(/:/g, '-');

  // Determine data set based on selected scope
  const resolveExportData = () => {
    if (exportScope === 'page') return pagedRows;
    if (exportScope === 'filtered') return searchFilteredRows; // respects search-as-you-type
    return sortedRows; // all loaded rows (sorted)
  };

  const fetchAllFilteredDatasetRows = async (): Promise<Row[]> => {
    const conn = getConnection();
    if (!conn?.backend_url) throw new Error('No backend URL configured (Runtime → Connection).');

    const chunkSize = EXPORT_CHUNK_DEFAULT; // fixed chunk size for export
    const targetTotal = Math.min((Number(limit) > 0 ? Number(limit) : MAX_EXPORT_ROWS), MAX_EXPORT_ROWS);

    let offsetLocal = 0;
    let totalRows = 0;
    let pageCount = 0;
    const all: Row[] = [];

    for (;;) {
      const remaining = targetTotal - totalRows;
      if (remaining <= 0) break;
      const perReqLimit = Math.min(chunkSize, remaining);

      const url = buildHookUrl(conn, offsetLocal, perReqLimit, true);
      const resp = await authenticatedFetch(url, {
        method: 'POST',
        headers: await buildBackendAuthHeaders(conn),
      });
      if (!resp.ok) throw new Error(await extractErrorMessage(resp));
      const resJson = await resp.json();
      if (resJson?.status !== 'success' || !resJson?.clickhouse) throw new Error(resJson?.message || 'Hook returned no data');
      const ch = resJson.clickhouse;
      let pageRows: Row[] = [];
      if (ch.query_result && typeof ch.query_result === 'object') {
        pageRows = parseHookResult(ch.query_result);
      } else if (typeof ch.raw === 'string') {
        pageRows = parseHookResult(ch.raw);
      }
      if (!Array.isArray(pageRows)) pageRows = [];

      // Respect targetTotal by slicing the last page if necessary
      let toAppend = pageRows;
      if (toAppend.length > remaining) toAppend = toAppend.slice(0, remaining);
      if (toAppend.length) all.push(...toAppend);

      totalRows += toAppend.length;
      pageCount += 1;
      setExportProgress({ pages: pageCount, rows: totalRows });

      if (pageRows.length < perReqLimit || totalRows >= targetTotal) break;
      offsetLocal += perReqLimit;
    }

    return all;
  };

  const fetchAllDatasetRowsNoFilter = async (): Promise<Row[]> => {
    const conn = getConnection();
    if (!conn?.backend_url) throw new Error('No backend URL configured (Runtime → Connection).');

    const chunkSize = EXPORT_CHUNK_DEFAULT; // fixed chunk size for export
    const targetTotal = Math.min((Number(limit) > 0 ? Number(limit) : MAX_EXPORT_ROWS), MAX_EXPORT_ROWS);

    let offsetLocal = 0;
    let totalRows = 0;
    let pageCount = 0;
    const all: Row[] = [];

    for (;;) {
      const remaining = targetTotal - totalRows;
      if (remaining <= 0) break;
      const perReqLimit = Math.min(chunkSize, remaining);

      const url = buildHookUrl(conn, offsetLocal, perReqLimit, false);
      const resp = await authenticatedFetch(url, {
        method: 'POST',
        headers: await buildBackendAuthHeaders(conn),
      });
      if (!resp.ok) throw new Error(await extractErrorMessage(resp));
      const resJson = await resp.json();
      if (resJson?.status !== 'success' || !resJson?.clickhouse) throw new Error(resJson?.message || 'Hook returned no data');
      const ch = resJson.clickhouse;
      let pageRows: Row[] = [];
      if (ch.query_result && typeof ch.query_result === 'object') {
        pageRows = parseHookResult(ch.query_result);
      } else if (typeof ch.raw === 'string') {
        pageRows = parseHookResult(ch.raw);
      }
      if (!Array.isArray(pageRows)) pageRows = [];

      // Respect targetTotal by slicing the last page if necessary
      let toAppend = pageRows;
      if (toAppend.length > remaining) toAppend = toAppend.slice(0, remaining);
      if (toAppend.length) all.push(...toAppend);

      totalRows += toAppend.length;
      pageCount += 1;
      setExportProgress({ pages: pageCount, rows: totalRows });

      if (pageRows.length < perReqLimit || totalRows >= targetTotal) break;
      offsetLocal += perReqLimit;
    }

    return all;
  };

  const performExport = async () => {
    try {
      setExporting(true);
      setExportProgress({ pages: 0, rows: 0 });
      let data: Row[];
      if (exportScope === 'page') {
        data = resolveExportData();
      } else if (exportScope === 'filtered') {
        data = await fetchAllFilteredDatasetRows();
      } else { // 'all'
        data = await fetchAllDatasetRowsNoFilter();
      }
      const fields = exportFields && exportFields.length ? exportFields : availableExportFields;
      const ts = nowForName();
      if (exportFormat === 'csv') {
        const csv = rowsToCsv(data, fields, csvDelimiter, csvWithHeader);
        // Prepend BOM to make Excel recognize UTF-8
        const BOM = new Uint8Array([0xEF, 0xBB, 0xBF]);
        const out = new Blob([BOM, csv], { type: 'text/csv;charset=utf-8' });
        downloadBlob(out, 'text/csv;charset=utf-8', `clickhouse-results-${ts}.csv`);
      } else {
        const json = rowsToJson(data, fields);
        downloadBlob(json, 'application/json;charset=utf-8', `clickhouse-results-${ts}.json`);
      }
      setExportOpen(false);
    } catch (e: any) {
      console.error('Export failed', e);
      setNotif({ open: true, severity: 'error', message: 'Export failed: ' + (e?.message || String(e)) });
    } finally {
      setExporting(false);
    }
  };

  // Reset to first page when filter or sort changes
  useEffect(() => {
    setPage(1);
    setHasMore(false);
  }, [authFilter, sortBy, sortDir]);



  // When availableFields arrive and no selection yet, pick sensible defaults
  useEffect(() => {
    if (availableFields.length === 0) return;
    if (selectedFields.length === 0) {
      const persisted = ((runtimeHooks as any)?.clickhouse_query?.columns || []) as string[];
      const intersect = (a: string[], b: string[]) => a.filter(x => b.includes(x));
      const fromPersisted = Array.isArray(persisted) && persisted.length ? intersect(persisted, availableFields) : [];
      let next = fromPersisted;
      if (next.length === 0) next = intersect(DEFAULT_COLUMNS, availableFields);
      if (next.length === 0) next = availableFields.slice(0, Math.min(10, availableFields.length));
      // Only normalize default ordering when not using an explicit persisted order and user hasn't reordered
      if (fromPersisted.length === 0 && !userReorderedCols) {
        next = normalizeColumnsDefault(next);
      }
      setSelectedFields(next);
    }
  }, [availableFields]);

  // When switching away from raw_sql, restore normal columns and view
  useEffect(() => {
    if (action !== 'raw_sql') {
      // Reset available fields back to known fields; actual meta will refine after next query
      setAvailableFields(KNOWN_FIELDS);
      // Determine selected fields from persisted settings or defaults
      const persisted = ((runtimeHooks as any)?.clickhouse_query?.columns || []) as string[];
      const intersect = (a: string[], b: string[]) => a.filter(x => b.includes(x));
      const fromPersisted = Array.isArray(persisted) && persisted.length ? intersect(persisted, KNOWN_FIELDS) : [];
      let next = fromPersisted;
      if (next.length === 0) next = intersect(DEFAULT_COLUMNS, KNOWN_FIELDS);
      if (next.length === 0) next = KNOWN_FIELDS.slice(0, Math.min(10, KNOWN_FIELDS.length));
      if (fromPersisted.length === 0 && !userReorderedCols) {
        next = normalizeColumnsDefault(next);
      }
      setSelectedFields(next);
      // Restore normal column widths if we had overridden them for raw_sql
      if (normalWidthsRef.current) {
        setColumnWidths(normalWidthsRef.current);
        normalWidthsRef.current = null;
      } else {
        // Try to restore from persisted runtime settings if available
        const prevCQ: any = (runtimeHooks as any)?.clickhouse_query || {};
        if (prevCQ && prevCQ.columnWidths && typeof prevCQ.columnWidths === 'object') {
          setColumnWidths(prevCQ.columnWidths as Record<string, number>);
        } else {
          // Fallback: keep current widths; getColWidth will use defaults for unknowns
        }
      }
      // Hide raw JSON area when not in raw mode
      setShowRaw(false);
    }
  }, [action]);

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
    IR: { lon: 53, lat: 32, aliases: ['Iran','IR','Islamic Republic of Iran'] },
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
    LY: { lon: 17, lat: 27, aliases: ['Libya','LY'] },
    IQ: { lon: 43, lat: 33, aliases: ['Iraq','IQ'] },
    SY: { lon: 38, lat: 35, aliases: ['Syria','SY','Syrian Arab Republic'] },
    JO: { lon: 36, lat: 31, aliases: ['Jordan','JO'] },
    LB: { lon: 35.8, lat: 33.9, aliases: ['Lebanon','LB'] },
    OM: { lon: 57, lat: 21, aliases: ['Oman','OM'] },
    QA: { lon: 51.2, lat: 25.3, aliases: ['Qatar','QA'] },
    KW: { lon: 47.6, lat: 29.3, aliases: ['Kuwait','KW'] },
    BH: { lon: 50.55, lat: 26.02, aliases: ['Bahrain','BH'] },
    YE: { lon: 48, lat: 15.6, aliases: ['Yemen','YE'] },
    AF: { lon: 66, lat: 34.5, aliases: ['Afghanistan','AF'] },
    BD: { lon: 90, lat: 23.7, aliases: ['Bangladesh','BD'] },
    LK: { lon: 80.7, lat: 7.8, aliases: ['Sri Lanka','LK'] },
    NP: { lon: 84, lat: 28, aliases: ['Nepal','NP'] },
    BT: { lon: 90.4, lat: 27.4, aliases: ['Bhutan','BT'] },
    TH: { lon: 100.5, lat: 15.9, aliases: ['Thailand','TH'] },
    VN: { lon: 108.3, lat: 14.1, aliases: ['Vietnam','VN','Viet Nam'] },
    PH: { lon: 122, lat: 12, aliases: ['Philippines','PH'] },
    MY: { lon: 102, lat: 4.2, aliases: ['Malaysia','MY'] },
    SG: { lon: 103.8, lat: 1.35, aliases: ['Singapore','SG'] },
    KH: { lon: 104.9, lat: 12.7, aliases: ['Cambodia','KH'] },
    LA: { lon: 102.6, lat: 19.9, aliases: ['Laos','LA','Lao PDR'] },
    MM: { lon: 96, lat: 21, aliases: ['Myanmar','MM','Burma'] },
    KZ: { lon: 68, lat: 48, aliases: ['Kazakhstan','KZ'] },
    UZ: { lon: 64.6, lat: 41.8, aliases: ['Uzbekistan','UZ'] },
    TM: { lon: 59.4, lat: 39.1, aliases: ['Turkmenistan','TM'] },
    TJ: { lon: 71, lat: 38.5, aliases: ['Tajikistan','TJ'] },
    KG: { lon: 75, lat: 41.2, aliases: ['Kyrgyzstan','KG'] },
    AZ: { lon: 47.5, lat: 40.4, aliases: ['Azerbaijan','AZ'] },
    AM: { lon: 45, lat: 40.2, aliases: ['Armenia','AM'] },
    GE: { lon: 43.4, lat: 42.1, aliases: ['Georgia','GE'] },
    MN: { lon: 103.8, lat: 46.9, aliases: ['Mongolia','MN'] },
    HK: { lon: 114.15, lat: 22.29, aliases: ['Hong Kong','HK','Hong Kong SAR'] },
    MO: { lon: 113.54, lat: 22.2, aliases: ['Macao','MO','Macau'] },
    TW: { lon: 120.97, lat: 23.97, aliases: ['Taiwan','TW','Chinese Taipei'] },
    PS: { lon: 35.2, lat: 31.9, aliases: ['Palestine','PS','State of Palestine','Palestinian Territory'] },
    
    SK: { lon: 19.5, lat: 48.7, aliases: ['Slovakia','SK'] },
    SI: { lon: 14.9, lat: 46.1, aliases: ['Slovenia','SI'] },
    HR: { lon: 16.4, lat: 45.1, aliases: ['Croatia','HR'] },
    RS: { lon: 20.9, lat: 44.2, aliases: ['Serbia','RS'] },
    BG: { lon: 25.5, lat: 42.7, aliases: ['Bulgaria','BG'] },
    BY: { lon: 28, lat: 53.7, aliases: ['Belarus','BY'] },
    LT: { lon: 23.9, lat: 55.2, aliases: ['Lithuania','LT'] },
    LV: { lon: 24.9, lat: 56.8, aliases: ['Latvia','LV'] },
    EE: { lon: 25.0, lat: 58.6, aliases: ['Estonia','EE'] },
    IS: { lon: -19, lat: 64.9, aliases: ['Iceland','IS'] },
    LU: { lon: 6.1, lat: 49.8, aliases: ['Luxembourg','LU'] },
    LI: { lon: 9.55, lat: 47.17, aliases: ['Liechtenstein','LI'] },
    MT: { lon: 14.4, lat: 35.9, aliases: ['Malta','MT'] },
    CY: { lon: 33.4, lat: 35.1, aliases: ['Cyprus','CY'] },
    BA: { lon: 17.8, lat: 44.2, aliases: ['Bosnia and Herzegovina','BA'] },
    MK: { lon: 21.7, lat: 41.6, aliases: ['North Macedonia','MK','Macedonia'] },
    AL: { lon: 20, lat: 41, aliases: ['Albania','AL'] },
    ME: { lon: 19.3, lat: 42.8, aliases: ['Montenegro','ME'] },
    MD: { lon: 28.4, lat: 47, aliases: ['Moldova','MD','Republic of Moldova'] },
    SM: { lon: 12.45, lat: 43.94, aliases: ['San Marino','SM'] },
    MC: { lon: 7.42, lat: 43.74, aliases: ['Monaco','MC'] },
    AD: { lon: 1.6, lat: 42.55, aliases: ['Andorra','AD'] },
    
    PE: { lon: -75, lat: -9.2, aliases: ['Peru','PE'] },
    EC: { lon: -78, lat: -1.4, aliases: ['Ecuador','EC'] },
    BO: { lon: -64.7, lat: -16.7, aliases: ['Bolivia','BO','Bolivia (Plurinational State of)'] },
    PY: { lon: -58.4, lat: -23.4, aliases: ['Paraguay','PY'] },
    UY: { lon: -56, lat: -32.8, aliases: ['Uruguay','UY'] },
    SR: { lon: -56, lat: 4.1, aliases: ['Suriname','SR'] },
    GY: { lon: -58.9, lat: 4.9, aliases: ['Guyana','GY'] },
    DO: { lon: -70.2, lat: 18.9, aliases: ['Dominican Republic','DO'] },
    HT: { lon: -72.3, lat: 18.9, aliases: ['Haiti','HT'] },
    CU: { lon: -79.5, lat: 21.5, aliases: ['Cuba','CU'] },
    JM: { lon: -77.3, lat: 18.1, aliases: ['Jamaica','JM'] },
    TT: { lon: -61.2, lat: 10.5, aliases: ['Trinidad and Tobago','TT'] },
    BS: { lon: -77.4, lat: 25.0, aliases: ['Bahamas','BS'] },
    BB: { lon: -59.5, lat: 13.2, aliases: ['Barbados','BB'] },
    BZ: { lon: -88.7, lat: 17.2, aliases: ['Belize','BZ'] },
    CR: { lon: -84, lat: 9.9, aliases: ['Costa Rica','CR'] },
    PA: { lon: -80, lat: 8.5, aliases: ['Panama','PA'] },
    GT: { lon: -90.4, lat: 15.7, aliases: ['Guatemala','GT'] },
    HN: { lon: -86.6, lat: 14.8, aliases: ['Honduras','HN'] },
    SV: { lon: -88.9, lat: 13.8, aliases: ['El Salvador','SV'] },
    NI: { lon: -85.1, lat: 12.8, aliases: ['Nicaragua','NI'] },
    
    ET: { lon: 40.5, lat: 9.1, aliases: ['Ethiopia','ET'] },
    SD: { lon: 30.2, lat: 13.6, aliases: ['Sudan','SD'] },
    SS: { lon: 31.3, lat: 6.9, aliases: ['South Sudan','SS'] },
    UG: { lon: 32.3, lat: 1.37, aliases: ['Uganda','UG'] },
    TZ: { lon: 34.8, lat: -6.3, aliases: ['Tanzania','TZ','United Republic of Tanzania'] },
    RW: { lon: 29.9, lat: -1.9, aliases: ['Rwanda','RW'] },
    BI: { lon: 29.9, lat: -3.4, aliases: ['Burundi','BI'] },
    SO: { lon: 46.2, lat: 5.0, aliases: ['Somalia','SO'] },
    DJ: { lon: 42.6, lat: 11.8, aliases: ['Djibouti','DJ'] },
    ER: { lon: 39.8, lat: 15.1, aliases: ['Eritrea','ER'] },
    GH: { lon: -1.2, lat: 7.95, aliases: ['Ghana','GH'] },
    CI: { lon: -5.55, lat: 7.54, aliases: ['Cote dIvoire','CI','Ivory Coast'] },
    SN: { lon: -14.5, lat: 14.5, aliases: ['Senegal','SN'] },
    ML: { lon: -3.5, lat: 17.5, aliases: ['Mali','ML'] },
    BF: { lon: -1.5, lat: 12.3, aliases: ['Burkina Faso','BF'] },
    NE: { lon: 9.4, lat: 17.6, aliases: ['Niger','NE'] },
    TD: { lon: 18.7, lat: 15.5, aliases: ['Chad','TD'] },
    CF: { lon: 20.5, lat: 6.6, aliases: ['Central African Republic','CF'] },
    CM: { lon: 12.7, lat: 5.7, aliases: ['Cameroon','CM'] },
    GQ: { lon: 10.5, lat: 1.6, aliases: ['Equatorial Guinea','GQ'] },
    GA: { lon: 11.7, lat: -0.6, aliases: ['Gabon','GA'] },
    CG: { lon: 15.0, lat: -0.7, aliases: ['Congo','CG','Republic of the Congo'] },
    CD: { lon: 23.7, lat: -2.8, aliases: ['DR Congo','CD','Democratic Republic of the Congo'] },
    AO: { lon: 17.9, lat: -12.3, aliases: ['Angola','AO'] },
    ZM: { lon: 28.3, lat: -13.1, aliases: ['Zambia','ZM'] },
    ZW: { lon: 29.8, lat: -19, aliases: ['Zimbabwe','ZW'] },
    NA: { lon: 17.2, lat: -22.6, aliases: ['Namibia','NA'] },
    BW: { lon: 24.7, lat: -22, aliases: ['Botswana','BW'] },
    LS: { lon: 28.2, lat: -29.5, aliases: ['Lesotho','LS'] },
    SZ: { lon: 31.5, lat: -26.5, aliases: ['Eswatini','SZ','Swaziland'] },
    MW: { lon: 34.3, lat: -13.5, aliases: ['Malawi','MW'] },
    MZ: { lon: 35.5, lat: -18.7, aliases: ['Mozambique','MZ'] },
    MG: { lon: 46.7, lat: -19.4, aliases: ['Madagascar','MG'] },
    MR: { lon: -10.3, lat: 20.3, aliases: ['Mauritania','MR'] },
    GN: { lon: -9.7, lat: 9.9, aliases: ['Guinea','GN'] },
    SL: { lon: -11.8, lat: 8.5, aliases: ['Sierra Leone','SL'] },
    LR: { lon: -9.4, lat: 6.4, aliases: ['Liberia','LR'] },
    BJ: { lon: 2.3, lat: 9.3, aliases: ['Benin','BJ'] },
    TG: { lon: 1.2, lat: 8.6, aliases: ['Togo','TG'] },
    GM: { lon: -15.4, lat: 13.5, aliases: ['Gambia','GM','The Gambia'] },
    GW: { lon: -15.2, lat: 12.0, aliases: ['Guinea-Bissau','GW'] },
    CV: { lon: -23.6, lat: 15.1, aliases: ['Cabo Verde','CV','Cape Verde'] },
    ST: { lon: 6.73, lat: 0.18, aliases: ['Sao Tome and Principe','ST'] },
    SC: { lon: 55.45, lat: -4.68, aliases: ['Seychelles','SC'] },
    MU: { lon: 57.55, lat: -20.3, aliases: ['Mauritius','MU'] },
    KM: { lon: 43.3, lat: -11.7, aliases: ['Comoros','KM'] },
    EH: { lon: -12.9, lat: 24.2, aliases: ['Western Sahara','EH'] },
    
    PG: { lon: 147, lat: -6.3, aliases: ['Papua New Guinea','PG'] },
    FJ: { lon: 178, lat: -17.8, aliases: ['Fiji','FJ'] },
    SB: { lon: 160, lat: -9.6, aliases: ['Solomon Islands','SB'] },
    VU: { lon: 167, lat: -16.2, aliases: ['Vanuatu','VU'] },
    WS: { lon: -172, lat: -13.8, aliases: ['Samoa','WS'] },
    TO: { lon: -175.2, lat: -21.2, aliases: ['Tonga','TO'] },
    KI: { lon: -157.4, lat: 1.9, aliases: ['Kiribati','KI'] },
    FM: { lon: 158.2, lat: 6.9, aliases: ['Micronesia','FM','Federated States of Micronesia'] },
    MH: { lon: 171.2, lat: 7.1, aliases: ['Marshall Islands','MH'] },
    PW: { lon: 134.5, lat: 7.5, aliases: ['Palau','PW'] },
    NR: { lon: 166.93, lat: -0.52, aliases: ['Nauru','NR'] },
    TV: { lon: 177.98, lat: -7.11, aliases: ['Tuvalu','TV'] },
  }), []);

  const normalizeCountryKey = useCallback((label: string): string | null => {
    if (!label) return null;
    let v = String(label).trim();
    // If it's a list like "DE, AT" or "DE;AT" or includes spaces, pick the first token
    const tokens = v.split(/[\s,;]+/).filter(Boolean);
    if (tokens.length > 1) v = tokens[0];
    // Accept bare 2-letter ISO codes case-insensitively
    if (/^[a-z]{2}$/i.test(v)) return v.toUpperCase();
    // Direct match against our centroid list
    if ((COUNTRY_CENTROIDS as any)[v]) return v as keyof typeof COUNTRY_CENTROIDS as string;
    const up = v.toUpperCase();
    if ((COUNTRY_CENTROIDS as any)[up]) return up;
    // Match by alias names (case-insensitive)
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
        if (def) {
          mapped.push({ iso, country: c.country, lon: def.lon, lat: def.lat, ...rec });
        } else {
          // Centroid not available for this ISO — keep stats for coloring via isoStats but no marker.
          unmapped.push({ country: c.country, ...rec });
        }
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

  const [mapOpen, setMapOpen] = useState<boolean>(true);
  // Zoom & pan state for the world map
  const MAP_MIN_ZOOM = 0.3;
  const MAP_MAX_ZOOM = 8;
  const MAP_DEFAULT_ZOOM = 1; // full world
  const [mapZoom, setMapZoom] = useState<number>(MAP_DEFAULT_ZOOM);
  const [mapSlider, setMapSlider] = useState<number>(50); // 0..100, 50% => full world
  const [mapCenter, setMapCenter] = useState<[number, number]>([0, 0]);

  // Map slider conversion helpers: piecewise linear so that 0%=>min, 50%=>default(1), 100%=>max
  const sliderToZoom = useCallback((s: number): number => {
    const clamped = Math.max(0, Math.min(100, s));
    if (clamped <= 50) {
      const t = clamped / 50; // 0..1
      return MAP_MIN_ZOOM + (MAP_DEFAULT_ZOOM - MAP_MIN_ZOOM) * t;
    }
    const t = (clamped - 50) / 50; // 0..1
    return MAP_DEFAULT_ZOOM + (MAP_MAX_ZOOM - MAP_DEFAULT_ZOOM) * t;
  }, []);
  const zoomToSlider = useCallback((z: number): number => {
    const clamped = Math.max(MAP_MIN_ZOOM, Math.min(MAP_MAX_ZOOM, z));
    if (clamped <= MAP_DEFAULT_ZOOM) {
      // Map [min, default] -> [0, 50]
      const t = (clamped - MAP_MIN_ZOOM) / (MAP_DEFAULT_ZOOM - MAP_MIN_ZOOM);
      return t * 50;
    }
    // Map (default, max] -> (50, 100]
    const t = (clamped - MAP_DEFAULT_ZOOM) / (MAP_MAX_ZOOM - MAP_DEFAULT_ZOOM);
    return 50 + t * 50;
  }, []);

  // Build quick lookup for stats by ISO code for coloring
  const isoStats = useMemo(() => {
    const m = new Map<string, { success: number; failed: number; total: number }>();
    for (const c of countryAgg) {
      const iso = normalizeCountryKey(c.country);
      if (!iso) continue;
      const cur = m.get(iso) || { success: 0, failed: 0, total: 0 };
      cur.success += c.success;
      cur.failed += c.failed;
      cur.total += c.total;
      m.set(iso, cur);
    }
    return m;
  }, [countryAgg, normalizeCountryKey]);

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


  const applySearch = useCallback(() => {
    setSearchQuery(searchDraft);
    if (action === 'recent') {
      if (page === 1) {
        void runQuery(true, { keepPage: true });
      } else {
        setPage(1);
      }
    } else {
      if (page !== 1) setPage(1);
    }
  }, [searchDraft, page, runQuery, action]);

  const autoRefreshing = refreshMs > 0;
  const hasAnyExpanded = expandedKeys.size > 0;

  const searchTipsText = `Tips: Strict mode: only field comparisons are allowed. Use AND/OR/NOT and parentheses to combine. Supported: key==value, !=, <, >, <=, >= (e.g., authenticated==true, failed_login_count >= 5). Regex is allowed only as a comparison value for text fields, e.g., user_agent="/android/i" or proto!="/^(imap|smtp)$/i".`;

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', rowGap: 1 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>ClickHouse</Typography>
        <Box sx={{ flexGrow: 1 }} />
      </Stack>

      {/* Connection status (unified banner) */}
      <Box sx={{ display:'flex', alignItems:'center', mb:2 }}>
        <Typography variant="subtitle1" sx={{ mr:2 }}>Connection Status:</Typography>
        {connStatus === 'checking' && <CircularProgress size={20} sx={{ mr:1 }} />}
        {connStatus === 'connected' && <CheckCircleIcon color="success" sx={{ mr:1 }} />}
        {connStatus === 'disconnected' && <ErrorIcon color="error" sx={{ mr:1 }} />}
        {connStatus === 'unknown' && <Typography color="text.secondary">Not checked</Typography>}
        {connStatus === 'disconnected' && (
          <Typography color="error.main">{statusMessage}</Typography>
        )}
        <Tooltip title="Check connection">
          <span>
            <IconButton onClick={() => { void checkConnection(getConnection()); }} disabled={connStatus === 'checking'} sx={{ ml: 1 }}>
              <RefreshIcon />
            </IconButton>
          </span>
        </Tooltip>
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
        ) }} sx={{ mt: 1 }} />
        <Box sx={{ display:'flex', justifyContent:'flex-end', mt:2 }}>
          <Button size="small" startIcon={<SaveIcon />} variant="contained" onClick={async()=>{
            try {
              const userId = await getCurrentUserId();
              const prevCQ: any = (runtimeHooks as any)?.clickhouse_query || {};
              // Avoid overwriting normal columns with ad-hoc raw SQL columns
              const colsToSave = action === 'raw_sql'
                ? (prevCQ?.columns || [])
                : ((selectedFields && selectedFields.length) ? selectedFields : (prevCQ?.columns || []));
              const ui = {
                action, username, account, ip, limit, pageSize, authFilter, tsStart, tsEnd, tsTimeZone, rawSql, mapOpen, searchQuery, refreshMs
              } as any;
              await saveRuntimeSettings(userId, currentProfileName, runtimeConnection, {
                ...(runtimeHooks || {}),
                clickhouse_query: { ...prevCQ, enabled: hookEnabled, endpoint_path: endpointPath, columns: colsToSave, ui }
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

      {/* Responsive layout: Query and Top Countries on the left, Map on the right */}
      <Grid container spacing={2}>
        {/* Right column: Map (takes about half width on md+ screens) */}
        <Grid sx={{ order: { xs: 2, md: 2 } }} size={{ xs: 12, md: 6 }}>
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
            <Collapse in={mapOpen} timeout="auto" unmountOnExit={false}>
              <Box sx={{ width:'100%', overflowX:'auto', mt:1, position:'relative' }}>
                {/* Subtle progress shown while long-running loads; map stays mounted */}
                {busy && (
                  <Box sx={{ position:'absolute', top:8, right:12, zIndex:1, minWidth:180 }}>
                    <LinearProgress />
                  </Box>
                )}

                {/* Zoom slider displayed above the map (not overlay) for better visibility on small screens */}
                <Box sx={{ display:'flex', justifyContent:'flex-end', mb:1 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="caption" sx={{ minWidth: 28, textAlign:'center' }}>-</Typography>
                    <Slider
                      size="small"
                      value={mapSlider}
                      onChange={(_, v)=> {
                        const s = Array.isArray(v) ? v[0] : (v as number);
                        setMapSlider(s);
                        setMapZoom(sliderToZoom(s));
                      }}
                      min={0}
                      max={100}
                      step={1}
                      sx={{ width: 160 }}
                      aria-label="Map zoom"
                    />
                    <Typography variant="caption" sx={{ minWidth: 28, textAlign:'center' }}>+</Typography>
                  </Stack>
                </Box>
                {/* Using react-simple-maps world-110m TopoJSON; map is always mounted */}
                <ComposableMap projection="geoMercator" width={980} height={600} style={{ width: '100%', height: 'auto' }}>
                  <ZoomableGroup center={mapCenter} zoom={mapZoom} minZoom={MAP_MIN_ZOOM} maxZoom={MAP_MAX_ZOOM} onMoveEnd={({ coordinates, zoom })=>{ setMapCenter(coordinates as any); const z = zoom as number; setMapZoom(z); setMapSlider(zoomToSlider(z)); }}>
                    <Geographies geography="https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json">
                      {({ geographies }) => (
                        <>
                          {geographies.map(geo => {
                            const props: any = (geo as any).properties || {};
                            const name = String(props.name || props.NAME || props.NAME_LONG || '').trim();
                            const iso2 = String(props.ISO_A2 || props.ISO_A2_EH || props.iso_a2 || '').trim();
                            const iso = iso2 ? normalizeCountryKey(iso2) : (name ? normalizeCountryKey(name) : null);
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

                          {/* Markers render only when we have mapped data; the base map stays */}
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
                  </ZoomableGroup>
                </ComposableMap>

                {/* Optional hint text; does not unmount the map */}
                {countryAgg.length === 0 && !loading && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt:1 }}>
                    No data to display.
                  </Typography>
                )}

                {/* Legend stays visible */}
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
            </Collapse>
          </Paper>
        </Grid>

        {/* Left column: Query (above) and Top Countries (below) */}
        <Grid sx={{ order: { xs: 1, md: 1 } }} size={{ xs: 12, md: 6 }}>
          {/* Query */}
          <Paper sx={{ p:2, mb:2 }}>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>Query</Typography>
            <Grid container spacing={2} sx={{ mt:1 }}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField select fullWidth label="Action" value={action} onChange={e=>setAction(e.target.value as Action)}>
                  <MenuItem value="recent">recent</MenuItem>
                  <MenuItem value="by_user">by_user</MenuItem>
                  <MenuItem value="by_account">by_account</MenuItem>
                  <MenuItem value="by_ip">by_ip</MenuItem>
                  <MenuItem value="raw_sql">raw_sql</MenuItem>
                </TextField>
              </Grid>
              {(action === 'by_user' || action === 'by_account' || action === 'by_ip') && (
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label={action === 'by_user' ? 'Username' : action === 'by_account' ? 'Account' : 'IP'}
                    value={action === 'by_user' ? username : action === 'by_account' ?  account : ip}
                    onChange={(e)=> action === 'by_user' ? setUsername(e.target.value) : action === 'by_account' ? setAccount(e.target.value) : setIp(e.target.value)}
                  />
                </Grid>
              )}
            </Grid>
            <Grid container spacing={2} sx={{ mt:1 }}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField select fullWidth label="Status" value={authFilter} onChange={e=>{ setAuthFilter(e.target.value as any); }}>
                  <MenuItem value="all">failed/success</MenuItem>
                  <MenuItem value="failed">failed</MenuItem>
                  <MenuItem value="success">success</MenuItem>
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField select fullWidth label="Time zone" value={tsTimeZone} onChange={(e)=> setTsTimeZone(String(e.target.value))} helperText="DST is applied automatically for this time zone; Start/End are interpreted in this zone and converted to UTC for the query.">
                  {tzList.map((z)=> (
                    <MenuItem key={z.id} value={z.id}>{z.label}</MenuItem>
                  ))}
                </TextField>
              </Grid>
            </Grid>
            <Grid container spacing={2} sx={{ mt:1 }}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  type="datetime-local"
                  label="Start (ts)"
                  value={tsStart}
                  onChange={(e)=>{ const v = e.target.value; setTsStart(v); if (v && v.trim() !== '') { try { setRefreshMs(0); } catch {} } }}
                  inputRef={tsStartRef}
                  placeholder="YYYY-MM-DDThh:mm"
                  InputLabelProps={{ shrink: true }}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        {tsStart ? (
                          <IconButton size="small" onClick={()=>setTsStart('')} aria-label="Clear start time">
                            <ClearIcon fontSize="small" />
                          </IconButton>
                        ) : null}
                        <IconButton size="small" onClick={()=>openPicker(tsStartRef.current)} aria-label="Pick start time">
                          <EventIcon fontSize="small" />
                        </IconButton>
                      </InputAdornment>
                    ),
                    sx: {
                      minHeight: { xs: 44, sm: 48 },
                      alignItems: 'center',
                      '& input[type="datetime-local"]': {
                        WebkitTextFillColor: 'currentColor',
                        color: 'text.primary',
                        fontFamily: 'monospace',
                        fontSize: { xs: 12, sm: 14 },
                        pr: 3, // leave room for the calendar icon
                      },
                      // Hide native calendar icon to avoid double icons with our custom button
                      '& input[type="datetime-local"]::-webkit-calendar-picker-indicator': {
                        display: 'none',
                        opacity: 0,
                      }
                    }
                  }}
                  inputProps={{ step: 60 }}
                  helperText="Optional"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  type="datetime-local"
                  label="End (ts)"
                  value={tsEnd}
                  onChange={(e)=>setTsEnd(e.target.value)}
                  inputRef={tsEndRef}
                  placeholder="YYYY-MM-DDThh:mm"
                  InputLabelProps={{ shrink: true }}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        {tsEnd ? (
                          <IconButton size="small" onClick={()=>setTsEnd('')} aria-label="Clear end time">
                            <ClearIcon fontSize="small" />
                          </IconButton>
                        ) : null}
                        <IconButton size="small" onClick={()=>openPicker(tsEndRef.current)} aria-label="Pick end time">
                          <EventIcon fontSize="small" />
                        </IconButton>
                      </InputAdornment>
                    ),
                    sx: {
                      minHeight: { xs: 44, sm: 48 },
                      alignItems: 'center',
                      '& input[type="datetime-local"]': {
                        WebkitTextFillColor: 'currentColor',
                        color: 'text.primary',
                        fontFamily: 'monospace',
                        fontSize: { xs: 12, sm: 14 },
                        pr: 3,
                      },
                      // Hide native calendar icon to avoid double icons with our custom button
                      '& input[type="datetime-local"]::-webkit-calendar-picker-indicator': {
                        display: 'none',
                        opacity: 0,
                      }
                    }
                  }}
                  inputProps={{ step: 60 }}
                  helperText="Optional"
                />
              </Grid>
              {action === 'raw_sql' && (
                <>
                  <Grid size={12}>
                    <TextField
                      fullWidth
                      multiline
                      minRows={3}
                      maxRows={12}
                      label="SQL (SELECT ...)"
                      placeholder="SELECT ... FROM ... WHERE ..."
                      value={rawSql}
                      onChange={(e)=>setRawSql(e.target.value)}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 8 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Button variant="contained" startIcon={<PlayArrowIcon/>} onClick={()=>runQuery(true)} disabled={loading}>
                        Run
                      </Button>
                      <Button variant="outlined" startIcon={<RefreshIcon/>} onClick={()=>{ setRows([]); setRawPreview(''); setRawPreviewFull(''); setError(''); }} disabled={loading}>
                        Reset
                      </Button>
                      <IconButton size="small" aria-label="SQL bookmarks" onClick={(e)=> setBmMenuAnchorSql(e.currentTarget)}>
                        <BookmarkBorderIcon/>
                      </IconButton>
                    </Stack>
                    <Menu anchorEl={bmMenuAnchorSql} open={Boolean(bmMenuAnchorSql)} onClose={()=> setBmMenuAnchorSql(null)}>
                      <MenuItem onClick={()=>{ 
                        const list = bookmarks.raw_sql || []; 
                        if (list.length >= MAX_BOOKMARKS) { setNotif({ open:true, severity:'warning', message:`Maximum ${MAX_BOOKMARKS} bookmarks allowed.` }); return; }
                        setBmDialogMode('create'); setBmDialogKind('raw_sql'); setBmDialogTargetId(undefined);
                        const def = `SQL ${list.length+1}`; setBmDialogName(def); setBmDialogError(''); setBmDialogOpen(true); setBmMenuAnchorSql(null);
                      }}>
                        <BookmarkAddIcon fontSize="small" style={{ marginRight: 8 }} /> Save current SQL
                      </MenuItem>
                      <Divider />
                      {(bookmarks.raw_sql || []).length === 0 ? (
                        <MenuItem disabled>No bookmarks</MenuItem>
                      ) : (
                        (bookmarks.raw_sql || []).map(bm => (
                          <MenuItem key={bm.id} onClick={()=>{ loadBookmark('raw_sql', bm.id); setBmMenuAnchorSql(null); }}>
                            <Box sx={{ display:'flex', alignItems:'center', width:'100%', gap:1 }}>
                              <Box sx={{ flexGrow:1, minWidth:160 }}>
                                <Typography variant="body2" noWrap title={bm.name}>{bm.name}</Typography>
                              </Box>
                              <IconButton size="small" onClick={(e)=>{ e.stopPropagation(); setBmDialogMode('rename'); setBmDialogKind('raw_sql'); setBmDialogTargetId(bm.id); setBmDialogName(bm.name); setBmDialogError(''); setBmDialogOpen(true); }} aria-label="Rename">
                                <DriveFileRenameOutlineIcon fontSize="small" />
                              </IconButton>
                              <IconButton size="small" onClick={(e)=>{ e.stopPropagation(); setBmDialogMode('delete'); setBmDialogKind('raw_sql'); setBmDialogTargetId(bm.id); setBmDialogName(bm.name); setBmDialogError(''); setBmDialogOpen(true); }} aria-label="Delete">
                                <DeleteOutlineIcon fontSize="small" />
                              </IconButton>
                            </Box>
                          </MenuItem>
                        ))
                      )}
                    </Menu>
                  </Grid>
                </>
              )}
              {action !== 'recent' && action !== 'raw_sql' && (
                <Grid size={{ xs: 12, sm: 8 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Button variant="contained" startIcon={<PlayArrowIcon/>} onClick={()=>runQuery(true)} disabled={loading}>
                      Run
                    </Button>
                    <Button variant="outlined" startIcon={<RefreshIcon/>} onClick={()=>{ setRows([]); setRawPreview(''); setRawPreviewFull(''); setError(''); }} disabled={loading}>
                      Reset
                    </Button>
                  </Stack>
                </Grid>
              )}
            </Grid>
            <Typography variant="caption" color="text.secondary" sx={{ mt:1, display:'block' }}>
              Hinweis: Sommer-/Winterzeit (DST) wird automatisch anhand der gewählten Zeitzone berücksichtigt. Eine separate Checkbox ist nicht nötig.
            </Typography>
          </Paper>

          {/* Query error under the Query box */}
          <Collapse in={Boolean(error)}>
            <Alert severity="error" sx={{ mb:2 }} onClose={()=> setError('')}>
              {error}
            </Alert>
          </Collapse>

          {/* Top Countries under Query */}
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
                  <Grid key={c.country} size={{ xs: 12, sm: 6, md: 6, lg: 6 }}>
                    <Paper variant="outlined" sx={{ p:1 }}>
                      <Stack direction="row" justifyContent="space-between">
                        <Typography fontWeight={600}>{c.country}</Typography>
                        <Typography variant="caption">{c.total}</Typography>
                      </Stack>
                      <Stack direction="row" spacing={1} mt={0.5}>
                        <Chip size="small" label={`success ${c.success}`} sx={{ bgcolor: '#0072B2', color: '#fff' }} />
                        <Chip size="small" label={`failed ${c.failed}`} sx={{ bgcolor: '#D55E00', color: '#fff' }} />
                      </Stack>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            )}
          </Paper>
        </Grid>
      </Grid>

      <CollapsibleFormSection title="Field Selection" description="Choose the columns to display in the results table.">
        <Stack direction="row" spacing={1} sx={{ mb:1, flexWrap:'wrap', alignItems:'center' }}>
          <Button size="small" onClick={()=>{
            const next = (!userReorderedCols ? normalizeColumnsDefault(sortedAvailableFields) : sortedAvailableFields);
            setSelectedFields(next);
          }}>Select all</Button>
          <Button size="small" onClick={()=>setSelectedFields([])}>Clear</Button>
          <Button size="small" onClick={()=>{
            // Set to defaults: exactly DEFAULT_COLUMNS intersected with currently available fields
            const intersect = (a: string[], b: string[]) => a.filter(x => b.includes(x));
            let next = intersect(DEFAULT_COLUMNS, availableFields);
            if (!userReorderedCols) next = normalizeColumnsDefault(next);
            setSelectedFields(next);
          }}>Set to defaults</Button>
          <Box sx={{ flexGrow:1 }} />
          <Button size="small" startIcon={<SaveIcon/>} variant="contained" onClick={async()=>{
            try {
              const userId = await getCurrentUserId();
              const prevCQ: any = (runtimeHooks as any)?.clickhouse_query || {};
              const ui = { action, username, account, ip, limit, pageSize, authFilter, tsStart, tsEnd, tsTimeZone, rawSql, searchQuery } as any;
              if (action === 'raw_sql') {
                setNotif({ open:true, severity:'info', message:'Column selection not persisted for raw SQL results' });
              } else {
                await saveRuntimeSettings(userId, currentProfileName, runtimeConnection, {
                  ...(runtimeHooks || {}),
                  clickhouse_query: { ...prevCQ, enabled: hookEnabled, endpoint_path: endpointPath, columns: selectedFields, ui }
                } as any);
                setNotif({ open:true, severity:'success', message:'Column selection saved' });
              }
            } catch(e:any) {
              setNotif({ open:true, severity:'error', message:`Save failed: ${e?.message || String(e)}` });
            }
          }}>Save settings</Button>
        </Stack>
        <Grid container spacing={1}>
          {sortedAvailableFields.map((name)=> (
            <Grid key={name} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={selectedFields.includes(name)}
                    onChange={(e)=>{
                      if (e.target.checked) {
                        setSelectedFields(prev => {
                          const arr = Array.from(new Set([...(prev||[]), name]));
                          if (!userReorderedCols) return normalizeColumnsDefault(arr);
                          return arr;
                        });
                      }
                      else setSelectedFields(prev => (prev||[]).filter(n => n !== name));
                    }}
                  />
                }
                label={name}
              />
            </Grid>
          ))}
        </Grid>
      </CollapsibleFormSection>

      <Paper sx={{ p:2 }}>
        <Typography variant="subtitle1" gutterBottom>Results</Typography>
        {/* Responsive grid: stack controls on xs, 3 columns on md+ */}
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr auto auto' },
          columnGap: 1,
          rowGap: 1,
          alignItems: 'center',
          mb: 1,
        }}>
          {/* Column 1, Row 1: Search + Send + Matches (flex) */}
          <Box sx={{ display:'flex', alignItems:'center', gap:1, minWidth: { xs: 160, md: 260 }, flexWrap: { xs: 'wrap', md: 'nowrap' } }}>
            <Box sx={{ position: 'relative', minWidth: { xs: 160, md: 260 }, flexGrow: 1 }}>
              {!!completionSuffix && (
                <Box
                  aria-hidden
                  sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    pointerEvents: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    // Mirror the actual input's computed styles for exact alignment
                    color: 'text.disabled',
                    whiteSpace: 'pre',
                    ...ghostStyle,
                  }}
                >
                  <span style={{ visibility: 'hidden' }}>{searchDraft}</span>
                  <span>{completionSuffix}</span>
                </Box>
              )}

              <TextField
                fullWidth
                size="small"
                label="Search"
                placeholder="Filter (strict: use field comparisons e.g. username==&quot;alice&quot;; combine with AND/OR/NOT and parentheses)"
                value={searchDraft}
                inputRef={searchInputRef}
                onClick={updateCaretAtEnd}
                onKeyUp={updateCaretAtEnd}
                onBlur={updateCaretAtEnd}
                onChange={(e) => { setSearchDraft(e.target.value); setTimeout(updateCaretAtEnd, 0); }}
                onKeyDown={(e) => {
                  if ((e as any).key === 'Enter') { e.preventDefault(); applySearch(); return; }
                  const hasCompletion = !!completionSuffix;
                  if ((e.key === 'ArrowRight' || e.key === 'Tab') && hasCompletion && caretAtEnd) {
                    e.preventDefault();
                    setSearchDraft(prev => prev + completionSuffix);
                    requestAnimationFrame(updateCaretAtEnd);
                  }
                }}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      {searchDraft && (
                        <IconButton size="small" onClick={() => { setSearchDraft(''); setSearchQuery(''); if (page !== 1) { setPage(1); } }} aria-label="Clear search">
                          <ClearIcon fontSize="small" />
                        </IconButton>
                      )}
                      <IconButton size="small" aria-label="Search bookmarks" onClick={(e) => setBmMenuAnchorSearch(e.currentTarget)}>
                        <BookmarkBorderIcon fontSize="small" />
                      </IconButton>
                      <InfoTooltip
                        title={searchTipsText}
                        size="small"
                        placement="top"
                      />
                    </InputAdornment>
                  )
                }}
                sx={{ minWidth: { xs: 160, md: 260 }, width: '100%', flexGrow: 1, '& .MuiInputBase-root': { height: 40 } }}
              />
            </Box>
            <Button size="small" variant="contained" onClick={()=>{ applySearch(); }} sx={{ whiteSpace: 'nowrap', height: 40, width: { xs: '100%', md: 'auto' }, flexShrink: 0 }}>
              Send
            </Button>
            <Menu anchorEl={bmMenuAnchorSearch} open={Boolean(bmMenuAnchorSearch)} onClose={()=> setBmMenuAnchorSearch(null)}>
              <MenuItem onClick={()=>{
                const list = bookmarks.search || [];
                if (list.length >= MAX_BOOKMARKS) { setNotif({ open:true, severity:'warning', message:`Maximum ${MAX_BOOKMARKS} bookmarks allowed.` }); return; }
                setBmDialogMode('create'); setBmDialogKind('search'); setBmDialogTargetId(undefined);
                const def = `Search ${list.length+1}`; setBmDialogName(def); setBmDialogError(''); setBmDialogOpen(true); setBmMenuAnchorSearch(null);
              }}>
                <BookmarkAddIcon fontSize="small" style={{ marginRight: 8 }} /> Save current search
              </MenuItem>
              <Divider />
              {(bookmarks.search || []).length === 0 ? (
                <MenuItem disabled>No bookmarks</MenuItem>
              ) : (
                (bookmarks.search || []).map(bm => (
                  <MenuItem key={bm.id} onClick={()=>{ loadBookmark('search', bm.id); setBmMenuAnchorSearch(null); }}>
                    <Box sx={{ display:'flex', alignItems:'center', width:'100%', gap:1 }}>
                      <Box sx={{ flexGrow:1, minWidth:160 }}>
                        <Typography variant="body2" noWrap title={bm.name}>{bm.name}</Typography>
                      </Box>
                      <IconButton size="small" onClick={(e)=>{ e.stopPropagation(); setBmDialogMode('rename'); setBmDialogKind('search'); setBmDialogTargetId(bm.id); setBmDialogName(bm.name); setBmDialogError(''); setBmDialogOpen(true); }} aria-label="Rename">
                        <DriveFileRenameOutlineIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={(e)=>{ e.stopPropagation(); setBmDialogMode('delete'); setBmDialogKind('search'); setBmDialogTargetId(bm.id); setBmDialogName(bm.name); setBmDialogError(''); setBmDialogOpen(true); }} aria-label="Delete">
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </MenuItem>
                ))
              )}
            </Menu>
            <Typography variant="caption" color="text.secondary" sx={{ flexBasis: { xs: '100%', md: 'auto' } }}>
              Matches: {searchFilteredRows.length} / {filteredRows.length}
            </Typography>
          </Box>

          {/* Column 2, Row 1: OFF/Refresh controls */}
          <Select
            size="small"
            value={refreshMs}
            onChange={(e)=>setRefreshMs(Number(e.target.value))}
            sx={{
              minWidth: { xs: 110, md: 140 },
              mr: { xs: 0, md: 1 },
              '& .MuiOutlinedInput-root': { height: 40 },
              width: { xs: '100%', md: 'auto' },
              justifySelf: { xs: 'stretch', md: 'start' },
            }}
            displayEmpty
            aria-label="Refresh interval"
            disabled={action!=='recent'}
          >
            <MenuItem value={0}>OFF</MenuItem>
            <MenuItem value={2000}>2 s</MenuItem>
            <MenuItem value={5000}>5 s</MenuItem>
            <MenuItem value={10000}>10 s</MenuItem>
            <MenuItem value={30000}>30 s</MenuItem>
            <MenuItem value={60000}>1 m</MenuItem>
            <MenuItem value={120000}>2 m</MenuItem>
          </Select>
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon/>}
            onClick={()=>{ void runQuery(true, { keepPage: true }); }}
            sx={{ height: 40, width: { xs: '100%', md: 'auto' }, justifySelf: { xs: 'stretch', md: 'start' } }}
            disabled={action!=='recent'}
          >
            Refresh
          </Button>

        </Box>
        {busy && !hasAnyExpanded && (
          <Box sx={{ mb: 1 }}>
            <LinearProgress />
          </Box>
        )}

        {rows.length === 0 ? (
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
          <Box sx={{ opacity: changePulse && !hasAnyExpanded ? 0.6 : 1, transition: 'opacity 120ms ease' }}>
            <Box sx={{ overflowX:'auto' }}>
              <table style={{ width:'max-content', minWidth:'100%', borderCollapse:'collapse', tableLayout:'fixed' as any }}>
                <thead>
                  <tr>
                    <th
                      style={{
                        width: 48,
                        minWidth: 32,
                        maxWidth: 48,
                        position: 'sticky',
                        left: 0,
                        zIndex: 2,
                        background: theme.palette.background.paper,
                        boxShadow: `inset -1px 0 0 ${theme.palette.divider}`
                      }}
                    />
                    {selectedFields.map((h, idx) => {
                      const active = sortBy === h;
                      const indicator = active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
                      const w = getColWidth(h);
                      return (
                        <th
                          key={h}
                          draggable
                          onDragStart={(e) => {
                            try { e.dataTransfer.setData('text/plain', String(idx)); } catch {}
                            (e.currentTarget as any).dataset.dragging = 'true';
                            // Suppress header sort shortly after a drag starts (reorder)
                            suppressSortUntilRef.current = Date.now() + 600;
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
                            // Suppress sort just after dropping to avoid accidental clicks
                            suppressSortUntilRef.current = Date.now() + 500;
                            let fromIdx = Number(e.dataTransfer.getData('text/plain'));
                            const toIdx = idx;
                            if (!Number.isFinite(fromIdx) || fromIdx === toIdx) return;
                            const next = [...selectedFields];
                            const [moved] = next.splice(fromIdx, 1);
                            next.splice(toIdx, 0, moved);
                            setSelectedFields(next);
                            setUserReorderedCols(true);
                            // Persist new order automatically
                            try {
                              const userId = await getCurrentUserId();
                              const prevCQ: any = (runtimeHooks as any)?.clickhouse_query || {};
                              const ui = { action, username, account, ip, limit, pageSize, authFilter, tsStart, tsEnd, tsTimeZone, rawSql, searchQuery } as any;
                              if (action === 'raw_sql') {
                                setNotif({ open:true, severity:'info', message:'Column order change not persisted for raw SQL results' });
                              } else {
                                await saveRuntimeSettings(userId, currentProfileName, runtimeConnection, {
                                  ...(runtimeHooks || {}),
                                  clickhouse_query: { ...prevCQ, enabled: hookEnabled, endpoint_path: endpointPath, columns: next, columnWidths, ui }
                                } as any);
                                setNotif({ open:true, severity:'success', message:'Column order saved' });
                              }
                            } catch(e:any) {
                              setNotif({ open:true, severity:'error', message:`Save failed: ${e?.message || String(e)}` });
                            }
                          }}
                          onClick={() => {
                            // Prevent accidental sort after resize or drag-reorder
                            if (Date.now() < suppressSortUntilRef.current) return;
                            if (sortBy === h) {
                              setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
                            } else {
                              setSortBy(h);
                              setSortDir('asc');
                            }
                          }}
                          style={{ textAlign:'left', padding:'6px 8px', borderBottom:`1px solid ${theme.palette.divider}`, cursor:'grab', userSelect:'none', position:'relative', width: w, minWidth:w, maxWidth:w, whiteSpace: (action === 'raw_sql' ? 'normal' : 'nowrap') as 'normal' | 'nowrap', wordBreak: (action === 'raw_sql' ? 'break-all' : 'normal') as any }}
                          title="Drag & drop to reorder, click to sort. Drag handle to resize"
                        >
                          <span style={{ display:'inline-block', maxWidth: (action === 'raw_sql' ? undefined : (w-12)), overflow: (action === 'raw_sql' ? 'visible' : 'hidden'), textOverflow: (action === 'raw_sql' ? 'clip' : 'ellipsis'), verticalAlign:'bottom', whiteSpace: (action === 'raw_sql' ? 'normal' : 'nowrap') as 'normal' | 'nowrap' }} title={h}>{h}{indicator}</span>
                          <span
                            onMouseDown={(e)=>{ e.preventDefault(); e.stopPropagation(); onResizeStart(h, e.clientX); }}
                            onTouchStart={(e)=>{ try{ const t = e.touches[0]; onResizeStart(h, t.clientX); e.preventDefault(); e.stopPropagation(); }catch{}}}
                            style={{ position:'absolute', top:0, right:0, width:8, cursor:'col-resize', userSelect:'none', height:'100%' }}
                            title="Resize column"
                          />
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((r, idx) => {
                    const k = rowKey(r);
                    const expanded = isExpanded(k);
                    const isDimmed = autoRefreshing && !expanded && seenKeysRef.current.has(k);
                    return (
                      <React.Fragment key={k || idx}>
                        <tr
                          ref={el => { rowRefs.current[k] = el; }}
                          style={{ color: isDimmed ? theme.palette.text.disabled : undefined, transition: 'color 120ms linear' }}
                        >
                          <td
                            style={{
                              width: 48,
                              minWidth: 32,
                              maxWidth: 48,
                              position: 'sticky',
                              left: 0,
                              zIndex: 1,
                              background: theme.palette.background.paper,
                              padding: '0 4px',
                              borderBottom: `1px solid ${theme.palette.divider}`,
                              textAlign: 'center',
                              verticalAlign: 'middle',
                              boxShadow: `inset -1px 0 0 ${theme.palette.divider}`
                            }}
                          >
                            <IconButton size="small" onClick={()=>toggleExpanded(k, r)} aria-label="Expand row" aria-expanded={expanded} sx={{ transition:'transform 0.2s', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                              <ChevronRightIcon fontSize="small" />
                            </IconButton>
                          </td>
                          {selectedFields.map((h) => {
                            const raw = (r as any)?.[h];
                            let text = h === 'ts' ? formatTsForZone(raw, tsTimeZone) : String(raw ?? '');
                            if (h === 'latency' && raw !== undefined && raw !== null) {
                              text = `${raw} ms`;
                            }
                            const w = getColWidth(h);
                            let color = 'inherit';
                            if (h === 'http_status' && typeof raw === 'number') {
                              if (raw >= 200 && raw < 300) color = theme.palette.success.main;
                              else if (raw >= 400) color = theme.palette.error.main;
                            }
                            return (
                              <td key={h} style={{ padding:'6px 8px', borderBottom:`1px solid ${theme.palette.divider}`, width:w, minWidth:w, maxWidth:w, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', color }} title={h === 'client_ip' ? undefined : String(text)}>
                                {h === 'client_ip' ? (
                                  <ClientIpCell ip={String(raw ?? '')} ipapiEnabled={ipapiEnabled} />
                                ) : (
                                  text
                                )}
                              </td>
                            );
                          })}
                        </tr>
                        <tr>
                          <td
                            style={{
                              width: 48,
                              minWidth: 32,
                              maxWidth: 48,
                              position: 'sticky',
                              left: 0,
                              zIndex: 1,
                              background: theme.palette.background.paper,
                              borderBottom: expanded ? `1px solid ${theme.palette.divider}` : 'none',
                              boxShadow: `inset -1px 0 0 ${theme.palette.divider}`
                            }}
                          />
                          <td colSpan={selectedFields.length} style={{ padding:'0 8px', borderBottom: expanded ? `1px solid ${theme.palette.divider}` : 'none' }}>
                            <Collapse in={expanded} timeout="auto" unmountOnExit>
                              <Box sx={{ p:1.25, bgcolor:'rgba(25,118,210,0.06)', border:'1px solid', borderColor:'primary.light', borderRadius:1 }}>
                                {/* Use an intrinsic two-column grid so that values stay right next to keys regardless of overall table width */}
                                <Box
                                  sx={{
                                    display: 'grid',
                                    gridTemplateColumns: 'max-content 1fr',
                                    columnGap: 1,
                                    rowGap: 0.5,
                                    alignItems: 'start',
                                    width: 'fit-content',
                                    maxWidth: '100%'
                                  }}
                                >
                                  {selectedFields
                                    .filter(kf => !isEmptyValue(((expandedSnapshotsRef.current.get(k) || r) as any)?.[kf]))
                                    .flatMap(kf => {
                                      const src = (expandedSnapshotsRef.current.get(k) || r) as any;
                                      const rawV = src?.[kf];
                                      const textV = kf === 'ts'
                                        ? formatTsForZone(rawV, tsTimeZone)
                                        : (typeof rawV === 'object' ? JSON.stringify(rawV) : String(rawV));
                                      return [
                                        (
                                          <Typography key={`${k}-${kf}-key`} variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', pr: 1 }}>
                                            {kf}
                                          </Typography>
                                        ),
                                        (
                                          <Typography key={`${k}-${kf}-val`} variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                                            {textV}
                                          </Typography>
                                        )
                                      ];
                                    })}
                                </Box>
                              </Box>
                            </Collapse>
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </Box>
            <Box display="flex" alignItems="center" justifyContent="space-between" mt={2}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <TextField select size="small" label="Rows per page" value={pageSize} onChange={e=>{ const newSize = Number(e.target.value); setPageSize(newSize); setPage(1); setHasMore(false); setTimeout(() => { try { void runQueryRef.current?.(true); } catch {} }, 0); }}>
                  {[10,25,50,100].map(n=> <MenuItem key={n} value={n}>{n}</MenuItem>)}
                </TextField>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Tooltip title={autoRefreshing ? 'Auto-refresh is active; navigation disabled' : ''}>
                  <span>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, opacity: autoRefreshing ? 0.6 : 1 }}>
                      <IconButton
                        aria-label="First page"
                        onClick={() => setPage(1)}
                        disabled={loading || page <= 1 || autoRefreshing}
                        size="small"
                      >
                        <FirstPageIcon />
                      </IconButton>
                      <IconButton
                        aria-label="Previous page"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={loading || page <= 1 || autoRefreshing}
                        size="small"
                      >
                        <ChevronLeftIcon />
                      </IconButton>
                      <Typography variant="body2" sx={{ minWidth: 48, textAlign: 'center' }} color={autoRefreshing ? 'text.disabled' : undefined} aria-disabled={autoRefreshing}>
                        Page {page}
                      </Typography>
                      <IconButton
                        aria-label="Next page"
                        onClick={() => setPage(p => p + 1)}
                        disabled={loading || !hasMore || autoRefreshing}
                        size="small"
                      >
                        <ChevronRightIcon />
                      </IconButton>
                    </Box>
                  </span>
                </Tooltip>
              </Box>
            </Box>
            <Divider sx={{ mt:2 }} />
            <Box sx={{ display:'flex', justifyContent:'flex-end', alignItems:'center', py:1, gap:1 }}>
              <Button variant="outlined" onClick={() => setExportOpen(true)} sx={{ py: 1 }}>
                Export
              </Button>
              <Button variant="contained" onClick={() => setAnalysisOpen(true)} sx={{ py: 1 }}>
                Analysis
              </Button>
            </Box>
            <Divider sx={{ mb:2 }} />
            {rawPreview && (
              <>
                <Stack direction="row" alignItems="center" gap={1} sx={{ flexWrap: 'wrap' }}>
                  <Button size="small" onClick={()=>setShowRaw(v=>!v)} sx={{ textTransform:'none' }}>
                    {showRaw ? 'HIDE RAW JSON' : 'SHOW RAW JSON'}
                  </Button>
                  <Box sx={{
                    display: 'flex', alignItems: 'center', gap: 1,
                    flexBasis: { xs: '100%', sm: 'auto' },
                    flexGrow: { xs: 1, sm: 0 },
                    justifyContent: { xs: 'flex-start', sm: 'flex-end' },
                    ml: { sm: 'auto' },
                    pt: 1,
                    pb: 0.5
                  }}>
                    <TextField
                      size="small"
                      type="number"
                      label="Raw JSON limit (bytes)"
                      value={rawLimitInput}
                      onChange={(e)=>{ setRawLimitInput(e.target.value); }}
                      onKeyDown={(e)=>{ if ((e as any).key === 'Enter') {
                        applyRawLimitFromInput();
                      } }}
                      inputProps={{ min: RAW_JSON_MIN_BYTES, max: RAW_JSON_MAX_BYTES, step: 256 }}
                      sx={{ minWidth: { xs: 160, sm: 210 } }}
                    />
                    <Button size="small" variant="outlined" onClick={()=>{
                      applyRawLimitFromInput();
                    }}>Apply</Button>
                  </Box>
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
          </Box>
        )}
      </Paper>
      {/* Export Dialog */}
      <Dialog open={exportOpen} onClose={() => setExportOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Export results</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Stack direction="row" spacing={2}>
              <TextField select label="Format" value={exportFormat} onChange={e => setExportFormat(e.target.value as any)} sx={{ minWidth: 160 }}>
                <MenuItem value="csv">CSV</MenuItem>
                <MenuItem value="json">JSON</MenuItem>
              </TextField>
              <TextField select label="Scope" value={exportScope} onChange={e => setExportScope(e.target.value as any)} sx={{ minWidth: 200 }}>
                <MenuItem value="page">Current page</MenuItem>
                <MenuItem value="filtered">Filtered</MenuItem>
                <MenuItem value="all">All</MenuItem>
              </TextField>
            </Stack>

            <Stack direction="row" spacing={2}>
              <TextField
                size="small"
                type="number"
                label="Max rows"
                value={Number.isFinite(limit) ? limit : 0}
                onChange={(e)=> setLimit(Math.max(0, Number(e.target.value) || 0))}
                inputProps={{ min: 0, step: 1000 }}
                helperText="0 = no hard limit (server caps still apply)"
                sx={{ minWidth: 200 }}
              />
            </Stack>

            {exportFormat === 'csv' && (
              <Stack direction="row" spacing={2}>
                <TextField select label="Delimiter" value={csvDelimiter} onChange={e => setCsvDelimiter(e.target.value)} sx={{ minWidth: 140 }}>
                  <MenuItem value=",">Comma (,)</MenuItem>
                  <MenuItem value=";">Semicolon (;)</MenuItem>
                  <MenuItem value="\t">Tab</MenuItem>
                </TextField>
                <FormControlLabel control={<Checkbox checked={csvWithHeader} onChange={e => setCsvWithHeader(e.target.checked)} />} label="Include header" />
              </Stack>
            )}

            <Divider />
            <Typography variant="subtitle2">Fields</Typography>
            <Stack spacing={0.5} sx={{ mb: 1 }}>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                <Button size="small" onClick={() => setExportFields(availableExportFields)}>Select all</Button>
                <Button size="small" onClick={() => setExportFields([])}>Clear</Button>
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                {exportFields.length} / {availableExportFields.length} selected
              </Typography>
            </Stack>
            <Grid container spacing={1}>
              {availableExportFields.map(name => (
                <Grid key={name} size={{ xs: 12, sm: 6, md: 4 }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={exportFields.includes(name)}
                        onChange={(e) => {
                          if (e.target.checked) setExportFields(prev => Array.from(new Set([...(prev||[]), name])));
                          else setExportFields(prev => (prev||[]).filter(n => n !== name));
                        }}
                      />
                    }
                    label={name}
                  />
                </Grid>
              ))}
            </Grid>
          {exporting && (
            <Stack spacing={1} sx={{ mt: 1 }}>
              <LinearProgress />
              <Typography variant="caption" color="text.secondary">
                Exporting… pages: {exportProgress.pages}, rows: {exportProgress.rows}
              </Typography>
            </Stack>
          )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExportOpen(false)} disabled={exporting}>Cancel</Button>
          <Button onClick={performExport} variant="contained" disabled={exporting}>{exporting ? 'Exporting…' : 'Export'}</Button>
        </DialogActions>
      </Dialog>

      {/* Analysis Dialog */}
      <Dialog open={analysisOpen} onClose={() => setAnalysisOpen(false)} fullWidth maxWidth="lg">
        <DialogTitle>Deep Analysis</DialogTitle>
        <DialogContent>
          <Stack direction="row" spacing={2} sx={{ mb: 1 }}>
            <TextField
              size="small"
              type="number"
              label="Max rows"
              value={Number.isFinite(limit) ? limit : 0}
              onChange={(e)=> setLimit(Math.max(0, Number(e.target.value) || 0))}
              inputProps={{ min: 0, step: 1000 }}
              helperText="0 = no hard limit (server caps still apply)"
              sx={{ minWidth: 220 }}
            />
          </Stack>
          {analysisLoading ? (
            <Stack spacing={1} sx={{ mb: 1 }}>
              <LinearProgress />
              <Typography variant="caption" color="text.secondary">
                Loading… pages: {analysisProgress.pages}, rows: {analysisProgress.rows}
              </Typography>
            </Stack>
          ) : (
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
              Ready. Set parameters above and press "Start analysis" to fetch data.
            </Typography>
          )}
          <AnalysisPanel rows={analysisRows} />
        </DialogContent>
        <DialogActions>
          <Button onClick={cancelAnalysisLoad} disabled={!analysisLoading}>Cancel</Button>
          <Button onClick={() => { void loadAllForAnalysis(); }} variant="contained" disabled={analysisLoading}>Start analysis</Button>
          <Button onClick={() => setAnalysisOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Bookmark Create/Rename/Delete Dialog */}
      <Dialog open={bmDialogOpen} onClose={handleBmDialogClose}>
        <DialogTitle>
          {bmDialogMode === 'create' ? (bmDialogKind === 'raw_sql' ? 'Save SQL bookmark' : 'Save search bookmark') :
           bmDialogMode === 'rename' ? 'Rename bookmark' : 'Delete bookmark'}
        </DialogTitle>
        <DialogContent>
          {bmDialogMode === 'delete' ? (
            <DialogContentText>
              Are you sure you want to delete the bookmark "{bmDialogName}"? This action cannot be undone.
            </DialogContentText>
          ) : (
            <TextField
              autoFocus
              margin="dense"
              fullWidth
              label="Name"
              value={bmDialogName}
              onChange={(e)=>{ setBmDialogName(e.target.value); setBmDialogError(''); }}
              error={Boolean(bmDialogError)}
              helperText={bmDialogError || ' '}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleBmDialogClose}>Cancel</Button>
          {bmDialogMode === 'delete' ? (
            <Button onClick={handleBmDialogConfirm} color="error">Delete</Button>
          ) : bmDialogMode === 'rename' ? (
            <Button onClick={handleBmDialogConfirm} color="primary" disabled={!bmDialogName.trim()}>Rename</Button>
          ) : (
            <Button onClick={handleBmDialogConfirm} color="primary" disabled={!bmDialogName.trim()}>
              Save
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <Snackbar
        open={notif.open}
        autoHideDuration={10000}
        onClose={() => setNotif((n)=>({ ...n, open:false }))}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert onClose={() => setNotif((n)=>({ ...n, open:false }))} severity={notif.severity} sx={{ width: '100%' }}>
          {notif.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default ClickhouseRuntime;
