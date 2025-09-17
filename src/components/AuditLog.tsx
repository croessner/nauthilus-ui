import React, { useEffect, useState, useMemo } from 'react';
import { Box, Card, CardContent, Typography, Table, TableHead, TableRow, TableCell, TableBody, Stack, TextField, Button, Pagination, MenuItem, FormControl, InputLabel, Select, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, FormControlLabel, Checkbox } from '@mui/material';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { authenticatedFetch } from '../utils/apiUtils';

interface AuditLogEntry {
  id?: string;
  ts: string;
  actor: string;
  actorRoles?: string[];
  ip?: string;
  action: string;
  target?: string;
  method?: string;
  details?: Record<string, any>;
}

interface AuditLogResponse {
  items: AuditLogEntry[];
  total: number;
}

// Measure text width in pixels using a canvas (fallback to char length estimation)
const measureTextWidth = (text: string, font = '14px Roboto, Helvetica, Arial, sans-serif'): number => {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return Math.ceil(text.length * 9); // fallback
    ctx.font = font;
    return Math.ceil(ctx.measureText(text).width);
  } catch {
    return Math.ceil(text.length * 9);
  }
};

const AuditLog: React.FC = () => {
  const [rows, setRows] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [loading, setLoading] = useState(false);
  const [actor, setActor] = useState('');
  const [action, setAction] = useState('');
  const [target, setTarget] = useState('');
  const [actorOptions, setActorOptions] = useState<string[]>([]);
  const [actionOptions, setActionOptions] = useState<string[]>([]);
  const [targetOptions, setTargetOptions] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  // Export dialog state
  const [exportOpen, setExportOpen] = useState(false);
  const [exportIncludeHeader, setExportIncludeHeader] = useState(true);
  const [exportPreset, setExportPreset] = useState<'1h'|'24h'|'7d'|'today'|'all'|'custom'>('24h');
  const [exportFromLocal, setExportFromLocal] = useState(''); // yyyy-MM-ddThh:mm
  const [exportToLocal, setExportToLocal] = useState('');

  const toggleExpanded = (i: number) => setExpanded(prev => ({ ...prev, [i]: !prev[i] }));

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set('limit', String(rowsPerPage));
    params.set('offset', String(Math.max(0, (page - 1) * rowsPerPage)));
    if (actor) params.set('actor', actor);
    if (action) params.set('action', action);
    if (target) params.set('target', target);
    return params.toString();
  }, [rowsPerPage, page, actor, action, target]);

  const load = async () => {
    setLoading(true);
    try {
      const resp = await authenticatedFetch(`/api/audit?${query}`);
      if (!resp.ok) return;
      const json: AuditLogResponse = await resp.json();
      setRows(json.items || []);
      setTotal(json.total || 0);
    } finally {
      setLoading(false);
    }
  };

  // Load distinct options for actor/action/target
  useEffect(() => {
    (async () => {
      try {
        const resp = await authenticatedFetch('/api/audit/meta');
        if (!resp.ok) return;
        const data = await resp.json();
        setActorOptions(Array.isArray(data.actors) ? data.actors : []);
        setActionOptions(Array.isArray(data.actions) ? data.actions : []);
        setTargetOptions(Array.isArray(data.targets) ? data.targets : []);
      } catch {
        // ignore
      }
    })();
  }, []);

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [query]);

  // Compute a min width for the Target input so the widest known target is fully visible
  const targetInputMinWidth = useMemo(() => {
    if (!targetOptions || targetOptions.length === 0) return 200;
    const font = '14px Roboto, Helvetica, Arial, sans-serif'; // matches MUI small TextField
    const maxTextWidth = Math.max(...targetOptions.map(t => measureTextWidth(String(t), font)));
    const paddingAllowance = 64; // input padding, label/icon allowance
    // Ensure a reasonable minimum
    return Math.max(200, Math.ceil(maxTextWidth + paddingAllowance));
  }, [targetOptions]);

  // Helpers for export ranges and formatting
  const toLocalInputValue = (d: Date): string => {
    const tzOffset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
  };
  const presetToRange = (preset: typeof exportPreset): { from?: string; to?: string; fromLocal?: string; toLocal?: string } => {
    const now = new Date();
    const to = now;
    const from = new Date(now);
    if (preset === '1h') from.setHours(now.getHours() - 1);
    else if (preset === '24h') from.setDate(now.getDate() - 1);
    else if (preset === '7d') from.setDate(now.getDate() - 7);
    else if (preset === 'today') { from.setHours(0,0,0,0); }
    else if (preset === 'all') { return {}; }
    return { from: from.toISOString(), to: to.toISOString(), fromLocal: toLocalInputValue(from), toLocal: toLocalInputValue(to) };
  };

  const openExport = () => {
    const preset: typeof exportPreset = exportPreset || '24h';
    const range = presetToRange(preset);
    setExportFromLocal(range.fromLocal || '');
    setExportToLocal(range.toLocal || '');
    setExportOpen(true);
  };

  const doExport = async () => {
    const params = new URLSearchParams();
    if (actor) params.set('actor', actor);
    if (action) params.set('action', action);
    if (target) params.set('target', target);
    params.set('header', exportIncludeHeader ? '1' : '0');

    if (exportPreset === 'custom') {
      if (exportFromLocal) {
        const fromISO = new Date(exportFromLocal).toISOString();
        params.set('from', fromISO);
      }
      if (exportToLocal) {
        const toISO = new Date(exportToLocal).toISOString();
        params.set('to', toISO);
      }
    } else if (exportPreset !== 'all') {
      const range = presetToRange(exportPreset);
      if (range.from) params.set('from', range.from);
      if (range.to) params.set('to', range.to);
    }

    try {
      const resp = await authenticatedFetch(`/api/audit/export?${params.toString()}`);
      if (!resp.ok) {
        console.error('Export failed', resp.status, resp.statusText);
        return;
      }
      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      // Try to extract filename from Content-Disposition
      const cd = resp.headers.get('content-disposition') || '';
      const match = cd.match(/filename="?([^";]+)"?/i);
      a.download = match?.[1] || 'audit_export.csv';
      a.href = url;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } finally {
      setExportOpen(false);
    }
  };

  return (
    <ContainerLike>
      <Typography variant="h5" gutterBottom>Audit Log</Typography>
      <Card>
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mb={2} alignItems="flex-end">
            <FormControl size="small" variant="outlined" sx={{ minWidth: 200 }}>
              <InputLabel id="actor-select-label">Actor</InputLabel>
              <Select
                labelId="actor-select-label"
                value={actor}
                label="Actor"
                onChange={(e) => setActor(e.target.value as string)}
              >
                <MenuItem value="">
                  <em>Any</em>
                </MenuItem>
                {actorOptions.map(opt => (
                  <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" variant="outlined" sx={{ minWidth: 200 }}>
              <InputLabel id="action-select-label">Action</InputLabel>
              <Select
                labelId="action-select-label"
                value={action}
                label="Action"
                onChange={(e) => setAction(e.target.value as string)}
              >
                <MenuItem value="">
                  <em>Any</em>
                </MenuItem>
                {actionOptions.map(opt => (
                  <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" variant="outlined" sx={{ minWidth: targetInputMinWidth }}>
              <InputLabel id="target-select-label">Target</InputLabel>
              <Select
                labelId="target-select-label"
                value={target}
                label="Target"
                onChange={(e) => setTarget(e.target.value as string)}
              >
                <MenuItem value="">
                  <em>Any</em>
                </MenuItem>
                {targetOptions.map(opt => (
                  <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <Button variant="contained" onClick={() => { setPage(1); load(); }} disabled={loading}>Filter</Button>
            <Button variant="outlined" onClick={openExport}>Export</Button>
          </Stack>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>Time</TableCell>
                  <TableCell>Actor</TableCell>
                  <TableCell>IP</TableCell>
                  <TableCell>Action</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap', width: 240, maxWidth: 240 }}>Target</TableCell>
                  <TableCell>Method</TableCell>
                  <TableCell>Details</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r, idx) => (
                  <React.Fragment key={`${r.ts}-${idx}`}>
                    <TableRow>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(r.ts || (r as any).Timestamp || '').toLocaleString()}</TableCell>
                      <TableCell>{r.actor}</TableCell>
                      <TableCell>{r.ip || ''}</TableCell>
                      <TableCell>{r.action}</TableCell>
                      <TableCell sx={{ maxWidth: 240, whiteSpace: 'nowrap' }}>
                        <span style={{ display:'inline-block', maxWidth: 240, overflow:'hidden', textOverflow:'ellipsis', verticalAlign:'bottom' }} title={r.target || ''}>
                          {r.target || ''}
                        </span>
                      </TableCell>
                      <TableCell>{r.method || ''}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        <IconButton size="small" onClick={() => toggleExpanded(idx)} aria-label="Expand details" aria-expanded={!!expanded[idx]} sx={{ mr:1, transition:'transform 0.2s', transform: expanded[idx] ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                          <ChevronRightIcon fontSize="small" />
                        </IconButton>
                        <code style={{ fontSize: 12, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', display:'inline-block', verticalAlign:'middle', maxWidth: 400 }}>
                          {r.details ? JSON.stringify(r.details) : ''}
                        </code>
                      </TableCell>
                    </TableRow>
                    {expanded[idx] && (
                      <TableRow>
                        <TableCell colSpan={7}>
                          <Box sx={{ p:1.25, bgcolor:'rgba(25,118,210,0.06)', border:'1px solid', borderColor:'primary.light', borderRadius:1 }}>
                            {r.details ? (
                              <pre style={{ margin:0, fontFamily:'monospace', fontSize:12, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>
                                {JSON.stringify(r.details, null, 2)}
                              </pre>
                            ) : (
                              <Typography variant="body2" color="text.secondary">No details</Typography>
                            )}
                          </Box>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </Box>
          <Box display="flex" alignItems="center" justifyContent="space-between" mt={2}>
            <TextField select size="small" label="Rows per page" value={rowsPerPage} onChange={(e)=>{ setRowsPerPage(Number(e.target.value)); setPage(1); }}>
              {[10,25,50,100].map(n => <MenuItem key={n} value={n}>{n}</MenuItem>)}
            </TextField>
            <Pagination color="primary" page={page} onChange={(_, p) => setPage(p)} count={Math.max(1, Math.ceil(total / rowsPerPage))} showFirstButton showLastButton />
          </Box>
        </CardContent>
      </Card>

      {/* Export dialog */}
      <Dialog open={exportOpen} onClose={()=>setExportOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Export Audit Log</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} mt={1}>
            <FormControl size="small">
              <InputLabel id="preset-label">Time range</InputLabel>
              <Select labelId="preset-label" label="Time range" value={exportPreset} onChange={(e)=>{
                const v = e.target.value as typeof exportPreset;
                setExportPreset(v);
                if (v !== 'custom') {
                  const range = presetToRange(v);
                  setExportFromLocal(range.fromLocal || '');
                  setExportToLocal(range.toLocal || '');
                }
              }}>
                <MenuItem value="1h">Last 1 hour</MenuItem>
                <MenuItem value="24h">Last 24 hours</MenuItem>
                <MenuItem value="7d">Last 7 days</MenuItem>
                <MenuItem value="today">Today</MenuItem>
                <MenuItem value="all">All time</MenuItem>
                <MenuItem value="custom">Custom range…</MenuItem>
              </Select>
            </FormControl>

            {exportPreset === 'custom' && (
              <Stack direction={{ xs:'column', sm:'row' }} spacing={2}>
                <TextField
                  label="From"
                  type="datetime-local"
                  size="small"
                  value={exportFromLocal}
                  onChange={(e)=>setExportFromLocal(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
                <TextField
                  label="To"
                  type="datetime-local"
                  size="small"
                  value={exportToLocal}
                  onChange={(e)=>setExportToLocal(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
              </Stack>
            )}

            <FormControlLabel control={<Checkbox checked={exportIncludeHeader} onChange={(e)=>setExportIncludeHeader(e.target.checked)} />} label="Include header row" />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ borderTop: theme => `1px solid ${theme.palette.divider}` }}>
          <Button onClick={()=>setExportOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={doExport}>Export CSV</Button>
        </DialogActions>
      </Dialog>
    </ContainerLike>
  );
};

// Minimal container spacing without importing full Container from MUI to keep style consistent here
const ContainerLike: React.FC<{ children: any }> = ({ children }) => (
  <Box sx={{ p: { xs: 1, sm: 2, md: 3 } }}>
    {children}
  </Box>
);

export default AuditLog;
