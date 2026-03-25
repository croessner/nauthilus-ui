const SSH_PASSPHRASE_CACHE_KEY_PREFIX = 'nauthilus_ui:ssh_passphrase_cache:v2';

export type SSHPassphraseCacheScope = 'git' | 'runtime';

interface SSHPassphraseCachePayload {
  passphrase: string;
  expiresAt: number;
}

function buildCacheKey(scope: SSHPassphraseCacheScope): string {
  return `${SSH_PASSPHRASE_CACHE_KEY_PREFIX}:${scope}`;
}

export function clearCachedSSHPassphrase(scope: SSHPassphraseCacheScope = 'git'): void {
  try {
    window.sessionStorage.removeItem(buildCacheKey(scope));
  } catch {
    // Ignore browser storage failures.
  }
}

export function cacheSSHPassphrase(
  passphrase: string,
  cacheSeconds: number,
  scope: SSHPassphraseCacheScope = 'git',
): void {
  const trimmedPassphrase = String(passphrase || '');
  if (!trimmedPassphrase) {
    clearCachedSSHPassphrase(scope);
    return;
  }

  // -1 means always ask and therefore no browser-side caching.
  if (cacheSeconds < 0) {
    clearCachedSSHPassphrase(scope);
    return;
  }

  const ttlMs = Math.max(0, Math.floor(cacheSeconds)) * 1000;
  const payload: SSHPassphraseCachePayload = {
    passphrase: trimmedPassphrase,
    expiresAt: Date.now() + ttlMs,
  };

  try {
    window.sessionStorage.setItem(buildCacheKey(scope), JSON.stringify(payload));
  } catch {
    // Ignore browser storage failures.
  }
}

export function readCachedSSHPassphrase(scope: SSHPassphraseCacheScope = 'git'): string {
  try {
    const raw = window.sessionStorage.getItem(buildCacheKey(scope));
    if (!raw) {
      return '';
    }

    const parsed = JSON.parse(raw) as SSHPassphraseCachePayload;
    if (!parsed || typeof parsed.passphrase !== 'string' || typeof parsed.expiresAt !== 'number') {
      clearCachedSSHPassphrase(scope);
      return '';
    }

    if (parsed.expiresAt <= Date.now()) {
      clearCachedSSHPassphrase(scope);
      return '';
    }

    return parsed.passphrase;
  } catch {
    clearCachedSSHPassphrase(scope);
    return '';
  }
}
