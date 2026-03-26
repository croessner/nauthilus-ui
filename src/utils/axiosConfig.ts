import axios from 'axios';
import { attachCSRFHeader, isMutatingMethod } from './csrf';

// Configure axios defaults
axios.defaults.withCredentials = true;

// Add a request interceptor to attach CSRF headers for mutating requests.
axios.interceptors.request.use(
  async (config) => {
    if (config.url && !config.url.includes('/api/auth/csrf') && isMutatingMethod(config.method)) {
      config.headers = await attachCSRFHeader(config.headers as any);
    }

    // Skip adding token for unauthenticated auth endpoints
    if (
      config.url && (
        config.url.includes('/api/auth/login') ||
        config.url.includes('/api/auth/refresh') ||
        config.url.includes('/api/auth/logout') ||
        config.url.includes('/api/auth/totp/verify') ||
        config.url.includes('/api/auth/webauthn/begin-login') ||
        config.url.includes('/api/auth/webauthn/finish-login') ||
        config.url.includes('/api/auth/oidc/')
      )
    ) {
      return config;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Global 401 handling with one-time refresh and retry
let isRefreshing = false;
let pendingResolvers: Array<(ok: boolean) => void> = [];

function getRequestPath(url: string): string {
  try {
    return new URL(url, window.location.origin).pathname;
  } catch {
    return url;
  }
}

function isProxyEndpoint(url: string): boolean {
  return getRequestPath(url).startsWith('/proxy/');
}

function hasSessionAuthRequiredHeader(headers: any): boolean {
  const marker = headers?.['x-nauthilus-auth-required'] ?? headers?.['X-Nauthilus-Auth-Required'];
  if (!marker) {
    return false;
  }

  const value = Array.isArray(marker) ? String(marker[0] ?? '') : String(marker);
  return value === '1' || value.toLowerCase() === 'true';
}

function shouldNotifySessionExpired(url: string, response: any): boolean {
  if (!isProxyEndpoint(url)) {
    return true;
  }

  // Proxy endpoints can return upstream 401 (backend auth failure) that are
  // unrelated to UI session state. Only treat them as session expiry when the
  // API explicitly marks the response as UI-auth-required.
  return hasSessionAuthRequiredHeader(response?.headers);
}

async function notifySessionExpiredDialog(): Promise<void> {
  try {
    const { notifySessionExpired } = await import('./notify');
    notifySessionExpired('Your session has expired. Please sign in again.');
  } catch {
    // Fallback just in case dynamic import fails
    window.alert('Your session has expired. Please sign in again.');
  }
}

async function refreshSession(): Promise<boolean> {
  try {
    // Use relative URL to ensure cookies for the current origin are sent reliably in dev/prod
    await axios.post('/api/auth/refresh', {}, { withCredentials: true });
    return true;
  } catch {
    return false;
  }
}

axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { response, config } = error || {};
    const originalRequest = config || {};

    if (!response || response.status !== 401) {
      return Promise.reject(error);
    }

    const url: string = (originalRequest && originalRequest.url) || '';
    if (
      !url ||
      url.includes('/api/auth/login') ||
      url.includes('/api/auth/refresh') ||
      url.includes('/api/auth/logout') ||
      url.includes('/api/auth/me')
    ) {
      // Do not attempt refresh for auth endpoints themselves
      return Promise.reject(error);
    }

    // Already retried once after refresh. Avoid refresh loops.
    if (originalRequest.__nauthilusRetry) {
      if (shouldNotifySessionExpired(url, response)) {
        await notifySessionExpiredDialog();
      }
      return Promise.reject(error);
    }

    if (!isRefreshing) {
      isRefreshing = true;
      try {
        const ok = await refreshSession();
        pendingResolvers.forEach((fn) => fn(ok));
        pendingResolvers = [];
        if (ok) {
          // Retry the original request
          return axios({ ...originalRequest, __nauthilusRetry: true });
        }
        // Session expired: inform user with a unified dialog
        if (shouldNotifySessionExpired(url, response)) {
          await notifySessionExpiredDialog();
        }
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    }

    // Wait for the in-flight refresh to finish
    return new Promise((resolve, reject) => {
      pendingResolvers.push((ok) => {
        if (ok) resolve(axios({ ...originalRequest, __nauthilusRetry: true }));
        else reject(error);
      });
    });
  }
);

export default axios;
