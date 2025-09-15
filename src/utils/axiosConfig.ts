import axios from 'axios';
import { getAuthToken } from './apiUtils';

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
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default axios;
