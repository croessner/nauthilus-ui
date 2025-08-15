import React from 'react';
import { Box, Card, CardContent, Grid, LinearProgress, Typography, Chip, Stack, Button, Select, MenuItem } from '@mui/material';
import InfoTooltip from './common/InfoTooltip';
import { useRuntime, getCurrentUserId } from '../contexts/RuntimeContext';
import { useConfig } from '../contexts/ConfigContext';
import { getProxyOrigin, prepareAuthParams, authenticatedFetch, loadSettings as loadSettingsUtil, checkConnection as checkConnectionUtil } from '../utils/apiUtils';

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

const GaugeBar: React.FC<{ label: string; value: number; max?: number; color?: 'primary'|'secondary'|'success'|'error'|'warning'|'info'; subtitle?: string }>
 = ({ label, value, max = 100, color = 'primary', subtitle }) => {
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
const CpuUsageGauge: React.FC<{ user?: number; system?: number; idle?: number }>
 = ({ user, system, idle }) => {
  // Clamp values to [0,100]
  const u = Math.max(0, Math.min(user ?? 0, 100));
  const s = Math.max(0, Math.min(system ?? 0, 100));
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

  const SingleGauge: React.FC<{ label: string; value: number; goodIsHigh?: boolean }>
   = ({ label, value, goodIsHigh = false }) => {
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
          <SingleGauge label="User" value={u} />
          <SingleGauge label="System" value={s} />
          <SingleGauge label="Idle" value={i} goodIsHigh />
        </Stack>
      </CardContent>
    </Card>
  );
};

const StatCard: React.FC<{ icon?: string; title: string; value: string }>
 = ({ icon, title, value }) => (
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

const SystemPage: React.FC = () => {
  const { connection, loadRuntimeSettings } = useRuntime();
  const { currentProfileName, config } = useConfig();
  const [data, setData] = React.useState<MetricsResponse | null>(null);
  const [statusMessage, setStatusMessage] = React.useState<string>('');

  // Bootstrapping: ensure runtime settings are loaded and connection checked (debounced)
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
        console.error('Failed to load settings on SystemPage:', err);
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
  const [refreshMs, setRefreshMs] = React.useState<number>(() => {
    const v = typeof window !== 'undefined' ? window.sessionStorage.getItem(REFRESH_SESSION_KEY) : null;
    const n = v ? parseInt(v, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : 1000;
  });

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(REFRESH_SESSION_KEY, String(refreshMs));
    }
  }, [refreshMs]);

  React.useEffect(() => {
    // initial fetch
    void fetchMetrics();
    // interval tick only when page/tab is visible
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      void fetchMetrics();
    }, refreshMs);
    return () => clearInterval(id);
  }, [fetchMetrics, refreshMs]);

  // Prepare display values
  const version = data?.version || 'unknown';
  const instanceName = (data?.instance && data.instance.trim()) || (config?.server?.instance_name || 'nauthilus');
  const uptime = formatDuration(data?.uptime_seconds);
  const rss = formatBytes(data?.process_resident_memory_bytes);
  const alloc = formatBytes(data?.go_memstats_alloc_bytes);
  const goroutines = data?.go_goroutines ?? NaN;
  const threads = data?.go_threads ?? NaN;

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', rowGap: 1 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>System</Typography><InfoTooltip title="Live system metrics fetched from the backend periodically." />
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

      <Grid container spacing={2}>
        <Grid item xs={12}>
          <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="h6" sx={{ fontWeight: 700, mt: 1 }}>CPU</Typography>
                    <InfoTooltip title="CPU usage breakdown (user/system/idle). Gauges initialize at 0% until data is available." />
                  </Stack>
        </Grid>
        <Grid item xs={12} md={6}>
          <CpuUsageGauge 
            user={data?.cpu_user_usage_percent}
            system={data?.cpu_system_usage_percent}
            idle={data?.cpu_idle_usage_percent}
          />
        </Grid>
        <Grid item xs={12}>
          <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="h6" sx={{ fontWeight: 700, mt: 2 }}>Memory</Typography>
                    <InfoTooltip title="Memory usage of the Go process (RSS) and allocated heap. Values are updated periodically." />
                  </Stack>
        </Grid>
        <Grid item xs={12} md={6}>
          <GaugeBar 
            label="Go Allocated Memory" 
            value={(data?.go_memstats_alloc_bytes || 0) / (1024*1024)}
            max={1024 * 8}
            color="info"
            subtitle={`${alloc}`}
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <GaugeBar 
            label="Process RSS Memory" 
            value={(data?.process_resident_memory_bytes || 0) / (1024*1024)}
            max={1024 * 16}
            color="secondary"
            subtitle={`${rss}`}
          />
        </Grid>
        <Grid item xs={12}>
          <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="h6" sx={{ fontWeight: 700, mt: 2 }}>Runtime</Typography>
                    <InfoTooltip title="General runtime stats like uptime and concurrency metrics (goroutines/threads)." />
                  </Stack>
        </Grid>
        <Grid item xs={12} md={6}>
          <StatCard icon="⏱️" title="Uptime" value={uptime} />
        </Grid>
        <Grid item xs={12} md={6}>
          <StatCard icon="📈" title="Goroutines" value={Number.isFinite(goroutines) ? String(goroutines) : 'N/A'} />
        </Grid>
        <Grid item xs={12} md={6}>
          <StatCard icon="🧵" title="Threads" value={Number.isFinite(threads) ? String(threads) : 'N/A'} />
        </Grid>
        <Grid item xs={12}>
          <Typography variant="h6" sx={{ fontWeight: 700, mt: 2 }}>Details</Typography>
        </Grid>
        <Grid item xs={12}>
          <Card variant="outlined">
            <CardContent>
              <Stack direction="row" spacing={2} alignItems="center">
                <Typography variant="body2" color="text.secondary">
                  CPU seconds total: {data?.process_cpu_seconds_total?.toFixed ? data.process_cpu_seconds_total.toFixed(2) : 'N/A'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  RSS: {rss} • Go Alloc: {alloc}
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default SystemPage;
