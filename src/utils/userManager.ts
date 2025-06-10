// User management and authentication for Nauthilus UI
// This module provides user management and authentication independently of the Nauthilus service

import { jwtDecode } from 'jwt-decode';
import CryptoJS from 'crypto-js';

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

// Load configuration from localStorage or use default
export const loadConfig = (): UserManagerConfig => {
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

// Save configuration to localStorage
export const saveConfig = (config: UserManagerConfig): void => {
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
};

// Add or update a user
export const addUser = (username: string, password: string, roles: string[] = ['user']): void => {
  const config = loadConfig();
  const passwordHash = CryptoJS.SHA256(password).toString();
  
  const existingUserIndex = config.users.findIndex(user => user.username === username);
  if (existingUserIndex >= 0) {
    // Update existing user
    config.users[existingUserIndex] = { username, passwordHash, roles };
  } else {
    // Add new user
    config.users.push({ username, passwordHash, roles });
  }
  
  saveConfig(config);
};

// Remove a user
export const removeUser = (username: string): void => {
  const config = loadConfig();
  config.users = config.users.filter(user => user.username !== username);
  saveConfig(config);
};

// Get all users (without password hashes)
export const getUsers = (): Omit<User, 'passwordHash'>[] => {
  const config = loadConfig();
  return config.users.map(({ username, roles }) => ({ username, roles }));
};

// Update JWT secret
export const updateJwtSecret = (secret: string): void => {
  const config = loadConfig();
  config.jwtSecret = secret;
  saveConfig(config);
};

// Update token expiry times
export const updateTokenExpiry = (tokenExpiry: number, refreshTokenExpiry: number): void => {
  const config = loadConfig();
  config.tokenExpiry = tokenExpiry;
  config.refreshTokenExpiry = refreshTokenExpiry;
  saveConfig(config);
};

// Generate a JWT token
const generateToken = (user: User, expiry: number): string => {
  const config = loadConfig();
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
export const authenticate = (username: string, password: string): { token: string, refreshToken: string } | null => {
  const config = loadConfig();
  const passwordHash = CryptoJS.SHA256(password).toString();
  
  const user = config.users.find(u => u.username === username && u.passwordHash === passwordHash);
  if (!user) {
    return null;
  }
  
  const token = generateToken(user, config.tokenExpiry);
  const refreshToken = generateToken(user, config.refreshTokenExpiry);
  
  // Store tokens
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
  localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken);
  
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
export const refreshToken = (): { token: string, refreshToken: string } | null => {
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
    
    const config = loadConfig();
    const newToken = generateToken(user, config.tokenExpiry);
    const newRefreshToken = generateToken(user, config.refreshTokenExpiry);
    
    // Store new tokens
    localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, newRefreshToken);
    
    return { token: newToken, refreshToken: newRefreshToken };
  } catch (error) {
    return null;
  }
};

// Logout
export const logout = (): void => {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
};

// Check if user is authenticated
export const isAuthenticated = (): boolean => {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  return !!token && validateToken(token);
};

// Get current user
export const getCurrentUser = (): { username: string, roles: string[] } | null => {
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
export const initialize = (): void => {
  if (!localStorage.getItem(CONFIG_STORAGE_KEY)) {
    saveConfig(DEFAULT_CONFIG);
  }
};

// Call initialize when the module is loaded
initialize();