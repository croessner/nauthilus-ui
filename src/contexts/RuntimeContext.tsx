import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import axios from '../utils/axiosConfig';
import { ConnectionConfig, LuaHooksConfig } from '../types/config';
import { withErrorHandling as apiWithErrorHandling } from '../utils/apiUtils';

const DEFAULT_CONFIG: ConnectionConfig = {
  backend_url: '',
  basic_auth: {
    enabled: false,
    username: '',
    password: ''
  },
  oidc_auth: {
    enabled: false,
    client_id: '',
    client_secret: '',
    scope: '',
    token: ''
  }
}

// Define the context type
interface RuntimeContextType {
  connection: ConnectionConfig;
  hooks: LuaHooksConfig | null;
  loading: boolean;
  error: string | null;
  loadRuntimeSettings: (userId: string, profileName: string) => Promise<void>;
  saveRuntimeSettings: (userId: string, profileName: string, connection: any, hooks: LuaHooksConfig) => Promise<void>;
  clearError: () => void;
}

// Create the context with a default value
const RuntimeContext = createContext<RuntimeContextType | undefined>(undefined);

// Helper function to get the current user ID
export const getCurrentUserId = async (): Promise<string> => {
  // Always return default-user since we're storing userId-Session-Infos only in browser
  return 'default-user';
};

// Provider component
interface RuntimeProviderProps {
  children: ReactNode;
}

export const RuntimeProvider = ({ children }: RuntimeProviderProps): React.JSX.Element => {
  const [connection, setConnection] = useState<any | null>(DEFAULT_CONFIG);
  const [hooks, setHooks] = useState<LuaHooksConfig | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Helper function to wrap operations with error handling
  const withErrorHandling = useCallback(async <T,>(
    operation: () => Promise<T> | T,
    errorMessage: string
  ): Promise<T | undefined> => {
    return apiWithErrorHandling(setLoading, setError, operation, errorMessage);
  }, [setLoading, setError]);

  // Function to load runtime settings
  const loadRuntimeSettings = useCallback(async (userId: string, profileName: string) => {
    await withErrorHandling(async () => {
      // Call the Runtime API to load the settings
      const response = await axios.get(`/api/runtime/${userId}/${profileName}`);

      if (response.data) {
        // Update connection settings if they exist
        if (response.data.connection && Object.keys(response.data.connection).length > 0) {
          setConnection(response.data.connection);
          console.log('Connection settings loaded from runtime collection');
        } else {
          setConnection(DEFAULT_CONFIG);
          console.log('No connection settings found in runtime collection, using default config');
        }

        // Update hooks settings if they exist
        if (response.data.hooks && Object.keys(response.data.hooks).length > 0) {
          setHooks(response.data.hooks as LuaHooksConfig);
          console.log('Hooks settings loaded from runtime collection');
        } else {
          setHooks(null);
          console.log('No hooks settings found in runtime collection');
        }

        console.log('Runtime settings loaded successfully');
        return true;
      }

      return false;
    }, 'Failed to load runtime settings. Please try again.');
  }, [withErrorHandling]);

  // Function to save runtime settings
  const saveRuntimeSettings = useCallback(async (
    userId: string, 
    profileName: string, 
    connectionData: any, 
    hooksData: LuaHooksConfig
  ) => {
    await withErrorHandling(async () => {
      // Call the Runtime API to save the settings
      await axios.post(`/api/runtime/${userId}/${profileName}`, {
        connection: connectionData,
        hooks: hooksData
      });

      // Update local state
      setConnection(connectionData);
      setHooks(hooksData);

      console.log('Runtime settings saved successfully');
      return true;
    }, 'Failed to save runtime settings. Please try again.');
  }, [withErrorHandling]);

  // Function to clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Provide the context value
  const contextValue: RuntimeContextType = {
    connection: connection || DEFAULT_CONFIG,
    hooks,
    loading,
    error,
    loadRuntimeSettings,
    saveRuntimeSettings,
    clearError
  };

  return (
    <RuntimeContext.Provider value={contextValue}>
      {children}
    </RuntimeContext.Provider>
  );
};

// Custom hook to use the runtime context
export const useRuntime = (): RuntimeContextType => {
  const context = useContext(RuntimeContext);
  if (context === undefined) {
    throw new Error('useRuntime must be used within a RuntimeProvider');
  }
  return context;
};
