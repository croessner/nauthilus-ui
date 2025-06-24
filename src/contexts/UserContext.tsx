import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as userManager from '../utils/userManager';

// Define the context type
interface UserContextType {
  isAuthenticated: boolean;
  user: { username: string; roles: string[] } | null;
  loading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  addUser: (username: string, password: string, roles: string[]) => Promise<void>;
  removeUser: (username: string) => Promise<void>;
  getUsers: () => Promise<{ username: string; roles: string[] }[]>;
  updatePassword: (username: string, password: string) => Promise<void>;
  clearError: () => void;
}

// Create the context with a default value
const UserContext = createContext<UserContextType | undefined>(undefined);

// Provider component
interface UserProviderProps {
  children: ReactNode;
}

export const UserProvider: React.FC<UserProviderProps> = ({ children }) => {
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

    checkAuth();
  }, []);

  // Login function
  const login = async (username: string, password: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await userManager.authenticate(username, password);
      
      if (result) {
        setIsAuthenticated(true);
        const currentUser = await userManager.getCurrentUser();
        setUser(currentUser);
        return true;
      } else {
        setError('Invalid username or password');
        return false;
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('An error occurred during login');
      return false;
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
  const getUsers = async (): Promise<{ username: string; roles: string[] }[]> => {
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
      // Get current user to preserve roles
      const users = await userManager.getUsers();
      const userToUpdate = users.find(u => u.username === username);
      
      if (userToUpdate) {
        await userManager.addUser(username, password, userToUpdate.roles);
      } else {
        throw new Error('User not found');
      }
    } catch (err) {
      console.error('Update password error:', err);
      setError('An error occurred while updating the password');
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
    logout,
    addUser,
    removeUser,
    getUsers,
    updatePassword,
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
