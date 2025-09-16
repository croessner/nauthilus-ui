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
  // Adaptive CAPTCHA support
  captchaRequired?: boolean;
  recaptchaSiteKey?: string;
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
  // Dynamically load the reCAPTCHA script when needed
  const loadRecaptchaScript = (siteKey: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!siteKey) return reject(new Error('Missing reCAPTCHA site key'));
      // If grecaptcha already present, resolve
      if ((window as any).grecaptcha && (window as any).grecaptcha.execute) {
        resolve();
        return;
      }
      // Check if script already added
      const existing = document.querySelector(`script[data-recaptcha="${siteKey}"]`);
      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('Failed to load reCAPTCHA')));
        return;
      }
      const script = document.createElement('script');
      script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
      script.async = true;
      script.defer = true;
      script.setAttribute('data-recaptcha', siteKey);
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load reCAPTCHA'));
      document.head.appendChild(script);
    });
  };

  const getRecaptchaToken = async (siteKey: string): Promise<string | null> => {
    try {
      await loadRecaptchaScript(siteKey);
      const grecaptcha: any = (window as any).grecaptcha;
      if (!grecaptcha || !grecaptcha.execute) return null;
      await new Promise<void>((res) => grecaptcha.ready(() => res()));
      const token: string = await grecaptcha.execute(siteKey, { action: 'login' });
      return token || null;
    } catch (e) {
      console.error('Failed to obtain reCAPTCHA token:', e);
      return null;
    }
  };
  const [auth, setAuth] = useState<AuthState>({
    isAuthenticated: false,
    username: null,
    loading: true,
    error: null,
  });

  // Check if the user is already authenticated on the mount
  useEffect(() => {
    // Skip initial auth check on public auth routes to avoid 401 spam on Login/MFA pages
    const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
    const isPublicAuthPath = pathname === '/login' || pathname === '/mfa' || pathname === '/oidc/callback' || pathname === '/oidc/callback/';

    // Prevent duplicate checks in React StrictMode (DEV)
    const hasRun = typeof window !== 'undefined' ? (window as any).__authInitRan : false;
    if (hasRun) {
      return;
    }
    if (typeof window !== 'undefined') {
      (window as any).__authInitRan = true;
    }

    const checkAuth = async () => {
      try {
        if (isPublicAuthPath) {
          // On login/MFA/OIDC pages, do not ping /api/auth/me pre-auth
          setAuth({
            isAuthenticated: false,
            username: null,
            loading: false,
            error: null,
          });
          return;
        }

        const currentUser = await userManager.getCurrentUser();
        if (currentUser) {
          setAuth({
            isAuthenticated: true,
            username: currentUser.username,
            loading: false,
            error: null,
          });
          // Post-auth: initialize protected config/user caches
          try { await userManager.initialize(); } catch { /* ignore init errors */ }
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
        // Check if CAPTCHA is required (adaptive)
        if ('captchaRequired' in result && result.captchaRequired) {
          const siteKey = (result as any).recaptchaSiteKey || (import.meta as any).env?.VITE_RECAPTCHA_SITE_KEY;
          // Try to auto-resolve using reCAPTCHA v3 if possible
          let token: string | null = null;
          if (siteKey) {
            token = await getRecaptchaToken(siteKey);
          }
          if (token) {
            const retry = await userManager.authenticate(username, password, rememberMe, token);
            if (retry) {
              if ('mfaRequired' in retry && retry.mfaRequired) {
                setAuth(prev => ({
                  ...prev,
                  loading: false,
                  error: null,
                  mfaRequired: retry.mfaRequired,
                  mfaType: retry.mfaType,
                  username: retry.username,
                  totpEnabled: (retry as any).totpEnabled,
                  webAuthnEnabled: (retry as any).webAuthnEnabled,
                  // clear captcha flags on success path to MFA
                  captchaRequired: undefined,
                  recaptchaSiteKey: undefined,
                }));
                return;
              } else if ('token' in retry) {
                setAuth({
                  isAuthenticated: true,
                  username,
                  loading: false,
                  error: null,
                });
                // Initialize protected data after authentication
                try { await userManager.initialize(); } catch { /* ignore */ }
                return;
              }
            }
          }
          // If auto-retry failed or no site key, surface requirement to UI
          setAuth(prev => ({
            ...prev,
            loading: false,
            error: token ? 'Captcha verification failed' : 'Additional verification required',
            captchaRequired: true,
            recaptchaSiteKey: siteKey,
          }));
          return;
        }
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
          // Initialize protected data after authentication
          try { await userManager.initialize(); } catch { /* ignore */ }
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

      // Redirect to OIDC provider via backend endpoint
      window.location.href = '/api/auth/oidc/login';

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
        // Initialize protected data after authentication (post-MFA)
        try { await userManager.initialize(); } catch { /* ignore */ }
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
