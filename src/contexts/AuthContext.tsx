import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as userManager from '../utils/userManager';

// Define the authentication state
interface AuthState {
  isAuthenticated: boolean;
  username: string | null;
  loading: boolean;
  error: string | null;
}

// Define the context type
interface AuthContextType {
  auth: AuthState;
  login: (username: string, password: string, rememberMe?: boolean) => Promise<void>;
  loginWithOIDC: () => Promise<void>;
  logout: () => Promise<void>;
}

// Create the context with a default value
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Provider component
interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps): React.JSX.Element => {
  const [auth, setAuth] = useState<AuthState>({
    isAuthenticated: false,
    username: null,
    loading: true,
    error: null,
  });

  // Check if the user is already authenticated on the mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const currentUser = await userManager.getCurrentUser();
        if (currentUser) {
          setAuth({
            isAuthenticated: true,
            username: currentUser.username,
            loading: false,
            error: null,
          });
        } else {
          setAuth({
            isAuthenticated: false,
            username: null,
            loading: false,
            error: null,
          });
        }
      } catch (error) {
        console.error('Error checking authentication:', error);
        setAuth({
          isAuthenticated: false,
          username: null,
          loading: false,
          error: 'Failed to check authentication status',
        });
      }
    };

    (async () => {
      await checkAuth();
    })();
  }, []);

  // Login with username and password
  const login = async (username: string, password: string, rememberMe: boolean = false) => {
    try {
      setAuth(prev => ({ ...prev, loading: true, error: null }));

      // Use the local user manager for authentication
      const result = await userManager.authenticate(username, password, rememberMe);

      if (result) {
        setAuth({
          isAuthenticated: true,
          username,
          loading: false,
          error: null,
        });
      } else {
        console.error('Invalid username or password');
      }
    } catch (err) {
      setAuth(prev => ({
        ...prev,
        loading: false,
        error: 'Invalid username or password',
      }));
      console.error('Login error:', err);
    }
  };

  // Login with OIDC
  const loginWithOIDC = async () => {
    try {
      setAuth(prev => ({ ...prev, loading: true, error: null }));

      // Redirect to OIDC provider
      // This is a placeholder - actual implementation will depend on the OIDC provider
      window.location.href = '/api/v1/oidc/login';

      // The rest of the flow will be handled by the OIDC callback
      // which should set the token and redirect back to the app
    } catch (err) {
      setAuth(prev => ({
        ...prev,
        loading: false,
        error: 'OIDC authentication failed',
      }));
      console.error('OIDC login error:', err);
    }
  };

  // Logout
  const logout = async () => {
    try {
      await userManager.logout();
      setAuth({
        isAuthenticated: false,
        username: null,
        loading: false,
        error: null,
      });
    } catch (error) {
      console.error('Error during logout:', error);
      setAuth(prev => ({
        ...prev,
        error: 'Failed to logout properly',
      }));
    }
  };

  // Provide the context value
  const contextValue: AuthContextType = {
    auth,
    login,
    loginWithOIDC,
    logout,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook to use the auth context
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
