import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { NauthilusConfig } from '../types/config';
import yaml from 'js-yaml';

// Define the context type
interface ConfigContextType {
  config: NauthilusConfig | null;
  loading: boolean;
  error: string | null;
  hasUnsavedChanges: boolean;
  refreshConfig: () => Promise<void>;
  updateConfig: (config: NauthilusConfig) => Promise<void>;
  updateConfigSection: (section: string, data: any) => Promise<void>;
  uploadConfig: (file: File) => Promise<void>;
  downloadConfig: () => void;
  resetConfig: () => void;
  setHasUnsavedChanges: (value: boolean) => void;
}

// Create the context with a default value
const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

// Storage key for the configuration
const CONFIG_STORAGE_KEY = 'nauthilus-config';

// Default empty configuration
const DEFAULT_CONFIG: NauthilusConfig = {
  server: {
    address: '127.0.0.1:8080',
    max_concurrent_requests: 100,
    max_password_history_entries: 10,
    redis: {
      database_number: 0,
      prefix: 'nt_',
      master: {
        address: '127.0.0.1:6379'
      }
    }
  }
};

// Provider component
interface ConfigProviderProps {
  children: ReactNode;
}

export const ConfigProvider: React.FC<ConfigProviderProps> = ({ children }) => {
  const [config, setConfig] = useState<NauthilusConfig | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);

  // Function to load the configuration from local storage
  const refreshConfig = async () => {
    try {
      setLoading(true);
      setError(null);

      const storedConfig = localStorage.getItem(CONFIG_STORAGE_KEY);
      if (storedConfig) {
        setConfig(JSON.parse(storedConfig));
      } else {
        // Use default config if none exists
        setConfig(DEFAULT_CONFIG);
        localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(DEFAULT_CONFIG));
      }
    } catch (err) {
      setError('Failed to load configuration. Please try again.');
      console.error('Error loading configuration:', err);
    } finally {
      setLoading(false);
    }
  };

  // Function to update the entire configuration
  const updateConfig = async (newConfig: NauthilusConfig) => {
    try {
      setLoading(true);
      setError(null);

      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(newConfig));
      setConfig(newConfig);
    } catch (err) {
      setError('Failed to update configuration. Please try again.');
      console.error('Error updating configuration:', err);
    } finally {
      setLoading(false);
    }
  };

  // Function to update a specific section of the configuration
  const updateConfigSection = async (section: string, data: any) => {
    try {
      setLoading(true);
      setError(null);

      if (!config) {
        throw new Error('No configuration loaded');
      }

      // Create a new config object with the updated section
      const newConfig = { ...config };

      // Merge the new data with the existing data instead of replacing it entirely
      (newConfig as any)[section] = {
        ...(newConfig as any)[section],
        ...data
      };

      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(newConfig));
      setConfig(newConfig);

      // Reset unsaved changes flag since we've just saved
      setHasUnsavedChanges(false);
    } catch (err) {
      setError(`Failed to update ${section} configuration. Please try again.`);
      console.error(`Error updating ${section} configuration:`, err);
    } finally {
      setLoading(false);
    }
  };

  // Function to upload a configuration file
  const uploadConfig = async (file: File) => {
    try {
      setLoading(true);
      setError(null);

      const fileContent = await file.text();
      let newConfig: NauthilusConfig;

      // Parse the file content based on the file extension
      if (file.name.endsWith('.json')) {
        newConfig = JSON.parse(fileContent);
      } else if (file.name.endsWith('.yml') || file.name.endsWith('.yaml')) {
        newConfig = yaml.load(fileContent) as NauthilusConfig;
      } else {
        throw new Error('Unsupported file format. Please upload a JSON or YAML file.');
      }

      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(newConfig));
      setConfig(newConfig);
    } catch (err) {
      setError('Failed to upload configuration. Please check the file format.');
      console.error('Error uploading configuration:', err);
    } finally {
      setLoading(false);
    }
  };

  // Function to download the current configuration
  const downloadConfig = () => {
    try {
      if (!config) {
        throw new Error('No configuration to download');
      }

      // Check if there are unsaved changes
      if (hasUnsavedChanges) {
        setError('Please save your changes before downloading the configuration.');
        return;
      }

      // Validate required fields before allowing download
      const validationErrors = validateConfig(config);
      if (validationErrors.length > 0) {
        setError(`Cannot download configuration: ${validationErrors.join(', ')}`);
        return;
      }

      // Create a deep copy of the configuration to ensure all nested objects are included
      const configToDownload = JSON.parse(JSON.stringify(config));

      // Convert the configuration to YAML
      const yamlContent = yaml.dump(configToDownload);

      // Create a blob and download link
      const blob = new Blob([yamlContent], { type: 'text/yaml' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = 'nauthilus.yml';
      document.body.appendChild(a);
      a.click();

      // Clean up
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to download configuration.');
      console.error('Error downloading configuration:', err);
    }
  };

  // Function to validate the configuration
  const validateConfig = (config: NauthilusConfig): string[] => {
    const errors: string[] = [];

    // Validate server configuration
    if (!config.server.address) {
      errors.push('Server address is required');
    }
    if (!config.server.instance_name) {
      errors.push('Instance name is required');
    }
    if (config.server.max_concurrent_requests === undefined || config.server.max_concurrent_requests < 1) {
      errors.push('Max concurrent requests must be at least 1');
    }
    if (config.server.max_password_history_entries === undefined || config.server.max_password_history_entries < 1) {
      errors.push('Max password history entries must be at least 1');
    }

    // Validate Redis configuration
    if (!config.server.redis) {
      errors.push('Redis configuration is required');
    } else {
      // Validate Redis setup type
      const hasStandaloneMaster = config.server.redis.master?.address;
      const hasStandaloneReplica = config.server.redis.replica?.addresses?.length || config.server.redis.replica?.address;
      const hasSentinel = config.server.redis.sentinels?.addresses?.length && config.server.redis.sentinels?.master;
      const hasCluster = config.server.redis.cluster?.addresses?.length;

      if (!hasStandaloneMaster && !hasStandaloneReplica && !hasSentinel && !hasCluster) {
        errors.push('At least one Redis setup type (Master, Replica, Sentinel, or Cluster) must be configured');
      }
    }

    // Validate basic auth configuration if enabled
    if (config.server.basic_auth?.enabled) {
      if (!config.server.basic_auth.username) {
        errors.push('Basic Auth username is required when Basic Auth is enabled');
      }
      if (!config.server.basic_auth.password) {
        errors.push('Basic Auth password is required when Basic Auth is enabled');
      } else if (config.server.basic_auth.password.length < 16) {
        errors.push('Basic Auth password must be at least 16 characters');
      }
    }

    // Validate JWT auth configuration if enabled
    if (config.server.jwt_auth?.enabled) {
      if (!config.server.jwt_auth.secret_key) {
        errors.push('JWT secret key is required when JWT Auth is enabled');
      } else if (config.server.jwt_auth.secret_key.length < 32) {
        errors.push('JWT secret key must be at least 32 characters');
      }
      if (!config.server.jwt_auth.token_expiry) {
        errors.push('JWT token expiry is required when JWT Auth is enabled');
      }
      if (config.server.jwt_auth.refresh_token && !config.server.jwt_auth.refresh_token_expiry) {
        errors.push('JWT refresh token expiry is required when refresh tokens are enabled');
      }
    }

    return errors;
  };

  // Function to reset the configuration to default
  const resetConfig = () => {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(DEFAULT_CONFIG));
    setConfig(DEFAULT_CONFIG);
  };

  // Load the configuration when the component mounts
  useEffect(() => {
    refreshConfig();
  }, []);

  // Provide the context value
  const contextValue: ConfigContextType = {
    config,
    loading,
    error,
    hasUnsavedChanges,
    refreshConfig,
    updateConfig,
    updateConfigSection,
    uploadConfig,
    downloadConfig,
    resetConfig,
    setHasUnsavedChanges,
  };

  return (
    <ConfigContext.Provider value={contextValue}>
      {children}
    </ConfigContext.Provider>
  );
};

// Custom hook to use the config context
export const useConfig = (): ConfigContextType => {
  const context = useContext(ConfigContext);
  if (context === undefined) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
};
