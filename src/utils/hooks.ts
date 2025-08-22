// Shared hook utilities to avoid duplication across components
// Provides endpoint suggestion extraction for runtime hooks structures.

export function getKnownHookEndpointSuggestions(hooks: any): string[] {
  const opts: string[] = [];

  const add = (v: any) => {
    if (!v) return;
    if (typeof v === 'string') {
      if (v.startsWith('/')) opts.push(v);
      return;
    }
    const ep = (v && (v.endpoint_path || v.http_location || v.path || v.endpoint || v.url_path));
    if (typeof ep === 'string' && ep.startsWith('/')) opts.push(ep);
  };

  const h: any = hooks ?? {};
  if (Array.isArray(h)) {
    h.forEach(add);
  } else if (h && typeof h === 'object') {
    Object.keys(h).forEach((k) => add((h as any)[k]));
    if (Array.isArray((h as any).custom_hooks)) (h as any).custom_hooks.forEach(add);
    if (Array.isArray((h as any).hooks)) (h as any).hooks.forEach(add);
    if ((h as any).lua && Array.isArray((h as any).lua?.custom_hooks)) (h as any).lua.custom_hooks.forEach(add);
  }

  const normalized = opts.map((p) => (p.startsWith('/api/v1/custom') ? p : `/api/v1/custom${p}`));
  return Array.from(new Set(normalized)).sort();
}
