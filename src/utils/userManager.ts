// User management and authentication for Nauthilus UI
// This module provides user management and authentication independently of the Nauthilus service

import axios from './axiosConfig';

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
  enabled?: boolean; // frontend flag, defaults to true on backend
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
  } catch {
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
    // Ensure we are authenticated before hitting protected endpoints
    try {
      const me = await axios.get('/api/auth/me');
      if (!me.data || !me.data.user) {
        // Not authenticated; skip fetching protected data
        return;
      }
    } catch (e: any) {
      // If 401 or any error occurs, skip fetching protected endpoints
      return;
    }

    // Attempt to load protected resources; relies on HttpOnly cookies sent with credentials
    const usersResponse = await axios.get('/api/users');
    if (usersResponse.data && Array.isArray(usersResponse.data.users)) {
      cachedUsers = usersResponse.data.users;
    } else {
      console.error('Invalid users data format received from API');
      cachedUsers = [];
    }

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
  
  return {
      users,
      tokenExpiry: cachedJwtConfig?.tokenExpiry || DEFAULT_CONFIG.tokenExpiry,
      refreshTokenExpiry: cachedJwtConfig?.refreshTokenExpiry || DEFAULT_CONFIG.refreshTokenExpiry,
      rememberMeExpiry: cachedJwtConfig?.rememberMeExpiry || DEFAULT_CONFIG.rememberMeExpiry
  };
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
    console.log('Failed to load user config from API, using default config:', error);

    // Return default config without trying to save it (will be saved after authentication)
    cachedConfig = DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG };
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
  if (!username) {
    throw new Error('Username is required and must be a string');
  }

  if (!password) {
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
    let userExists: boolean;
    try {
      const response = await axios.get(`/api/users/${username}`);
      userExists = response.data && !!response.data.user;
    } catch {
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
  if (!username) {
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
  profileData: Partial<Omit<User, 'username' | 'passwordHash'>>
): Promise<void> => {
  // Validate input parameters
  if (!username) {
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


// Authenticate a user and generate tokens
export const authenticate = async (username: string, password: string, rememberMe: boolean = false, recaptchaToken?: string): Promise<
  | { token: string; refreshToken: string }
  | { mfaRequired: boolean; mfaType: string; username: string; totpEnabled?: boolean; webAuthnEnabled?: boolean }
  | { captchaRequired: true; recaptchaSiteKey?: string }
  | null
> => {
  if (!username || !password) {
    return null;
  }


  try {
    // Authenticate with backend using the dedicated authentication endpoint
    try {
      const response = await axios.post('/api/auth/login', {
        username,
        password,
        rememberMe,
        ...(recaptchaToken ? { recaptchaToken } : {}),
      });

      // Check if MFA is required
      if (response.data && response.data.mfaRequired) {
        // Do not store credentials client-side. Just forward MFA info.
        return {
          mfaRequired: response.data.mfaRequired,
          mfaType: response.data.mfaType,
          username: response.data.username,
          totpEnabled: response.data.totpEnabled,
          webAuthnEnabled: response.data.webAuthnEnabled,
        };
      } else if (response.data && response.data.user && response.data.token) {
        // Server already set HttpOnly cookies. Return tokens for compatibility, but do not store client-side.
        const token = response.data.token;
        const refreshToken = response.data.refreshToken || token;

        // Update lastLogin timestamp
        await updateUserLastLogin(username);

        return { token, refreshToken };
      } else {
        console.error('Invalid response format from server:', response.data);
        return null;
      }
    } catch (error: any) {
      // Detect adaptive CAPTCHA requirement signaled by backend
      const status = error?.response?.status;
      const data = error?.response?.data;
      if (status === 403 && data && data.captchaRequired) {
        return { captchaRequired: true, recaptchaSiteKey: data.recaptchaSiteKey };
      }
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
export const completeMfaLogin = async (username: string, _rememberMe: boolean = false): Promise<{ token: string, refreshToken: string } | null> => {
  console.log('Starting completeMfaLogin for user:', username);
  if (!username) {
    console.error('Username is null or empty');
    return null;
  }

  try {
    // At this point, TOTP/WebAuthn verification should have set cookies server-side.
    // We optionally rotate tokens to return a fresh set.
    const response = await axios.post('/api/auth/refresh');
    if (response.data && response.data.token) {
      console.log('MFA completion successful via refresh, returning tokens');
      // Update lastLogin timestamp
      await updateUserLastLogin(username);
      return { token: response.data.token, refreshToken: response.data.refreshToken || response.data.token };
    }
    console.error('Invalid response from refresh during MFA completion:', response.data);
    return null;
  } catch (error) {
    console.error('Error during MFA completion:', error);
    return null;
  }
};


// Logout
export const logout = async (): Promise<void> => {
  try {
    // Ask backend to clear HttpOnly cookies
    await axios.post('/api/auth/logout');

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
    const response = await axios.get('/api/auth/me');
    return !!(response.data && response.data.user);
  } catch (error: any) {
    if (error?.response?.status === 401) return false;
    console.error('Error checking authentication status:', error);
    return false;
  }
};

// Get current user
export const getCurrentUser = async (): Promise<Omit<User, 'passwordHash'> | null> => {
  try {
    const response = await axios.get('/api/auth/me');
    if (response.data && response.data.user) {
      return response.data.user;
    }
    return null;
  } catch (error: any) {
    if (error?.response?.status === 401) return null;
    console.error('Error fetching current user:', error);
    return null;
  }
};

// Initialize with default configuration if none exists
export const initialize = async (): Promise<void> => {
  try {
    // Try to load existing configuration (relies on server-managed cookies)
    try {
      await fetchConfigData();

      // Construct config object with proper null checks
      const config = constructConfigObject();
      if (!config) {
        await Promise.reject('Failed to construct config object');
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

// Note: Do NOT auto-run initialize() on module load to avoid pre-auth 401s.
// The app will call initialize() explicitly after successful authentication.
