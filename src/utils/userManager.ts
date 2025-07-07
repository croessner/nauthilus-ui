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

// Declare the _env_ property on the Window interface
declare global {
  interface Window {
    _env_?: Record<string, string>;
  }
}

// Get environment variables or use defaults
const getEnvVar = (name: string, defaultValue: string): string => {
  // In a browser environment, environment variables must be exposed via process.env.REACT_APP_*
  // or via window._env_
  const fullName = `REACT_APP_${name}`;
  if (typeof window !== 'undefined' && window._env_ && fullName in window._env_) {
    return window._env_[fullName] || defaultValue;
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

// Helper function to fetch data from API endpoints
const fetchConfigData = async (): Promise<void> => {
  try {
    // Load users
    const usersResponse = await axios.get('/api/users');
    if (usersResponse.data && Array.isArray(usersResponse.data.users)) {
      cachedUsers = usersResponse.data.users;
    } else {
      console.error('Invalid users data format received from API');
      cachedUsers = [];
    }

    // Load JWT config
    const jwtConfigResponse = await axios.get('/api/jwtconfig');
    if (jwtConfigResponse.data && jwtConfigResponse.data.jwtConfig) {
      cachedJwtConfig = jwtConfigResponse.data.jwtConfig;
    } else {
      console.error('Invalid JWT config data format received from API');
      cachedJwtConfig = null;
    }
  } catch (error) {
    console.error('Error fetching configuration data:', error);
    throw error;
  }
};

// Helper function to construct config object
const constructConfigObject = (): UserManagerConfig => {
  // Ensure we have valid arrays and values
  const users = Array.isArray(cachedUsers) ? cachedUsers : [];

  const config: UserManagerConfig = {
    users,
    jwtSecret: cachedJwtConfig?.jwtSecret || DEFAULT_CONFIG.jwtSecret,
    tokenExpiry: cachedJwtConfig?.tokenExpiry || DEFAULT_CONFIG.tokenExpiry,
    refreshTokenExpiry: cachedJwtConfig?.refreshTokenExpiry || DEFAULT_CONFIG.refreshTokenExpiry,
    rememberMeExpiry: cachedJwtConfig?.rememberMeExpiry || DEFAULT_CONFIG.rememberMeExpiry
  };

  return config;
};

// Helper function to create default config in MongoDB
const createDefaultConfig = async (): Promise<UserManagerConfig> => {
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
};

// Load configuration from MongoDB
export const loadConfig = async (): Promise<UserManagerConfig> => {
  // Return cached config if available
  if (cachedConfig) {
    return { ...cachedConfig };
  }

  try {
    await fetchConfigData();

    const config = constructConfigObject();
    cachedConfig = config;
    return config;
  } catch (error) {
    console.log('Failed to load user config from API, creating default config:', error);

    // If API fails, create default config in MongoDB
    try {
      return await createDefaultConfig();
    } catch (saveError) {
      console.error('Failed to save default user config to API:', saveError);
      throw new Error('Failed to initialize user configuration');
    }
  }
};

// Save configuration to MongoDB
export const saveConfig = async (config: UserManagerConfig): Promise<void> => {
  // Create a deep copy of the config to ensure we're not modifying the original
  const configToSave = JSON.parse(JSON.stringify(config));

  // Ensure lastLogin is explicitly set for each user
  configToSave.users.forEach((user: User) => {
    if (!('lastLogin' in user) || user.lastLogin === undefined) {
      user.lastLogin = null; // Set to null if it doesn't exist or is undefined
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
  // Validate input parameters
  if (!username || typeof username !== 'string') {
    throw new Error('Username is required and must be a string');
  }

  if (!password || typeof password !== 'string') {
    throw new Error('Password is required and must be a string');
  }

  if (!Array.isArray(roles)) {
    roles = ['user']; // Default to user role if roles is not an array
  }

  // Ensure profileData is an object
  if (!profileData || typeof profileData !== 'object') {
    profileData = {};
  }

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
      userExists = response.data && !!response.data.user;
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
  // Validate input parameters
  if (!username || typeof username !== 'string') {
    throw new Error('Username is required and must be a string');
  }

  try {
    // Delete user
    await axios.delete(`/api/users/${username}`);

    // Update cached users
    if (cachedUsers && Array.isArray(cachedUsers)) {
      cachedUsers = cachedUsers.filter(user => 
        user && user.username !== username
      );

      // Update cachedConfig
      if (cachedConfig) {
        cachedConfig.users = cachedUsers || [];
      }
    }
  } catch (error) {
    console.error(`Failed to remove user ${username}:`, error);
    // Don't throw the error to improve resilience
    // Just log it and continue
  }
};

// Get all users (without password hashes)
export const getUsers = async (): Promise<Omit<User, 'passwordHash'>[]> => {
  try {
    // Get users
    const response = await axios.get('/api/users');

    // Validate response data
    if (!response.data || !Array.isArray(response.data.users)) {
      console.error('Invalid user data format received from API');
      // Return empty array instead of throwing to improve resilience
      return [];
    }

    // Update cached users
    cachedUsers = response.data.users;

    // Update cachedConfig if it exists
    if (cachedConfig) {
      cachedConfig.users = cachedUsers || [];
    }

    return response.data.users;
  } catch (error) {
    console.error('Failed to get users:', error);
    // Return empty array instead of throwing to improve resilience
    return [];
  }
};

// Update JWT secret
export const updateJwtSecret = async (secret: string): Promise<void> => {
  // Validate input parameters
  if (!secret || typeof secret !== 'string') {
    throw new Error('JWT secret is required and must be a string');
  }

  try {
    // Get current JWT config
    const response = await axios.get('/api/jwtconfig');

    // Validate response data
    if (!response.data || !response.data.jwtConfig) {
      throw new Error('Invalid JWT config data received from API');
    }

    const jwtConfig = response.data.jwtConfig;

    // Update JWT secret
    await axios.put('/api/jwtconfig', {
      jwtSecret: secret,
      tokenExpiry: jwtConfig.tokenExpiry || DEFAULT_CONFIG.tokenExpiry,
      refreshTokenExpiry: jwtConfig.refreshTokenExpiry || DEFAULT_CONFIG.refreshTokenExpiry,
      rememberMeExpiry: jwtConfig.rememberMeExpiry || DEFAULT_CONFIG.rememberMeExpiry
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
  // Validate input parameters
  if (typeof tokenExpiry !== 'number' || tokenExpiry <= 0) {
    throw new Error('Token expiry must be a positive number');
  }

  if (typeof refreshTokenExpiry !== 'number' || refreshTokenExpiry <= 0) {
    throw new Error('Refresh token expiry must be a positive number');
  }

  try {
    // Get current JWT config
    const response = await axios.get('/api/jwtconfig');

    // Validate response data
    if (!response.data || !response.data.jwtConfig) {
      throw new Error('Invalid JWT config data received from API');
    }

    const jwtConfig = response.data.jwtConfig;

    // Update token expiry times
    await axios.put('/api/jwtconfig', {
      jwtSecret: jwtConfig.jwtSecret || DEFAULT_CONFIG.jwtSecret,
      tokenExpiry,
      refreshTokenExpiry,
      rememberMeExpiry: jwtConfig.rememberMeExpiry || DEFAULT_CONFIG.rememberMeExpiry
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
  // Validate input parameters
  if (!username || typeof username !== 'string') {
    throw new Error('Username is required and must be a string');
  }

  // Ensure profileData is an object
  if (!profileData || typeof profileData !== 'object') {
    profileData = {};
  }

  try {
    // If lastModified is explicitly provided, use it
    // Otherwise, it should have been set correctly in the UserContext
    // based on whether there were actual changes to the profile

    // Update user
    await axios.put(`/api/users/${username}`, profileData);

    // Update cached users
    if (cachedUsers && Array.isArray(cachedUsers)) {
      const userIndex = cachedUsers.findIndex(user => 
        user && user.username === username
      );

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
  // Ensure we have a valid config
  const config = cachedConfig ? { ...cachedConfig } : { ...DEFAULT_CONFIG };

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
  // Check if token is provided and is a string
  if (!token || typeof token !== 'string') {
    return false;
  }

  try {
    const decoded = jwtDecode<{ exp: number }>(token);

    // Check if decoded token has expiration time
    if (!decoded || typeof decoded.exp !== 'number') {
      return false;
    }

    const now = Math.floor(Date.now() / 1000);
    return decoded.exp > now;
  } catch (error) {
    console.error('Error validating token:', error);
    return false;
  }
};

// Authenticate a user and generate tokens
export const authenticate = async (username: string, password: string, rememberMe: boolean = false): Promise<{ token: string, refreshToken: string } | null> => {
  if (!username || !password) {
    return null;
  }

  let config;
  try {
    config = cachedConfig || await loadConfig();
  } catch (error) {
    console.error('Failed to load config during authentication:', error);
    return null;
  }

  let user;

  try {
    // Authenticate with backend using the dedicated authentication endpoint
    try {
      const response = await axios.post('/api/auth/login', {
        username,
        password
      });

      if (response.data && response.data.user) {
        user = response.data.user;
      } else {
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

  // Update user profile with lastLogin only, but preserve lastModified
  try {
    // Get the current user to preserve the lastModified timestamp
    const users = await getUsers();
    const currentUser = users.find(u => u.username === username);

    if (currentUser) {
      await updateUserProfile(username, { 
        lastLogin: now,
        lastModified: currentUser.lastModified // Explicitly preserve the existing lastModified value
      });
    } else {
      // Fallback if we can't find the current user
      await updateUserProfile(username, { 
        lastLogin: now
      });
    }
  } catch (error) {
    // Log the error but continue with authentication
    console.error('Failed to update lastLogin timestamp:', error);
    // Don't return null here, continue with the authentication process
  }

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

    // Validate decoded token data
    if (!decoded || !decoded.sub || !Array.isArray(decoded.roles)) {
      console.error('Invalid token data during refresh');
      return null;
    }

    const user = {
      username: decoded.sub,
      passwordHash: '', // Not needed for token generation
      roles: decoded.roles
    };

    let config;
    try {
      config = await loadConfig();
    } catch (error) {
      console.error('Failed to load config during token refresh:', error);
      return null;
    }

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
  try {
    // Clear tokens from cookies
    Cookies.remove(TOKEN_COOKIE_NAME, { path: '/' });
    Cookies.remove(REFRESH_TOKEN_COOKIE_NAME, { path: '/' });

    // Clear cached data to ensure fresh data is loaded on next login
    cachedConfig = null;
    cachedUsers = null;
    cachedJwtConfig = null;

    console.log('User logged out successfully');
  } catch (error) {
    console.error('Error during logout:', error);
    // Don't throw the error to improve resilience
    // Just log it and continue
  }
};

// Check if user is authenticated
export const isAuthenticated = async (): Promise<boolean> => {
  try {
    // Use token from cookie
    const token = Cookies.get(TOKEN_COOKIE_NAME);

    if (!token) {
      return false;
    }

    if (!validateToken(token)) {
      // Token is invalid, try to refresh
      try {
        const refreshed = await refreshToken();
        return !!refreshed;
      } catch (refreshError) {
        console.error('Error refreshing token during authentication check:', refreshError);
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error('Error checking authentication status:', error);
    return false;
  }
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
    if (!currentToken) {
      return null;
    }

    const decoded = jwtDecode<{ sub: string, roles: string[] }>(currentToken);
    const username = decoded.sub;

    // Get full user data from config
    try {
      const users = await getUsers();

      // Since getUsers now returns an empty array instead of throwing,
      // we need to check if users is valid
      if (Array.isArray(users) && users.length > 0) {
        const currentUser = users.find(u => u && u.username === username);
        if (currentUser) {
          return currentUser;
        }
      }
    } catch (error) {
      console.error('Error getting user data:', error);
      // Continue to fallback
    }

    // Fallback to basic user data from token
    return {
      username: decoded.sub,
      roles: decoded.roles,
      lastLogin: null // Add lastLogin to be consistent with User interface
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
      await fetchConfigData();

      // Construct config object with proper null checks
      const config = constructConfigObject();
      if (!config) {
        throw new Error('Failed to construct config object');
      }

      cachedConfig = config;
      console.log('Configuration loaded successfully');

      // Check if users exist with proper null check
      if (!cachedUsers || !Array.isArray(cachedUsers) || cachedUsers.length === 0) {
        console.log('No users found, creating default admin user');
        // Add default admin user with lastLogin explicitly set to null
        await addUser('admin', 'admin', ['admin'], { 
          lastLogin: null, 
          lastModified: new Date().toISOString() 
        });
      } else {
        // Check if users have lastLogin property
        const usersWithoutLastLogin = cachedUsers.filter(user => 
          user && typeof user === 'object' && !('lastLogin' in user)
        );

        if (usersWithoutLastLogin.length > 0) {
          // Update each user to add lastLogin property
          for (const user of usersWithoutLastLogin) {
            if (user && user.username) {
              await updateUserProfile(user.username, { 
                lastLogin: null, 
                lastModified: new Date().toISOString() 
              });
            }
          }
        }
      }
    } catch (error) {
      console.log('Failed to load configuration, initializing with defaults:', error);

      // Create default configuration
      try {
        await createDefaultConfig();
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
// Using a more robust error handling approach
try {
  initialize().catch(error => {
    console.error('Error during initialization:', error);
    // Log additional information that might help with debugging
    console.error('Current environment:', process.env.NODE_ENV);
  });
} catch (error) {
  console.error('Critical error during initialization setup:', error);
}
