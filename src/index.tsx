import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import App from './App';
// Import axios config to set up interceptors
import './utils/axiosConfig';

// Create a theme instance
const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
    background: {
      default: '#f5f5f5',
    },
  },
});

type RuntimeEnv = Record<string, string> | undefined;

// Add TypeScript declaration for window._env_
declare global {
  interface Window {
    _env_?: RuntimeEnv;
  }
}

/**
 * Resolves the port used to download env-config.js.
 * Priority:
 *   1. Explicit port in the current URL (window.location.port)
 *   2. Runtime / build-time variable REACT_APP_PROXY_PORT
 *   3. Protocol default (https → 443, http → 80) or dev fallback (3001)
 */
const resolveEnvConfigPort = (): string | undefined => {
  const currentPort = window.location.port;

  if (currentPort && currentPort !== '3000') return currentPort;

  const buildTimePort = (typeof process !== 'undefined' && (process as any).env && (process as any).env.REACT_APP_PROXY_PORT) as string | undefined;
  if (buildTimePort) return buildTimePort;

  // For development environment
  if (currentPort === '3000') return '3001';
  
  // For HTTPS with empty port string or HTTP without port
  if (currentPort === '') {
    return window.location.protocol === 'https:' ? '443' : '80';
  }
  
  // Fallback for any other case
  return '3001';
};

/**
 * Fetches env-config.js and injects the variables into window._env_.
 */
const fetchEnvConfig = async (): Promise<void> => {
  try {
    // Check if window._env_ is already defined (from the injected script)
    if (window._env_) {
      console.log('Environment variables already loaded from injected script');
      return;
    }

    const { protocol, hostname } = window.location;
    const port = resolveEnvConfigPort();

    // Do not include default ports (80/443) in the URL
    const omitPort =
        (protocol === 'https:' && port === '443') ||
        (protocol === 'http:' && port === '80');
    const portSegment = omitPort || !port ? '' : `:${port}`;

    const envConfigUrl = `${protocol}//${hostname}${portSegment}/env-config.js`;

    const response = await fetch(envConfigUrl);
    if (!response.ok) {
      console.error(
          `Failed to load env-config.js (status ${response.status})`
      );
      return;
    }

    // For JavaScript response, we need to evaluate it instead of parsing as JSON
    // The script will set window._env_ directly, so we don't need to assign it here
    const scriptText = await response.text();
    
    // Create a function from the script text and execute it in the current context
    // This is safer than using eval() directly
    new Function(scriptText)();
    
    console.log('Environment variables loaded dynamically');
  } catch (err) {
    console.error('Error while loading environment variables:', err);
  }
};

// Load environment variables before rendering the app
fetchEnvConfig().then(() => {
  const root = ReactDOM.createRoot(
      document.getElementById('root') as HTMLElement
  );

  root.render(
      <React.StrictMode>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            <App />
          </ThemeProvider>
        </BrowserRouter>
      </React.StrictMode>
  );
});
