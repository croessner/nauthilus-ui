/**
 * Utility functions for API operations
 */
import Cookies from 'js-cookie';

/**
 * Returns the proxy server origin (protocol, hostname, and port)
 * @returns The proxy server origin URL
 */
export const getProxyOrigin = (): string => {
  // Check window._env_ first, then fall back to process.env, then default to '3002'
  const port = (window._env_ && window._env_['REACT_APP_PROXY_PORT']) || 
               process.env.REACT_APP_PROXY_PORT || 
               '3002';
  
  // If we're using HTTPS on port 443, don't include the port in the URL
  return port === '443' && window.location.protocol === 'https:' 
    ? `${window.location.protocol}//${window.location.hostname}`
    : `${window.location.protocol}//${window.location.hostname}:${port}`;
};

/**
 * Gets the current JWT token from cookies
 * @returns The JWT token or null if not found
 */
export const getAuthToken = (): string | null => {
  // Get token from cookie (TOKEN_COOKIE_NAME from userManager.ts is 'nauthilus_token')
  const token = Cookies.get('nauthilus_token');
  
  return token || null;
};

/**
 * Prepares authentication parameters for API requests
 * @param connectionConfig - The connection configuration object containing auth settings
 * @returns An object with authType and authValue properties
 */
export const prepareAuthParams = (connectionConfig: any): { authType: string, authValue: string } => {
  let authType = '';
  let authValue = '';

  // Add Basic Auth if enabled
  if (connectionConfig.basic_auth?.enabled && 
      connectionConfig.basic_auth.username && 
      connectionConfig.basic_auth.password) {
    authType = 'basic';
    authValue = btoa(`${connectionConfig.basic_auth.username}:${connectionConfig.basic_auth.password}`);
  }

  // For JWT Auth, use existing token if available
  if (connectionConfig.jwt_auth?.enabled && connectionConfig.jwt_auth.token) {
    authType = 'bearer';
    authValue = connectionConfig.jwt_auth.token;
  }

  return { authType, authValue };
};

/**
 * Extracts a detailed error message from an API response
 * @param response - The Response object from a fetch request
 * @returns A formatted error message string
 */
export const extractErrorMessage = async (response: Response): Promise<string> => {
  const errorData = await response.json().catch(() => ({ error: response.statusText }));

  // Extract more detailed error information if available
  let errorMessage = errorData.error || response.statusText;

  // Add HTTP status code to the error message
  errorMessage = `[${response.status} ${response.statusText}] ${errorMessage}`;

  // Check if there are detailed error information fields
  if (errorData.details) {
    errorMessage = `${errorMessage}: ${errorData.details}`;
  } else if (errorData.code) {
    errorMessage = `${errorMessage} (Code: ${errorData.code})`;
  }

  // Check if there's a more detailed error message in the result field
  if (errorData.result && typeof errorData.result === 'object') {
    if (errorData.result.error) {
      errorMessage = `${errorMessage}: ${errorData.result.error}`;
    } else if (typeof errorData.result === 'string') {
      errorMessage = `${errorMessage}: ${errorData.result}`;
    } else if (JSON.stringify(errorData.result) !== '{}') {
      errorMessage = `${errorMessage}: ${JSON.stringify(errorData.result)}`;
    }
  }

  return errorMessage;
};

/**
 * Checks connection to the backend
 * @param connectionConfig - The connection configuration object
 * @param setConnectionStatus - Function to set the connection status
 * @param setStatusMessage - Function to set the status message
 */
export const checkConnection = async (
  connectionConfig: any,
  setConnectionStatus: (status: 'unknown' | 'connected' | 'disconnected' | 'checking') => void,
  setStatusMessage: (message: string) => void
) => {
  if (!connectionConfig.backend_url) {
    setConnectionStatus('unknown');
    setStatusMessage('No backend URL configured');
    return;
  }

  setConnectionStatus('checking');
  setStatusMessage('Checking connection...');

  try {
    // Use the proxy endpoint to make the request server-side
    const proxyUrl = new URL('/proxy/ping', getProxyOrigin());
    proxyUrl.searchParams.append('url', connectionConfig.backend_url);

    // Use the authenticatedFetch helper
    const response = await authenticatedFetch(proxyUrl.toString(), {
      method: 'GET',
    });

    if (response.ok) {
      setConnectionStatus('connected');
      setStatusMessage('Connected to Nauthilus backend (ping successful)');
    } else {
      setConnectionStatus('disconnected');
      const errorMessage = await extractErrorMessage(response);
      setStatusMessage(`Failed to connect: ${errorMessage}`);
    }
  } catch (error) {
    console.error('Error checking connection:', error);
    setConnectionStatus('disconnected');
    setStatusMessage(`Connection error: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * Helper function to wrap operations with error handling
 * @param setLoading - Function to set loading state
 * @param setError - Function to set error state
 * @param operation - The operation to execute
 * @param errorMessage - Error message to display if operation fails
 * @returns The result of the operation or undefined if it fails
 */
export const withErrorHandling = async <T,>(
  setLoading: (loading: boolean) => void,
  setError: (error: string | null) => void,
  operation: () => Promise<T> | T,
  errorMessage: string
): Promise<T | undefined> => {
  try {
    setLoading(true);
    setError(null);
    return await operation();
  } catch (err) {
    setError(errorMessage);
    console.error(`${errorMessage}:`, err);
    return undefined;
  } finally {
    setLoading(false);
  }
};

/**
 * Resets the settings state to force a reload on the next call to loadSettings
 */
export const resetSettingsState = () => {
  if (window.__settingsState) {
    window.__settingsState.loaded = false;
  }
  console.log('Settings state reset, next call to loadSettings will reload settings');
};

/**
 * Performs an authenticated fetch request with JWT token
 * @param url - The URL to fetch
 * @param options - Fetch options
 * @returns The fetch response
 */
export const authenticatedFetch = async (
  url: string,
  options: RequestInit = {}
): Promise<Response> => {
  // Get the JWT token
  const token = getAuthToken();
  
  // Prepare headers
  const headers = new Headers(options.headers || {});
  
  // Set default content type if not already set
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  
  // Add Authorization header if token exists
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  // Merge options with headers
  const fetchOptions: RequestInit = {
    ...options,
    headers
  };
  
  // Perform the fetch
  return fetch(url, fetchOptions);
};

/**
 * Loads runtime settings and checks connection status
 * @param getCurrentUserId - Function to get the current user ID
 * @param loadRuntimeSettings - Function to load runtime settings
 * @param currentProfileName - Current profile name
 * @param checkConnection - Function to check connection status
 * @param getConnection - Function to get the current connection configuration
 */
export const loadSettings = async (
  getCurrentUserId: () => Promise<string>,
  loadRuntimeSettings: (userId: string, profileName: string) => Promise<void>,
  currentProfileName: string,
  checkConnection: (connectionConfig: any) => Promise<void>,
  getConnection: () => any
) => {
  try {
    // Get current connection data
    const currentConnection = getConnection();
    const currentConnectionUrl = currentConnection?.backend_url || '';

    // Initialize settings state if it doesn't exist
    if (!window.__settingsState) {
      window.__settingsState = {
        loaded: false,
        profileName: '',
        connectionUrl: ''
      };
    }

    // Check if we need to reload settings
    const needsReload = !window.__settingsState.loaded || 
                        window.__settingsState.profileName !== currentProfileName ||
                        window.__settingsState.connectionUrl !== currentConnectionUrl;

    if (!needsReload) {
      console.log('Settings already loaded for current profile and connection, skipping reload');

      // Still check connection with current connection data
      if (currentConnectionUrl) {
        await checkConnection(currentConnection);
      }
      return;
    }

    console.log(`Loading settings for profile: ${currentProfileName}, connection: ${currentConnectionUrl}`);

    const userId = await getCurrentUserId();
    await loadRuntimeSettings(userId, currentProfileName);

    // Check connection status after loading runtime settings
    // This ensures we have the latest connection data
    // Get the connection AFTER loadRuntimeSettings has completed
    const connectionToCheck = getConnection();
    if (connectionToCheck?.backend_url) {
      await checkConnection(connectionToCheck);
    }

    // Update settings state
    window.__settingsState = {
      loaded: true,
      profileName: currentProfileName,
      connectionUrl: connectionToCheck?.backend_url || ''
    };
  } catch (error) {
    console.error('Failed to load runtime settings:', error);
  }
};
