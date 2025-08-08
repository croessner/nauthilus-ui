import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as userManager from '../utils/userManager';

// Define the authentication state
interface AuthState {
  isAuthenticated: boolean;
  username: string | null;
  loading: boolean;
  error: string | null;
  mfaRequired?: boolean;
  mfaType?: string;
  totpEnabled?: boolean;
  webAuthnEnabled?: boolean;
}

// Define the context type
interface AuthContextType {
  auth: AuthState;
  login: (username: string, password: string, rememberMe?: boolean) => Promise<void>;
  loginWithOIDC: () => Promise<void>;
  logout: () => Promise<void>;
  completeMfaLogin: (username: string, rememberMe?: boolean) => Promise<{ token: string; refreshToken: string; } | null>;
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
        // Check if MFA is required
        if ('mfaRequired' in result && result.mfaRequired) {
          // Handle MFA required response
          // For now, just set loading to false and don't set isAuthenticated
          setAuth(prev => ({
            ...prev,
            loading: false,
            error: null,
            // Store MFA info in the auth state for use by MFA components
            mfaRequired: result.mfaRequired,
            mfaType: result.mfaType,
            username: result.username,
            totpEnabled: (result as any).totpEnabled,
            webAuthnEnabled: (result as any).webAuthnEnabled,
          }));

          // We don't redirect to MFA pages, instead we let the UI components
          // handle the display of MFA verification UI based on the auth state
        } else if ('token' in result) {
          // Normal authentication success
          setAuth({
            isAuthenticated: true,
            username,
            loading: false,
            error: null,
          });
        }
      } else {
        console.error('Invalid username or password');
        setAuth(prev => ({
          ...prev,
          loading: false,
          error: 'Invalid username or password',
        }));
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

  // Complete MFA login after successful verification
  const completeMfaLogin = async (username: string, rememberMe: boolean = false): Promise<{ token: string; refreshToken: string; } | null> => {
    try {
      console.log('AuthContext: Starting completeMfaLogin for user:', username);
      setAuth(prev => ({ ...prev, loading: true, error: null }));

      // Use the user manager to complete MFA login
      console.log('AuthContext: Calling userManager.completeMfaLogin');
      const result = await userManager.completeMfaLogin(username, rememberMe);
      console.log('AuthContext: Result from userManager.completeMfaLogin:', result);

      if (result) {
        console.log('AuthContext: Result exists, checking for token property');
        // Authentication success
        setAuth({
          isAuthenticated: true,
          username,
          loading: false,
          error: null,
          // Clear MFA flags
          mfaRequired: false,
          mfaType: undefined,
        });
        console.log('AuthContext: Authentication successful, updated auth state');
        return result; // Return the result to the caller
      } else {
        console.error('AuthContext: Failed to complete MFA login, result is null or undefined');
        setAuth(prev => ({
          ...prev,
          loading: false,
          error: 'Failed to complete authentication',
        }));
        return null; // Explicitly return null in error case
      }
    } catch (err) {
      console.error('AuthContext: MFA login error:', err);
      setAuth(prev => ({
        ...prev,
        loading: false,
        error: 'Failed to complete authentication',
      }));
      return null; // Explicitly return null in error case
    }
  };

  // Provide the context value
  const contextValue: AuthContextType = {
    auth,
    login,
    loginWithOIDC,
    logout,
    completeMfaLogin,
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
