import axios from 'axios';
import { getAuthToken, getProxyOrigin } from './apiUtils';

// Configure axios defaults
axios.defaults.withCredentials = true;

// Add a request interceptor to include JWT token in all requests
axios.interceptors.request.use(
  (config) => {
    // Skip adding token for unauthenticated auth endpoints
    if (
      config.url && (
        config.url.includes('/api/auth/login') ||
        config.url.includes('/api/auth/refresh') ||
        config.url.includes('/api/auth/logout') ||
        config.url.includes('/api/auth/me') ||
        config.url.includes('/api/auth/webauthn/') ||
        config.url.includes('/api/auth/totp/')
      )
    ) {
      return config;
    }

    const token = getAuthToken();
    if (token) {
      (config.headers as any).Authorization = `Bearer ${token}`;
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

async function refreshSession(): Promise<boolean> {
  try {
    await axios.post(`${getProxyOrigin()}/api/auth/refresh`, {}, { withCredentials: true });
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

    if (!isRefreshing) {
      isRefreshing = true;
      try {
        const ok = await refreshSession();
        pendingResolvers.forEach((fn) => fn(ok));
        pendingResolvers = [];
        if (ok) {
          // Retry the original request
          return axios(originalRequest);
        }
        // Session expired: inform user with a unified dialog
        try {
          const { notifySessionExpired } = await import('./notify');
          notifySessionExpired('Your session has expired. Please sign in again.');
        } catch {
          // Fallback just in case dynamic import fails
          window.alert('Your session has expired. Please sign in again.');
        }
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    }

    // Wait for the in-flight refresh to finish
    return new Promise((resolve, reject) => {
      pendingResolvers.push((ok) => {
        if (ok) resolve(axios(originalRequest));
        else reject(error);
      });
    });
  }
);

export default axios;
