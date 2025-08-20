import React from 'react';
import { usePersistedAutoRefresh } from '../hooks/usePersistedAutoRefresh';
import { Box, Card, CardContent, Grid, Typography, Chip, Stack, Button, Select, MenuItem, Accordion, AccordionSummary, AccordionDetails, Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SecurityIcon from '@mui/icons-material/Security';
import InfoTooltip from './common/InfoTooltip';
import { useRuntime, getCurrentUserId } from '../contexts/RuntimeContext';
import { useConfig } from '../contexts/ConfigContext';
import { getProxyOrigin, prepareAuthParams, authenticatedFetch, loadSettings as loadSettingsUtil, checkConnection as checkConnectionUtil } from '../utils/apiUtils';

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
  const { connection, loadRuntimeSettings } = useRuntime();
  const { currentProfileName } = useConfig();
  const [data, setData] = React.useState<SecurityMetricsResponse | null>(null);
  const [statusMessage, setStatusMessage] = React.useState<string>('');

  // Ensure runtime settings and connection are loaded
  const connectionRef = React.useRef(connection);
  React.useEffect(() => { connectionRef.current = connection; }, [connection]);
  const getConnection = React.useCallback(() => connectionRef.current, []);

  const checkConnection = React.useCallback(async (conn: any) => {
    await checkConnectionUtil(conn, () => {}, (msg: string) => setStatusMessage(msg));
  }, []);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProfileName]);

  const inFlightRef = React.useRef(false);
  const fetchMetrics = React.useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const backendUrl = getConnection()?.backend_url;
      if (!backendUrl) return;
      const proxyUrl = new URL('/proxy/security/metrics', getProxyOrigin());
      proxyUrl.searchParams.append('url', backendUrl);
      const { authType, authValue } = prepareAuthParams(getConnection());
      if (authType && authValue) {
        proxyUrl.searchParams.append('authType', authType);
        proxyUrl.searchParams.append('authValue', authValue);
      }
      const res = await authenticatedFetch(proxyUrl.toString());
      if (!res.ok) {
        setStatusMessage(`Failed to fetch security metrics: ${res.status} ${res.statusText}`);
        return;
      }
      const json = await res.json() as SecurityMetricsResponse;
      setData(json);
      setStatusMessage('');
    } catch (err) {
      console.error('Failed to fetch security metrics:', err);
      setStatusMessage(`Failed to fetch security metrics: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      inFlightRef.current = false;
    }
  }, [getConnection]);

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
        {statusMessage && (
          <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>{statusMessage}</Typography>
        )}
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

      <Grid container spacing={2}>
        <Grid item xs={12}>
          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}> 
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="h6" sx={{ fontWeight: 700 }}>Overview</Typography>
                <InfoTooltip title="Summary counters indicating current security posture. Some counters are cumulative since process start." />
              </Stack>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
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
                <Grid item xs={12} md={6}>
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
                <Grid item xs={12} md={4}>
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
                <Grid item xs={12} md={4}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1 }}>Step-Up Challenges Issued</Typography>
                      <Typography variant="h4" sx={{ fontWeight: 700 }}>{data?.stepup_challenges_issued_total != null ? Math.round(data.stepup_challenges_issued_total) : 'N/A'}</Typography>
                      <Typography variant="body2" color="text.secondary">Total number of hint flags set to trigger step-up (since start).</Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1 }}>Proof-of-Work Challenges Issued</Typography>
                      <Typography variant="h4" sx={{ fontWeight: 700 }}>{data?.pow_challenges_issued_total != null ? Math.round(data.pow_challenges_issued_total) : 'N/A'}</Typography>
                      <Typography variant="body2" color="text.secondary">Total proof-of-work challenges issued (since start).</Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} md={4}>
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

        <Grid item xs={12}>
          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}> 
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="h6" sx={{ fontWeight: 700 }}>Per-User Metrics</Typography>
                <InfoTooltip title="Per user metrics are labeled by username and time window. Values show current gauge values per scrape." />
              </Stack>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
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
                <Grid item xs={12} md={6}>
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
