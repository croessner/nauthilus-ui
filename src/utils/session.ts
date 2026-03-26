import axios from './axiosConfig';

let initialized = false;
let lastCheck = 0;
const CHECK_DEBOUNCE_MS = 1500;

function isPublicAuthPath(pathname: string): boolean {
  return pathname === '/login' || pathname === '/mfa' || pathname === '/oidc/callback' || pathname === '/oidc/callback/';
}

async function checkAndRefreshSession(): Promise<void> {
  const now = Date.now();
  if (now - lastCheck < CHECK_DEBOUNCE_MS) return;
  lastCheck = now;

  // Skip background probes on public auth pages to avoid false-expiry UX.
  if (isPublicAuthPath(window.location.pathname)) {
    return;
  }

  try {
    await axios.get('/api/auth/me', { withCredentials: true });
    // Session is valid; nothing to do
    return;
  } catch (err: any) {
    const status = err?.response?.status;
    if (status !== 401) {
      // Network or other error; do not spam the user
      return;
    }
    // Try silent refresh
    try {
      await axios.post('/api/auth/refresh', {}, { withCredentials: true });
      return; // refreshed successfully
    } catch {
      // Keep this probe silent. Real user-triggered API calls will surface
      // session-expiry notifications through the centralized interceptors.
      return;
    }
  }
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') {
    checkAndRefreshSession().catch(() => {});
  }
}

function onFocus() {
  checkAndRefreshSession().catch(() => {});
}

export function initSessionHandlers(): void {
  if (initialized) return;
  initialized = true;
  window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', onVisibilityChange);
}

export function removeSessionHandlers(): void {
  if (!initialized) return;
  window.removeEventListener('focus', onFocus);
  document.removeEventListener('visibilitychange', onVisibilityChange);
  initialized = false;
}
