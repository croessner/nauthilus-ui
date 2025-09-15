/**
 * Utility functions for API operations
 */
import Cookies from 'js-cookie';

/**
 * Retrieves the proxy origin URL based on the current environment configuration.
 *
 * The function checks the following sources in order of priority:
 * 1. `window._env_?.REACT_APP_PROXY_PORT` - If available, this port value is used.
 * 2. `process.env.REACT_APP_PROXY_PORT` - If running in a Node.js-like environment, this port value is used.
 * 3. Fallback to the default port `3002` if neither of the above are defined.
 *
 * A debug message is logged for each source used to determine the port.
 *
 * @returns {string} The generated proxy origin URL based on the chosen port.
 */
export const getProxyOrigin = (): string => {
  if (window._env_?.REACT_APP_PROXY_PORT) {
    console.debug('[getProxyOrigin] Source: window._env_, Port:', window._env_.REACT_APP_PROXY_PORT);
    return buildUrl(window._env_.REACT_APP_PROXY_PORT);
  }

  if (typeof process !== 'undefined' && process.env.REACT_APP_PROXY_PORT) {
    console.debug('[getProxyOrigin] Source: process.env, Port:', process.env.REACT_APP_PROXY_PORT);
    return buildUrl(process.env.REACT_APP_PROXY_PORT);
  }

  console.debug('[getProxyOrigin] Source: Fallback, Port: 3002');
  return buildUrl('3002');
};

/**
 * Constructs a URL based on the provided port and current window location details.
 *
 * @param {string} port - The port to use when building the URL. If the port is "443" and the protocol is "https:", the port is omitted from the URL.
 * @return {string} The constructed URL as a string.
 */
function buildUrl(port: string): string {
  const { protocol, hostname } = window.location;
  return port === '443' && protocol === 'https:'
      ? `${protocol}//${hostname}`
      : `${protocol}//${hostname}:${port}`;
}

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
    // Treat missing URL as a disconnected state to avoid lingering "Not checked"
    setConnectionStatus('disconnected');
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

  // Decide whether to set a default Content-Type
  const method = (options.method || 'GET').toUpperCase();
  const hasBody = options.body !== undefined && options.body !== null;
  const isFormData = typeof FormData !== 'undefined' && hasBody && options.body instanceof FormData;

  // Only set Content-Type automatically when:
  // - there is a request body
  // - it's not FormData (browser will set proper boundary)
  // - caller did not already provide Content-Type
  // Do NOT set for GET/HEAD requests or when no body is present.
  if (hasBody && !isFormData && !headers.has('Content-Type') && method !== 'GET' && method !== 'HEAD') {
    headers.set('Content-Type', 'application/json');
  }

  // Add Authorization header if token exists
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Merge options with headers
  const fetchOptions: RequestInit = {
    ...options,
    headers,
    // Ensure cookies (HttpOnly JWT) are sent to the proxy (different origin/port)
    credentials: 'include'
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
    // Get current connection data (may be empty on first render)
    const currentConnection = getConnection();
    const currentConnectionUrl = currentConnection?.backend_url || '';

    // Initialize settings state singleton on window
    if (!window.__settingsState) {
      window.__settingsState = {
        loaded: false,
        profileName: '',
        connectionUrl: '',
        lastCheckedUrl: '',
        lastCheckedAt: 0,
        inFlightKey: '',
        inFlightPromise: undefined as Promise<void> | undefined,
      } as any;
    }

    const state: any = window.__settingsState!;

    // Helper: decide whether we should run a connection check right now
    const shouldCheckNow = (url: string): boolean => {
      if (!url) return false; // nothing to check
      // Avoid immediate repeats (e.g., React StrictMode double effects in DEV)
      const now = Date.now();
      const lastUrl = state.lastCheckedUrl || '';
      const lastAt = state.lastCheckedAt || 0;
      const isSameUrl = lastUrl === url;
      const withinDebounce = now - lastAt < 1500; // 1.5s debounce window
      return !(isSameUrl && withinDebounce);
    };

    // Compute a key for the current desired load
    const desiredKey = `${currentProfileName}|${currentConnectionUrl}`;

    // If a matching load is already in-flight, await it instead of starting another
    if (state.inFlightPromise && state.inFlightKey === desiredKey) {
      await state.inFlightPromise;
      // After in-flight finishes, do a debounced ping if needed and exit
      if (shouldCheckNow(currentConnectionUrl)) {
        await checkConnection(getConnection());
        state.lastCheckedUrl = currentConnectionUrl;
        state.lastCheckedAt = Date.now();
      }
      return;
    }

    // Check if we actually need to reload
    const needsReload = !state.loaded ||
      state.profileName !== currentProfileName ||
      state.connectionUrl !== currentConnectionUrl;

    if (!needsReload) {
      // Already up-to-date, just do a debounced connection check
      if (shouldCheckNow(currentConnectionUrl)) {
        await checkConnection(currentConnection);
        state.lastCheckedUrl = currentConnectionUrl;
        state.lastCheckedAt = Date.now();
      }
      return;
    }

    // Start a new in-flight load for this key
    state.inFlightKey = desiredKey;
    state.inFlightPromise = (async () => {
      console.log(`Loading settings for profile: ${currentProfileName}, preload connection: ${currentConnectionUrl || '(none)'}`);
      const userId = await getCurrentUserId();
      await loadRuntimeSettings(userId, currentProfileName);

      // Give React state a tick to propagate (RuntimeContext updates connection asynchronously)
      await new Promise(resolve => setTimeout(resolve, 0));

      // After load, re-read connection and ping (debounced)
      const connectionToCheck = getConnection();
      const urlToCheck = connectionToCheck?.backend_url || '';
      console.log(`Runtime settings loaded for profile: ${currentProfileName}, effective connection: ${urlToCheck || '(none)'}`);
      if (shouldCheckNow(urlToCheck)) {
        await checkConnection(connectionToCheck);
        state.lastCheckedUrl = urlToCheck;
        state.lastCheckedAt = Date.now();
      }

      // Mark as loaded
      state.loaded = true;
      state.profileName = currentProfileName;
      state.connectionUrl = urlToCheck;
    })();

    try {
      await state.inFlightPromise;
    } finally {
      // Clear in-flight markers only if they correspond to this key
      if (state.inFlightKey === desiredKey) {
        state.inFlightPromise = undefined;
        state.inFlightKey = '';
      }
    }
  } catch (error) {
    console.error('Failed to load runtime settings:', error);
  }
};
