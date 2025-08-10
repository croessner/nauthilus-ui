// User management and authentication for Nauthilus UI
// This module provides user management and authentication independently of the Nauthilus service

import { jwtDecode } from 'jwt-decode';
import Cookies from 'js-cookie';
import axios from './axiosConfig';

// Helper to set auth cookies from server response in a DRY manner
const setCookiesFromResponse = (
  data: any,
  defaultTokenSeconds: number = 3600,
  defaultRefreshSeconds: number = 86400
): { token: string; refreshToken: string } | null => {
  if (!data || !data.token) {
    return null;
  }

  const token: string = data.token;
  const refreshToken: string = data.refreshToken || token;

  const tokenExpiry: Date = data.expiresAt
    ? new Date(data.expiresAt * 1000)
    : new Date(Date.now() + defaultTokenSeconds * 1000);

  Cookies.set(TOKEN_COOKIE_NAME, token, {
    ...COOKIE_OPTIONS,
    expires: tokenExpiry,
  });

  Cookies.set(REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
    ...COOKIE_OPTIONS,
    expires: new Date(Date.now() + defaultRefreshSeconds * 1000),
  });

  return { token, refreshToken };
};

// Helper to update user's lastLogin while preserving lastModified
const updateUserLastLogin = async (username: string): Promise<void> => {
  const now = new Date().toISOString();
  try {
    const users = await getUsers();
    const currentUser = users.find(u => u.username === username);

    if (currentUser) {
      await updateUserProfile(username, {
        lastLogin: now,
        lastModified: currentUser.lastModified,
      });
    } else {
      await updateUserProfile(username, {
        lastLogin: now,
      });
    }
    console.log('LastLogin timestamp updated successfully');
  } catch (updateError) {
    console.error('Failed to update lastLogin timestamp:', updateError);
  }
};

// Helper to store credentials for token refresh (sessionStorage)
const storeCredentialsForTokenRefresh = (username: string, password: string): void => {
  try {
    sessionStorage.setItem('auth_credentials', JSON.stringify({ username, password }));
    console.log('Stored credentials for token refresh');
  } catch (storageError) {
    console.error('Failed to store credentials for token refresh:', storageError);
  }
};

// Cookie names for token storage
const TOKEN_COOKIE_NAME = 'nauthilus_token';
const REFRESH_TOKEN_COOKIE_NAME = 'nauthilus_refresh_token';

// Cookie options
const COOKIE_OPTIONS = {
  secure: window.location.protocol === 'https:',
  sameSite: 'strict' as const,
  path: '/'
};

// WebAuthnCredential interface
export interface WebAuthnCredential {
  id: string;
  publicKey: string; // Base64 encoded
  name: string;
  createdAt: string;
  lastUsed: string;
  aaguid: string;
  authenticator: string;
}

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
  // TOTP fields
  totpEnabled?: boolean;
  totpSecret?: string;
  // WebAuthn fields
  webAuthnEnabled?: boolean;
  webAuthnDevices?: WebAuthnCredential[];
}

// Configuration interface
export interface UserManagerConfig {
  users: User[];
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
  const fullName = `REACT_APP_${name}`;

  // 1) Prefer runtime-injected variables
  if (typeof window !== 'undefined' && window._env_ && fullName in window._env_) {
    return window._env_[fullName] || defaultValue;
  }

  // 2) Vite build-time variables. Support both legacy REACT_APP_* and VITE_* names.
  try {
    const viteEnv: any = (typeof import.meta !== 'undefined' && (import.meta as any).env) || undefined;
    if (viteEnv) {
      if (fullName in viteEnv && viteEnv[fullName]) return viteEnv[fullName] as string;
      const viteName = `VITE_${name}`;
      if (viteName in viteEnv && viteEnv[viteName]) return viteEnv[viteName] as string;
    }
  } catch (_) {
    // ignore
  }

  // 3) Fallback default (do not access process.env in the browser)
  return defaultValue;
};

// Default configuration
const DEFAULT_CONFIG: UserManagerConfig = {
  users: [
    {
      username: 'admin',
      // Placeholder: UI does not store password hashes; authentication is handled by backend
      passwordHash: '',
      roles: ['admin'],
      lastLogin: null, // Explicitly set lastLogin to null
      lastModified: new Date().toISOString() // Set lastModified to current time
    }
  ],
  tokenExpiry: parseInt(getEnvVar('TOKEN_EXPIRY', '3600')), // 1 hour
  refreshTokenExpiry: parseInt(getEnvVar('REFRESH_TOKEN_EXPIRY', '86400')), // 24 hours
  rememberMeExpiry: parseInt(getEnvVar('REMEMBER_ME_EXPIRY', '86400')) // Default: 1 day
};

// Cache for config to reduce API calls
let cachedConfig: UserManagerConfig | null = null;
let cachedUsers: User[] | null = null;
let cachedJwtConfig: { tokenExpiry: number, refreshTokenExpiry: number, rememberMeExpiry: number } | null = null;

// Helper function to fetch data from API endpoints
const fetchConfigData = async (): Promise<void> => {
  try {
    // Check if we have a valid token before making requests to protected endpoints
    const token = Cookies.get(TOKEN_COOKIE_NAME);
    if (!token || !validateToken(token)) {
      console.log('No valid token available, skipping loading of protected resources');
      cachedUsers = [];
      cachedJwtConfig = null;
      return;
    }

    // Load users only if we have a valid token
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
    // Don't throw the error, just set empty values
    cachedUsers = [];
    cachedJwtConfig = null;
  }
};

// Helper function to construct config object
const constructConfigObject = (): UserManagerConfig => {
  // Ensure we have valid arrays and values
  const users = Array.isArray(cachedUsers) ? cachedUsers : [];

  const config: UserManagerConfig = {
    users,
    tokenExpiry: cachedJwtConfig?.tokenExpiry || DEFAULT_CONFIG.tokenExpiry,
    refreshTokenExpiry: cachedJwtConfig?.refreshTokenExpiry || DEFAULT_CONFIG.refreshTokenExpiry,
    rememberMeExpiry: cachedJwtConfig?.rememberMeExpiry || DEFAULT_CONFIG.rememberMeExpiry
  };

  return config;
};

// Helper function to create default config in MongoDB
// This should only be called after successful authentication
const createDefaultConfig = async (): Promise<UserManagerConfig> => {
  // Check if we have a valid token before trying to create default config
  const token = Cookies.get(TOKEN_COOKIE_NAME);
  if (!token || !validateToken(token)) {
    console.log('No valid token available, cannot create default config');
    // Return default config without trying to save it (will be saved after authentication)
    cachedConfig = DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG };
  }

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
      tokenExpiry: DEFAULT_CONFIG.tokenExpiry,
      refreshTokenExpiry: DEFAULT_CONFIG.refreshTokenExpiry,
      rememberMeExpiry: DEFAULT_CONFIG.rememberMeExpiry
    });

    cachedConfig = DEFAULT_CONFIG;
    return DEFAULT_CONFIG;
  } catch (error) {
    console.error('Failed to create default config:', error);
    // Return default config without saving
    cachedConfig = DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG };
  }
};

// Load configuration from MongoDB
export const loadConfig = async (): Promise<UserManagerConfig> => {
  // Return cached config if available
  if (cachedConfig) {
    return { ...cachedConfig };
  }

  try {
    // Check if we have a valid token before trying to fetch data
    const token = Cookies.get(TOKEN_COOKIE_NAME);
    if (!token || !validateToken(token)) {
      console.log('No valid token available, returning default config');
      // Return default config without trying to save it (will be saved after authentication)
      cachedConfig = DEFAULT_CONFIG;
      return { ...DEFAULT_CONFIG };
    }

    await fetchConfigData();

    const config = constructConfigObject();
    cachedConfig = config;
    return config;
  } catch (error) {
    console.log('Failed to load user config from API, using default config:', error);

    // Return default config without trying to save it (will be saved after authentication)
    cachedConfig = DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG };
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
      tokenExpiry: configToSave.tokenExpiry,
      refreshTokenExpiry: configToSave.refreshTokenExpiry,
      rememberMeExpiry: configToSave.rememberMeExpiry
    };
  } catch (error) {
    console.error('Failed to save user config to API:', error);
    return Promise.reject(new Error('Failed to save user configuration to MongoDB'));
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
export const authenticate = async (username: string, password: string, rememberMe: boolean = false): Promise<{ token: string, refreshToken: string } | { mfaRequired: boolean, mfaType: string, username: string, totpEnabled?: boolean, webAuthnEnabled?: boolean } | null> => {
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

  try {
    // Authenticate with backend using the dedicated authentication endpoint
    try {
      const response = await axios.post('/api/auth/login', {
        username,
        password,
        rememberMe
      });

      // Check if MFA is required
      if (response.data && response.data.mfaRequired) {
        // Store credentials in sessionStorage for MFA completion
        // This is necessary regardless of rememberMe setting because we need these credentials
        // to complete the MFA process
        try {
          sessionStorage.setItem('auth_credentials', JSON.stringify({
            username,
            password
          }));
          console.log('Stored credentials for MFA completion');
        } catch (storageError) {
          console.error('Failed to store credentials for MFA completion:', storageError);
          // Continue even if storage fails
        }
        
        return {
          mfaRequired: response.data.mfaRequired,
          mfaType: response.data.mfaType,
          username: response.data.username,
          totpEnabled: response.data.totpEnabled,
          webAuthnEnabled: response.data.webAuthnEnabled,
        };
      } else if (response.data && response.data.user && response.data.token) {
        // Use the tokens provided by the server
        const token = response.data.token;
        const refreshToken = response.data.refreshToken || token; // Fallback to token if refreshToken is not provided
        
        // Store tokens in cookies
        const tokenExpiry = response.data.expiresAt ? 
          new Date(response.data.expiresAt * 1000) : 
          new Date(Date.now() + (rememberMe ? config.rememberMeExpiry : config.tokenExpiry) * 1000);
          
        Cookies.set(TOKEN_COOKIE_NAME, token, {
          ...COOKIE_OPTIONS,
          expires: tokenExpiry
        });
        
        Cookies.set(REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
          ...COOKIE_OPTIONS,
          expires: new Date(Date.now() + config.refreshTokenExpiry * 1000)
        });
        
        // Store credentials securely for token refresh (only if rememberMe is true)
        if (rememberMe) {
          storeCredentialsForTokenRefresh(username, password);
        }
        
        // Update lastLogin timestamp
        await updateUserLastLogin(username);
        
        return { token, refreshToken };
      } else {
        console.error('Invalid response format from server:', response.data);
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
};

// Refresh a token
// Complete MFA login after successful verification
export const completeMfaLogin = async (username: string, rememberMe: boolean = false): Promise<{ token: string, refreshToken: string } | null> => {
  console.log('Starting completeMfaLogin for user:', username);
  if (!username) {
    console.error('Username is null or empty');
    return null;
  }

  try {
    // Since there's no dedicated MFA verification endpoint, we need to use the stored credentials
    // to re-authenticate with the server
    const storedCredentials = sessionStorage.getItem('auth_credentials');
    
    if (!storedCredentials) {
      console.error('No stored credentials found for MFA completion');
      return null;
    }
    
    const { username: storedUsername, password } = JSON.parse(storedCredentials);
    
    // Only proceed if the stored username matches the MFA username
    if (storedUsername !== username) {
      console.error('Stored username does not match MFA username');
      return null;
    }
    
    console.log('Found stored credentials, attempting to authenticate with MFA');
    
    // Re-authenticate with the server
    const response = await axios.post('/api/auth/login', {
      username: storedUsername,
      password,
      // Add MFA verification data
      mfaVerified: true,
      rememberMe
    });
    
    if (response.data && response.data.token) {
      const cookiesResult = setCookiesFromResponse(response.data, 3600, 86400);
      if (!cookiesResult) {
        console.error('Invalid response format from server during MFA completion:', response.data);
        return null;
      }

      // Store credentials securely for token refresh (only if rememberMe is true)
      if (rememberMe) {
        storeCredentialsForTokenRefresh(username, password);
      }

      // Update lastLogin timestamp
      await updateUserLastLogin(username);

      console.log('MFA authentication successful, returning tokens');
      return cookiesResult;
    } else {
      console.error('Invalid response format from server during MFA completion:', response.data);
      return null;
    }
  } catch (error) {
    console.error('Error during MFA completion:', error);
    return null;
  }
};

export const refreshToken = async (): Promise<{ token: string, refreshToken: string } | null> => {
  // Use refresh token from cookie
  const currentRefreshToken = Cookies.get(REFRESH_TOKEN_COOKIE_NAME);
  if (!currentRefreshToken || !validateToken(currentRefreshToken)) {
    console.log('No valid refresh token found, cannot refresh');
    return null;
  }

  try {
    const decoded = jwtDecode<{ sub: string, roles: string[] }>(currentRefreshToken);

    // Validate decoded token data
    if (!decoded || !decoded.sub || !Array.isArray(decoded.roles)) {
      console.error('Invalid token data during refresh');
      return null;
    }

    // Get the username from the token
    const username = decoded.sub;
    
    // Since there's no dedicated refresh endpoint, we need to re-authenticate
    // We'll use a special header to indicate this is a token refresh request
    try {
      // Try to get the stored credentials from sessionStorage (if available)
      const storedCredentials = sessionStorage.getItem('auth_credentials');
      
      if (storedCredentials) {
        const { username: storedUsername, password } = JSON.parse(storedCredentials);
        
        // Only proceed if the stored username matches the token username
        if (storedUsername === username) {
          console.log('Found stored credentials, attempting to re-authenticate');
          
          // Re-authenticate with the server
          const response = await axios.post('/api/auth/login', {
            username: storedUsername,
            password
          });
          
          if (response.data && response.data.token) {
            const cookiesResult = setCookiesFromResponse(response.data, 3600, 86400);
            if (!cookiesResult) {
              console.error('Invalid response format during token refresh:', response.data);
              return null;
            }

            console.log('Successfully refreshed tokens via re-authentication');
            return cookiesResult;
          }
        }
      }
      
      console.log('No stored credentials or re-authentication failed');
      return null;
    } catch (error) {
      console.error('Error during token refresh via re-authentication:', error);
      return null;
    }
  } catch (error) {
    console.error('Error parsing refresh token:', error);
    return null;
  }
};

// Logout
export const logout = async (): Promise<void> => {
  try {
    // Clear tokens from cookies
    Cookies.remove(TOKEN_COOKIE_NAME, { path: '/' });
    Cookies.remove(REFRESH_TOKEN_COOKIE_NAME, { path: '/' });

    // Clear stored credentials from sessionStorage
    try {
      sessionStorage.removeItem('auth_credentials');
    } catch (storageError) {
      console.error('Failed to clear stored credentials:', storageError);
      // Continue even if this fails
    }

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
    // Check if we have a valid token before trying to fetch data
    const token = Cookies.get(TOKEN_COOKIE_NAME);
    if (!token || !validateToken(token)) {
      console.log('No valid token available during initialization, using default config');
      // Set default config without trying to save it (will be saved after authentication)
      cachedConfig = DEFAULT_CONFIG;
      cachedUsers = [];
      cachedJwtConfig = null;
      return;
    }

    // Try to load existing configuration only if we have a valid token
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
      console.log('Failed to load configuration, using defaults:', error);
      // Set default config without trying to save it (will be saved after authentication)
      cachedConfig = DEFAULT_CONFIG;
      cachedUsers = [];
      cachedJwtConfig = null;
    }
  } catch (error) {
    console.error('Error during initialization:', error);
    // Don't throw the error, just use default values
    cachedConfig = DEFAULT_CONFIG;
    cachedUsers = [];
    cachedJwtConfig = null;
  }
};

// Call initialize when the module is loaded
// Using a more robust error handling approach
try {
  initialize().catch(error => {
    console.error('Error during initialization:', error);
    // Log additional information that might help with debugging
    const env = (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.MODE) || (typeof process !== 'undefined' && (process as any).env && (process as any).env.NODE_ENV) || 'unknown';
    console.error('Current environment:', env);
  });
} catch (error) {
  console.error('Critical error during initialization setup:', error);
}
