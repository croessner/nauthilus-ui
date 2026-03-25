// Shared hook utilities to avoid duplication across components.
// Provides endpoint suggestion extraction from one or many hook/config sources.
export const CANONICAL_CLICKHOUSE_ENDPOINT = '/api/v1/custom/clickhouse-query';

function normalizeEndpointCandidate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Keep already absolute custom-hook paths untouched.
  if (trimmed.startsWith('/api/v1/custom')) return trimmed;
  if (trimmed.startsWith('api/v1/custom')) return `/${trimmed}`;

  // Convert hook locations to backend custom-hook endpoint paths.
  if (trimmed.startsWith('/')) return `/api/v1/custom${trimmed}`;

  return `/api/v1/custom/${trimmed}`;
}

/**
 * Normalizes custom hook endpoint paths to the canonical backend format.
 * Returns an empty string when the input is blank after trimming.
 */
export function normalizeCustomHookEndpointPath(value: string): string {
  return normalizeEndpointCandidate(value) || '';
}

const SUPPORTED_HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

function normalizeHttpMethod(value: string): string | null {
  const method = value.trim().toUpperCase();
  if (!method) return null;
  return SUPPORTED_HTTP_METHODS.has(method) ? method : null;
}

type HookEndpointCandidate = {
  endpointPath: string;
  method?: string;
};

function extractEndpointCandidates(source: any): HookEndpointCandidate[] {
  const opts: HookEndpointCandidate[] = [];

  const add = (v: any) => {
    if (!v) return;
    if (typeof v === 'string') {
      const normalized = normalizeEndpointCandidate(v);
      if (normalized) opts.push({ endpointPath: normalized });
      return;
    }
    const ep = (v && (v.endpoint_path || v.http_location || v.path || v.endpoint || v.url_path));
    if (typeof ep === 'string' && ep.trim()) {
      const normalized = normalizeEndpointCandidate(ep);
      if (normalized) {
        const rawMethod = typeof v.http_method === 'string' ? v.http_method : (typeof v.method === 'string' ? v.method : '');
        const method = rawMethod ? (normalizeHttpMethod(rawMethod) || undefined) : undefined;
        opts.push({ endpointPath: normalized, method });
      }
    }
  };

  if (Array.isArray(source)) {
    source.forEach(add);
    return opts;
  }

  if (source && typeof source === 'object') {
    Object.keys(source).forEach((k) => add((source as any)[k]));
    if (Array.isArray((source as any).custom_hooks)) (source as any).custom_hooks.forEach(add);
    if (Array.isArray((source as any).hooks)) (source as any).hooks.forEach(add);
    if ((source as any).lua && Array.isArray((source as any).lua?.custom_hooks)) (source as any).lua.custom_hooks.forEach(add);
  }

  return opts;
}

export function getKnownHookEndpointSuggestions(...sources: any[]): string[] {
  const allSources = sources.length > 0 ? sources : [null];
  const normalized = allSources
    .flatMap((source) => extractEndpointCandidates(source))
    .map((candidate) => candidate.endpointPath);

  return Array.from(new Set(normalized)).sort();
}

export function getKnownHookHttpMethodForEndpoint(endpointPath: string, ...sources: any[]): string | null {
  const normalizedEndpoint = normalizeEndpointCandidate(endpointPath);
  if (!normalizedEndpoint) return null;

  const allSources = sources.length > 0 ? sources : [null];
  const candidates = allSources.flatMap((source) => extractEndpointCandidates(source));

  for (const candidate of candidates) {
    if (candidate.endpointPath === normalizedEndpoint && candidate.method) {
      return candidate.method;
    }
  }

  return null;
}

export function hasCanonicalClickhouseEndpoint(...sources: any[]): boolean {
  return getKnownHookEndpointSuggestions(...sources).includes(CANONICAL_CLICKHOUSE_ENDPOINT);
}
