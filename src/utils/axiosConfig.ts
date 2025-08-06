import axios from 'axios';
import { getAuthToken } from './apiUtils';

// Configure axios defaults
axios.defaults.withCredentials = true;

// Add a request interceptor to include JWT token in all requests
axios.interceptors.request.use(
  (config) => {
    // Skip adding token for login endpoint
    if (config.url && config.url.includes('/api/auth/login')) {
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
