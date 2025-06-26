// User management and authentication for Nauthilus UI
// This module provides user management and authentication independently of the Nauthilus service

import { jwtDecode } from 'jwt-decode';
import CryptoJS from 'crypto-js';
import axios from 'axios';
import * as bcrypt from 'bcryptjs';
import Cookies from 'js-cookie';

// Cookie names for token storage
const TOKEN_COOKIE_NAME = 'nauthilus_token';
const REFRESH_TOKEN_COOKIE_NAME = 'nauthilus_refresh_token';

// Cookie options
const COOKIE_OPTIONS = {
  secure: window.location.protocol === 'https:',
  sameSite: 'strict' as const,
  path: '/'
};

// Helper function to get the current user ID from token
const getCurrentUserId = (): string => {
  const token = Cookies.get(TOKEN_COOKIE_NAME);
  if (token) {
    try {
      const decoded = jwtDecode<{ sub: string }>(token);
      return decoded.sub; // Use the username as the user ID
    } catch (error) {
      console.error('Error decoding token:', error);
    }
  }

  // Fallback to default user if no token or error decoding
  return 'default-user';
};

// User interface
export interface User {
  username: string;
  passwordHash: string;
  roles: string[];
  displayName?: string;
  email?: string;
  avatar?: string;
  lastLogin?: string | null;
  lastModified?: string;
}

// Configuration interface
export interface UserManagerConfig {
  users: User[];
  jwtSecret: string;
  tokenExpiry: number; // in seconds
  refreshTokenExpiry: number; // in seconds
}

// Get environment variables or use defaults
const getEnvVar = (name: string, defaultValue: string): string => {
  // In a browser environment, environment variables must be exposed via process.env.REACT_APP_*
  // or via window._env_
  const fullName = `REACT_APP_${name}`;
  if (typeof window !== 'undefined' && window._env_ && window._env_[fullName]) {
    return window._env_[fullName];
  }
  return (process.env[fullName] || defaultValue);
};

// Default configuration
const DEFAULT_CONFIG: UserManagerConfig = {
  users: [
    {
      username: 'admin',
      // Default password hash using bcrypt (password: 'admin')
      passwordHash: bcrypt.hashSync('admin', 12),
      roles: ['admin'],
      lastLogin: null, // Explicitly set lastLogin to null
      lastModified: new Date().toISOString() // Set lastModified to current time
    }
  ],
  jwtSecret: getEnvVar('JWT_SECRET', 'nauthilus-ui-default-secret-key-change-in-production'),
  tokenExpiry: parseInt(getEnvVar('TOKEN_EXPIRY', '3600')), // 1 hour
  refreshTokenExpiry: parseInt(getEnvVar('REFRESH_TOKEN_EXPIRY', '86400')) // 24 hours
};

// Cache for config to reduce API calls
let cachedConfig: UserManagerConfig | null = null;

// Load configuration from MongoDB
export const loadConfig = async (): Promise<UserManagerConfig> => {
  // Return cached config if available
  if (cachedConfig) {
    return { ...cachedConfig };
  }

  const userId = getCurrentUserId();

  try {
    // Try to load from API
    const response = await axios.get(`/api/userconfig/${userId}`);
    cachedConfig = response.data.config;
    return response.data.config;
  } catch (error) {
    console.log('Failed to load user config from API, creating default config:', error);

    // If API fails, create default config in MongoDB
    try {
      await axios.post(`/api/userconfig/${userId}`, { config: DEFAULT_CONFIG });
      cachedConfig = DEFAULT_CONFIG;
      return DEFAULT_CONFIG;
    } catch (saveError) {
      console.error('Failed to save default user config to API:', saveError);
      throw new Error('Failed to initialize user configuration');
    }
  }
};

// Save configuration to MongoDB
export const saveConfig = async (config: UserManagerConfig): Promise<void> => {
  const userId = getCurrentUserId();

  // Create a deep copy of the config to ensure we're not modifying the original
  const configToSave = JSON.parse(JSON.stringify(config));

  // Ensure lastLogin is explicitly set for each user
  configToSave.users.forEach((user: User) => {
    if (!('lastLogin' in user) && user.lastLogin === undefined) {
      user.lastLogin = null; // Set to null if it doesn't exist
    }
  });

  try {
    // Save to API
    await axios.post(`/api/userconfig/${userId}`, { config: configToSave });
    // Update cache
    cachedConfig = configToSave;
  } catch (error) {
    console.error('Failed to save user config to API:', error);
    throw new Error('Failed to save user configuration to MongoDB');
  }
};

// Add or update a user
export const addUser = async (
  username: string, 
  password: string, 
  roles: string[] = ['user'], 
  profileData: Partial<Omit<User, 'username' | 'roles' | 'passwordHash'>> = {}
): Promise<void> => {
  const config = await loadConfig();
  // Use bcrypt with cost factor 12 for secure password hashing
  const passwordHash = await bcrypt.hash(password, 12);

  // Set lastModified timestamp
  const now = new Date().toISOString();

  const existingUserIndex = config.users.findIndex(user => user.username === username);
  if (existingUserIndex >= 0) {
    // Store existing values that we want to preserve if not explicitly provided
    const existingLastLogin = config.users[existingUserIndex].lastLogin;

    // Create userData with password and roles
    const userData = {
      username,
      passwordHash,
      roles,
      lastModified: now,
      ...profileData
    };

    // Update existing user
    config.users[existingUserIndex] = {
      ...config.users[existingUserIndex],
      ...userData
    };

    // Ensure lastLogin is preserved if it exists and not provided in profileData
    if (existingLastLogin && !profileData.lastLogin) {
      config.users[existingUserIndex].lastLogin = existingLastLogin;
    }
  } else {
    // Create userData for new user
    const userData = {
      username,
      passwordHash,
      roles,
      lastModified: now,
      ...profileData
    };

    // Add new user
    config.users.push(userData);
  }

  // Save to MongoDB
  try {
    await saveConfig(config);
  } catch (error) {
    console.error(`Failed to save user ${username} to MongoDB:`, error);
    throw error;
  }
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
  return config.users.map(({ username, roles, displayName, email, avatar, lastLogin, lastModified }) => 
    ({ username, roles, displayName, email, avatar, lastLogin, lastModified }));
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

// Update user profile
export const updateUserProfile = async (
  username: string, 
  profileData: Partial<Omit<User, 'username' | 'roles' | 'passwordHash'>>
): Promise<void> => {
  const config = await loadConfig();
  const userIndex = config.users.findIndex(user => user.username === username);

  if (userIndex === -1) {
    throw new Error(`User ${username} not found`);
  }

  // Store existing values that we want to preserve if not explicitly provided
  const existingLastLogin = config.users[userIndex].lastLogin;

  // Update user with new profile data
  config.users[userIndex] = {
    ...config.users[userIndex],
    ...profileData
  };

  // Ensure lastLogin is preserved or updated
  if (profileData.lastLogin) {
    config.users[userIndex].lastLogin = profileData.lastLogin;
  } else if (existingLastLogin) {
    // Restore lastLogin if it existed but wasn't provided in profileData
    config.users[userIndex].lastLogin = existingLastLogin;
  }

  // Only update lastModified if not explicitly provided AND we're not just updating lastLogin
  if (!profileData.lastModified && 
      !(Object.keys(profileData).length === 1 && 'lastLogin' in profileData)) {
    const now = new Date().toISOString();
    config.users[userIndex].lastModified = now;
  }

  // Save to MongoDB
  try {
    await saveConfig(config);
  } catch (error) {
    console.error(`Failed to save profile update for ${username} to MongoDB:`, error);
    throw error;
  }
};

// Generate a JWT token
const generateToken = (user: User, expiry: number): string => {
  const config = cachedConfig || DEFAULT_CONFIG;
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

// Authenticate a user and generate tokens
export const authenticate = async (username: string, password: string): Promise<{ token: string, refreshToken: string } | null> => {
  const config = await loadConfig();

  // Find user by username (case-insensitive)
  const user = config.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) {
    return null;
  }

  // Verify password using bcrypt.compare
  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    return null;
  }

  // Update lastLogin timestamp
  const now = new Date().toISOString();

  // Update user profile with lastLogin only
  await updateUserProfile(username, { 
    lastLogin: now
  });

  const token = generateToken(user, config.tokenExpiry);
  const refreshToken = generateToken(user, config.refreshTokenExpiry);

  // Store tokens in cookies
  Cookies.set(TOKEN_COOKIE_NAME, token, {
    ...COOKIE_OPTIONS,
    expires: new Date(Date.now() + config.tokenExpiry * 1000)
  });

  Cookies.set(REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
    ...COOKIE_OPTIONS,
    expires: new Date(Date.now() + config.refreshTokenExpiry * 1000)
  });

  return { token, refreshToken };
};

// Refresh a token
export const refreshToken = async (): Promise<{ token: string, refreshToken: string } | null> => {
  // Use refresh token from cookie
  const currentRefreshToken = Cookies.get(REFRESH_TOKEN_COOKIE_NAME);
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

    // Store tokens in cookies
    Cookies.set(TOKEN_COOKIE_NAME, newToken, {
      ...COOKIE_OPTIONS,
      expires: new Date(Date.now() + config.tokenExpiry * 1000)
    });

    Cookies.set(REFRESH_TOKEN_COOKIE_NAME, newRefreshToken, {
      ...COOKIE_OPTIONS,
      expires: new Date(Date.now() + config.refreshTokenExpiry * 1000)
    });

    return { token: newToken, refreshToken: newRefreshToken };
  } catch (error) {
    return null;
  }
};

// Logout
export const logout = async (): Promise<void> => {
  // Clear tokens from cookies
  Cookies.remove(TOKEN_COOKIE_NAME, { path: '/' });
  Cookies.remove(REFRESH_TOKEN_COOKIE_NAME, { path: '/' });
};

// Check if user is authenticated
export const isAuthenticated = async (): Promise<boolean> => {
  // Use token from cookie
  const token = Cookies.get(TOKEN_COOKIE_NAME);

  if (!token) {
    return false;
  }

  if (!validateToken(token)) {
    // Token is invalid, try to refresh
    const refreshed = await refreshToken();
    return !!refreshed;
  }

  return true;
};

// Get current user
export const getCurrentUser = async (): Promise<Omit<User, 'passwordHash'> | null> => {
  // Use token from cookie
  const token = Cookies.get(TOKEN_COOKIE_NAME);

  if (!token) {
    // No token, try to refresh
    const refreshed = await refreshToken();
    if (!refreshed) {
      return null;
    }
  } else if (!validateToken(token)) {
    // Token is invalid, try to refresh
    const refreshed = await refreshToken();
    if (!refreshed) {
      return null;
    }
  }

  // Get the current token (either the original or the refreshed one)
  const currentToken = Cookies.get(TOKEN_COOKIE_NAME);

  try {
    const decoded = jwtDecode<{ sub: string, roles: string[] }>(currentToken!);
    const username = decoded.sub;

    // Get full user data from config
    const users = await getUsers();
    const currentUser = users.find(u => u.username === username);

    if (currentUser) {
      return currentUser;
    }

    // Fallback to basic user data from token
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
  try {
    // Check if config exists in MongoDB
    const userId = getCurrentUserId();
    let configExists = false;

    try {
      // Check if config exists in MongoDB
      const response = await axios.get(`/api/userconfig/${userId}`);
      // If we get here, config exists in MongoDB
      console.log('User config found in MongoDB');
      configExists = true;
      cachedConfig = response.data.config;

      // Even if config exists, check if it has users
      if (!response.data.config.users || response.data.config.users.length === 0) {
        console.log('User config exists but no users found, adding default admin user');
        // Add default admin user with lastLogin explicitly set to null
        await addUser('admin', 'admin', ['admin'], { 
          lastLogin: null, 
          lastModified: new Date().toISOString() 
        });
      } else {
        // Check if users have lastLogin property
        const usersWithoutLastLogin = response.data.config.users.filter((user: User) => !('lastLogin' in user));
        if (usersWithoutLastLogin.length > 0) {
          // Update each user to add lastLogin property
          for (const user of usersWithoutLastLogin) {
            await updateUserProfile(user.username, { 
              lastLogin: null, 
              lastModified: new Date().toISOString() 
            });
          }
        }
      }
    } catch (error) {
      console.log('No user config found in MongoDB, initializing with default config');

      // Save default config to MongoDB
      try {
        await axios.post(`/api/userconfig/${userId}`, { config: DEFAULT_CONFIG });
        // Update cache
        cachedConfig = DEFAULT_CONFIG;
        console.log('Default config saved to MongoDB');
      } catch (saveError) {
        console.error('Failed to save default config to MongoDB:', saveError);
        throw new Error('Failed to initialize user configuration in MongoDB');
      }
    }

    // If config didn't exist before, we've already added the default admin user
    // If config did exist, we've already checked for users above
    if (!configExists) {
      // Double-check that users exist after initialization
      try {
        const users = await getUsers();
        if (users.length === 0) {
          console.log('No users found after initialization, creating default admin user');
          // Add default admin user with lastLogin explicitly set to null
          await addUser('admin', 'admin', ['admin'], { 
            lastLogin: null, 
            lastModified: new Date().toISOString() 
          });
        }
      } catch (error) {
        console.error('Error checking/creating users:', error);
        throw new Error('Failed to initialize users in MongoDB');
      }
    }
  } catch (error) {
    console.error('Error during initialization:', error);
    throw error;
  }
};

// Call initialize when the module is loaded
initialize().catch(error => {
  console.error('Error during initialization:', error);
});
