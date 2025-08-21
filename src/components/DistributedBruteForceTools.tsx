import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Tabs,
  Tab,
  Grid,
  TextField,
  Button,
  Switch,
  FormControlLabel,
  Alert,
  InputAdornment,
  MenuItem,
  CircularProgress,
  Divider,
  Tooltip,
  IconButton,
  Chip
} from '@mui/material';
import SecurityIcon from '@mui/icons-material/Security';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import InfoTooltip from './common/InfoTooltip';
import { useConfig } from '../contexts/ConfigContext';
import { useRuntime, getCurrentUserId } from '../contexts/RuntimeContext';
import { getProxyOrigin, authenticatedFetch, extractErrorMessage, loadSettings as loadSettingsUtil, prepareAuthParams } from '../utils/apiUtils';

const prettyJson = (obj: any) => {
  try { return JSON.stringify(obj, null, 2); } catch { return String(obj); }
};

const parseJson = (text: string) => {
  try { return JSON.parse(text); } catch { return null; }
};

const defaultAdminOps = [
  { value: 'get_metrics', label: 'get_metrics' },
  { value: 'reset_protection', label: 'reset_protection' },
  { value: 'reset_account', label: 'reset_account' },
];

const DistributedBruteForceTools: React.FC = () => {
  const { currentProfileName, config } = useConfig();
  const { connection: runtimeConnection, hooks: runtimeHooks, saveRuntimeSettings, loadRuntimeSettings } = useRuntime();

  const [tab, setTab] = useState(0);
  const [adminEnabled, setAdminEnabled] = useState<boolean>(Boolean(config?.lua?.hooks?.distributed_brute_force_admin?.enabled || runtimeHooks?.distributed_brute_force_admin?.enabled));
  const [testEnabled, setTestEnabled] = useState<boolean>(Boolean(config?.lua?.hooks?.distributed_brute_force_test?.enabled || runtimeHooks?.distributed_brute_force_test?.enabled));
  const [adminPath, setAdminPath] = useState<string>(config?.lua?.hooks?.distributed_brute_force_admin?.endpoint_path || runtimeHooks?.distributed_brute_force_admin?.endpoint_path || '/hooks/distributed-brute-force-admin');
  const [testPath, setTestPath] = useState<string>(config?.lua?.hooks?.distributed_brute_force_test?.endpoint_path || runtimeHooks?.distributed_brute_force_test?.endpoint_path || '/hooks/distributed-brute-force-test');

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
  const [adminResponse, setAdminResponse] = useState<string>('');
  const [adminResponseJson, setAdminResponseJson] = useState<any | null>(null);
  const [adminLoading, setAdminLoading] = useState<boolean>(false);
  const [showAdminRaw, setShowAdminRaw] = useState<boolean>(false);
  const [expandedLists, setExpandedLists] = useState<Record<string, boolean>>({});

  const [testFields, setTestFields] = useState({
    username: '',
    ip_address: '',
    protocol: '',
    oidc_cid: '',
    rule_name: '',
    attempts: 0,
  });
  const [testBodyText, setTestBodyText] = useState<string>('{}');
  const [useAdvancedBody, setUseAdvancedBody] = useState<boolean>(false);
  const [testResponse, setTestResponse] = useState<string>('');
  const [testLoading, setTestLoading] = useState<boolean>(false);

  const [notif, setNotif] = useState<{open:boolean, severity:'success'|'error'|'info'|'warning', message:string}>({open:false, severity:'info', message:''});

  const connectionRef = useRef(runtimeConnection);
  useEffect(() => { connectionRef.current = runtimeConnection; }, [runtimeConnection]);
  const getRuntimeConnection = useCallback(() => connectionRef.current, []);

  // Centralized connection check to avoid duplication in effects and UI handlers
  const checkConnection = useCallback(async () => {
    const conn = getRuntimeConnection();
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
        setConnStatus('disconnected');
        const msg = await extractErrorMessage(resp);
        setStatusMessage(`Failed to connect: ${msg}`);
      }
    } catch (e: any) {
      setConnStatus('disconnected');
      setStatusMessage(`Connection error: ${e?.message || String(e)}`);
    }
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

  // Sync hook states when configuration or runtime hook settings load/update
  useEffect(() => {
    const newAdminEnabled = Boolean(
      config?.lua?.hooks?.distributed_brute_force_admin?.enabled ??
      runtimeHooks?.distributed_brute_force_admin?.enabled
    );
    const newTestEnabled = Boolean(
      config?.lua?.hooks?.distributed_brute_force_test?.enabled ??
      runtimeHooks?.distributed_brute_force_test?.enabled
    );
    const newAdminPath = (
      config?.lua?.hooks?.distributed_brute_force_admin?.endpoint_path ||
      runtimeHooks?.distributed_brute_force_admin?.endpoint_path ||
      '/hooks/distributed-brute-force-admin'
    );
    const newTestPath = (
      config?.lua?.hooks?.distributed_brute_force_test?.endpoint_path ||
      runtimeHooks?.distributed_brute_force_test?.endpoint_path ||
      '/hooks/distributed-brute-force-test'
    );

    setAdminEnabled(newAdminEnabled);
    setTestEnabled(newTestEnabled);
    setAdminPath(newAdminPath);
    setTestPath(newTestPath);
  }, [config, runtimeHooks]);

  const hasValidConnection = Boolean(runtimeConnection?.backend_url);

  const saveHooksRuntime = async () => {
    try {
      const userId = await getCurrentUserId();
      await saveRuntimeSettings(userId, currentProfileName, runtimeConnection, {
        ...(runtimeHooks || {}),
        distributed_brute_force_admin: { enabled: adminEnabled, endpoint_path: adminPath },
        distributed_brute_force_test: { enabled: testEnabled, endpoint_path: testPath },
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
      url.searchParams.append('operation', adminOperation);
    }

    // Build request body
    let body: any;
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
        body = { username: effectiveUsername };
      } else {
        body = {};
      }
    } else {
      body = (useAdvancedBody ? (parseJson(testBodyText) ?? {}) : {
        username: testFields.username || undefined,
        ip_address: testFields.ip_address || undefined,
        protocol: testFields.protocol || undefined,
        oidc_cid: testFields.oidc_cid || undefined,
        rule_name: testFields.rule_name || undefined,
        attempts: testFields.attempts || undefined,
      });
    }

    const setLoading = isAdmin ? setAdminLoading : setTestLoading;
    const setResp = isAdmin ? setAdminResponse : setTestResponse;

    setLoading(true);
    setResp('');
    if (isAdmin) {
      setAdminResponseJson(null);
    }
    try {
      const options: RequestInit = { method: 'POST', body: JSON.stringify(body || {}) } as any;
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
      }
      setResp(prettyJson(json));
      setNotif({ open: true, severity: 'success', message: 'Request executed successfully' });
    } catch (e:any) {
      const msg = e?.message || String(e);
      setResp(`Request error: ${msg}`);
      setNotif({ open: true, severity: 'error', message: msg });
    } finally {
      setLoading(false);
    }
  };

  const generatedTestJson = useMemo(() => prettyJson({
    username: testFields.username || undefined,
    ip_address: testFields.ip_address || undefined,
    protocol: testFields.protocol || undefined,
    oidc_cid: testFields.oidc_cid || undefined,
    rule_name: testFields.rule_name || undefined,
    attempts: testFields.attempts || undefined,
  }), [testFields]);

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

  return (
    <>
      <Paper sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <SecurityIcon sx={{ mr: 1, color: 'primary.main' }} />
          <Typography variant="h6">Distributed Brute-Force Tools</Typography>
          <InfoTooltip title="Configuration and testing of the distributed brute-force Lua hooks (Admin and Test)." />
        </Box>

        {/* Connection status (match Connection page style) */}
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
                disabled={connStatus === 'checking' || !hasValidConnection}
                sx={{ ml: 1 }}
              >
                <RefreshIcon />
              </IconButton>
            </span>
          </Tooltip>
        </Box>

        {/* Auto-hide connection success message */}
        {/* Clear success message after a few seconds to match other runtime pages */}
        {/* This is implemented with a side-effect below */}

        {/* Hook settings */}
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid item xs={12} md={6}>
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
              InputProps={{ endAdornment: (
                <InputAdornment position="end"><InfoTooltip title="Path of the Admin hook as configured in the backend (e.g., /hooks/distributed-brute-force-admin)." /></InputAdornment>
              )}}
              sx={{ mt: 1 }}
            />
          </Grid>
          <Grid item xs={12} md={6}>
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
              InputProps={{ endAdornment: (
                <InputAdornment position="end"><InfoTooltip title="Path of the Test hook as configured in the backend (e.g., /hooks/distributed-brute-force-test)." /></InputAdornment>
              )}}
              sx={{ mt: 1 }}
            />
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
              <Grid item xs={12} md={6}>
                <TextField
                  select
                  fullWidth
                  label="Operation"
                  value={adminOperation}
                  onChange={(e) => setAdminOperation(e.target.value)}
                  helperText="Available operations: get_metrics, reset_protection, reset_account"
                >
                  {defaultAdminOps.map(op => (
                    <MenuItem key={op.value} value={op.value}>{op.label}</MenuItem>
                  ))}
                </TextField>
              </Grid>

              {/* Username required field for reset_account */}
              {adminOperation === 'reset_account' && (
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    required
                    label="Username (required)"
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    InputProps={{ endAdornment: (
                      <InputAdornment position="end"><InfoTooltip title="Required field: Username of the account to reset." /></InputAdornment>
                    )}}
                  />
                </Grid>
              )}

              <Grid item xs={12}>
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
              <Grid item xs={12}>
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
                        return (
                          <>
                            <Grid container spacing={2}>
                              <Grid item xs={12} md={3}>
                                <Paper sx={{ p: 2 }}>
                                  <Typography variant="subtitle2">Attempts</Typography>
                                  <Typography variant="h6">{toNum(m.attempts) || 0}</Typography>
                                </Paper>
                              </Grid>
                              <Grid item xs={12} md={3}>
                                <Paper sx={{ p: 2 }}>
                                  <Typography variant="subtitle2">Unique IPs</Typography>
                                  <Typography variant="h6">{toNum(m.unique_ips) || 0}</Typography>
                                </Paper>
                              </Grid>
                              <Grid item xs={12} md={3}>
                                <Paper sx={{ p: 2 }}>
                                  <Typography variant="subtitle2">Unique Users</Typography>
                                  <Typography variant="h6">{toNum(m.unique_users) || 0}</Typography>
                                </Paper>
                              </Grid>
                              <Grid item xs={12} md={3}>
                                <Paper sx={{ p: 2 }}>
                                  <Typography variant="subtitle2">IPs per User</Typography>
                                  <Typography variant="h6">{(toNum(m.ips_per_user) || 0).toFixed(2)}</Typography>
                                </Paper>
                              </Grid>
                              <Grid item xs={12} md={3}>
                                <Paper sx={{ p: 2 }}>
                                  <Typography variant="subtitle2">Threat Level</Typography>
                                  <Typography variant="h6">{toNum(m.threat_level) || 0}</Typography>
                                </Paper>
                              </Grid>
                              <Grid item xs={12} md={3}>
                                <Paper sx={{ p: 2 }}>
                                  <Typography variant="subtitle2">Attacked Accounts</Typography>
                                  <Typography variant="h6">{attacked}</Typography>
                                </Paper>
                              </Grid>
                              <Grid item xs={12} md={3}>
                                <Paper sx={{ p: 2 }}>
                                  <Typography variant="subtitle2">Rate-limited IPs</Typography>
                                  <Typography variant="h6">{rateLimitedIPs}</Typography>
                                </Paper>
                              </Grid>
                              <Grid item xs={12} md={3}>
                                <Paper sx={{ p: 2 }}>
                                  <Typography variant="subtitle2">Blocked Regions</Typography>
                                  <Typography variant="h6">{blockedRegions}</Typography>
                                </Paper>
                              </Grid>
                              <Grid item xs={12} md={3}>
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
                          <Alert severity="success" sx={{ mb: 1 }}>
                            {adminResponseJson?.message || 'Operation executed successfully'}
                          </Alert>
                        ) : (
                          <Alert severity="error" sx={{ mb: 1 }}>
                            {adminResponseJson?.message || 'Operation failed'}
                          </Alert>
                        )}
                        <Box sx={{ color: 'text.secondary' }}>
                          <Typography variant="caption">Caller: {adminResponseJson?.caller || 'n/a'} | Time: {adminResponseJson?.ts || 'n/a'}</Typography>
                        </Box>
                      </>
                    )}
                  </Box>
                )}
                {/* Raw JSON toggle */}
                <Box sx={{ mb: 1 }}>
                  <Button size="small" onClick={() => setShowAdminRaw(v => !v)}>
                    {showAdminRaw ? 'Hide raw JSON' : 'Show raw JSON'}
                  </Button>
                </Box>
                {showAdminRaw && (
                  <TextField
                    value={adminResponse}
                    fullWidth
                    multiline
                    minRows={8}
                    InputProps={{ readOnly: true }}
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
              label={<Box sx={{ display:'inline-flex', alignItems:'center' }}>Advanced mode (custom JSON)<InfoTooltip title="When enabled, the JSON body entered below is sent as-is." /></Box>} 
              sx={{ mb: 1 }}
            />

            {!useAdvancedBody && (
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Username"
                    value={testFields.username}
                    onChange={(e) => setTestFields({ ...testFields, username: e.target.value })}
                    InputProps={{ endAdornment: (<InputAdornment position="end"><InfoTooltip title="Username of the account (optional)." /></InputAdornment>) }}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="IP Address"
                    value={testFields.ip_address}
                    onChange={(e) => setTestFields({ ...testFields, ip_address: e.target.value })}
                    InputProps={{ endAdornment: (<InputAdornment position="end"><InfoTooltip title="IP address (IPv4/IPv6) for testing." /></InputAdornment>) }}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="Protocol"
                    value={testFields.protocol}
                    onChange={(e) => setTestFields({ ...testFields, protocol: e.target.value })}
                    placeholder="smtp, imap, …"
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="OIDC Client ID"
                    value={testFields.oidc_cid}
                    onChange={(e) => setTestFields({ ...testFields, oidc_cid: e.target.value })}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="Rule Name"
                    value={testFields.rule_name}
                    onChange={(e) => setTestFields({ ...testFields, rule_name: e.target.value })}
                    placeholder="e.g., 5x/1m"
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="Attempts"
                    type="number"
                    value={testFields.attempts}
                    onChange={(e) => setTestFields({ ...testFields, attempts: Number(e.target.value || 0) })}
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    label="Generated JSON body (read-only)"
                    value={generatedTestJson}
                    fullWidth
                    multiline
                    minRows={6}
                    InputProps={{ readOnly: true }}
                  />
                </Grid>
              </Grid>
            )}

            {useAdvancedBody && (
              <TextField
                label="Request Body (JSON)"
                value={testBodyText}
                onChange={(e) => setTestBodyText(e.target.value)}
                fullWidth
                multiline
                minRows={8}
              />
            )}

            <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
              <Button 
                variant="contained" 
                startIcon={testLoading ? <CircularProgress size={18} /> : <PlayArrowIcon />} 
                disabled={testLoading}
                onClick={() => callHook('test')}
              >
                {testLoading ? 'Running…' : 'Execute Test'}
              </Button>
            </Box>

            <Box sx={{ mt: 2 }}>
              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Response</Typography>
              <TextField
                value={testResponse}
                fullWidth
                multiline
                minRows={8}
                InputProps={{ readOnly: true }}
              />
            </Box>
          </Box>
        )}
      </Paper>

    </>
  );
};

export default DistributedBruteForceTools;
