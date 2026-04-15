import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import * as userManager from '../utils/userManager';

// Define the user type
interface User {
  username: string;
  roles: string[];
  displayName?: string;
  email?: string;
  avatar?: string;
  enabled?: boolean;
  lastLogin?: string | null;
  lastModified?: string;
  // TOTP fields
  totpEnabled?: boolean;
  // WebAuthn fields
  webAuthnEnabled?: boolean;
  webAuthnDevices?: userManager.WebAuthnCredential[];
}

// Define the context type
interface UserContextType {
  isAuthenticated: boolean;
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<User | null>;
  syncSession: () => Promise<User | null>;
  loginAfterMfa: (username: string) => Promise<User | null>;
  logout: () => Promise<void>;
  addUser: (username: string, password: string, roles: string[]) => Promise<void>;
  removeUser: (username: string) => Promise<void>;
  getUsers: () => Promise<User[]>;
  updatePassword: (username: string, password: string) => Promise<void>;
  updateUserProfile: (username: string, profileData: Partial<Omit<User, 'username'>>) => Promise<void>;
  clearError: () => void;
}

// Create the context with a default value
const UserContext = createContext<UserContextType | undefined>(undefined);

// Provider component
interface UserProviderProps {
  children: ReactNode;
}

export const UserProvider = ({ children }: UserProviderProps): React.JSX.Element => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [user, setUser] = useState<{ username: string; roles: string[] } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const syncSession = useCallback(async (): Promise<User | null> => {
    setLoading(true);
    setError(null);

    try {
      const currentUser = await userManager.getCurrentUser();
      setIsAuthenticated(!!currentUser);
      setUser(currentUser);
      return currentUser;
    } catch (err) {
      console.error('Error syncing authenticated user session:', err);
      setIsAuthenticated(false);
      setUser(null);
      setError('Failed to load current user session');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Initialize the user state
  useEffect(() => {
    // Prevent duplicate checks in React StrictMode (DEV)
    const hasRun = typeof window !== 'undefined' ? (window as any).__userInitRan : false;
    if (hasRun) {
      return;
    }
    if (typeof window !== 'undefined') {
      (window as any).__userInitRan = true;
    }

    const checkAuth = async () => {
      try {
        const currentUser = await userManager.getCurrentUser();
        setIsAuthenticated(!!currentUser);
        setUser(currentUser);
      } catch (err) {
        console.error('Error checking authentication:', err);
        setError('Failed to check authentication status');
      } finally {
        setLoading(false);
      }
    };

    (async () => {
      await checkAuth();
    })();
  }, []);

  // Login function (stable)
  const login = useCallback(async (username: string, password: string): Promise<User | null> => {
    setLoading(true);
    setError(null);

    try {
      const result = await userManager.authenticate(username, password);

      if (result && 'success' in result) {
        const currentUser = await userManager.getCurrentUser();
        setIsAuthenticated(!!currentUser);
        setUser(currentUser);
        return currentUser;
      }

      if (result && 'mfaRequired' in result) {
        setIsAuthenticated(false);
        setUser(null);
        return null;
      }

      setError('Invalid username or password');
      return null;
    } catch (err) {
      console.error('Login error:', err);
      setError('An error occurred during login');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Login after MFA completion function (stable)
  const loginAfterMfa = useCallback(async (username: string): Promise<User | null> => {
    try {
      const currentUser = await syncSession();
      if (currentUser) {
        console.log('UserContext: Setting user after MFA completion:', currentUser);
        return currentUser;
      }

      console.error('UserContext: Failed to get current user after MFA completion');
      setError('Failed to get user information after MFA');
      return null;
    } catch (err) {
      console.error(`UserContext: Error in loginAfterMfa for ${username}:`, err);
      setError('An error occurred during login after MFA');
      return null;
    }
  }, [syncSession]);

  // Logout function (stable)
  const logout = useCallback(async (): Promise<void> => {
    setLoading(true);

    try {
      await userManager.logout();
      setIsAuthenticated(false);
      setUser(null);
    } catch (err) {
      console.error('Logout error:', err);
      setError('An error occurred during logout');
    } finally {
      setLoading(false);
    }
  }, []);

  // Add user function (stable)
  const addUser = useCallback(async (username: string, password: string, roles: string[]): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      await userManager.addUser(username, password, roles);
    } catch (err) {
      console.error('Add user error:', err);
      setError('An error occurred while adding the user');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Remove user function (stable)
  const removeUser = useCallback(async (username: string): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      await userManager.removeUser(username);
    } catch (err) {
      console.error('Remove user error:', err);
      setError('An error occurred while removing the user');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Get users function (stable)
  const getUsers = useCallback(async (): Promise<User[]> => {
    setLoading(true);
    setError(null);

    try {
      return await userManager.getUsers();
    } catch (err) {
      console.error('Get users error:', err);
      setError('An error occurred while getting users');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Update password function (stable)
  const updatePassword = useCallback(async (username: string, password: string): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const userToUpdate = user?.username === username ? user : await userManager.getUser(username);
      if (!userToUpdate) {
        console.error('User not found');
        return;
      }

      await userManager.updateUserProfile(username, {
        password,
        lastModified: userToUpdate.lastModified || new Date().toISOString(),
      });
    } catch (err) {
      console.error('Update password error:', err);
      setError('An error occurred while updating the password');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Update user profile function (stable)
  const updateUserProfile = useCallback(async (username: string, profileData: Partial<Omit<User, 'username'>>): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const userToUpdate = user?.username === username ? user : await userManager.getUser(username);
      if (!userToUpdate) {
        console.error('User not found');
        return;
      }

      // Create a copy of the profile data
      const updatedProfileData = {
        ...profileData
      };

      // Check if we're only updating lastLogin
      const isOnlyLastLoginUpdate = Object.keys(profileData).length === 1 && 'lastLogin' in profileData;

      // If we're not just updating lastLogin, check if there are actual changes
      if (!isOnlyLastLoginUpdate) {
        // Check if there are actual changes to the profile
        let hasChanges = false;

        // Compare each field in profileData with the current user data
        for (const key in profileData) {
          if (key !== 'lastLogin' && key !== 'lastModified') {
            // Handle undefined values correctly
            const newValue = profileData[key as keyof typeof profileData];
            const currentValue = userToUpdate[key as keyof typeof userToUpdate];

            // Check if the values are different
            if ((newValue || '') !== (currentValue || '')) {
              hasChanges = true;
              break;
            }
          }
        }

        // Only update lastModified if there are actual changes
        if (hasChanges) {
          updatedProfileData.lastModified = new Date().toISOString();
        } else {
          // No changes, preserve the existing lastModified value
          updatedProfileData.lastModified = userToUpdate.lastModified;
        }
      } else {
        // For lastLogin updates, preserve the existing lastModified value
        updatedProfileData.lastModified = userToUpdate.lastModified;
      }

      await userManager.updateUserProfile(username, updatedProfileData);

      // If the current user is being updated, refresh the user state
      if (user && user.username === username) {
        const currentUser = await userManager.getCurrentUser();
        setUser(currentUser);
      }
    } catch (err) {
      console.error('Update user profile error:', err);
      setError('An error occurred while updating the user profile');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Clear error function (stable)
  const clearError = useCallback((): void => {
    setError(null);
  }, []);

  // Provide the context value
  const contextValue: UserContextType = useMemo(() => ({
    isAuthenticated,
    user,
    loading,
    error,
    login,
    syncSession,
    loginAfterMfa,
    logout,
    addUser,
    removeUser,
    getUsers,
    updatePassword,
    updateUserProfile,
    clearError
  }), [isAuthenticated, user, loading, error, login, syncSession, loginAfterMfa, logout, addUser, removeUser, getUsers, updatePassword, updateUserProfile, clearError]);

  return (
    <UserContext.Provider value={contextValue}>
      {children}
    </UserContext.Provider>
  );
};

// Custom hook to use the user context
export const useUser = (): UserContextType => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};
