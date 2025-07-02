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
  rememberMeExpiry: number; // in seconds
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
  refreshTokenExpiry: parseInt(getEnvVar('REFRESH_TOKEN_EXPIRY', '86400')), // 24 hours
  rememberMeExpiry: parseInt(getEnvVar('REMEMBER_ME_EXPIRY', '86400')) // Default: 1 day
};

// Cache for config to reduce API calls
let cachedConfig: UserManagerConfig | null = null;
let cachedUsers: User[] | null = null;
let cachedJwtConfig: { jwtSecret: string, tokenExpiry: number, refreshTokenExpiry: number, rememberMeExpiry: number } | null = null;

// Load configuration from MongoDB
export const loadConfig = async (): Promise<UserManagerConfig> => {
  // Return cached config if available
  if (cachedConfig) {
    return { ...cachedConfig };
  }

  const userId = getCurrentUserId();

  try {
    // Load users
    const usersResponse = await axios.get('/api/users');
    cachedUsers = usersResponse.data.users;

    // Load JWT config
    const jwtConfigResponse = await axios.get('/api/jwtconfig');
    cachedJwtConfig = jwtConfigResponse.data.jwtConfig;

    // Construct config object
    const config: UserManagerConfig = {
      users: cachedUsers || [],
      jwtSecret: cachedJwtConfig?.jwtSecret || DEFAULT_CONFIG.jwtSecret,
      tokenExpiry: cachedJwtConfig?.tokenExpiry || DEFAULT_CONFIG.tokenExpiry,
      refreshTokenExpiry: cachedJwtConfig?.refreshTokenExpiry || DEFAULT_CONFIG.refreshTokenExpiry,
      rememberMeExpiry: cachedJwtConfig?.rememberMeExpiry || DEFAULT_CONFIG.rememberMeExpiry
    };

    cachedConfig = config;
    return config;
  } catch (error) {
    console.log('Failed to load user config from API, creating default config:', error);

    // If API fails, create default config in MongoDB
    try {
      // Create default admin user
      await axios.post('/api/users', {
        username: 'admin',
        password: 'admin',
        roles: ['admin'],
        lastLogin: null,
        lastModified: new Date().toISOString()
      });

      // Create default JWT config
      await axios.put('/api/jwtconfig', {
        jwtSecret: DEFAULT_CONFIG.jwtSecret,
        tokenExpiry: DEFAULT_CONFIG.tokenExpiry,
        refreshTokenExpiry: DEFAULT_CONFIG.refreshTokenExpiry,
        rememberMeExpiry: DEFAULT_CONFIG.rememberMeExpiry
      });

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
    // Save JWT config
    await axios.put('/api/jwtconfig', {
      jwtSecret: configToSave.jwtSecret,
      tokenExpiry: configToSave.tokenExpiry,
      refreshTokenExpiry: configToSave.refreshTokenExpiry,
      rememberMeExpiry: configToSave.rememberMeExpiry
    });

    // For users, we would need to handle each user individually
    // This is handled by the specific user management functions (addUser, removeUser, etc.)
    // We don't need to save all users here as that would be inefficient

    // Update cache
    cachedConfig = configToSave;
    cachedJwtConfig = {
      jwtSecret: configToSave.jwtSecret,
      tokenExpiry: configToSave.tokenExpiry,
      refreshTokenExpiry: configToSave.refreshTokenExpiry,
      rememberMeExpiry: configToSave.rememberMeExpiry
    };
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
  // Set lastModified timestamp if not provided
  const now = new Date().toISOString();
  if (!profileData.lastModified) {
    profileData.lastModified = now;
  }

  try {
    // Check if user exists
    let userExists = false;
    try {
      const response = await axios.get(`/api/users/${username}`);
      userExists = !!response.data.user;
    } catch (error) {
      // User doesn't exist if we get a 404
      userExists = false;
    }

    if (userExists) {
      // Update existing user
      await axios.put(`/api/users/${username}`, {
        password,
        roles,
        ...profileData
      });
    } else {
      // Create new user
      await axios.post('/api/users', {
        username,
        password,
        roles,
        ...profileData
      });
    }

    // Update cached users
    if (cachedUsers) {
      const existingUserIndex = cachedUsers.findIndex(user => user.username === username);
      if (existingUserIndex >= 0) {
        // Store existing values that we want to preserve if not explicitly provided
        const existingLastLogin = cachedUsers[existingUserIndex].lastLogin;

        // Update existing user
        cachedUsers[existingUserIndex] = {
          ...cachedUsers[existingUserIndex],
          username,
          passwordHash: '', // We don't have access to the hash
          roles,
          lastModified: profileData.lastModified || now,
          ...profileData
        };

        // Ensure lastLogin is preserved if it exists and not provided in profileData
        if (existingLastLogin && !profileData.lastLogin) {
          cachedUsers[existingUserIndex].lastLogin = existingLastLogin;
        }
      } else {
        // Add new user to cache
        cachedUsers.push({
          username,
          passwordHash: '', // We don't have access to the hash
          roles,
          lastModified: profileData.lastModified || now,
          ...profileData
        });
      }

      // Update cachedConfig
      if (cachedConfig) {
        cachedConfig.users = cachedUsers || [];
      }
    }
  } catch (error) {
    console.error(`Failed to save user ${username}:`, error);
    throw error;
  }
};

// Remove a user
export const removeUser = async (username: string): Promise<void> => {
  try {
    // Delete user
    await axios.delete(`/api/users/${username}`);

    // Update cached users
    if (cachedUsers) {
      cachedUsers = cachedUsers.filter(user => user.username !== username);

      // Update cachedConfig
      if (cachedConfig) {
        cachedConfig.users = cachedUsers || [];
      }
    }
  } catch (error) {
    console.error(`Failed to remove user ${username}:`, error);
    throw error;
  }
};

// Get all users (without password hashes)
export const getUsers = async (): Promise<Omit<User, 'passwordHash'>[]> => {
  try {
    // Get users
    const response = await axios.get('/api/users');

    // Update cached users
    cachedUsers = response.data.users;

    // Update cachedConfig if it exists
    if (cachedConfig) {
      cachedConfig.users = cachedUsers || [];
    }

    return response.data.users;
  } catch (error) {
    console.error('Failed to get users:', error);
    throw error;
  }
};

// Update JWT secret
export const updateJwtSecret = async (secret: string): Promise<void> => {
  try {
    // Get current JWT config
    const response = await axios.get('/api/jwtconfig');
    const jwtConfig = response.data.jwtConfig;

    // Update JWT secret
    await axios.put('/api/jwtconfig', {
      jwtSecret: secret,
      tokenExpiry: jwtConfig.tokenExpiry,
      refreshTokenExpiry: jwtConfig.refreshTokenExpiry,
      rememberMeExpiry: jwtConfig.rememberMeExpiry
    });

    // Update cached JWT config
    if (cachedJwtConfig) {
      cachedJwtConfig.jwtSecret = secret;
    }

    // Update cachedConfig
    if (cachedConfig) {
      cachedConfig.jwtSecret = secret;
    }
  } catch (error) {
    console.error('Failed to update JWT secret:', error);
    throw error;
  }
};

// Update token expiry times
export const updateTokenExpiry = async (tokenExpiry: number, refreshTokenExpiry: number): Promise<void> => {
  try {
    // Get current JWT config
    const response = await axios.get('/api/jwtconfig');
    const jwtConfig = response.data.jwtConfig;

    // Update token expiry times
    await axios.put('/api/jwtconfig', {
      jwtSecret: jwtConfig.jwtSecret,
      tokenExpiry,
      refreshTokenExpiry,
      rememberMeExpiry: jwtConfig.rememberMeExpiry
    });

    // Update cached JWT config
    if (cachedJwtConfig) {
      cachedJwtConfig.tokenExpiry = tokenExpiry;
      cachedJwtConfig.refreshTokenExpiry = refreshTokenExpiry;
    }

    // Update cachedConfig
    if (cachedConfig) {
      cachedConfig.tokenExpiry = tokenExpiry;
      cachedConfig.refreshTokenExpiry = refreshTokenExpiry;
    }
  } catch (error) {
    console.error('Failed to update token expiry times:', error);
    throw error;
  }
};

// Update user profile
export const updateUserProfile = async (
  username: string, 
  profileData: Partial<Omit<User, 'username' | 'roles' | 'passwordHash'>>
): Promise<void> => {
  try {
    // Only update lastModified if not explicitly provided AND we're not just updating lastLogin
    if (!profileData.lastModified && 
        !(Object.keys(profileData).length === 1 && 'lastLogin' in profileData)) {
      profileData.lastModified = new Date().toISOString();
    }

    // Update user
    await axios.put(`/api/users/${username}`, profileData);

    // Update cached users
    if (cachedUsers) {
      const userIndex = cachedUsers.findIndex(user => user.username === username);
      if (userIndex !== -1) {
        // Store existing values that we want to preserve if not explicitly provided
        const existingLastLogin = cachedUsers[userIndex].lastLogin;

        // Update user with new profile data
        cachedUsers[userIndex] = {
          ...cachedUsers[userIndex],
          ...profileData
        };

        // Ensure lastLogin is preserved or updated
        if (profileData.lastLogin) {
          cachedUsers[userIndex].lastLogin = profileData.lastLogin;
        } else if (existingLastLogin) {
          // Restore lastLogin if it existed but wasn't provided in profileData
          cachedUsers[userIndex].lastLogin = existingLastLogin;
        }

        // Update cachedConfig
        if (cachedConfig) {
          cachedConfig.users = cachedUsers || [];
        }
      }
    }
  } catch (error) {
    console.error(`Failed to update profile for ${username}:`, error);
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
export const authenticate = async (username: string, password: string, rememberMe: boolean = false): Promise<{ token: string, refreshToken: string } | null> => {
  let config = cachedConfig || await loadConfig();
  let user;

  try {
    // Try to find the user by username
    try {
      const response = await axios.get(`/api/users/${username}`);
      if (response.data.user) {
        user = response.data.user;
      } else {
        return null;
      }
    } catch (error) {
      // User not found
      return null;
    }

    // Authenticate with backend
    try {
      // This would ideally be a dedicated authentication endpoint
      // For now, we'll use the existing user API and rely on the cached config
      // In a production environment, you would implement a proper authentication endpoint

      // Find user in cached config (case-insensitive)
      const cachedUser = config.users.find((u: User) => u.username.toLowerCase() === username.toLowerCase());
      if (!cachedUser || !cachedUser.passwordHash) {
        return null;
      }

      // Verify password using bcrypt.compare
      const isPasswordValid = await bcrypt.compare(password, cachedUser.passwordHash);
      if (!isPasswordValid) {
        return null;
      }
    } catch (error) {
      console.error('Authentication failed:', error);
      return null;
    }
  } catch (error) {
    console.error('Failed to authenticate user:', error);
    return null;
  }

  // Update lastLogin timestamp
  const now = new Date().toISOString();

  // Update user profile with lastLogin only
  await updateUserProfile(username, { 
    lastLogin: now
  });

  // Use rememberMeExpiry if rememberMe is true, otherwise use regular tokenExpiry
  const tokenExpiryTime = rememberMe ? config.rememberMeExpiry : config.tokenExpiry;
  // Always use the longer expiry for refresh token
  const refreshTokenExpiryTime = Math.max(config.refreshTokenExpiry, tokenExpiryTime);

  const token = generateToken(user, tokenExpiryTime);
  const refreshToken = generateToken(user, refreshTokenExpiryTime);

  // Store tokens in cookies
  Cookies.set(TOKEN_COOKIE_NAME, token, {
    ...COOKIE_OPTIONS,
    expires: new Date(Date.now() + tokenExpiryTime * 1000)
  });

  Cookies.set(REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
    ...COOKIE_OPTIONS,
    expires: new Date(Date.now() + refreshTokenExpiryTime * 1000)
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

  // Clear cached data to ensure fresh data is loaded on next login
  cachedConfig = null;
  cachedUsers = null;
  cachedJwtConfig = null;
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
    // Try to load existing configuration
    try {
      // Load users
      const usersResponse = await axios.get('/api/users');
      cachedUsers = usersResponse.data.users;

      // Load JWT config
      const jwtConfigResponse = await axios.get('/api/jwtconfig');
      cachedJwtConfig = jwtConfigResponse.data.jwtConfig;

      // Construct config object
      const config: UserManagerConfig = {
        users: cachedUsers || [],
        jwtSecret: cachedJwtConfig?.jwtSecret || DEFAULT_CONFIG.jwtSecret,
        tokenExpiry: cachedJwtConfig?.tokenExpiry || DEFAULT_CONFIG.tokenExpiry,
        refreshTokenExpiry: cachedJwtConfig?.refreshTokenExpiry || DEFAULT_CONFIG.refreshTokenExpiry,
        rememberMeExpiry: cachedJwtConfig?.rememberMeExpiry || DEFAULT_CONFIG.rememberMeExpiry
      };

      cachedConfig = config;
      console.log('Configuration loaded successfully');

      // Check if users exist
      if (cachedUsers.length === 0) {
        console.log('No users found, creating default admin user');
        // Add default admin user with lastLogin explicitly set to null
        await addUser('admin', 'admin', ['admin'], { 
          lastLogin: null, 
          lastModified: new Date().toISOString() 
        });
      } else {
        // Check if users have lastLogin property
        const usersWithoutLastLogin = cachedUsers.filter(user => !('lastLogin' in user));
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
      console.log('Failed to load configuration, initializing with defaults:', error);

      // Create default configuration
      try {
        // Create default admin user
        await axios.post('/api/users', {
          username: 'admin',
          password: 'admin',
          roles: ['admin'],
          lastLogin: null,
          lastModified: new Date().toISOString()
        });

        // Create default JWT config
        await axios.put('/api/jwtconfig', {
          jwtSecret: DEFAULT_CONFIG.jwtSecret,
          tokenExpiry: DEFAULT_CONFIG.tokenExpiry,
          refreshTokenExpiry: DEFAULT_CONFIG.refreshTokenExpiry,
          rememberMeExpiry: DEFAULT_CONFIG.rememberMeExpiry
        });

        cachedConfig = DEFAULT_CONFIG;
        console.log('Default configuration created successfully');
      } catch (saveError) {
        console.error('Failed to create default configuration:', saveError);
        throw new Error('Failed to initialize configuration');
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
