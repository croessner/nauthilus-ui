import React from 'react';
import { usePersistedAutoRefresh } from '../hooks/usePersistedAutoRefresh';
import { Box, Card, CardContent, LinearProgress, Typography, Chip, Stack, Button, Select, MenuItem, Accordion, AccordionSummary, AccordionDetails } from '@mui/material';
import InfoTooltip from './common/InfoTooltip';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ConnectionStatus from './common/ConnectionStatus';
import { useRuntime, getCurrentUserId } from '../contexts/RuntimeContext';
import { useConfig } from '../contexts/ConfigContext';
import { getProxyOrigin, prepareAuthParams, authenticatedFetch, loadSettings as loadSettingsUtil, checkConnection as checkConnectionUtil } from '../utils/apiUtils';
import Grid from '@mui/material/Grid';

interface MetricsResponse {
  timestamp_ms: number;
  version?: string;
  instance?: string;
  uptime_seconds?: number;
  process_cpu_seconds_total?: number;
  process_resident_memory_bytes?: number;
  go_memstats_alloc_bytes?: number;
  go_goroutines?: number;
  go_threads?: number;
  cpu_user_usage_percent?: number;
  cpu_system_usage_percent?: number;
  cpu_idle_usage_percent?: number;
  cpu_nice_usage_percent?: number;
  cpu_iowait_usage_percent?: number;
  cpu_steal_usage_percent?: number;

  // Newly added fields for connections
  connections_current?: number;
}

const formatBytes = (bytes?: number): string => {
  if (!bytes || !isFinite(bytes)) return 'N/A';
  const units = ['B','KB','MB','GB','TB'];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
  return `${val.toFixed(1)} ${units[i]}`;
};

const formatDuration = (seconds?: number): string => {
  if (!seconds || !isFinite(seconds)) return 'N/A';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [] as string[];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
};

interface GaugeBarProps { label: string; value: number; max?: number; color?: 'primary'|'secondary'|'success'|'error'|'warning'|'info'; subtitle?: string }
const GaugeBar = ({ label, value, max = 100, color = 'primary', subtitle }: GaugeBarProps): React.JSX.Element => {
  const clamped = Math.max(0, Math.min(value, max));
  const pct = (clamped / max) * 100;
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>{label}</Typography>
          <Typography variant="body2" color="text.secondary">{subtitle}</Typography>
        </Stack>
        <LinearProgress variant="determinate" value={pct} color={color} sx={{ height: 10, borderRadius: 5 }} />
      </CardContent>
    </Card>
  );
};

// Three separate semicircular gauges for User/System/Idle with idle having reversed color logic
interface CpuUsageGaugeProps { user?: number; system?: number; nice?: number; iowait?: number; steal?: number; idle?: number }
const CpuUsageGauge = ({ user, system, nice, iowait, steal, idle }: CpuUsageGaugeProps): React.JSX.Element => {
  // Clamp values to [0,100]
  const u = Math.max(0, Math.min(user ?? 0, 100));
  const s = Math.max(0, Math.min(system ?? 0, 100));
  const n = Math.max(0, Math.min(nice ?? 0, 100));
  const w = Math.max(0, Math.min(iowait ?? 0, 100));
  const st = Math.max(0, Math.min(steal ?? 0, 100));
  const i = Math.max(0, Math.min(idle ?? 0, 100));

  const width = 160;
  const height = 110;
  const cx = width / 2;
  const cy = height - 8;
  const rOuter = Math.min(width, height * 2) / 2 - 10;
  const rInner = rOuter - 12;

  const polar = (angleDeg: number, r: number) => {
    const a = (angleDeg - 90) * (Math.PI / 180);
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };

  const arcPath = (startAngle: number, endAngle: number, r1: number, r2: number) => {
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    const p1 = polar(startAngle, r1);
    const p2 = polar(endAngle, r1);
    const p3 = polar(endAngle, r2);
    const p4 = polar(startAngle, r2);
    return `M ${p1.x} ${p1.y} A ${r1} ${r1} 0 ${largeArc} 1 ${p2.x} ${p2.y} L ${p3.x} ${p3.y} A ${r2} ${r2} 0 ${largeArc} 0 ${p4.x} ${p4.y} Z`;
  };

  const colorFor = (value: number, goodIsHigh: boolean): string => {
    // Thresholds chosen for intuitive feedback
    if (goodIsHigh) {
      if (value >= 70) return '#4caf50'; // good
      if (value >= 40) return '#ff9800'; // warning
      return '#f44336'; // bad
    } else {
      if (value >= 80) return '#f44336'; // bad
      if (value >= 50) return '#ff9800'; // warning
      return '#4caf50'; // good
    }
  };

  const SingleGauge = ({ label, value, goodIsHigh = false }: { label: string; value: number; goodIsHigh?: boolean }): React.JSX.Element => {
    const pct = Math.max(0, Math.min(value, 100));
    const baseStart = -90;
    const totalAngle = 180;
    const endAngle = baseStart + (totalAngle * pct) / 100;

    const track = arcPath(baseStart, baseStart + totalAngle, rOuter, rInner);
    const needle = arcPath(baseStart, endAngle, rOuter, rInner);

    const fill = colorFor(pct, goodIsHigh);

    return (
      <Box sx={{ textAlign: 'center', flex: '1 1 140px', minWidth: 140, maxWidth: 260 }}>
        <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" aria-label={`${label} gauge`} style={{ height: 'auto' }}>
          {/* track */}
          <path d={track} fill="#e0e0e0" />
          {/* value */}
          <path d={needle} fill={fill} />
          {/* ticks */}
          {Array.from({ length: 7 }).map((_, idx) => {
            const ang = baseStart + (idx * totalAngle) / 6;
            const pOuter = polar(ang, rOuter);
            const pInner = polar(ang, rOuter - 8);
            return <line key={idx} x1={pInner.x} y1={pInner.y} x2={pOuter.x} y2={pOuter.y} stroke="#bdbdbd" strokeWidth={1}/>;
          })}
          {/* center label */}
          <text x={cx} y={cy - 10} textAnchor="middle" fontSize="14" fill="#424242">{Math.round(pct)}%</text>
        </svg>
        <Typography variant="body2" color="text.secondary">{label}</Typography>
      </Box>
    );
  };

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1 }}>CPU</Typography>
        <Stack
          direction="row"
          spacing={2}
          justifyContent={{ xs: 'center', sm: 'space-around' }}
          sx={{ width: '100%', flexWrap: 'wrap', rowGap: 2, columnGap: 2, overflowX: 'auto' }}
        >
          {/* Logical order: User, System, Nice, I/O Wait, Steal, Idle */}
          <SingleGauge label="User" value={u} />
          <SingleGauge label="System" value={s} />
          <SingleGauge label="Nice" value={n} />
          <SingleGauge label="I/O Wait" value={w} />
          <SingleGauge label="Steal" value={st} />
          <SingleGauge label="Idle" value={i} goodIsHigh />
        </Stack>
      </CardContent>
    </Card>
  );
};

interface StatCardProps { icon?: string; title: string; value: string }
const StatCard = ({ icon, title, value }: StatCardProps): React.JSX.Element => (
  <Card variant="outlined">
    <CardContent>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        {icon && <Typography component="span" aria-hidden sx={{ fontWeight: 700 }}>{icon}</Typography>}
        <Typography variant="subtitle2" color="text.secondary">{title}</Typography>
      </Stack>
      <Typography variant="h6" sx={{ fontWeight: 600 }}>{value}</Typography>
    </CardContent>
  </Card>
);

const SystemPage = (): React.JSX.Element => {
  const { connection, loadRuntimeSettings } = useRuntime();
  const { currentProfileName, config } = useConfig();
  const [data, setData] = React.useState<MetricsResponse | null>(null);
  const [statusMessage, setStatusMessage] = React.useState<string>('');
  const [connStatus, setConnStatus] = React.useState<'unknown'|'connected'|'disconnected'|'checking'>('unknown');

  // Bootstrapping: ensure runtime settings are loaded and connection checked (debounced)
  const connectionRef = React.useRef(connection);
  React.useEffect(() => { connectionRef.current = connection; }, [connection]);
  const getConnection = React.useCallback(() => connectionRef.current, []);

  const checkConnection = React.useCallback(async (conn: any) => {
    await checkConnectionUtil(conn, setConnStatus, (msg: string) => setStatusMessage(msg));
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
        console.error('Failed to load settings on SystemPage:', err);
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
      const proxyUrl = new URL('/proxy/system/metrics', getProxyOrigin());
      proxyUrl.searchParams.append('url', backendUrl);

      const { authType, authValue } = prepareAuthParams(getConnection());
      if (authType && authValue) {
        proxyUrl.searchParams.append('authType', authType);
        proxyUrl.searchParams.append('authValue', authValue);
      }

      const res = await authenticatedFetch(proxyUrl.toString());
      if (!res.ok) {
        setStatusMessage(`Failed to fetch metrics: ${res.status} ${res.statusText}`);
        return;
      }
      const json = await res.json() as MetricsResponse;
      setData(json);
      setStatusMessage('');
    } catch (err) {
      console.error('Failed to fetch metrics:', err);
      setStatusMessage(`Failed to fetch metrics: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      inFlightRef.current = false;
    }
  }, [getConnection]);

  const REFRESH_SESSION_KEY = 'systemPage.refreshIntervalMs';
  const [refreshMs, setRefreshMs] = usePersistedAutoRefresh(fetchMetrics, REFRESH_SESSION_KEY, 5000);

  // Collapsible sections expanded state persisted in sessionStorage
  const getSessionBool = (key: string, def: boolean) => {
    try {
      const v = typeof window !== 'undefined' ? window.sessionStorage.getItem(key) : null;
      if (v === 'true') return true;
      if (v === 'false') return false;
    } catch {}
    return def;
  };
  const setSessionBool = (key: string, val: boolean) => {
    try { if (typeof window !== 'undefined') window.sessionStorage.setItem(key, val ? 'true' : 'false'); } catch {}
  };
  const [cpuExpanded, setCpuExpanded] = React.useState<boolean>(() => getSessionBool('ui:system:cpu', true));
  const [memoryExpanded, setMemoryExpanded] = React.useState<boolean>(() => getSessionBool('ui:system:memory', true));
  const [runtimeExpanded, setRuntimeExpanded] = React.useState<boolean>(() => getSessionBool('ui:system:runtime', true));
  const [detailsExpanded, setDetailsExpanded] = React.useState<boolean>(() => getSessionBool('ui:system:details', true));

  React.useEffect(() => setSessionBool('ui:system:cpu', cpuExpanded), [cpuExpanded]);
  React.useEffect(() => setSessionBool('ui:system:memory', memoryExpanded), [memoryExpanded]);
  React.useEffect(() => setSessionBool('ui:system:runtime', runtimeExpanded), [runtimeExpanded]);
  React.useEffect(() => setSessionBool('ui:system:details', detailsExpanded), [detailsExpanded]);

  // Prepare display values
  const version = data?.version || 'unknown';
  const instanceName = (data?.instance && data.instance.trim()) || (config?.server?.instance_name || 'nauthilus');
  const uptime = formatDuration(data?.uptime_seconds);
  const rss = formatBytes(data?.process_resident_memory_bytes);
  const alloc = formatBytes(data?.go_memstats_alloc_bytes);
  const goroutines = data?.go_goroutines ?? NaN;
  const threads = data?.go_threads ?? NaN;

  // Connections
  const connectionsCurrent = data?.connections_current;

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', rowGap: 1 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>System</Typography><InfoTooltip title="Live metrics of this instance, fetched periodically from the backend." />
        <Chip label={`Instance: ${instanceName}`} size="small" sx={{ ml: 1 }} />
        <Chip label={`Version: ${version}`} size="small" sx={{ ml: 1 }} />
        {statusMessage && (
          <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>{statusMessage}</Typography>
        )}
        <Box sx={{ flexGrow: 1 }} />
        <Select
          size="small"
          value={refreshMs}
          onChange={(e) => setRefreshMs(Number(e.target.value))}
          sx={{ minWidth: 120, mr: 1 }}
          displayEmpty
          aria-label="Refresh interval"
        >
          <MenuItem value={1000}>1 s</MenuItem>
          <MenuItem value={5000}>5 s</MenuItem>
          <MenuItem value={10000}>10 s</MenuItem>
          <MenuItem value={30000}>30 s</MenuItem>
          <MenuItem value={60000}>1 m</MenuItem>
          <MenuItem value={300000}>5 m</MenuItem>
        </Select>
        <Button variant="outlined" size="small" onClick={fetchMetrics}>Refresh</Button>
      </Stack>

      {/* Connection status (unified banner) */}
      <ConnectionStatus
        status={connStatus}
        message={statusMessage}
        onCheck={() => checkConnection(getConnection())}
      />

      <Grid container spacing={2}>
        <Grid size={12}>
          <Accordion
            expanded={cpuExpanded}
            onChange={() => setCpuExpanded(prev => !prev)}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="h6" sx={{ fontWeight: 700 }}>CPU</Typography>
                <InfoTooltip title="CPU usage breakdown. User: app code; System: OS/kernel work; Nice: low‑priority work; I/O Wait: waiting for disks/network; Steal: time taken by other VMs; Idle: unused CPU. Gauges start at 0% until data arrives." />
              </Stack>
            </AccordionSummary>
            <AccordionDetails>
              <CpuUsageGauge
                user={data?.cpu_user_usage_percent}
                system={data?.cpu_system_usage_percent}
                nice={data?.cpu_nice_usage_percent}
                iowait={data?.cpu_iowait_usage_percent}
                steal={data?.cpu_steal_usage_percent}
                idle={data?.cpu_idle_usage_percent}
              />
            </AccordionDetails>
          </Accordion>
        </Grid>
        <Grid size={12}>
          <Accordion
            expanded={memoryExpanded}
            onChange={() => setMemoryExpanded(prev => !prev)}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="h6" sx={{ fontWeight: 700 }}>Memory</Typography>
                <InfoTooltip title="Memory used by this process. RSS (Resident Set Size) is the part of memory currently in RAM; Go heap (allocated) is memory managed by Go. Values update periodically." />
              </Stack>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <GaugeBar
                    label="Go Heap (allocated)"
                    value={(data?.go_memstats_alloc_bytes || 0) / (1024*1024)}
                    max={1024 * 8}
                    color="info"
                    subtitle={`${alloc}`}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <GaugeBar
                    label="Process Memory (RSS)"
                    value={(data?.process_resident_memory_bytes || 0) / (1024*1024)}
                    max={1024 * 16}
                    color="secondary"
                    subtitle={`${rss}`}
                  />
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>
        </Grid>
        <Grid size={12}>
          <Accordion
            expanded={runtimeExpanded}
            onChange={() => setRuntimeExpanded(prev => !prev)}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}> 
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="h6" sx={{ fontWeight: 700 }}>Runtime</Typography>
                <InfoTooltip title="General runtime stats like uptime and concurrency metrics (goroutines/threads)." />
              </Stack>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <StatCard icon="⏱️" title="Uptime" value={uptime} />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <StatCard icon="📈" title="Goroutines" value={Number.isFinite(goroutines) ? String(goroutines) : 'N/A'} />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <StatCard icon="🧵" title="Threads" value={Number.isFinite(threads) ? String(threads) : 'N/A'} />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <StatCard icon="🔌" title="Connections" value={Number.isFinite(connectionsCurrent || NaN) ? String(connectionsCurrent) : 'N/A'} />
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>
        </Grid>

        <Grid size={12}>
          <Accordion
            expanded={detailsExpanded}
            onChange={() => setDetailsExpanded(prev => !prev)}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>Details</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Card variant="outlined">
                <CardContent>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Typography variant="body2" color="text.secondary">
                      CPU seconds total: {data?.process_cpu_seconds_total?.toFixed ? data.process_cpu_seconds_total.toFixed(2) : 'N/A'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      RSS (Resident Set Size): {rss} • Go heap (allocated): {alloc}
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            </AccordionDetails>
          </Accordion>
        </Grid>
      </Grid>
    </Box>
  );
};

export default SystemPage;
