// User management and authentication for Nauthilus UI
// This module provides user management and authentication independently of the Nauthilus service

import { jwtDecode } from 'jwt-decode';
import CryptoJS from 'crypto-js';
import axios from 'axios';

// Helper function to get the current user ID
// In a real application, this would come from an authentication system
const getCurrentUserId = (): string => {
  // For simplicity, we'll use a fixed user ID
  // In a real application, this would be the authenticated user's ID
  return 'default-user';
};

// User interface
export interface User {
  username: string;
  passwordHash: string;
  roles: string[];
}

// Configuration interface
export interface UserManagerConfig {
  users: User[];
  jwtSecret: string;
  tokenExpiry: number; // in seconds
  refreshTokenExpiry: number; // in seconds
}

// Default configuration
const DEFAULT_CONFIG: UserManagerConfig = {
  users: [
    {
      username: 'admin',
      // Default password: 'admin' (hashed)
      passwordHash: CryptoJS.SHA256('admin').toString(),
      roles: ['admin']
    }
  ],
  jwtSecret: 'nauthilus-ui-default-secret-key-change-in-production',
  tokenExpiry: 3600, // 1 hour
  refreshTokenExpiry: 86400 // 24 hours
};

// Storage keys
const CONFIG_STORAGE_KEY = 'nauthilus-ui-user-config';
const TOKEN_STORAGE_KEY = 'token';
const REFRESH_TOKEN_STORAGE_KEY = 'refresh_token';

// Load configuration from MongoDB (with localStorage fallback)
export const loadConfig = async (): Promise<UserManagerConfig> => {
  const userId = getCurrentUserId();

  try {
    // Try to load from API first
    const response = await axios.get(`/api/userconfig/${userId}`);
    return response.data.config;
  } catch (error) {
    console.log('Failed to load user config from API, falling back to localStorage:', error);

    // Fallback to localStorage if API fails
    const storedConfig = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (storedConfig) {
      try {
        const config = JSON.parse(storedConfig);

        // Save to API for future use
        try {
          await axios.post(`/api/userconfig/${userId}`, { config });
        } catch (saveError) {
          console.error('Failed to save user config to API:', saveError);
        }

        return config;
      } catch (parseError) {
        console.error('Error parsing stored user configuration:', parseError);
      }
    }

    // If all else fails, return default config
    return DEFAULT_CONFIG;
  }
};

// Synchronous version for internal use
export const loadConfigSync = (): UserManagerConfig => {
  const storedConfig = localStorage.getItem(CONFIG_STORAGE_KEY);
  if (storedConfig) {
    try {
      return JSON.parse(storedConfig);
    } catch (error) {
      console.error('Error parsing stored user configuration:', error);
    }
  }
  return DEFAULT_CONFIG;
};

// Save configuration to MongoDB (with localStorage fallback)
export const saveConfig = async (config: UserManagerConfig): Promise<void> => {
  const userId = getCurrentUserId();

  try {
    // Save to API
    await axios.post(`/api/userconfig/${userId}`, { config });
  } catch (error) {
    console.error('Failed to save user config to API:', error);
  }

  // Always save to localStorage as fallback
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
};

// Add or update a user
export const addUser = async (username: string, password: string, roles: string[] = ['user']): Promise<void> => {
  const config = await loadConfig();
  const passwordHash = CryptoJS.SHA256(password).toString();

  const existingUserIndex = config.users.findIndex(user => user.username === username);
  if (existingUserIndex >= 0) {
    // Update existing user
    config.users[existingUserIndex] = { username, passwordHash, roles };
  } else {
    // Add new user
    config.users.push({ username, passwordHash, roles });
  }

  await saveConfig(config);
};

// Synchronous version for internal use
export const addUserSync = (username: string, password: string, roles: string[] = ['user']): void => {
  const config = loadConfigSync();
  const passwordHash = CryptoJS.SHA256(password).toString();

  const existingUserIndex = config.users.findIndex(user => user.username === username);
  if (existingUserIndex >= 0) {
    // Update existing user
    config.users[existingUserIndex] = { username, passwordHash, roles };
  } else {
    // Add new user
    config.users.push({ username, passwordHash, roles });
  }

  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));

  // Also save to API asynchronously
  saveConfig(config).catch(error => {
    console.error('Failed to save user config to API:', error);
  });
};

// Remove a user
export const removeUser = async (username: string): Promise<void> => {
  const config = await loadConfig();
  config.users = config.users.filter(user => user.username !== username);
  await saveConfig(config);
};

// Get all users (without password hashes)
export const getUsers = async (): Promise<Omit<User, 'passwordHash'>[]> => {
  const config = await loadConfig();
  return config.users.map(({ username, roles }) => ({ username, roles }));
};

// Synchronous version for internal use
export const getUsersSync = (): Omit<User, 'passwordHash'>[] => {
  const config = loadConfigSync();
  return config.users.map(({ username, roles }) => ({ username, roles }));
};

// Update JWT secret
export const updateJwtSecret = async (secret: string): Promise<void> => {
  const config = await loadConfig();
  config.jwtSecret = secret;
  await saveConfig(config);
};

// Update token expiry times
export const updateTokenExpiry = async (tokenExpiry: number, refreshTokenExpiry: number): Promise<void> => {
  const config = await loadConfig();
  config.tokenExpiry = tokenExpiry;
  config.refreshTokenExpiry = refreshTokenExpiry;
  await saveConfig(config);
};

// Generate a JWT token
const generateToken = (user: User, expiry: number): string => {
  const config = loadConfigSync();
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.username,
    roles: user.roles,
    iat: now,
    exp: now + expiry
  };

  const headerBase64 = btoa(JSON.stringify(header));
  const payloadBase64 = btoa(JSON.stringify(payload));

  const signature = CryptoJS.HmacSHA256(
    `${headerBase64}.${payloadBase64}`,
    config.jwtSecret
  ).toString(CryptoJS.enc.Base64);

  return `${headerBase64}.${payloadBase64}.${signature}`;
};

// Authenticate a user and generate tokens
export const authenticate = async (username: string, password: string): Promise<{ token: string, refreshToken: string } | null> => {
  const config = await loadConfig();
  const passwordHash = CryptoJS.SHA256(password).toString();

  const user = config.users.find(u => u.username === username && u.passwordHash === passwordHash);
  if (!user) {
    return null;
  }

  const token = generateToken(user, config.tokenExpiry);
  const refreshToken = generateToken(user, config.refreshTokenExpiry);

  // Store tokens in MongoDB
  const userId = getCurrentUserId();
  try {
    await axios.post(`/api/tokens/${userId}`, { token, refreshToken });
  } catch (error) {
    console.error('Failed to save tokens to API:', error);
  }

  // Always store in localStorage as fallback
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
  localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken);

  return { token, refreshToken };
};

// Synchronous version for internal use
export const authenticateSync = (username: string, password: string): { token: string, refreshToken: string } | null => {
  const config = loadConfigSync();
  const passwordHash = CryptoJS.SHA256(password).toString();

  const user = config.users.find(u => u.username === username && u.passwordHash === passwordHash);
  if (!user) {
    return null;
  }

  const token = generateToken(user, config.tokenExpiry);
  const refreshToken = generateToken(user, config.refreshTokenExpiry);

  // Store tokens in localStorage
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
  localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken);

  // Also save to API asynchronously
  const userId = getCurrentUserId();
  axios.post(`/api/tokens/${userId}`, { token, refreshToken })
    .catch(error => {
      console.error('Failed to save tokens to API:', error);
    });

  return { token, refreshToken };
};

// Validate a token
export const validateToken = (token: string): boolean => {
  try {
    const decoded = jwtDecode<{ exp: number }>(token);
    const now = Math.floor(Date.now() / 1000);
    return decoded.exp > now;
  } catch (error) {
    return false;
  }
};

// Refresh a token
export const refreshToken = async (): Promise<{ token: string, refreshToken: string } | null> => {
  // Try to get tokens from API first
  const userId = getCurrentUserId();
  let currentRefreshToken: string | null = null;

  try {
    const response = await axios.get(`/api/tokens/${userId}`);
    currentRefreshToken = response.data.refreshToken;
  } catch (error) {
    console.log('Failed to get tokens from API, falling back to localStorage:', error);
    // Fallback to localStorage
    currentRefreshToken = localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
  }

  if (!currentRefreshToken || !validateToken(currentRefreshToken)) {
    return null;
  }

  try {
    const decoded = jwtDecode<{ sub: string, roles: string[] }>(currentRefreshToken);
    const user = {
      username: decoded.sub,
      passwordHash: '', // Not needed for token generation
      roles: decoded.roles
    };

    const config = await loadConfig();
    const newToken = generateToken(user, config.tokenExpiry);
    const newRefreshToken = generateToken(user, config.refreshTokenExpiry);

    // Store new tokens in MongoDB
    try {
      await axios.post(`/api/tokens/${userId}`, { token: newToken, refreshToken: newRefreshToken });
    } catch (error) {
      console.error('Failed to save tokens to API:', error);
    }

    // Always store in localStorage as fallback
    localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, newRefreshToken);

    return { token: newToken, refreshToken: newRefreshToken };
  } catch (error) {
    return null;
  }
};

// Synchronous version for internal use
export const refreshTokenSync = (): { token: string, refreshToken: string } | null => {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
  if (!refreshToken || !validateToken(refreshToken)) {
    return null;
  }

  try {
    const decoded = jwtDecode<{ sub: string, roles: string[] }>(refreshToken);
    const user = {
      username: decoded.sub,
      passwordHash: '', // Not needed for token generation
      roles: decoded.roles
    };

    const config = loadConfigSync();
    const newToken = generateToken(user, config.tokenExpiry);
    const newRefreshToken = generateToken(user, config.refreshTokenExpiry);

    // Store new tokens in localStorage
    localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, newRefreshToken);

    // Also save to API asynchronously
    const userId = getCurrentUserId();
    axios.post(`/api/tokens/${userId}`, { token: newToken, refreshToken: newRefreshToken })
      .catch(error => {
        console.error('Failed to save tokens to API:', error);
      });

    return { token: newToken, refreshToken: newRefreshToken };
  } catch (error) {
    return null;
  }
};

// Logout
export const logout = async (): Promise<void> => {
  // Remove tokens from MongoDB
  const userId = getCurrentUserId();
  try {
    await axios.delete(`/api/tokens/${userId}`);
  } catch (error) {
    console.error('Failed to delete tokens from API:', error);
  }

  // Always remove from localStorage as well
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
};

// Synchronous version for internal use
export const logoutSync = (): void => {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);

  // Also delete from API asynchronously
  const userId = getCurrentUserId();
  axios.delete(`/api/tokens/${userId}`)
    .catch(error => {
      console.error('Failed to delete tokens from API:', error);
    });
};

// Check if user is authenticated
export const isAuthenticated = async (): Promise<boolean> => {
  // Try to get token from API first
  const userId = getCurrentUserId();
  let token: string | null = null;

  try {
    const response = await axios.get(`/api/tokens/${userId}`);
    token = response.data.token;
  } catch (error) {
    console.log('Failed to get token from API, falling back to localStorage:', error);
    // Fallback to localStorage
    token = localStorage.getItem(TOKEN_STORAGE_KEY);
  }

  return !!token && validateToken(token);
};

// Synchronous version for internal use
export const isAuthenticatedSync = (): boolean => {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  return !!token && validateToken(token);
};

// Get current user
export const getCurrentUser = async (): Promise<{ username: string, roles: string[] } | null> => {
  // Try to get token from API first
  const userId = getCurrentUserId();
  let token: string | null = null;

  try {
    const response = await axios.get(`/api/tokens/${userId}`);
    token = response.data.token;
  } catch (error) {
    console.log('Failed to get token from API, falling back to localStorage:', error);
    // Fallback to localStorage
    token = localStorage.getItem(TOKEN_STORAGE_KEY);
  }

  if (!token || !validateToken(token)) {
    return null;
  }

  try {
    const decoded = jwtDecode<{ sub: string, roles: string[] }>(token);
    return {
      username: decoded.sub,
      roles: decoded.roles
    };
  } catch (error) {
    return null;
  }
};

// Synchronous version for internal use
export const getCurrentUserSync = (): { username: string, roles: string[] } | null => {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (!token || !validateToken(token)) {
    return null;
  }

  try {
    const decoded = jwtDecode<{ sub: string, roles: string[] }>(token);
    return {
      username: decoded.sub,
      roles: decoded.roles
    };
  } catch (error) {
    return null;
  }
};

// Initialize with default configuration if none exists
export const initialize = async (): Promise<void> => {
  const userId = getCurrentUserId();

  try {
    // Check if config exists in MongoDB
    await axios.get(`/api/userconfig/${userId}`);
    // If we get here, config exists in MongoDB
  } catch (error) {
    console.log('No user config found in API, initializing with default config');

    // Check if config exists in localStorage
    if (!localStorage.getItem(CONFIG_STORAGE_KEY)) {
      // Save default config to localStorage
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(DEFAULT_CONFIG));
    }

    // Get config from localStorage (either default or existing)
    const config = loadConfigSync();

    // Save to MongoDB
    try {
      await axios.post(`/api/userconfig/${userId}`, { config });
    } catch (saveError) {
      console.error('Failed to save default config to API:', saveError);
    }
  }
};

// Call initialize when the module is loaded
// We use the synchronous version for the immediate initialization
// and then call the async version to ensure MongoDB is updated
if (!localStorage.getItem(CONFIG_STORAGE_KEY)) {
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(DEFAULT_CONFIG));
}
initialize().catch(error => {
  console.error('Error during initialization:', error);
});
