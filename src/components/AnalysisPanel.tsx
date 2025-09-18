import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Chip, Divider, Stack, Typography } from '@mui/material';
import { useTheme as useMuiTheme } from '@mui/material/styles';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import { computeInsights, TOPN_USERS, TOPN_IPS, TOPN_UAS, TOPN_SERVICES, TOPN_REASONS, TOPN_FEATURE_IPS, TOPN_SPRAYING_IPS } from '../analysis/computeInsights';
import { generatePDFServerSide } from '../utils/apiUtils';

// Shared helpers to reduce duplicate code across charts
function calcVerticalChartHeight(count: number, opts?: { base?: number; perItem?: number; min?: number }) {
  const { base = 40, perItem = 26, min = 180 } = opts || {};
  return Math.max(min, base + count * perItem);
}

function calcYAxisWidthFromLabels(labels: string[], opts?: { min?: number; max?: number; pxPerChar?: number; padding?: number }) {
  const { min = 200, max = 640, pxPerChar = 7.2, padding = 28 } = opts || {};
  const longest = labels.reduce((m, s) => Math.max(m, (s || '').length), 0);
  return Math.max(min, Math.min(max, Math.round(padding + pxPerChar * longest)));
}

function makeYAxisTickRenderer(ds: { fullName?: string; name?: string }[], axisColor: string) {
  return function Tick(props: any) {
    const { x, y, payload } = props;
    const idx = payload?.index ?? 0;
    const full = ds[idx]?.fullName ?? String(payload?.value ?? '');
    const display = String(payload?.value ?? '');
    return (
      // eslint-disable-next-line react/jsx-key
      <g transform={`translate(${x},${y})`}>
        <title>{full}</title>
        <text x={0} y={0} dy={4} textAnchor="end" fill={axisColor}>
          {display}
        </text>
      </g>
    );
  };
}

const tooltipBoxStyle: React.CSSProperties = {
  background: '#111827',
  color: '#e5e7eb',
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px solid #374151'
};

function TimeSeriesChart({ data }: { data: [string, number][] }) {
  const ds = data.map(([t, v]) => ({ t, v }));
  const theme = useMuiTheme();
  const axisColor = theme.palette.text.primary;

  const TooltipContent = (props: any) => {
    const { active, payload, label } = props;
    if (!active || !payload || !payload.length) return null;
    const val = payload[0]?.value ?? 0;
    return (
      <div style={tooltipBoxStyle}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
        <div>Events: {val}</div>
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={ds}>
        <XAxis dataKey="t" hide />
        <YAxis allowDecimals={false} stroke={axisColor} tick={{ fill: axisColor }} />
        <Tooltip content={<TooltipContent />} />
        <Line type="monotone" dataKey="v" stroke="#3b82f6" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function TopBar({ data, label }: { data: [string, number][], label: string }) {
  const maxLen = 40;
  const truncate = (s: string) => (s && s.length > maxLen ? s.slice(0, maxLen - 3) + '...' : s || '—');
  const ds = data.map(([name, value]) => {
    const full = String(name ?? '—');
    return { fullName: full, name: truncate(full), value };
  });
  const theme = useMuiTheme();
  const axisColor = theme.palette.text.primary;
  const height = calcVerticalChartHeight(ds.length, { min: 180 });
  const yAxisWidth = calcYAxisWidthFromLabels(ds.map(d => d.name || ''), { min: 200, max: 640, pxPerChar: 7.2, padding: 28 });

  const Tick = makeYAxisTickRenderer(ds, axisColor);

  const TooltipContent = (props: any) => {
    const { active, payload } = props;
    if (!active || !payload || !payload.length) return null;
    const p = payload[0];
    const val = p?.value ?? 0;
    const name = p?.payload?.fullName ?? p?.payload?.name ?? '';
    return (
      <div style={tooltipBoxStyle}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{name}</div>
        <div>{label}: {val}</div>
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={ds} layout="vertical" margin={{ left: 12, right: 16, top: 8, bottom: 8 }}>
        <XAxis type="number" stroke={axisColor} tick={{ fill: axisColor }} />
        <YAxis type="category" dataKey="name" width={yAxisWidth} stroke={axisColor} tick={<Tick />} interval={0} />
        <Tooltip content={<TooltipContent />} />
        <Bar dataKey="value" fill="#10b981" />
      </BarChart>
    </ResponsiveContainer>
  );
}

function TopCountriesStacked({ data }: { data: { country: string; success: number; failure: number; total: number }[] }) {
  const theme = useMuiTheme();
  const axisColor = theme.palette.text.primary;
  const ds = (data || []).map(d => ({ fullName: String(d.country || '—'), name: String(d.country || '—'), success: d.success || 0, failure: d.failure || 0, total: d.total || 0 }));
  const height = calcVerticalChartHeight(ds.length, { min: 220 });
  const yAxisWidth = calcYAxisWidthFromLabels(ds.map(d => d.name || ''), { min: 180, max: 640, pxPerChar: 7.2, padding: 28 });

  const Tick = makeYAxisTickRenderer(ds, axisColor);

  const TooltipContent = (props: any) => {
    const { active, payload } = props;
    if (!active || !payload || !payload.length) return null;
    const p = payload[0].payload;
    return (
      <div style={tooltipBoxStyle}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{p.fullName || p.name}</div>
        <div><span style={{ color: '#ef4444' }}>Failure:</span> {p.failure}</div>
        <div><span style={{ color: '#10b981' }}>Success:</span> {p.success}</div>
        <div style={{ marginTop: 4, color: '#9ca3af' }}>Total: {p.total}</div>
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={ds} layout="vertical" margin={{ left: 12, right: 16, top: 8, bottom: 8 }}>
        <XAxis type="number" stroke={axisColor} tick={{ fill: axisColor }} allowDecimals={false} />
        <YAxis type="category" dataKey="name" width={yAxisWidth} stroke={axisColor} tick={<Tick />} interval={0} />
        <Tooltip content={<TooltipContent />} />
        <Legend />
        <Bar dataKey="failure" name="Failure" stackId="a" fill="#ef4444" />
        <Bar dataKey="success" name="Success" stackId="a" fill="#10b981" />
      </BarChart>
    </ResponsiveContainer>
  );
}

function TopUsersStacked({ data }: { data: { username: string; success: number; failure: number; total: number }[] }) {
  const theme = useMuiTheme();
  const axisColor = theme.palette.text.primary;
  const maxLen = 24;
  const truncate = (s: string) => {
    if (!s) return '—';
    return s.length > maxLen ? s.slice(0, maxLen - 3) + '...' : s;
  };
  const ds = (data || []).map(d => ({
    fullName: String(d.username || '—'),
    name: truncate(String(d.username || '—')),
    success: d.success || 0,
    failure: d.failure || 0,
    total: d.total || 0,
  }));
  const height = calcVerticalChartHeight(ds.length, { min: 220 });
  const yAxisWidth = calcYAxisWidthFromLabels(ds.map(d => d.name || ''), { min: 220, max: 640, pxPerChar: 7.2, padding: 28 });

  const Tick = makeYAxisTickRenderer(ds, axisColor);

  const TooltipContent = (props: any) => {
    const { active, payload } = props;
    if (!active || !payload || !payload.length) return null;
    const p = payload[0].payload;
    return (
      <div style={tooltipBoxStyle}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{p.fullName}</div>
        <div><span style={{ color: '#ef4444' }}>Failure:</span> {p.failure}</div>
        <div><span style={{ color: '#10b981' }}>Success:</span> {p.success}</div>
        <div style={{ marginTop: 4, color: '#9ca3af' }}>Total: {p.total}</div>
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={ds} layout="vertical" margin={{ left: 12, right: 16, top: 8, bottom: 8 }}>
        <XAxis type="number" stroke={axisColor} tick={{ fill: axisColor }} allowDecimals={false} />
        <YAxis type="category" dataKey="name" width={yAxisWidth} stroke={axisColor} tick={<Tick />} interval={0} />
        <Tooltip content={<TooltipContent />} />
        <Legend />
        <Bar dataKey="failure" name="Failure" stackId="a" fill="#ef4444" />
        <Bar dataKey="success" name="Success" stackId="a" fill="#10b981" />
      </BarChart>
    </ResponsiveContainer>
  );
}

function TopIPsStacked({ data }: { data: { ip: string; success: number; failure: number; total: number }[] }) {
  const theme = useMuiTheme();
  const axisColor = theme.palette.text.primary;
  const maxLen = 40;
  const truncate = (s: string) => {
    if (!s) return '—';
    return s.length > maxLen ? s.slice(0, maxLen - 3) + '...' : s;
  };
  const ds = (data || []).map(d => ({
    fullName: String(d.ip || '—'),
    name: truncate(String(d.ip || '—')),
    success: d.success || 0,
    failure: d.failure || 0,
    total: d.total || 0,
  }));
  const height = calcVerticalChartHeight(ds.length, { min: 220 });
  // Increase the estimated px-per-char and padding to prevent left-side clipping for long IPv6 labels
  const yAxisWidth = calcYAxisWidthFromLabels(ds.map(d => d.name || ''), { min: 260, max: 800, pxPerChar: 8.6, padding: 40 });

  const Tick = makeYAxisTickRenderer(ds, axisColor);

  const TooltipContent = (props: any) => {
    const { active, payload } = props;
    if (!active || !payload || !payload.length) return null;
    const p = payload[0].payload;
    return (
      <div style={tooltipBoxStyle}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{p.fullName}</div>
        <div><span style={{ color: '#ef4444' }}>Failure:</span> {p.failure}</div>
        <div><span style={{ color: '#10b981' }}>Success:</span> {p.success}</div>
        <div style={{ marginTop: 4, color: '#9ca3af' }}>Total: {p.total}</div>
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={ds} layout="vertical" margin={{ left: 36, right: 16, top: 8, bottom: 8 }}>
        <XAxis type="number" stroke={axisColor} tick={{ fill: axisColor }} allowDecimals={false} />
        <YAxis type="category" dataKey="name" width={yAxisWidth} stroke={axisColor} tick={<Tick />} interval={0} tickMargin={8} />
        <Tooltip content={<TooltipContent />} />
        <Legend />
        <Bar dataKey="failure" name="Failure" stackId="a" fill="#ef4444" />
        <Bar dataKey="success" name="Success" stackId="a" fill="#10b981" />
      </BarChart>
    </ResponsiveContainer>
  );
}

function TopUserAgentsStacked({ data }: { data: { ua: string; success: number; failure: number; total: number }[] }) {
  const theme = useMuiTheme();
  const axisColor = theme.palette.text.primary;
  const maxLen = 40;
  const truncate = (s: string) => {
    if (!s) return '—';
    return s.length > maxLen ? s.slice(0, maxLen - 3) + '...' : s;
  };
  const ds = (data || []).map(d => ({
    fullName: String(d.ua || '—'),
    name: truncate(String(d.ua || '—')),
    success: d.success || 0,
    failure: d.failure || 0,
    total: d.total || 0,
  }));
  const height = calcVerticalChartHeight(ds.length, { min: 220 });
  const yAxisWidth = calcYAxisWidthFromLabels(ds.map(d => d.name || ''), { min: 220, max: 640, pxPerChar: 7.2, padding: 28 });

  const Tick = makeYAxisTickRenderer(ds, axisColor);

  const TooltipContent = (props: any) => {
    const { active, payload } = props;
    if (!active || !payload || !payload.length) return null;
    const p = payload[0].payload;
    return (
      <div style={tooltipBoxStyle}>
        <div style={{ fontWeight: 700, marginBottom: 4, maxWidth: 520, whiteSpace: 'normal' }}>{p.fullName}</div>
        <div><span style={{ color: '#ef4444' }}>Failure:</span> {p.failure}</div>
        <div><span style={{ color: '#10b981' }}>Success:</span> {p.success}</div>
        <div style={{ marginTop: 4, color: '#9ca3af' }}>Total: {p.total}</div>
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={ds} layout="vertical" margin={{ left: 12, right: 16, top: 8, bottom: 8 }}>
        <XAxis type="number" stroke={axisColor} tick={{ fill: axisColor }} allowDecimals={false} />
        <YAxis type="category" dataKey="name" width={yAxisWidth} stroke={axisColor} tick={<Tick />} interval={0} />
        <Tooltip content={<TooltipContent />} />
        <Legend />
        <Bar dataKey="failure" name="Failure" stackId="a" fill="#ef4444" />
        <Bar dataKey="success" name="Success" stackId="a" fill="#10b981" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function AnalysisPanel({ rows }: { rows: any[] }) {
  const insights = useMemo(() => computeInsights(rows), [rows]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [pdfMode, setPdfMode] = useState(false);
  const featureKeys = (insights as any).features?.featureKeys || [];
  const [selectedFeature, setSelectedFeature] = useState<string | null>(featureKeys[0] || null);
  useEffect(() => {
    const keys = (insights as any).features?.featureKeys || [];
    setSelectedFeature(keys[0] || null);
  }, [insights]);

  const handleExportPDF = async () => {
    if (!containerRef.current) return;
    try {
      setDownloading(true);
      // Switch component into PDF mode to render all feature charts and hide interactive controls
      setPdfMode(true);
      // Wait for React to re-render with pdfMode and for charts to paint
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      // Give Recharts a brief moment to render multiple charts
      await new Promise<void>(resolve => setTimeout(resolve, 150));
      // Build a minimal HTML document using the panel content
      const inner = containerRef.current.innerHTML;
      const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
  /* Page setup */
  @page { size: A4; margin: 14mm 14mm 16mm; }
  html, body { background: #fff; }
  body{
    font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
    color: #0b1220; /* high contrast */
    padding: 0;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  #report { margin: 6px auto 0; max-width: 1080px; }
  h1,h2,h3{ margin: 0.2rem 0; color: #0b1220; }
  .subtle { color:#374151; }
  .kpis { display:flex; flex-wrap:wrap; gap:8px; margin: 8px 0 12px; }
  .kpis .k { background:#eef2f7; border:1px solid #c7d2fe; border-radius:8px; padding:8px 12px; color:#0b1220; }
  .section { margin-top: 18px; }

  /* Typography approximations */
  .MuiTypography-root { color: #0b1220; }
  .MuiTypography-subtitle1 { font-size: 16px; font-weight: 600; margin: 8px 0; }
  p { margin: 4px 0; }

  /* Chips */
  .MuiChip-root { display:inline-flex; align-items:center; border-radius:16px; border:1px solid #c7d2fe; background:#eef2f7; color:#0b1220; padding:2px 8px; margin:2px 4px; font-size:12px; line-height:18px; }
  .MuiChip-colorPrimary { background:#e0e7ff; border-color:#93c5fd; }
  .MuiChip-label { padding: 0 4px; }

  /* Stack approximations */
  .MuiStack-root { display:flex; gap:8px; flex-wrap:wrap; }

  /* Divider */
  hr, .MuiDivider-root { border:0; border-top:1px solid #e5e7eb; margin:12px 0; height:0; }

  /* Hide interactive-only controls in PDF */
  [data-pdf-hide="true"]{ display:none !important; }

  /* Avoid awkward page breaks */
  .report, #report { page-break-inside: auto; }
  /* Keep headings with their following content (avoid splits between heading and chart) */
  h1, h2, h3, h4, h5, h6, .MuiTypography-subtitle1, .MuiTypography-h6 { break-after: avoid-page; page-break-after: avoid; orphans: 3; widows: 3; }
  .kpis, .MuiStack-root, .MuiBox-root, .MuiGrid-root, .MuiTypography-root,
  .recharts-responsive-container, .MuiChip-root, .MuiDivider-root, .section {
    break-inside: avoid; page-break-inside: avoid; }

  /* Charts and SVG should not split, and scale to page width */
  svg { break-inside: avoid; page-break-inside: avoid; max-width: 100%; height: auto; }

  /* Force Recharts axis/tick/legend to dark for print on white */
  .recharts-cartesian-axis-tick text { fill: #0b1220 !important; font-size: 12px; }
  .recharts-cartesian-axis-line line, .recharts-cartesian-grid line { stroke: #334155 !important; }
  .recharts-legend-wrapper, .recharts-default-legend { color: #0b1220 !important; font-size: 12px; }
  .recharts-default-legend { display: flex; flex-wrap: wrap; gap: 8px; }
</style>
</head>
<body>
  <h1>Nauthilus – ClickHouse Deep Analysis</h1>
  <div class="subtle" style="font-size:12px;">Time range: ${insights.meta.timeMin || '-'} – ${insights.meta.timeMax || '-'}</div>
  <div id="report">${inner}</div>
</body></html>`;

      const blob = await generatePDFServerSide(html, 'clickhouse-report.pdf');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'clickhouse-report.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('PDF export failed', e);
      alert('PDF export failed: ' + (e as Error).message);
    } finally {
      // Restore normal mode
      setPdfMode(false);
      setDownloading(false);
    }
  };

  const total = insights.meta.total;
  const failRate = total ? Math.round((insights.kpis.failures / total) * 100) : 0;
  const topCountries = insights.top.topCountries.map(([c]) => String(c || '—')).slice(0, 5);
  const topServices = insights.top.topServices.map(([s]) => String(s || '—')).slice(0, 5);
  const topUAs = (insights.top as any).topUserAgents?.map(([ua]: any) => String(ua || '—')).slice(0, 5) || [];
  const featStats: any[] = ((insights as any).features?.stats || []) as any[];
  const coveragePct = Math.round(((((insights as any).features?.shareFailuresWithAnyFeature) || 0) * 100));
  const topFeatNamesByFailures: string[] = [...featStats]
    .sort((a: any, b: any) => (b.failure - a.failure))
    .slice(0, 3)
    .map((f: any) => String(f.feature));
  return (
    <Box ref={containerRef} sx={{ minWidth: 720 }}>
      <Typography variant="h6">Overview</Typography>
      <div className="kpis">
        <div className="k">Events: {insights.meta.total} ({insights.meta.timeMin} … {insights.meta.timeMax})</div>
        <div className="k">Success/Failure: {insights.kpis.successes}/{insights.kpis.failures} ({failRate}% failed)</div>
        <div className="k">Unique IPs/Users/UAs/Fingerprints: {insights.kpis.uniqIPs}/{insights.kpis.uniqUsers}/{insights.kpis.uniqUA}/{insights.kpis.uniqFP}</div>
        <div className="k">Blocklist/RBL hits: {insights.kpis.blocklistHits} | Protection active: {insights.kpis.protActive}</div>
      </div>
      <Typography variant="body2" sx={{ color:'text.secondary', mt: 1 }}>
        Executive Summary: Analyzed {total} events. {failRate}% are failed logins. Most activity is from {topCountries.slice(0,3).join(', ') || '—'} and mainly targets services/ports {topServices.slice(0,3).join(', ') || '—'}. Top user agents: {topUAs.slice(0,3).join(', ') || '—'}. Feature coverage: {coveragePct}% of failures are tagged by features{topFeatNamesByFailures.length ? ` (notably: ${topFeatNamesByFailures.join(', ')})` : ''}.
      </Typography>

      <Divider className="section" />
      <Typography variant="subtitle1">Time series</Typography>
      <TimeSeriesChart data={insights.time.perMinute} />

      <Divider className="section" />
      <Typography variant="subtitle1">Features (success vs failure)</Typography>
      <FeaturesStacked data={((insights as any).features?.stats || []) as any} />

      {/* Feature efficiency chips */}
      <Stack direction="row" spacing={1} sx={{ flexWrap:'wrap', mb: 1.5 }}>
        <Chip size="small" label={`Failures with any feature: ${(insights as any).features?.failuresWithAnyFeature ?? 0} (${coveragePct}% of all failures)`} />
        {featStats.slice(0, 6).sort((a:any,b:any)=> b.failure - a.failure).map((f:any)=>{
          const share = insights.kpis.failures ? Math.round((f.failure / insights.kpis.failures) * 100) : 0;
          return <Chip key={f.feature} size="small" label={`${f.feature}: ${share}% of failures`} />;
        })}
      </Stack>

      <Typography variant="subtitle1">Top IPs by feature (success vs failure) — Top {TOPN_FEATURE_IPS}</Typography>
      {!pdfMode && (
        <Stack direction="row" spacing={1} sx={{ flexWrap:'wrap', mb: 1 }} data-pdf-hide="true">
          {featureKeys.length ? featureKeys.map((f:string)=> (
            <Chip key={f} label={f} color={selectedFeature===f? 'primary' : 'default'} onClick={()=>setSelectedFeature(f)} clickable />
          )) : <Chip label="No feature tags found" size="small" />}
        </Stack>
      )}
      {pdfMode ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {featureKeys.map((f: string) => (
            <Box key={f} sx={{ mb: 1 }}>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 0.5 }}>Feature: {f}</Typography>
              <TopIPsStacked data={(((insights as any).features?.topIPsByFeature?.[f]) || []) as any} />
            </Box>
          ))}
        </Box>
      ) : (
        selectedFeature && (
          <TopIPsStacked data={(((insights as any).features?.topIPsByFeature?.[selectedFeature]) || []) as any} />
        )
      )}

      <Divider className="section" />
      <Typography variant="subtitle1">Top countries (success vs failure) — Top 20</Typography>
      <TopCountriesStacked data={((insights.top as any).topCountriesAllBreakdown || []).slice(0, 20)} />

      <Divider className="section" />
      <Typography variant="subtitle1">Top users (success vs failure) — Top {TOPN_USERS}</Typography>
      <TopUsersStacked data={(insights.top as any).topUsersBreakdown || []} />

      <Divider className="section" />
      <Typography variant="subtitle1">Top IPs (success vs failure) — Top {TOPN_IPS}</Typography>
      <TopIPsStacked data={(insights.top as any).topIPsBreakdown || []} />

      <Divider className="section" />
      <Typography variant="subtitle1">Top user agents (success vs failure) — Top {TOPN_UAS}</Typography>
      <TopUserAgentsStacked data={(insights.top as any).topUserAgentsBreakdown || []} />

      <Divider className="section" />
      <Typography variant="subtitle1">Top Services/Ports — Top {TOPN_SERVICES}</Typography>
      <TopBar data={insights.top.topServices} label="Services" />

      <Divider className="section" />
      <Typography variant="subtitle1">Top protection reasons (prot_reason) — Top {TOPN_REASONS}</Typography>
      <TopBar data={insights.top.topReasons} label="Protection reasons" />

      <Divider className="section" />
      <Typography variant="subtitle1">Detected peaks</Typography>
      <Stack spacing={0.5}>
        {insights.time.peaks.map(([t,v]) => <Chip key={t} label={`${t}: ${v}`} size="small" />)}
      </Stack>

      {insights.abuse.sprayingIPs.length > 0 && (
        <>
          <Divider className="section" />
          <Typography variant="subtitle1">Username spraying (IP → #usernames) — Top {TOPN_SPRAYING_IPS}</Typography>
          <Stack spacing={0.5} direction="row" flexWrap="wrap" useFlexGap>
            {insights.abuse.sprayingIPs.slice(0, TOPN_SPRAYING_IPS).map(([ip, set]: any) => (
              <Chip key={ip} label={`${ip} → ${(set as Set<string>).size}`} size="small" />
            ))}
          </Stack>
        </>
      )}

      <Divider className="section" data-pdf-hide="true" />
      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }} data-pdf-hide="true">
        <Button onClick={handleExportPDF} variant="contained" disabled={downloading}>
          {downloading ? 'Exporting…' : 'Export as PDF (server-side)'}
        </Button>
      </Box>
    </Box>
  );
}


// Stacked horizontal bar for features (success vs failure)
function FeaturesStacked({ data }: { data: { feature: string; success: number; failure: number; total: number; uniqueIPs?: number }[] }) {
  const theme = useMuiTheme();
  const axisColor = theme.palette.text.primary;
  const ds = (data || []).map(d => ({ fullName: String(d.feature || '—'), name: String(d.feature || '—'), success: d.success || 0, failure: d.failure || 0, total: d.total || 0, uniqueIPs: d.uniqueIPs ?? 0 }));
  const height = calcVerticalChartHeight(ds.length, { min: 180 });
  const yAxisWidth = calcYAxisWidthFromLabels(ds.map(d => d.name || ''), { min: 200, max: 640, pxPerChar: 7.2, padding: 28 });

  const Tick = makeYAxisTickRenderer(ds, axisColor);

  const TooltipContent = (props: any) => {
    const { active, payload } = props;
    if (!active || !payload || !payload.length) return null;
    const p = payload[0].payload;
    const rate = p.total ? Math.round((p.failure / p.total) * 100) : 0;
    return (
      <div style={tooltipBoxStyle}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{p.fullName || p.name}</div>
        <div><span style={{ color: '#ef4444' }}>Failure:</span> {p.failure}</div>
        <div><span style={{ color: '#10b981' }}>Success:</span> {p.success}</div>
        <div style={{ color: '#9ca3af' }}>Failure rate: {rate}%</div>
        <div style={{ marginTop: 4, color: '#9ca3af' }}>Total: {p.total}{typeof p.uniqueIPs === 'number' ? ` • Unique IPs: ${p.uniqueIPs}` : ''}</div>
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={ds} layout="vertical" margin={{ left: 12, right: 16, top: 8, bottom: 8 }}>
        <XAxis type="number" stroke={axisColor} tick={{ fill: axisColor }} allowDecimals={false} />
        <YAxis type="category" dataKey="name" width={yAxisWidth} stroke={axisColor} tick={<Tick />} interval={0} />
        <Tooltip content={<TooltipContent />} />
        <Legend />
        <Bar dataKey="failure" name="Failure" stackId="a" fill="#ef4444" />
        <Bar dataKey="success" name="Success" stackId="a" fill="#10b981" />
      </BarChart>
    </ResponsiveContainer>
  );
}
