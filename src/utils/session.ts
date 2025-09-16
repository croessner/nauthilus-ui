import axios from './axiosConfig';
import { getProxyOrigin } from './apiUtils';

let initialized = false;
let lastCheck = 0;
const CHECK_DEBOUNCE_MS = 1500;

async function checkAndRefreshSession(): Promise<void> {
  const now = Date.now();
  if (now - lastCheck < CHECK_DEBOUNCE_MS) return;
  lastCheck = now;

  try {
    await axios.get(`${getProxyOrigin()}/api/auth/me`, { withCredentials: true });
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
      await axios.post(`${getProxyOrigin()}/api/auth/refresh`, {}, { withCredentials: true });
      return; // refreshed successfully
    } catch {
      // Inform user with unified dialog
      try {
        const { notifySessionExpired } = await import('./notify');
        notifySessionExpired('Your session has expired. Please sign in again.');
      } catch {
        window.alert('Your session has expired. Please sign in again.');
      }
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
