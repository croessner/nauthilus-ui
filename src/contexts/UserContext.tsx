import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as userManager from '../utils/userManager';

// Define the user type
interface User {
  username: string;
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
  webAuthnDevices?: userManager.WebAuthnCredential[];
}

// Define the context type
interface UserContextType {
  isAuthenticated: boolean;
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<User | null>;
  loginAfterMfa: (username: string) => Promise<User | null>;
  logout: () => Promise<void>;
  addUser: (username: string, password: string, roles: string[]) => Promise<void>;
  removeUser: (username: string) => Promise<void>;
  getUsers: () => Promise<User[]>;
  updatePassword: (username: string, password: string) => Promise<void>;
  updateUserProfile: (username: string, profileData: Partial<Omit<User, 'username' | 'roles'>>) => Promise<void>;
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

  // Initialize the user state
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const authenticated = await userManager.isAuthenticated();
        setIsAuthenticated(authenticated);

        if (authenticated) {
          const currentUser = await userManager.getCurrentUser();
          setUser(currentUser);
        }
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

  // Login function
  const login = async (username: string, password: string): Promise<User | null> => {
    setLoading(true);
    setError(null);

    try {
      const result = await userManager.authenticate(username, password);

      if (result) {
        setIsAuthenticated(true);
        const currentUser = await userManager.getCurrentUser();
        setUser(currentUser);
        return currentUser;
      } else {
        setError('Invalid username or password');
        return null;
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('An error occurred during login');
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Login after MFA completion function
  const loginAfterMfa = async (username: string): Promise<User | null> => {
    setLoading(true);
    setError(null);

    try {
      // Skip authentication since it's already done in AuthContext
      // Just update the user state with the current user
      setIsAuthenticated(true);
      const currentUser = await userManager.getCurrentUser();

      if (currentUser) {
        console.log('UserContext: Setting user after MFA completion:', currentUser);
        setUser(currentUser);
        return currentUser;
      } else {
        console.error('UserContext: Failed to get current user after MFA completion');
        setError('Failed to get user information after MFA');
        return null;
      }
    } catch (err) {
      console.error('UserContext: Error in loginAfterMfa:', err);
      setError('An error occurred during login after MFA');
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Logout function
  const logout = async (): Promise<void> => {
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
  };

  // Add user function
  const addUser = async (username: string, password: string, roles: string[]): Promise<void> => {
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
  };

  // Remove user function
  const removeUser = async (username: string): Promise<void> => {
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
  };

  // Get users function
  const getUsers = async (): Promise<User[]> => {
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
  };

  // Update password function
  const updatePassword = async (username: string, password: string): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      // Get current user to preserve all user data
      const users = await userManager.getUsers();
      const userToUpdate = users.find(u => u.username === username);

      if (userToUpdate) {
        // Extract profile data to preserve
        const { displayName, email, avatar, lastLogin, lastModified } = userToUpdate;
        const profileData = { displayName, email, avatar, lastLogin, lastModified };

        // Update user with preserved profile data
        await userManager.addUser(username, password, userToUpdate.roles, profileData);
      } else {
        console.error('User not found');
        return;
      }
    } catch (err) {
      console.error('Update password error:', err);
      setError('An error occurred while updating the password');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Update user profile function
  const updateUserProfile = async (username: string, profileData: Partial<Omit<User, 'username' | 'roles'>>): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      // Get the current user to preserve roles and other data
      const users = await userManager.getUsers();
      const userToUpdate = users.find(u => u.username === username);

      if (userToUpdate) {
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
      } else {
        console.error('User not found');
        return;
      }
    } catch (err) {
      console.error('Update user profile error:', err);
      setError('An error occurred while updating the user profile');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Clear error function
  const clearError = (): void => {
    setError(null);
  };

  // Provide the context value
  const contextValue: UserContextType = {
    isAuthenticated,
    user,
    loading,
    error,
    login,
    loginAfterMfa,
    logout,
    addUser,
    removeUser,
    getUsers,
    updatePassword,
    updateUserProfile,
    clearError
  };

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
