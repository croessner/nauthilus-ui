import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Paper, Typography, Tabs, Tab, TextField, Button, Switch, FormControlLabel, Alert, InputAdornment, MenuItem, CircularProgress, Divider, Tooltip, IconButton, Chip, Stack, Snackbar, Menu } from '@mui/material';
import SecurityIcon from '@mui/icons-material/Security';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import LinkIcon from '@mui/icons-material/Link';
import InfoTooltip from './common/InfoTooltip';
import { useConfig } from '../contexts/ConfigContext';
import { useRuntime, getCurrentUserId } from '../contexts/RuntimeContext';
import { getProxyOrigin, authenticatedFetch, extractErrorMessage, loadSettings as loadSettingsUtil, prepareAuthParams, checkConnection as checkConnectionUtil } from '../utils/apiUtils';
import { getKnownHookEndpointSuggestions } from '../utils/hooks';
import { byteLengthUtf8, getEffectiveRawJsonMaxBytes, setRawJsonMaxBytesOverride, RAW_JSON_MIN_BYTES, RAW_JSON_MAX_BYTES, applyPreviewLimit } from '../utils/limits';
import Grid from '@mui/material/Grid';
import { formatDuration } from '../utils/format';

const prettyJson = (obj: any) => {
  try { return JSON.stringify(obj, null, 2); } catch { return String(obj); }
};

const parseJson = (text: string) => {
  try { return JSON.parse(text); } catch { return null; }
};


const defaultAdminOps = [
  { value: 'get_metrics', label: 'View metrics' },
  { value: 'reset_protection', label: 'Reset global protection' },
  { value: 'reset_account', label: 'Reset single account' },
];

const DistributedBruteForceTools = (): React.JSX.Element => {
  const { currentProfileName } = useConfig();
  const { connection: runtimeConnection, hooks: runtimeHooks, saveRuntimeSettings, loadRuntimeSettings } = useRuntime();

  const [tab, setTab] = useState(0);
  const [adminEnabled, setAdminEnabled] = useState<boolean>(Boolean(runtimeHooks?.distributed_brute_force_admin?.enabled));
  const [testEnabled, setTestEnabled] = useState<boolean>(Boolean(runtimeHooks?.distributed_brute_force_test?.enabled));
  const [adminPath, setAdminPath] = useState<string>(runtimeHooks?.distributed_brute_force_admin?.endpoint_path || '/hooks/distributed-brute-force-admin');
  const [testPath, setTestPath] = useState<string>(runtimeHooks?.distributed_brute_force_test?.endpoint_path || '/hooks/distributed-brute-force-test');

  // Known hook endpoint suggestions (shared with HookTester)
  const effectiveEndpointSuggestions = useMemo(() => getKnownHookEndpointSuggestions(runtimeHooks), [runtimeHooks]);

  // Menus for picking endpoints for Admin/Test fields
  const [adminAnchorEl, setAdminAnchorEl] = useState<null | HTMLElement>(null);
  const [testAnchorEl, setTestAnchorEl] = useState<null | HTMLElement>(null);
  const adminMenuOpen = Boolean(adminAnchorEl);
  const testMenuOpen = Boolean(testAnchorEl);
  const closeAdminMenu = () => setAdminAnchorEl(null);
  const closeTestMenu = () => setTestAnchorEl(null);
  const pickAdminEndpoint = (ep: string) => { setAdminPath(ep); closeAdminMenu(); };
  const pickTestEndpoint = (ep: string) => { setTestPath(ep); closeTestMenu(); };

  const [connStatus, setConnStatus] = useState<'unknown'|'connected'|'disconnected'|'checking'>('unknown');
  const [statusMessage, setStatusMessage] = useState('');

  // Auto-hide the success connection message after a short delay to match other runtime pages
  useEffect(() => {
    if (connStatus === 'connected' && statusMessage.includes('Connected to Nauthilus backend')) {
      const t = setTimeout(() => {
        setStatusMessage('');
      }, 5000);
      return () => clearTimeout(t);
    }
  }, [connStatus, statusMessage]);

  const [adminOperation, setAdminOperation] = useState<string>('get_metrics');
  const [adminUsername, setAdminUsername] = useState<string>('');
  // We only need the setter; ignore the current value
  const [, setAdminResponse] = useState<string>('');
  const [adminResponseJson, setAdminResponseJson] = useState<any | null>(null);
  const [adminLoading, setAdminLoading] = useState<boolean>(false);
  const [showAdminRaw, setShowAdminRaw] = useState<boolean>(false);
  const [expandedLists, setExpandedLists] = useState<Record<string, boolean>>({});

  const [testFields, setTestFields] = useState({
    action: 'run_test',
    username: '',
    num_ips: 20,
    country_code: '',
  });
  const [testBodyText, setTestBodyText] = useState<string>(prettyJson({ action: 'run_test', username: '', num_ips: 20, country_code: '' }));
  const [rawJsonMaxBytes, setRawJsonMaxBytes] = useState<number>(getEffectiveRawJsonMaxBytes());
  const [rawLimitInput, setRawLimitInput] = useState<string>(String(getEffectiveRawJsonMaxBytes()));
  const testBodyBytes = useMemo(() => byteLengthUtf8(testBodyText), [testBodyText]);
  const testBodyTooLarge = testBodyBytes > rawJsonMaxBytes;
  const [useAdvancedBody, setUseAdvancedBody] = useState<boolean>(false);
  // We only need the setter; ignore the current value
  const [, setTestResponse] = useState<string>('');
  const [testResponseJson, setTestResponseJson] = useState<any | null>(null);
  const [lastTestAction, setLastTestAction] = useState<string>('run_test');
  const [showTestRaw, setShowTestRaw] = useState<boolean>(false);
  const [testLoading, setTestLoading] = useState<boolean>(false);
  // ClickHouse-like limited raw preview states
  const [adminRawPreviewFull, setAdminRawPreviewFull] = useState<string>('');
  const [adminRawPreview, setAdminRawPreview] = useState<string>('');
  const [testRawPreviewFull, setTestRawPreviewFull] = useState<string>('');
  const [testRawPreview, setTestRawPreview] = useState<string>('');

  // Inline Test alert visibility (auto-hide with close X, like Admin tab)
  const [testAlertOpen, setTestAlertOpen] = useState<boolean>(false);

  const [notif, setNotif] = useState<{open:boolean, severity:'success'|'error'|'info'|'warning', message:string}>({open:false, severity:'info', message:''});

  // Local visibility for inline admin status messages
  const [adminMetricsStatusOpen, setAdminMetricsStatusOpen] = useState<boolean>(false);
  const [adminOpStatusOpen, setAdminOpStatusOpen] = useState<boolean>(false);

  const connectionRef = useRef(runtimeConnection);
  useEffect(() => { connectionRef.current = runtimeConnection; }, [runtimeConnection]);
  const getRuntimeConnection = useCallback(() => connectionRef.current, []);

  // Centralized connection check via shared utility (DRY)
  const checkConnection = useCallback(async (connParam?: any) => {
    await checkConnectionUtil(connParam ?? getRuntimeConnection(), setConnStatus, setStatusMessage);
  }, [getRuntimeConnection]);

  useEffect(() => {
    (async () => {
      await loadSettingsUtil(
        getCurrentUserId,
        loadRuntimeSettings,
        currentProfileName,
        async (_conn) => {
          await checkConnection();
        },
        getRuntimeConnection
      );
    })();
  }, [currentProfileName, loadRuntimeSettings, getRuntimeConnection, checkConnection]);

  // Control visibility of inline Alerts for admin operations and auto-hide after 10s
  useEffect(() => {
    // get_metrics status message
    if (adminResponseJson && adminOperation === 'get_metrics') {
      setAdminMetricsStatusOpen(true);
      const t = setTimeout(() => setAdminMetricsStatusOpen(false), 10000);
      return () => clearTimeout(t);
    }
  }, [adminResponseJson, adminOperation]);

  useEffect(() => {
    // reset_protection / reset_account status message
    if (adminResponseJson && (adminOperation === 'reset_protection' || adminOperation === 'reset_account')) {
      setAdminOpStatusOpen(true);
      const t = setTimeout(() => setAdminOpStatusOpen(false), 10000);
      return () => clearTimeout(t);
    }
  }, [adminResponseJson, adminOperation]);

  // Test tab: control visibility of header Alert, auto-hide after 10s like Admin tab
  useEffect(() => {
    if (testResponseJson) {
      setTestAlertOpen(true);
      const t = setTimeout(() => setTestAlertOpen(false), 10000);
      return () => clearTimeout(t);
    }
  }, [testResponseJson]);

  // Sync hook states when runtime hook settings load/update
  useEffect(() => {
    const newAdminEnabled = Boolean(runtimeHooks?.distributed_brute_force_admin?.enabled);
    const newTestEnabled = Boolean(runtimeHooks?.distributed_brute_force_test?.enabled);
    const newAdminPath = (
      runtimeHooks?.distributed_brute_force_admin?.endpoint_path ||
      '/hooks/distributed-brute-force-admin'
    );
    const newTestPath = (
      runtimeHooks?.distributed_brute_force_test?.endpoint_path ||
      '/hooks/distributed-brute-force-test'
    );

    setAdminEnabled(newAdminEnabled);
    setTestEnabled(newTestEnabled);
    setAdminPath(newAdminPath);
    setTestPath(newTestPath);
  }, [runtimeHooks]);

  // Initialize UI state from persisted runtime settings (once per mount)
  const didInitUiRef = useRef(false);
  useEffect(() => {
    if (didInitUiRef.current) return;
    const ui: any = (runtimeHooks as any)?.distributed_brute_force_ui || {};
    if (ui && typeof ui === 'object') {
      const t = Number(ui.tab);
      if (Number.isFinite(t)) setTab(t);
      if (typeof ui.adminOperation === 'string') setAdminOperation(ui.adminOperation);
      if (typeof ui.adminUsername === 'string') setAdminUsername(ui.adminUsername);
      if (ui.testFields && typeof ui.testFields === 'object') {
        setTestFields(prev => {
          const nips = Number((ui.testFields as any).num_ips);
          return ({
            action: typeof ui.testFields.action === 'string' ? ui.testFields.action : prev.action,
            username: typeof ui.testFields.username === 'string' ? ui.testFields.username : prev.username,
            num_ips: Number.isFinite(nips) ? nips : prev.num_ips,
            country_code: typeof ui.testFields.country_code === 'string' ? ui.testFields.country_code : prev.country_code,
          });
        });
      }
      if (typeof ui.useAdvancedBody === 'boolean') setUseAdvancedBody(Boolean(ui.useAdvancedBody));
    }
    didInitUiRef.current = true;
  }, [runtimeHooks]);

  // Keep raw limit input synced with applied limit
  useEffect(() => {
    setRawLimitInput(String(rawJsonMaxBytes));
  }, [rawJsonMaxBytes]);

  // Recompute limited previews when limit or full previews change
  useEffect(() => {
    if (adminRawPreviewFull) setAdminRawPreview(applyPreviewLimit(adminRawPreviewFull, rawJsonMaxBytes));
  }, [adminRawPreviewFull, rawJsonMaxBytes]);
  useEffect(() => {
    if (testRawPreviewFull) setTestRawPreview(applyPreviewLimit(testRawPreviewFull, rawJsonMaxBytes));
  }, [testRawPreviewFull, rawJsonMaxBytes]);

  const hasValidConnection = Boolean(runtimeConnection?.backend_url);

  // Shared handler to apply/clamp raw JSON preview limit and recompute previews (DRY)
  const applyRawLimitHandler = useCallback(() => {
    const v = Number((rawLimitInput || '').trim());
    const clamped = Math.max(
      RAW_JSON_MIN_BYTES,
      Math.min(RAW_JSON_MAX_BYTES, Number.isFinite(v) ? v : RAW_JSON_MIN_BYTES)
    );
    setRawJsonMaxBytesOverride(clamped);
    setRawJsonMaxBytes(clamped);
    if (adminRawPreviewFull) setAdminRawPreview(applyPreviewLimit(adminRawPreviewFull, clamped));
    if (testRawPreviewFull) setTestRawPreview(applyPreviewLimit(testRawPreviewFull, clamped));
  }, [rawLimitInput, setRawJsonMaxBytes, adminRawPreviewFull, testRawPreviewFull]);

  // Small local component for the Raw JSON limit controls to remove duplication
  const RawLimitControls: React.FC = () => (
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
        onKeyDown={(e)=>{ if ((e as any).key === 'Enter') { applyRawLimitHandler(); } }}
        slotProps={{ input: { inputProps: { min: RAW_JSON_MIN_BYTES, max: RAW_JSON_MAX_BYTES, step: 256 } } }}
        sx={{ minWidth: { xs: 160, sm: 210 } }}
      />
      <Button size="small" variant="outlined" onClick={applyRawLimitHandler}>Apply</Button>
    </Box>
  );

  // Ensure connection check runs immediately when backend_url becomes available (bypass navigation debounce)
  useEffect(() => {
    if (runtimeConnection?.backend_url) {
      void checkConnection(runtimeConnection);
    }
  }, [runtimeConnection?.backend_url, checkConnection]);

  const saveHooksRuntime = async () => {
    try {
      const userId = await getCurrentUserId();
      const ui = {
        tab,
        adminOperation,
        adminUsername,
        testFields,
        useAdvancedBody,
      } as any;
      await saveRuntimeSettings(userId, currentProfileName, runtimeConnection, {
        ...(runtimeHooks || {}),
        distributed_brute_force_admin: { enabled: adminEnabled, endpoint_path: adminPath },
        distributed_brute_force_test: { enabled: testEnabled, endpoint_path: testPath },
        distributed_brute_force_ui: ui,
      });
      setNotif({ open: true, severity: 'success', message: 'Hook settings saved' });
    } catch (e:any) {
      setNotif({ open: true, severity: 'error', message: `Failed to save: ${e?.message || String(e)}` });
    }
  };

  const callHook = async (kind: 'admin'|'test') => {
    const isAdmin = kind === 'admin';
    const path = isAdmin ? adminPath : testPath;
    const enabled = isAdmin ? adminEnabled : testEnabled;
    const conn = runtimeConnection;

    if (!enabled) {
      setNotif({ open: true, severity: 'warning', message: `The ${isAdmin ? 'Admin' : 'Test'} hook is disabled.` });
      return;
    }
    if (!hasValidConnection) {
      setNotif({ open: true, severity: 'error', message: 'No backend URL configured' });
      return;
    }
    if (!path) {
      setNotif({ open: true, severity: 'error', message: 'Endpoint path is required' });
      return;
    }

    const { authType, authValue } = prepareAuthParams(conn);
    const proxyBase = isAdmin ? '/proxy/hooks/distributed-brute-force-admin' : '/proxy/hooks/distributed-brute-force-test';
    const url = new URL(proxyBase, getProxyOrigin());
    url.searchParams.append('url', conn.backend_url!);
    url.searchParams.append('endpoint_path', path);
    if (authType && authValue) {
      url.searchParams.append('authType', authType);
      url.searchParams.append('authValue', authValue);
    }
    if (isAdmin && adminOperation) {
      url.searchParams.append('action', adminOperation);
    }

    // Build request body
    if (isAdmin) {
      // Admin hook does not accept arbitrary JSON body. Build minimal body per operation.
      if (adminOperation === 'reset_account') {
        const effectiveUsername = adminUsername?.trim();
        if (!effectiveUsername) {
          setNotif({ open: true, severity: 'error', message: 'Username is required for reset_account' });
          return;
        }
        // The username MUST be sent as a query parameter to the backend
        url.searchParams.append('username', effectiveUsername);
      }
    } else {
      // Build test hook body but ensure required query parameters are provided
      // as the Lua hook expects them in the query string even for POST.
      const bodyObj = (useAdvancedBody ? (parseJson(testBodyText) ?? {}) : {
        action: testFields.action || 'run_test',
        username: testFields.username || undefined,
        num_ips: testFields.num_ips || undefined,
        country_code: testFields.country_code || undefined,
      });

      // Validate required fields (username is required for all actions)
      const effectiveAction = (typeof bodyObj.action === 'string' && bodyObj.action) ? bodyObj.action : 'run_test';
      const effectiveUsername = (typeof bodyObj.username === 'string' && bodyObj.username) ? bodyObj.username : (testFields.username || '');
      if (!effectiveUsername) {
        setNotif({ open: true, severity: 'error', message: 'Username is required' });
        setTestLoading(false);
        return;
      }

      // Map to expected query params: action, username, num_ips, country_code
      url.searchParams.append('action', effectiveAction);
      url.searchParams.append('username', effectiveUsername);

      // Only add num_ips and country_code if action is not check_detection
      if (effectiveAction !== 'check_detection') {
        const qpNumIps = (bodyObj.num_ips != null ? Number(bodyObj.num_ips) : (testFields.num_ips || undefined));
        if (qpNumIps != null && !Number.isNaN(qpNumIps) && qpNumIps > 0) {
          url.searchParams.append('num_ips', String(qpNumIps));
        }
        const qpCountry = (typeof bodyObj.country_code === 'string' && bodyObj.country_code) ? bodyObj.country_code : (testFields.country_code || '');
        if (qpCountry) url.searchParams.append('country_code', qpCountry);
      }
    }

    const setLoading = isAdmin ? setAdminLoading : setTestLoading;
    const setResp = isAdmin ? setAdminResponse : setTestResponse;

    setLoading(true);
    setResp('');
    // Clear raw previews at start
    setAdminRawPreviewFull('');
    setAdminRawPreview('');
    setTestRawPreviewFull('');
    setTestRawPreview('');
    if (isAdmin) {
      setAdminResponseJson(null);
    } else {
      // Remember which action we executed and reset pretty JSON for Test
      const executedAction = useAdvancedBody ? ((parseJson(testBodyText)?.action) || testFields.action || 'run_test') : (testFields.action || 'run_test');
      setLastTestAction(String(executedAction));
      setTestResponseJson(null);
    }
    try {
      const options: RequestInit = { method: 'GET' } as any;
      const resp = await authenticatedFetch(url.toString(), options);
      if (!resp.ok) {
        const msg = await extractErrorMessage(resp);
        setResp(`Request failed: ${msg}`);
        setNotif({ open: true, severity: 'error', message: msg });
        return;
      }
      const json = await resp.json().catch(() => ({}));
      if (isAdmin) {
        setAdminResponseJson(json);
      } else {
        setTestResponseJson(json);
      }
      const pretty = prettyJson(json);
      setResp(pretty);
      // Update ClickHouse-like raw previews
      if (isAdmin) {
        setAdminRawPreviewFull(pretty);
        setAdminRawPreview(applyPreviewLimit(pretty, rawJsonMaxBytes));
      } else {
        setTestRawPreviewFull(pretty);
        setTestRawPreview(applyPreviewLimit(pretty, rawJsonMaxBytes));
      }
      // Success toast at the top removed as per requirement: top hints are unnecessary here.
      // Keep inline alerts for admin operations and rely on response panels for feedback.
    } catch (e:any) {
      const msg = e?.message || String(e);
      setResp(`Request error: ${msg}`);
      setNotif({ open: true, severity: 'error', message: msg });
    } finally {
      setLoading(false);
    }
  };


  // Helper to render string array metrics as chips with an expand/collapse toggle
  const renderStringArray = (title: string, arr: any, key: string) => {
    const isArr = Array.isArray(arr);
    const items: string[] = isArr ? arr.map((v: any) => String(v)) : [];
    const total = items.length;
    const expanded = expandedLists[key];
    const limit = 10;
    const visibleItems = expanded ? items : items.slice(0, limit);
    return (
      <Box sx={{ mt: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>{title} ({total})</Typography>
        {total === 0 ? (
          <Typography variant="body2" color="text.secondary">None</Typography>
        ) : (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {visibleItems.map((item, idx) => (
              <Chip key={`${key}-${idx}`} size="small" label={item} />
            ))}
            {total > limit && (
              <Button size="small" onClick={() => setExpandedLists(s => ({ ...s, [key]: !expanded }))}>
                {expanded ? 'Show less' : `Show all (${total})`}
              </Button>
            )}
          </Box>
        )}
      </Box>
    );
  };

  // Helper to render detection_result in tiles
  const renderDetectionTiles = (dr: any) => {
    const toBool = (v: any) => Boolean(v);
    const toNum = (v: any) => (typeof v === 'number' ? v : Number(v || 0));
    const boolTile = (label: string, value: any) => (
      <Grid size={{ xs: 6, md: 3 }}>
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle2">{label}</Typography>
          <Typography variant="h6" color={toBool(value) ? 'error.main' : 'text.primary'}>
            {toBool(value) ? 'Yes' : 'No'}
          </Typography>
        </Paper>
      </Grid>
    );
    return (
      <Grid container spacing={2}>
        <Grid size={{ xs: 6, md: 3 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle2">Threat Level</Typography>
            <Typography variant="h6">{toNum(dr?.threat_level) || 0}</Typography>
          </Paper>
        </Grid>
        {boolTile('Attack Detected', dr?.attack_detected)}
        {boolTile('Account Under Attack', dr?.account_under_attack)}
        {boolTile('Rate Limit Enabled', dr?.rate_limit_enabled)}
        {boolTile('Captcha Enabled', dr?.captcha_enabled)}
        {boolTile('Captcha Account', dr?.is_captcha_account)}
        {boolTile('Monitoring Mode', dr?.monitoring_mode)}
      </Grid>
    );
  };

  return (
    <>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', rowGap: 1 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>Distributed Brute-Force Tools</Typography>
        <SecurityIcon fontSize="small" />
        <InfoTooltip title="Configuration and testing of the distributed brute-force Lua hooks (Admin and Test)." />
      </Stack>

      {/* Connection status (unified banner) */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Typography variant="subtitle1" sx={{ mr: 2 }}>Connection Status:</Typography>
        {connStatus === 'checking' && <CircularProgress size={20} sx={{ mr: 1 }} />}
        {connStatus === 'connected' && <CheckCircleIcon color="success" sx={{ mr: 1 }} />}
        {connStatus === 'disconnected' && <ErrorIcon color="error" sx={{ mr: 1 }} />}
        {connStatus === 'unknown' && <Typography color="text.secondary">Not checked</Typography>}
        {connStatus === 'disconnected' && (
          <Typography color="error.main">
            {statusMessage}
          </Typography>
        )}
        <Tooltip title="Check connection">
          <span>
            <IconButton
              onClick={async () => {
                await checkConnection();
              }}
              disabled={connStatus === 'checking'}
              sx={{ ml: 1 }}
            >
              <RefreshIcon />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      <Paper sx={{ p: 3 }}>

        {/* Auto-hide connection success message */}
        {/* Clear success message after a few seconds to match other runtime pages */}
        {/* This is implemented with a side-effect below */}

        {/* Hook settings */}
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>Admin Hook</Typography>
            <FormControlLabel 
              control={<Switch checked={adminEnabled} onChange={(e) => setAdminEnabled(e.target.checked)} />} 
              label={<Box sx={{ display:'inline-flex', alignItems:'center' }}>Enabled<InfoTooltip title="Enable/disable the Admin hook." /></Box>} 
            />
            <TextField
              fullWidth
              label="Admin Endpoint Path"
              value={adminPath}
              onChange={(e) => setAdminPath(e.target.value)}
              slotProps={{ input: { endAdornment: (
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Tooltip title={effectiveEndpointSuggestions.length ? 'Pick from known hook paths detected in runtime settings' : 'No known hook paths detected'}>
                    <span>
                      <IconButton size="small" disabled={effectiveEndpointSuggestions.length === 0} onClick={(e) => setAdminAnchorEl(e.currentTarget)} aria-label="pick-admin-endpoint">
                        <LinkIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <InputAdornment position="end"><InfoTooltip title="Path of the Admin hook as configured in the backend (e.g., /hooks/distributed-brute-force-admin)." /></InputAdornment>
                </Box>
              ) }}}
              helperText={undefined}
              sx={{ mt: 1 }}
            />
            <Menu anchorEl={adminAnchorEl} open={adminMenuOpen} onClose={closeAdminMenu}>
              {effectiveEndpointSuggestions.map((ep) => (
                <MenuItem key={ep} onClick={() => pickAdminEndpoint(ep)}>{ep}</MenuItem>
              ))}
            </Menu>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>Test Hook</Typography>
            <FormControlLabel 
              control={<Switch checked={testEnabled} onChange={(e) => setTestEnabled(e.target.checked)} />} 
              label={<Box sx={{ display:'inline-flex', alignItems:'center' }}>Enabled<InfoTooltip title="Enable/disable the Test hook." /></Box>} 
            />
            <TextField
              fullWidth
              label="Test Endpoint Path"
              value={testPath}
              onChange={(e) => setTestPath(e.target.value)}
              slotProps={{ input: { endAdornment: (
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Tooltip title={effectiveEndpointSuggestions.length ? 'Pick from known hook paths detected in runtime settings' : 'No known hook paths detected'}>
                    <span>
                      <IconButton size="small" disabled={effectiveEndpointSuggestions.length === 0} onClick={(e) => setTestAnchorEl(e.currentTarget)} aria-label="pick-test-endpoint">
                        <LinkIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <InputAdornment position="end"><InfoTooltip title="Path of the Test hook as configured in the backend (e.g., /hooks/distributed-brute-force-test)." /></InputAdornment>
                </Box>
              ) }}}
              helperText={undefined}
              sx={{ mt: 1 }}
            />
            <Menu anchorEl={testAnchorEl} open={testMenuOpen} onClose={closeTestMenu}>
              {effectiveEndpointSuggestions.map((ep) => (
                <MenuItem key={ep} onClick={() => pickTestEndpoint(ep)}>{ep}</MenuItem>
              ))}
            </Menu>
          </Grid>
        </Grid>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
          <Button variant="contained" startIcon={<SaveIcon />} onClick={saveHooksRuntime}>
            Save Hook Settings
          </Button>
        </Box>

        <Tabs value={tab} onChange={(_e, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tab label="Admin" />
          <Tab label="Test" />
        </Tabs>

        {/* Admin Tab */}
        {tab === 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body1" sx={{ mb: 2 }}>
              Execute admin operations for the distributed brute-force detection. Choose an operation below.
            </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  select
                  fullWidth
                  label="Operation"
                  value={adminOperation}
                  onChange={(e) => setAdminOperation(e.target.value)}
                  helperText="Choose what to do. This sets the 'action' query parameter (e.g., get_metrics, reset_protection, reset_account)."
                >
                  {defaultAdminOps.map(op => (
                    <MenuItem key={op.value} value={op.value}>{op.label}</MenuItem>
                  ))}
                </TextField>
              </Grid>

              {/* Username required field for reset_account */}
              {adminOperation === 'reset_account' && (
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    required
                    label="Username (required)"
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    slotProps={{ input: { endAdornment: (
                      <InputAdornment position="end"><InfoTooltip title="Required field: Username of the account to reset." /></InputAdornment>
                    ) }}}
                  />
                </Grid>
              )}

              <Grid size={12}>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button 
                    variant="contained" 
                    startIcon={adminLoading ? <CircularProgress size={18} /> : <PlayArrowIcon />} 
                    disabled={adminLoading}
                    onClick={() => callHook('admin')}
                  >
                    {adminLoading ? 'Running…' : 'Execute'}
                  </Button>
                </Box>
              </Grid>
              <Grid size={12}>
                <Divider sx={{ my: 1 }} />
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Response</Typography>
                {/* Pretty admin response rendering */}
                {adminResponseJson && (
                  <Box sx={{ mb: 2 }}>
                    {adminOperation === 'get_metrics' && (
                      (() => {
                        const m = adminResponseJson?.metrics || {};
                        const toNum = (x: any) => (typeof x === 'number' ? x : Number(x));
                        const attacked = Array.isArray(m.attacked_accounts) ? m.attacked_accounts.length : 0;
                        const blockedRegions = Array.isArray(m.blocked_regions) ? m.blocked_regions.length : 0;
                        const captchaAccounts = Array.isArray(m.captcha_accounts) ? m.captcha_accounts.length : 0;
                        const rateLimitedIPs = Array.isArray(m.rate_limited_ips) ? m.rate_limited_ips.length : 0;
                        // Note: warm-up details are rendered in the banner below when not fully warmed up.
                        return (
                          <>
                            {/* Status message shown above detailed metrics */}
                            {adminMetricsStatusOpen && (
                              <Alert severity="success" sx={{ mb: 2 }} onClose={() => setAdminMetricsStatusOpen(false)}>
                                {adminResponseJson?.message || 'Metrics retrieved successfully'}
                              </Alert>
                            )}
                            {/* Warm-up banner when system is not fully warmed up */}
                            {m && m.warmup && m.warmup.warmed_up === false && (() => {
                              const toNum = (x: any) => (typeof x === 'number' ? x : Number(x || 0));
                              const warm = m.warmup || {};
                              const prog = warm.progress || {};
                              const req = warm.requirements || {};
                              const secondsPct = Math.round(Math.min(100, Math.max(0, toNum(prog.seconds) * 100)));
                              const usersPct = Math.round(Math.min(100, Math.max(0, toNum(prog.users) * 100)));
                              const attemptsPct = Math.round(Math.min(100, Math.max(0, toNum(prog.attempts) * 100)));
                              const overallPct = Math.round(Math.min(100, Math.max(0, toNum(prog.overall) * 100)));
                              const elapsed = toNum(warm.elapsed_seconds);
                              const windowSec = toNum(req.seconds);
                              
                              return (
                                <Alert severity="info" sx={{ mb: 2 }}>
                                  System is in warm-up; sliding windows may not reflect steady-state yet. Overall: {overallPct}% — Time: {secondsPct}% · Min Users: {usersPct}% · Min Attempts: {attemptsPct}%. Uptime: {formatDuration(elapsed)} of {formatDuration(windowSec)} window.
                                </Alert>
                              );
                            })()}
                            <Grid container spacing={2}>
                              <Grid size={{ xs: 12, md: 3 }}>
                                <Paper sx={{ p: 2 }}>
                                  <Typography variant="subtitle2">Attempts</Typography>
                                  <Typography variant="h6">{toNum(m.attempts) || 0}</Typography>
                                </Paper>
                              </Grid>
                              <Grid size={{ xs: 12, md: 3 }}>
                                <Paper sx={{ p: 2 }}>
                                  <Typography variant="subtitle2">Unique IPs</Typography>
                                  <Typography variant="h6">{toNum(m.unique_ips) || 0}</Typography>
                                </Paper>
                              </Grid>
                              <Grid size={{ xs: 12, md: 3 }}>
                                <Paper sx={{ p: 2 }}>
                                  <Typography variant="subtitle2">Unique Users</Typography>
                                  <Typography variant="h6">{toNum(m.unique_users) || 0}</Typography>
                                </Paper>
                              </Grid>
                              <Grid size={{ xs: 12, md: 3 }}>
                                <Paper sx={{ p: 2 }}>
                                  <Typography variant="subtitle2">IPs per User</Typography>
                                  <Typography variant="h6">{(toNum(m.ips_per_user) || 0).toFixed(2)}</Typography>
                                </Paper>
                              </Grid>
                              <Grid size={{ xs: 12, md: 3 }}>
                                <Paper sx={{ p: 2 }}>
                                  <Typography variant="subtitle2">Threat Level</Typography>
                                  <Typography variant="h6">{toNum(m.threat_level) || 0}</Typography>
                                </Paper>
                              </Grid>
                              <Grid size={{ xs: 12, md: 3 }}>
                                <Paper sx={{ p: 2 }}>
                                  <Typography variant="subtitle2">Attacked Accounts</Typography>
                                  <Typography variant="h6">{attacked}</Typography>
                                </Paper>
                              </Grid>
                              <Grid size={{ xs: 12, md: 3 }}>
                                <Paper sx={{ p: 2 }}>
                                  <Typography variant="subtitle2">Rate-limited IPs</Typography>
                                  <Typography variant="h6">{rateLimitedIPs}</Typography>
                                </Paper>
                              </Grid>
                              <Grid size={{ xs: 12, md: 3 }}>
                                <Paper sx={{ p: 2 }}>
                                  <Typography variant="subtitle2">Blocked Regions</Typography>
                                  <Typography variant="h6">{blockedRegions}</Typography>
                                </Paper>
                              </Grid>
                              <Grid size={{ xs: 12, md: 3 }}>
                                <Paper sx={{ p: 2 }}>
                                  <Typography variant="subtitle2">Captcha Accounts</Typography>
                                  <Typography variant="h6">{captchaAccounts}</Typography>
                                </Paper>
                              </Grid>
                            </Grid>
                            <Box sx={{ mt: 1, color: 'text.secondary' }}>
                              <Typography variant="caption">Status: {adminResponseJson?.status || 'n/a'} | Session: {adminResponseJson?.session || 'n/a'} | Time: {adminResponseJson?.ts || 'n/a'}</Typography>
                            </Box>

                            {/* Render detailed lists below the summary tiles */}
                            <Box sx={{ mt: 2 }}>
                              {renderStringArray('Attacked Accounts', m.attacked_accounts, 'attacked_accounts')}
                              {renderStringArray('Rate-limited IPs', m.rate_limited_ips, 'rate_limited_ips')}
                              {renderStringArray('Blocked Regions', m.blocked_regions, 'blocked_regions')}
                              {renderStringArray('Captcha Accounts', m.captcha_accounts, 'captcha_accounts')}
                            </Box>
                          </>
                        );
                      })()
                    )}
                    {(adminOperation === 'reset_protection' || adminOperation === 'reset_account') && (
                      <>
                        {adminResponseJson?.status === 'success' ? (
                          adminOpStatusOpen && (
                            <Alert severity="success" sx={{ mb: 1 }} onClose={() => setAdminOpStatusOpen(false)}>
                              {adminResponseJson?.message || 'Operation executed successfully'}
                            </Alert>
                          )
                        ) : (
                          adminOpStatusOpen && (
                            <Alert severity="error" sx={{ mb: 1 }} onClose={() => setAdminOpStatusOpen(false)}>
                              {adminResponseJson?.message || 'Operation failed'}
                            </Alert>
                          )
                        )}
                        <Box sx={{ color: 'text.secondary' }}>
                          <Typography variant="caption">Caller: {adminResponseJson?.caller || 'n/a'} | Time: {adminResponseJson?.ts || 'n/a'}</Typography>
                        </Box>
                      </>
                    )}
                  </Box>
                )}
                {/* Raw JSON toggle and limit control (ClickHouse-style) */}
                <Stack direction="row" alignItems="center" gap={1} sx={{ flexWrap: 'wrap' }}>
                  <Button size="small" onClick={() => setShowAdminRaw(v => !v)} sx={{ textTransform:'none' }}>
                    {showAdminRaw ? 'HIDE RAW JSON' : 'SHOW RAW JSON'}
                  </Button>
                  {/* Right-side controls: wrap below on small screens */}
                  <RawLimitControls />
                </Stack>
                {showAdminRaw && (
                  <TextField
                    value={adminRawPreview}
                    fullWidth
                    multiline
                    minRows={8}
                    slotProps={{ input: { readOnly: true } }}
                    sx={{ mt:1, '& .MuiInputBase-input': { fontFamily:'monospace', fontSize:12 } }}
                  />
                )}
              </Grid>
            </Grid>
          </Box>
        )}

        {/* Test Tab */}
        {tab === 1 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body1" sx={{ mb: 2 }}>
              Test the detection with user-friendly input fields. Optionally, switch to a custom JSON body.
            </Typography>
            <FormControlLabel 
              control={<Switch checked={useAdvancedBody} onChange={(e) => setUseAdvancedBody(e.target.checked)} />} 
              label={<Box sx={{ display:'inline-flex', alignItems:'center' }}>Advanced mode (custom JSON)<InfoTooltip title="When enabled, you can set action, username, num_ips, and country_code as JSON. The backend reads them from query params; the body is shown for reference." /></Box>} 
              sx={{ mb: 1 }}
            />

            {!useAdvancedBody && (
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    select
                    fullWidth
                    label="Action"
                    value={testFields.action}
                    onChange={(e) => setTestFields({ ...testFields, action: e.target.value })}
                    helperText="Choose what to run"
                  >
                    <MenuItem value="run_test">Run test</MenuItem>
                    <MenuItem value="simulate_attack">Simulate distributed attack</MenuItem>
                    <MenuItem value="check_detection">Check detection status</MenuItem>
                  </TextField>
                </Grid>
                <Grid size={{ xs: 12, md: 8 }}>
                  <TextField
                    fullWidth
                    required
                    label="Username"
                    value={testFields.username}
                    onChange={(e) => setTestFields({ ...testFields, username: e.target.value })}
                    slotProps={{ input: { endAdornment: (<InputAdornment position="end"><InfoTooltip title="Required for all actions." /></InputAdornment>) } }}
                  />
                </Grid>
                {testFields.action !== 'check_detection' && (
                  <Grid size={{ xs: 12, md: 4 }}>
                    <TextField
                      fullWidth
                      label="Num IPs"
                      type="number"
                      value={testFields.num_ips}
                      onChange={(e) => setTestFields({ ...testFields, num_ips: Number(e.target.value || 0) })}
                      slotProps={{ input: { endAdornment: (<InputAdornment position="end"><InfoTooltip title="Number of IPs to simulate (default 20)." /></InputAdornment>) } }}
                    />
                  </Grid>
                )}
                {testFields.action !== 'check_detection' && (
                  <Grid size={{ xs: 12, md: 4 }}>
                    <TextField
                      fullWidth
                      label="Country Code"
                      value={testFields.country_code}
                      onChange={(e) => setTestFields({ ...testFields, country_code: e.target.value })}
                      placeholder="e.g., US, DE"
                    />
                  </Grid>
                )}
              </Grid>
            )}

            {useAdvancedBody && (
              <>
                <TextField
                  label="Request Body (JSON)"
                  value={testBodyText}
                  onChange={(e) => setTestBodyText(e.target.value)}
                  fullWidth
                  multiline
                  minRows={8}
                  error={testBodyTooLarge}
                  helperText={`${testBodyBytes} / ${rawJsonMaxBytes} bytes${testBodyTooLarge ? ' — exceeds limit' : ''}`}
                />
              </>
            )}

            <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
              <Button 
                variant="contained" 
                startIcon={testLoading ? <CircularProgress size={18} /> : <PlayArrowIcon />} 
                disabled={testLoading || (useAdvancedBody && testBodyTooLarge)}
                onClick={() => callHook('test')}
              >
                {testLoading ? 'Running…' : 'Execute Test'}
              </Button>
            </Box>

            <Box sx={{ mt: 2 }}>
              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Response</Typography>

              {/* Pretty Test response rendering */}
              {testResponseJson && (
                <Box sx={{ mb: 2 }}>
                  {(() => {
                    const jr: any = testResponseJson || {};
                    const act = (lastTestAction || '').toString();
                    const isRun = act === 'run_test';
                    const isCheck = act === 'check_detection';
                    const status = jr?.status || 'info';
                    const testRes = jr?.test_result;

                    const alertSeverity: 'success'|'info'|'warning'|'error' = isRun
                      ? (testRes === 'FAIL' ? 'warning' : 'success')
                      : (status === 'success' ? 'success' : 'error');

                    const headerMsg = (isRun ? (jr?.test_message || jr?.message) : jr?.message) || 'Response received';

                    return (
                      <>
                        {testAlertOpen && (
                          <Alert severity={alertSeverity} sx={{ mb: 2 }} onClose={() => setTestAlertOpen(false)}>
                            {headerMsg}
                          </Alert>
                        )}

                        {/* Warm-up banner when system is not fully warmed up (from test hook response) */}
                        {jr?.warmup && jr?.warmup?.warmup_complete === false && (() => {
                          const toNum = (x: any) => (typeof x === 'number' ? x : Number(x));
                          const warm = jr.warmup;
                          const progress = toNum(warm.warmup_progress) || 0;
                          const pct = Math.round(Math.min(100, Math.max(0, progress * 100)));
                          const uptime = toNum(warm.uptime_seconds) || 0;
                          const windowSec = toNum(warm.warmup_window_seconds) || 0;
                          return (
                            <Alert severity="info" sx={{ mb: 2 }}>
                              System is in warm-up; sliding windows may not reflect steady-state yet. Progress: {pct}% — Uptime: {formatDuration(uptime)} of {formatDuration(windowSec)} window.
                            </Alert>
                          );
                        })()}

                        {/* Special chip for run_test result */}
                        {isRun && (
                          <Box sx={{ mb: 2 }}>
                            <Typography variant="subtitle2" sx={{ mr: 1, display: 'inline-flex', alignItems:'center' }}>Test Result:</Typography>
                            <Chip
                              label={testRes || 'UNKNOWN'}
                              color={testRes === 'FAIL' ? 'error' : 'success'}
                              variant="filled"
                              sx={{ fontWeight: 600 }}
                            />
                          </Box>
                        )}

                        {/* Detection tiles for run_test and check_detection */}
                        {(isRun || isCheck) && (
                          <Box sx={{ mb: 2 }}>
                            <Typography variant="subtitle2" sx={{ mb: 1 }}>Detection Result</Typography>
                            {renderDetectionTiles(jr?.detection_result || {})}
                          </Box>
                        )}

                        {/* Context info */}
                        <Box sx={{ color: 'text.secondary', mt: 1 }}>
                          <Typography variant="caption">
                            Status: {jr?.status || 'n/a'} | User: {jr?.username || 'n/a'}{jr?.num_ips != null ? ` | Num IPs: ${jr.num_ips}` : ''}{jr?.country_code ? ` | Country: ${jr.country_code}` : ''} | Session: {jr?.session || 'n/a'} | Time: {jr?.ts || 'n/a'}
                          </Typography>
                        </Box>
                      </>
                    );
                  })()}
                </Box>
              )}

              {/* Raw JSON toggle and limit control (ClickHouse-style) */}
              <Stack direction="row" alignItems="center" gap={1} sx={{ flexWrap: 'wrap' }}>
                <Button size="small" onClick={() => setShowTestRaw(v => !v)} sx={{ textTransform:'none' }}>
                  {showTestRaw ? 'HIDE RAW JSON' : 'SHOW RAW JSON'}
                </Button>
                {/* Right-side controls: wrap below on small screens */}
                <RawLimitControls />
              </Stack>
              {showTestRaw && (
                <TextField
                  value={testRawPreview}
                  fullWidth
                  multiline
                  minRows={8}
                  slotProps={{ input: { readOnly: true } }}
                  sx={{ mt:1, '& .MuiInputBase-input': { fontFamily:'monospace', fontSize:12 } }}
                />
              )}
            </Box>
          </Box>
        )}
      </Paper>

      {/* Snackbar for displaying notifications with auto-hide and close button */}
      <Snackbar
        open={notif.open}
        autoHideDuration={10000}
        onClose={() => setNotif({ ...notif, open: false })}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
     >
        <Alert onClose={() => setNotif({ ...notif, open: false })} severity={notif.severity} sx={{ width: '100%' }}>
          {notif.message}
        </Alert>
      </Snackbar>

    </>
  );
};

export default DistributedBruteForceTools;
