// User management and authentication for Nauthilus UI
// This module provides user management and authentication independently of the Nauthilus service

import { jwtDecode } from 'jwt-decode';
import CryptoJS from 'crypto-js';
import axios from 'axios';
import * as bcrypt from 'bcryptjs';

// Storage keys
const CONFIG_STORAGE_KEY = 'nauthilus-ui-user-config';
const TOKEN_STORAGE_KEY = 'token';
const REFRESH_TOKEN_STORAGE_KEY = 'refresh_token';

// Helper function to get the current user ID
const getCurrentUserId = async (): Promise<string> => {
  // Use token from browser memory only
  if (cachedTokens?.token) {
    try {
      const decoded = jwtDecode<{ sub: string }>(cachedTokens.token);
      return decoded.sub; // Use the username as the user ID
    } catch (error) {
      console.error('Error decoding token:', error);
    }
  }

  // Fallback to default user if no token or error decoding
  return 'default-user';
};

// Synchronous version for internal use
const getCurrentUserIdSync = (): string => {
  // Try to use cached token
  if (cachedTokens?.token) {
    try {
      const decoded = jwtDecode<{ sub: string }>(cachedTokens.token);
      return decoded.sub;
    } catch (error) {
      console.error('Error decoding cached token:', error);
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
  if (typeof window !== 'undefined' && window._env_ && window._env_[name]) {
    return window._env_[name];
  }
  return (process.env[`REACT_APP_${name}`] || defaultValue);
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

// Load configuration from MongoDB
export const loadConfig = async (): Promise<UserManagerConfig> => {
  const userId = await getCurrentUserId();

  try {
    // Try to load from API
    const response = await axios.get(`/api/userconfig/${userId}`);

    return response.data.config;
  } catch (error) {
    console.log('Failed to load user config from API, creating default config:', error);

    // If API fails, create default config in MongoDB
    try {
      await axios.post(`/api/userconfig/${userId}`, { config: DEFAULT_CONFIG });
      return DEFAULT_CONFIG;
    } catch (saveError) {
      console.error('Failed to save default user config to API:', saveError);
      throw new Error('Failed to initialize user configuration');
    }
  }
};

// Synchronous version for internal use
// Note: This now returns a cached version or default config
// and triggers an async update in the background
let cachedConfig: UserManagerConfig | null = null;

export const loadConfigSync = (): UserManagerConfig => {
  if (cachedConfig) {
    return cachedConfig;
  }

  // If no cached config, use default and trigger async load
  const config = DEFAULT_CONFIG;

  // Trigger async load to update cache
  loadConfig().then(loadedConfig => {
    cachedConfig = loadedConfig;
  }).catch(error => {
    console.error('Background config load failed:', error);
  });

  return config;
};

// Save configuration to MongoDB
export const saveConfig = async (config: UserManagerConfig): Promise<void> => {
  const userId = await getCurrentUserId();

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

// Synchronous version for internal use
export const addUserSync = (
  username: string, 
  password: string, 
  roles: string[] = ['user'],
  profileData: Partial<Omit<User, 'username' | 'roles' | 'passwordHash'>> = {}
): void => {
  const config = loadConfigSync();
  // Use bcrypt.hashSync with cost factor 12 for secure password hashing
  const passwordHash = bcrypt.hashSync(password, 12);

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

  // Update cache immediately
  cachedConfig = config;

  // Save to API asynchronously
  setTimeout(() => {
    saveConfig(config)
      .catch(error => {
        console.error(`Failed to save user ${username} to MongoDB:`, error);
      });
  }, 0);
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

// Synchronous version for internal use
export const getUsersSync = (): Omit<User, 'passwordHash'>[] => {
  const config = loadConfigSync();
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
export const updateUserProfile = async (username: string, profileData: Partial<Omit<User, 'username' | 'roles' | 'passwordHash'>>): Promise<void> => {
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

  // Always update lastModified if not explicitly provided
  if (!profileData.lastModified) {
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

  // Find user by username
  const user = config.users.find(u => u.username === username);
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

  // Get current user to ensure we have the latest data
  const users = await getUsers();
  const userToUpdate = users.find(u => u.username === username);

  if (userToUpdate) {

    // Update user profile with lastLogin and lastModified
    await updateUserProfile(username, { 
      lastLogin: now,
      lastModified: now
    });

  } else {
    console.error(`User ${username} not found when trying to update lastLogin`);
  }

  const token = generateToken(user, config.tokenExpiry);
  const refreshToken = generateToken(user, config.refreshTokenExpiry);

  // Store tokens only in browser memory
  cachedTokens = { token, refreshToken };

  return { token, refreshToken };
};

// Cache for tokens
let cachedTokens: { token: string, refreshToken: string } | null = null;

// Synchronous version for internal use
export const authenticateSync = (username: string, password: string): { token: string, refreshToken: string } | null => {
  const config = loadConfigSync();

  // Find user by username
  const user = config.users.find(u => u.username === username);
  if (!user) {
    return null;
  }

  // Verify password using bcrypt.compareSync
  const isPasswordValid = bcrypt.compareSync(password, user.passwordHash);
  if (!isPasswordValid) {
    return null;
  }

  // Update lastLogin timestamp
  // Note: We can't use updateUserProfile here because it's async
  // Instead, we'll update the user directly in the config
  const now = new Date().toISOString();
  const userIndex = config.users.findIndex(u => u.username === username);
  if (userIndex >= 0) {

    // Update both lastLogin and lastModified
    config.users[userIndex].lastLogin = now;
    config.users[userIndex].lastModified = now;


    // Update cache immediately
    cachedConfig = config;

    // Save to API asynchronously
    setTimeout(() => {
      saveConfig(config)
        .catch(error => {
          console.error(`Failed to save user update for ${username} to MongoDB:`, error);
        });
    }, 0);
  }

  const token = generateToken(user, config.tokenExpiry);
  const refreshToken = generateToken(user, config.refreshTokenExpiry);

  // Store tokens only in browser memory
  cachedTokens = { token, refreshToken };

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
  // Use cached refresh token from browser memory
  const currentRefreshToken = cachedTokens?.refreshToken;
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

    // Store tokens only in browser memory
    cachedTokens = { token: newToken, refreshToken: newRefreshToken };

    return { token: newToken, refreshToken: newRefreshToken };
  } catch (error) {
    return null;
  }
};

// Synchronous version for internal use
export const refreshTokenSync = (): { token: string, refreshToken: string } | null => {
  // Use cached refresh token from browser memory
  const currentRefreshToken = cachedTokens?.refreshToken;
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

    const config = loadConfigSync();
    const newToken = generateToken(user, config.tokenExpiry);
    const newRefreshToken = generateToken(user, config.refreshTokenExpiry);

    // Store tokens only in browser memory
    cachedTokens = { token: newToken, refreshToken: newRefreshToken };

    return { token: newToken, refreshToken: newRefreshToken };
  } catch (error) {
    return null;
  }
};

// Logout
export const logout = async (): Promise<void> => {
  // Clear tokens from browser memory only
  cachedTokens = null;
};

// Synchronous version for internal use
export const logoutSync = (): void => {
  // Clear tokens from browser memory only
  cachedTokens = null;
};

// Check if user is authenticated
export const isAuthenticated = async (): Promise<boolean> => {
  // Use token from browser memory only
  const token = cachedTokens?.token || null;
  return !!token && validateToken(token);
};

// Synchronous version for internal use
export const isAuthenticatedSync = (): boolean => {
  const token = cachedTokens?.token || null;
  return !!token && validateToken(token);
};

// Get current user
export const getCurrentUser = async (): Promise<Omit<User, 'passwordHash'> | null> => {
  // Use token from browser memory only
  const token = cachedTokens?.token || null;

  if (!token || !validateToken(token)) {
    return null;
  }

  try {
    const decoded = jwtDecode<{ sub: string, roles: string[] }>(token);
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

// Synchronous version for internal use
export const getCurrentUserSync = (): Omit<User, 'passwordHash'> | null => {
  const token = cachedTokens?.token || null;
  if (!token || !validateToken(token)) {
    return null;
  }

  try {
    const decoded = jwtDecode<{ sub: string, roles: string[] }>(token);
    const username = decoded.sub;

    // Get full user data from config
    const users = getUsersSync();
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
  const userId = await getCurrentUserId();
  let configExists = false;

  try {
    // Check if config exists in MongoDB
    const response = await axios.get(`/api/userconfig/${userId}`);
    // If we get here, config exists in MongoDB
    console.log('User config found in MongoDB');
    configExists = true;

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
};

// Call initialize when the module is loaded
initialize().catch(error => {
  console.error('Error during initialization:', error);
});
