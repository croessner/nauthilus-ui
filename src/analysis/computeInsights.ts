// Deterministic insight computation for ClickHouse event data

// Centralized limits for "Top" sections so UI and PDF can reference them
export const TOPN_USERS = 20;
export const TOPN_IPS = 20;
export const TOPN_UAS = 20;
export const TOPN_SERVICES = 10;
export const TOPN_REASONS = 10;
export const TOPN_FEATURE_IPS = 20;
export const TOPN_SPRAYING_IPS = 10;

export type Row = {
  ts?: string;
  client_ip?: string;
  client_net?: string;
  client_port?: number | string;
  geoip_country?: string;
  geoip_iso_codes?: string;
  service?: string;
  local_port?: number | string;
  proto?: string;
  username?: string;
  authenticated?: boolean | string;
  user_found?: boolean | string;
  failed_login_count?: number | string;
  gp_attempts?: number | string;
  gp_ips_per_user?: number | string;
  gp_unique_ips?: number | string;
  gp_unique_users?: number | string;
  prot_active?: boolean | string;
  prot_delay_ms?: number | string;
  prot_reason?: string;
  rbl?: string;
  blocklist?: string;
  pwnd_info?: string;
  ssl_fingerprint?: string;
  xssl_cipher?: string;
  xssl_protocol?: string;
  user_agent?: string;
  hostname?: string;
  account?: string;
  account_field?: string;
  features_raw?: string;
  features?: string[];
};

const toB = (v: any) => v === true || v === 'true' || v === '1' || v === 1;
const toN = (v: any) => (v === '' || v === null || v === undefined ? undefined : Number(v));

export function normalizeRow(r: any): Row {
  // Normalize features column into an array of tokens if present
  let featuresArr: string[] | undefined;
  const raw = (r.features ?? r.feature ?? r.flags ?? '') as any;
  if (Array.isArray(raw)) {
    featuresArr = raw.map((x:any)=>String(x).trim()).filter(Boolean);
  } else if (typeof raw === 'string') {
    const s = raw.trim();
    if (s) {
      featuresArr = s.split(/[;,\s]+/).map(x => x.trim()).filter(Boolean);
    }
  }
  return {
    ts: r.ts,
    client_ip: r.client_ip,
    client_net: r.client_net,
    client_port: toN(r.client_port),
    geoip_country: r.geoip_country,
    geoip_iso_codes: r.geoip_iso_codes,
    service: r.service,
    local_port: toN(r.local_port),
    proto: r.proto,
    username: r.username?.toLowerCase?.(),
    authenticated: toB(r.authenticated),
    user_found: toB(r.user_found),
    failed_login_count: toN(r.failed_login_count) ?? 0,
    gp_attempts: toN(r.gp_attempts),
    gp_ips_per_user: toN(r.gp_ips_per_user),
    gp_unique_ips: toN(r.gp_unique_ips),
    gp_unique_users: toN(r.gp_unique_users),
    prot_active: toB(r.prot_active),
    prot_delay_ms: toN(r.prot_delay_ms),
    prot_reason: r.prot_reason,
    rbl: r.rbl,
    blocklist: r.blocklist,
    pwnd_info: r.pwnd_info,
    ssl_fingerprint: r.ssl_fingerprint,
    xssl_cipher: r.xssl_cipher,
    xssl_protocol: r.xssl_protocol,
    user_agent: r.user_agent,
    hostname: r.hostname,
    account: r.account,
    account_field: r.account_field,
    features_raw: typeof raw === 'string' ? raw : undefined,
    features: featuresArr,
  };
}

export function groupCount<T, K extends string | number>(arr: T[], keyFn: (x: T) => K | undefined) {
  const m = new Map<K, number>();
  for (const a of arr) {
    const k = keyFn(a);
    if (k === undefined || k === null || k === '' as any) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export function unique<T, K>(arr: T[], keyFn: (x: T) => K) {
  const s = new Set<K>();
  for (const a of arr) s.add(keyFn(a));
  return s.size;
}

export function bucketByMinute(rows: Row[]) {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (!r.ts) continue;
    const t = new Date(r.ts);
    if (isNaN(t.getTime())) continue;
    const key = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')} ${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}`;
    m.set(key, (m.get(key) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

export function zScore(values: number[]) {
  const n = values.length; if (!n) return values.map(() => 0);
  const mean = values.reduce((a,b)=>a+b,0)/n;
  const sd = Math.sqrt(values.reduce((a,b)=>a+(b-mean)*(b-mean),0)/n) || 1;
  return values.map(v => (v-mean)/sd);
}

export function detectPeaks(series: [string, number][], threshold = 3) {
  const zs = zScore(series.map(([,v]) => v));
  return series.filter((p, i) => zs[i] >= threshold);
}

export function computeInsights(rowsRaw: any[]) {
  const rows = rowsRaw.map(normalizeRow);
  const total = rows.length;
  const timeMin = rows.reduce<string | undefined>((m, r) => !m || (r.ts! < m) ? r.ts : m, undefined);
  const timeMax = rows.reduce<string | undefined>((m, r) => !m || (r.ts! > m) ? r.ts : m, undefined);

  const successes = rows.filter(r => r.authenticated).length;
  const failures = total - successes;

  const uniqIPs = unique(rows.filter(r => !!r.client_ip), r => r.client_ip!);
  const uniqUsers = unique(rows.filter(r => !!r.username), r => r.username!);
  const uniqUA = unique(rows.filter(r => !!r.user_agent), r => r.user_agent!);
  const uniqFP = unique(rows.filter(r => !!r.ssl_fingerprint), r => r.ssl_fingerprint!);

  // Countries (totals and success/failure breakdown)
  const countryMap = new Map<string, { country: string; success: number; failure: number; total: number }>();
  for (const r of rows) {
    const c = (r.geoip_country || '—') as string;
    if (!countryMap.has(c)) countryMap.set(c, { country: c, success: 0, failure: 0, total: 0 });
    const ent = countryMap.get(c)!;
    const ok = Boolean(r.authenticated);
    if (ok) ent.success++; else ent.failure++;
    ent.total++;
  }
  const countriesAll = [...countryMap.values()].sort((a,b)=> b.total - a.total);
  const topCountries = countriesAll.slice(0, 10).map(e => [e.country, e.total] as [string, number]);

  // Users (totals and success/failure breakdown)
  const userMap = new Map<string, { username: string; success: number; failure: number; total: number }>();
  for (const r of rows) {
    const u = (r.username || '—') as string;
    if (!userMap.has(u)) userMap.set(u, { username: u, success: 0, failure: 0, total: 0 });
    const ent = userMap.get(u)!;
    const ok = Boolean(r.authenticated);
    if (ok) ent.success++; else ent.failure++;
    ent.total++;
  }
  const usersAll = [...userMap.values()].sort((a,b)=> b.total - a.total);
  const topUsersBreakdown = usersAll.slice(0, TOPN_USERS);

  const topIPs = groupCount(rows, r => r.client_ip).slice(0, TOPN_IPS);
  const topUsers = groupCount(rows, r => r.username).slice(0, TOPN_USERS);
  const topServices = groupCount(rows, r => (r.service ?? String(r.local_port ?? 'unknown'))).slice(0, TOPN_SERVICES);
  const topReasons = groupCount(rows, r => r.prot_reason).slice(0, TOPN_REASONS);
  const topUserAgents = groupCount(rows, r => r.user_agent).slice(0, TOPN_UAS);

  // IPs (success/failure breakdown)
  const ipMap = new Map<string, { ip: string; success: number; failure: number; total: number }>();
  for (const r of rows) {
    const ip = (r.client_ip || '—') as string;
    if (!ipMap.has(ip)) ipMap.set(ip, { ip, success: 0, failure: 0, total: 0 });
    const ent = ipMap.get(ip)!;
    if (r.authenticated) ent.success++; else ent.failure++;
    ent.total++;
  }
  const ipsAll = [...ipMap.values()].sort((a,b)=> b.total - a.total);
  const topIPsBreakdown = ipsAll.slice(0, TOPN_IPS);

  // User agents (success/failure breakdown)
  const uaMap = new Map<string, { ua: string; success: number; failure: number; total: number }>();
  for (const r of rows) {
    const ua = (r.user_agent || '—') as string;
    if (!uaMap.has(ua)) uaMap.set(ua, { ua, success: 0, failure: 0, total: 0 });
    const ent = uaMap.get(ua)!;
    if (r.authenticated) ent.success++; else ent.failure++;
    ent.total++;
  }
  const uasAll = [...uaMap.values()].sort((a,b)=> b.total - a.total);
  const topUserAgentsBreakdown = uasAll.slice(0, TOPN_UAS);

  // Count Blocklist/RBL hits from either legacy fields or normalized features[]
  const blocklistHits = rows.filter(r => {
    const feats = (r.features || []) as string[];
    return Boolean(r.blocklist) || Boolean(r.rbl) || feats.includes('blocklist') || feats.includes('rbl');
  }).length;
  const protActive = rows.filter(r => r.prot_active).length;

  // ===== Features analysis =====
  type FeatureAgg = { feature: string; success: number; failure: number; total: number; uniqueIPs: Set<string> };
  const featuresMap = new Map<string, FeatureAgg>();
  const rowsWithAnyFeature = rows.filter(r => Array.isArray(r.features) && r.features.length > 0);
  for (const r of rowsWithAnyFeature) {
    const tags = r.features as string[];
    for (const tagRaw of tags) {
      const tag = String(tagRaw || '').trim();
      if (!tag) continue;
      if (!featuresMap.has(tag)) featuresMap.set(tag, { feature: tag, success: 0, failure: 0, total: 0, uniqueIPs: new Set<string>() });
      const agg = featuresMap.get(tag)!;
      if (r.authenticated) agg.success++; else agg.failure++;
      agg.total++;
      if (r.client_ip) agg.uniqueIPs.add(r.client_ip);
    }
  }
  const featureStats = [...featuresMap.values()].map(x => ({
    feature: x.feature,
    success: x.success,
    failure: x.failure,
    total: x.total,
    uniqueIPs: x.uniqueIPs.size,
    failureRate: x.total ? x.failure / x.total : 0,
  })).sort((a,b)=> b.total - a.total);

  const failuresWithAnyFeature = rowsWithAnyFeature.filter(r => !r.authenticated).length;
  const shareFailuresWithAnyFeature = failures ? failuresWithAnyFeature / failures : 0;

  // Top IPs per feature (success/failure breakdown per IP within feature)
  const topIPsByFeature: Record<string, { ip: string; success: number; failure: number; total: number }[]> = {};
  for (const [feat, _] of featuresMap.entries()) {
    const m = new Map<string, { ip: string; success: number; failure: number; total: number }>();
    for (const r of rowsWithAnyFeature) {
      if (!r.features || !r.features.includes(feat)) continue;
      const ip = (r.client_ip || '—') as string;
      if (!m.has(ip)) m.set(ip, { ip, success: 0, failure: 0, total: 0 });
      const ent = m.get(ip)!;
      if (r.authenticated) ent.success++; else ent.failure++;
      ent.total++;
    }
    topIPsByFeature[feat] = [...m.values()].sort((a,b)=> b.total - a.total).slice(0, TOPN_FEATURE_IPS);
  }
  // Aggregated 'All' across any feature
  if (rowsWithAnyFeature.length) {
    const mAll = new Map<string, { ip: string; success: number; failure: number; total: number }>();
    for (const r of rowsWithAnyFeature) {
      const ip = (r.client_ip || '—') as string;
      if (!mAll.has(ip)) mAll.set(ip, { ip, success: 0, failure: 0, total: 0 });
      const ent = mAll.get(ip)!;
      if (r.authenticated) ent.success++; else ent.failure++;
      ent.total++;
    }
    topIPsByFeature['All'] = [...mAll.values()].sort((a,b)=> b.total - a.total).slice(0, TOPN_FEATURE_IPS);
  }
  // Feature keys sorted by total (from stats), with 'All' first when present
  const sortedKeys = Object.keys(topIPsByFeature).sort((a,b)=>{
    const at = a === 'All' ? Number.MAX_SAFE_INTEGER : (featureStats.find(s=>s.feature===a)?.total || 0);
    const bt = b === 'All' ? Number.MAX_SAFE_INTEGER : (featureStats.find(s=>s.feature===b)?.total || 0);
    return bt - at;
  });
  const featureKeys = sortedKeys;

  const usernamesPerIP = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.client_ip || !r.username) continue;
    if (!usernamesPerIP.has(r.client_ip)) usernamesPerIP.set(r.client_ip, new Set());
    usernamesPerIP.get(r.client_ip)!.add(r.username);
  }
  const sprayingIPs = [...usernamesPerIP.entries()].filter(([, s]) => s.size >= 5).sort((a,b)=>b[1].size-a[1].size);

  const seriesMin = bucketByMinute(rows);
  const peaks = detectPeaks(seriesMin, 3);

  return {
    meta: { total, timeMin, timeMax },
    kpis: { successes, failures, uniqIPs, uniqUsers, uniqUA, uniqFP, blocklistHits, protActive },
    top: { topCountries, topIPs, topUsers, topServices, topReasons, topUserAgents, topCountriesAllBreakdown: countriesAll, topUsersBreakdown, topIPsBreakdown, topUserAgentsBreakdown },
    features: { stats: featureStats, topIPsByFeature, featureKeys, failuresWithAnyFeature, shareFailuresWithAnyFeature },
    abuse: { sprayingIPs: sprayingIPs.slice(0, TOPN_SPRAYING_IPS) },
    time: { perMinute: seriesMin, peaks },
    rows, // normalized rows (for downstream use)
  };
}
