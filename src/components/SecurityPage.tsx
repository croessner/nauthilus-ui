import React from 'react';
import { usePersistedAutoRefresh } from '../hooks/usePersistedAutoRefresh';
import { Box, Card, CardContent, Typography, Chip, Stack, Button, Select, MenuItem, Accordion, AccordionSummary, AccordionDetails, Table, TableBody, TableCell, TableHead, TableRow, Alert, CircularProgress, Tooltip, IconButton } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SecurityIcon from '@mui/icons-material/Security';
import InfoTooltip from './common/InfoTooltip';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import { useRuntime, getCurrentUserId } from '../contexts/RuntimeContext';
import { useConfig } from '../contexts/ConfigContext';
import { getProxyOrigin, buildBackendAuthHeaders, authenticatedFetch, loadSettings as loadSettingsUtil } from '../utils/apiUtils';
import Grid from '@mui/material/Grid';
import { useConnectionAccess } from '../hooks/useConnectionAccess';
import { formatDuration } from '../utils/format';

interface PerUserMetric {
  username: string;
  window: string;
  value: number;
}
interface PerWindowMetric {
  window: string;
  value: number;
}
interface SecurityMetricsResponse {
  timestamp_ms: number;
  unique_ips_per_user: PerUserMetric[];
  account_fail_budget_used: PerUserMetric[];
  global_ips_per_user: PerWindowMetric[];
  sprayed_password_tokens: PerWindowMetric[];
  accounts_in_protection_mode_total?: number;
  stepup_challenges_issued_total?: number;
  pow_challenges_issued_total?: number;
  slow_attack_suspicions_total?: number;
}

const prettyWindow = (w?: string) => (w && w.trim()) || 'n/a';

const SecurityPage = (): React.JSX.Element => {
  const { connection, hooks, loadRuntimeSettings } = useRuntime();
  const { currentProfileName } = useConfig();
  const [data, setData] = React.useState<SecurityMetricsResponse | null>(null);
  const [statusMessage, setStatusMessage] = React.useState<string>('');
  const [connStatus, setConnStatus] = React.useState<'unknown'|'connected'|'disconnected'|'checking'>('unknown');
  // Warm-up diagnostics from admin hook metrics
  const [warmup, setWarmup] = React.useState<{
    warmup_complete?: boolean;
    warmup_progress?: number;
    uptime_seconds?: number;
    warmup_window_seconds?: number;
  } | null>(null);

  // Ensure runtime settings and connection are loaded (deduped via hook)
  const { getConnection, checkConnection } = useConnectionAccess(connection, setConnStatus, setStatusMessage);

  React.useEffect(() => {
    (async () => {
      try {
        await loadSettingsUtil(
          getCurrentUserId,
          loadRuntimeSettings,
          currentProfileName,
          checkConnection,
          getConnection
        );
      } catch (err) {
        console.error('Failed to load settings on SecurityPage:', err);
        setStatusMessage(`Failed to load settings: ${err instanceof Error ? err.message : String(err)}`);
      }
    })();
     
  }, [currentProfileName]);

  // Ensure connection check runs immediately when backend_url becomes available (bypass navigation debounce)
  React.useEffect(() => {
    if (connection?.backend_url) {
      void checkConnection(connection);
    }
  }, [connection?.backend_url, checkConnection]);

  const inFlightRef = React.useRef(false);
  const fetchMetrics = React.useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const backendUrl = getConnection()?.backend_url;
      if (!backendUrl) return;

      // 1) Fetch Prometheus-derived security metrics for the page
      const proxyUrl = new URL('/proxy/security/metrics', getProxyOrigin());
      proxyUrl.searchParams.append('url', backendUrl);
      const backendAuthHeaders = await buildBackendAuthHeaders(getConnection());
      const res = await authenticatedFetch(proxyUrl.toString(), { headers: backendAuthHeaders });
      if (!res.ok) {
        setStatusMessage(`Failed to fetch security metrics: ${res.status} ${res.statusText}`);
      } else {
        const json = await res.json() as SecurityMetricsResponse;
        setData(json);
        setStatusMessage('');
      }

      // 2) Fetch warm-up diagnostics from the Admin hook metrics (non-blocking if fails)
      try {
        const adminProxy = new URL('/proxy/hooks/distributed-brute-force-admin', getProxyOrigin());
        adminProxy.searchParams.append('url', backendUrl);
        adminProxy.searchParams.append('endpoint_path', hooks?.distributed_brute_force_admin?.endpoint_path || '/hooks/distributed-brute-force-admin');
        adminProxy.searchParams.append('action', 'get_metrics');
        const ares = await authenticatedFetch(adminProxy.toString(), { headers: backendAuthHeaders });
        if (ares.ok) {
          const aj = await ares.json().catch(() => ({} as any));
          const m = aj?.metrics || {};
          const w = (m?.warmup || {}) as any;
          setWarmup(w && Object.keys(w).length ? w : null);
        } else {
          setWarmup(null);
        }
      } catch {
        setWarmup(null);
      }
    } catch (err) {
      console.error('Failed to fetch security metrics:', err);
      setStatusMessage(`Failed to fetch security metrics: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      inFlightRef.current = false;
    }
  }, [getConnection, hooks]);

  const REFRESH_SESSION_KEY = 'securityPage.refreshIntervalMs';
  const [refreshMs, setRefreshMs] = usePersistedAutoRefresh(fetchMetrics, REFRESH_SESSION_KEY, 5000);

  // Helpers to render tables grouped by window
  const groupPerUserByWindow = (items?: PerUserMetric[]) => {
    const map: Record<string, PerUserMetric[]> = {};
    (items || []).forEach((it) => {
      const key = prettyWindow(it.window);
      (map[key] ||= []).push(it);
    });
    // sort usernames by value desc
    Object.values(map).forEach(arr => arr.sort((a, b) => (b.value || 0) - (a.value || 0)));
    return map;
  };

  const groupPerWindow = (items?: PerWindowMetric[]) => {
    const map: Record<string, number> = {};
    (items || []).forEach((it) => {
      map[prettyWindow(it.window)] = it.value;
    });
    return map;
  };

  const uniqueByWin = groupPerUserByWindow(data?.unique_ips_per_user);
  const failBudgetByWin = groupPerUserByWindow(data?.account_fail_budget_used);
  const globalRatioByWin = groupPerWindow(data?.global_ips_per_user);
  const sprayedTokensByWin = groupPerWindow(data?.sprayed_password_tokens);

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', rowGap: 1 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>Security</Typography>
        <SecurityIcon fontSize="small" />
        <InfoTooltip title="Live security-related heuristics and counters exposed by the NAuthilus backend via Prometheus metrics." />
        <Box sx={{ flexGrow: 1 }} />
        <Select size="small" value={refreshMs} onChange={(e) => setRefreshMs(Number(e.target.value))} sx={{ minWidth: 120, mr: 1 }} displayEmpty aria-label="Refresh interval">
          <MenuItem value={1000}>1 s</MenuItem>
          <MenuItem value={5000}>5 s</MenuItem>
          <MenuItem value={10000}>10 s</MenuItem>
          <MenuItem value={30000}>30 s</MenuItem>
          <MenuItem value={60000}>1 m</MenuItem>
        </Select>
        <Button variant="outlined" size="small" onClick={fetchMetrics}>Refresh</Button>
      </Stack>

      {/* Connection status (unified banner) */}
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
            <IconButton onClick={() => { void checkConnection(getConnection()); }} disabled={connStatus === 'checking'} sx={{ ml: 1 }}>
              <RefreshIcon />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {/* Heuristics & thresholds (documentation) */}
      <Accordion sx={{ mb: 2 }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle2" sx={{ display:'inline-flex', alignItems:'center', gap: 0.5 }}>
            Account-centric Monitoring Heuristics (backend)
            <InfoTooltip title="Backend uses per-window thresholds to detect distributed patterns with fewer false positives. Adjust via environment variables." />
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>Global Pattern</Typography>
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    <li><code>GPM_THRESH_UNIQ_1H</code> default 12</li>
                    <li><code>GPM_THRESH_UNIQ_24H</code> default 25</li>
                    <li><code>GPM_THRESH_UNIQ_7D</code> default 60</li>
                    <li><code>GPM_MIN_FAILS_24H</code> default 8</li>
                    <li><code>GPM_THRESH_IP_TO_FAIL_RATIO</code> default 1.2</li>
                    <li><code>GPM_ATTACK_TTL_SEC</code> default 43200 (12h)</li>
                  </ul>
                  <Typography variant="caption" color="text.secondary">Short-term OR 24h must hit, plus 7d must hit, with minimum fails and ratio in 1h/24h.</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>Soft Delay</Typography>
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    <li><code>SOFT_DELAY_MIN_MS</code> default 50</li>
                    <li><code>SOFT_DELAY_MAX_MS</code> default 200</li>
                    <li><code>SOFT_DELAY_THRESH_UNIQ24</code> default 8</li>
                    <li><code>SOFT_DELAY_THRESH_UNIQ7D</code> default 20</li>
                    <li><code>SOFT_DELAY_THRESH_FAIL24</code> default 5</li>
                    <li><code>SOFT_DELAY_THRESH_FAIL7D</code> default 10</li>
                  </ul>
                  <Typography variant="caption" color="text.secondary">Adds small delays for risky patterns without blocking.</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>Account Protection Mode</Typography>
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    <li><code>PROTECT_THRESH_UNIQ24</code> default 12</li>
                    <li><code>PROTECT_THRESH_UNIQ7D</code> default 30</li>
                    <li><code>PROTECT_THRESH_FAIL24</code> default 7</li>
                    <li><code>PROTECT_THRESH_FAIL7D</code> default 15</li>
                    <li><code>PROTECT_BACKOFF_MIN_MS</code> default 150</li>
                    <li><code>PROTECT_BACKOFF_MAX_MS</code> default 1000</li>
                    <li><code>PROTECT_BACKOFF_MAX_LEVEL</code> default 5</li>
                    <li><code>PROTECT_MODE_TTL_SEC</code> default 3600 (1h)</li>
                    <li><code>PROTECT_ENFORCE_REJECT</code> default false (dry-run; when true, reject on failed auth under protection)</li>
                  </ul>
                  <Typography variant="caption" color="text.secondary">Progressive, per-account backoff and optional Step-Up/Reject when long-window metrics or attack flag hit thresholds.</Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </AccordionDetails>
      </Accordion>

      {/* Warm-up notice from Admin metrics */}
      {warmup && (warmup as any)?.warmed_up === false && (() => {
        const toNum = (x: any) => (typeof x === 'number' ? x : Number(x || 0));
        const prog = (warmup as any)?.progress || {};
        const req = (warmup as any)?.requirements || {};
        const toPct = (v: unknown) => Math.round(Math.min(100, Math.max(0, toNum(v) * 100)));
        const secondsPct = toPct(prog.seconds);
        const usersPct = toPct(prog.users);
        const attemptsPct = toPct(prog.attempts);
        const overallPct = toPct(prog.overall);
        const elapsed = toNum((warmup as any)?.elapsed_seconds);
        const windowSec = toNum(req.seconds);
        return (
          <Alert severity="info" sx={{ mb: 2 }}>
            System is in warm-up; sliding windows may not reflect steady-state yet. Overall: {overallPct}% — Time: {secondsPct}% · Min Users: {usersPct}% · Min Attempts: {attemptsPct}%. Uptime: {formatDuration(elapsed)} of {formatDuration(windowSec)} window.
          </Alert>
        );
      })()}

      <Grid container spacing={2}>
        <Grid size={12}>
          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}> 
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="h6" sx={{ fontWeight: 700 }}>Overview</Typography>
                <InfoTooltip title="Summary counters indicating current security posture. Some counters are cumulative since process start." />
              </Stack>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1 }}>Accounts in Protection Mode</Typography>
                      <Typography variant="h4" sx={{ fontWeight: 700 }}>
                        {data?.accounts_in_protection_mode_total != null ? Math.round(data.accounts_in_protection_mode_total) : 'N/A'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">Current number of accounts under additional protection.</Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1 }}>Global IPs per User (by window)</Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap" rowGap={1}>
                        {Object.keys(globalRatioByWin).length === 0 ? (
                          <Typography variant="body2" color="text.secondary">No data</Typography>
                        ) : (
                          Object.entries(globalRatioByWin).map(([win, val]) => (
                            <Chip key={win} label={`${win}: ${(val ?? 0).toFixed(2)}`} color={val > 1.5 ? 'warning' : 'default'} />
                          ))
                        )}
                      </Stack>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Ratio of unique IPs to users across the system for each time window.</Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1 }}>Sprayed Password Tokens</Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap" rowGap={1}>
                        {Object.keys(sprayedTokensByWin).length === 0 ? (
                          <Typography variant="body2" color="text.secondary">No data</Typography>
                        ) : (
                          Object.entries(sprayedTokensByWin).map(([win, val]) => (
                            <Chip key={win} label={`${win}: ${Math.round(val ?? 0)}`} />
                          ))
                        )}
                      </Stack>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Cumulative counters of observed privacy-preserving sprayed password tokens by window.</Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1 }}>Step-Up Challenges Issued</Typography>
                      <Typography variant="h4" sx={{ fontWeight: 700 }}>{data?.stepup_challenges_issued_total != null ? Math.round(data.stepup_challenges_issued_total) : 'N/A'}</Typography>
                      <Typography variant="body2" color="text.secondary">Total number of hint flags set to trigger step-up (since start).</Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1 }}>Proof-of-Work Challenges Issued</Typography>
                      <Typography variant="h4" sx={{ fontWeight: 700 }}>{data?.pow_challenges_issued_total != null ? Math.round(data.pow_challenges_issued_total) : 'N/A'}</Typography>
                      <Typography variant="body2" color="text.secondary">Total proof-of-work challenges issued (since start).</Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1 }}>Slow-Attack Suspicions</Typography>
                      <Typography variant="h4" sx={{ fontWeight: 700 }}>{data?.slow_attack_suspicions_total != null ? Math.round(data.slow_attack_suspicions_total) : 'N/A'}</Typography>
                      <Typography variant="body2" color="text.secondary">Heuristic slow-attack suspicions (cumulative).</Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>
        </Grid>

        <Grid size={12}>
          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}> 
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="h6" sx={{ fontWeight: 700 }}>Per-User Metrics</Typography>
                <InfoTooltip title="Per user metrics are labeled by username and time window. Values show current gauge values per scrape." />
              </Stack>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1 }}>Unique IPs per User</Typography>
                      {Object.keys(uniqueByWin).length === 0 ? (
                        <Typography variant="body2" color="text.secondary">No data</Typography>
                      ) : (
                        Object.entries(uniqueByWin).map(([win, arr]) => (
                          <Box key={win} sx={{ mb: 2 }}>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Window: {win}</Typography>
                            <Table size="small" aria-label={`unique-ips-${win}`}>
                              <TableHead>
                                <TableRow>
                                  <TableCell>User</TableCell>
                                  <TableCell align="right">Unique IPs</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {arr.slice(0, 20).map((row) => (
                                  <TableRow key={`${win}-${row.username}`}>
                                    <TableCell>{row.username || '—'}</TableCell>
                                    <TableCell align="right">{(row.value ?? 0).toFixed(0)}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </Box>
                        ))
                      )}
                    </CardContent>
                  </Card>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1 }}>Account Fail Budget Used</Typography>
                      {Object.keys(failBudgetByWin).length === 0 ? (
                        <Typography variant="body2" color="text.secondary">No data</Typography>
                      ) : (
                        Object.entries(failBudgetByWin).map(([win, arr]) => (
                          <Box key={win} sx={{ mb: 2 }}>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Window: {win}</Typography>
                            <Table size="small" aria-label={`fail-budget-${win}`}>
                              <TableHead>
                                <TableRow>
                                  <TableCell>User</TableCell>
                                  <TableCell align="right">Failures</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {arr.slice(0, 20).map((row) => (
                                  <TableRow key={`${win}-${row.username}`}>
                                    <TableCell>{row.username || '—'}</TableCell>
                                    <TableCell align="right">{(row.value ?? 0).toFixed(0)}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </Box>
                        ))
                      )}
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>
        </Grid>
      </Grid>
    </Box>
  );
};

export default SecurityPage;
