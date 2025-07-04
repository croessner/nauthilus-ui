import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { NauthilusConfig, LuaHooksConfig } from '../types/config';
import yaml from 'js-yaml';
import axios from 'axios';
import { withErrorHandling as apiWithErrorHandling, prepareAuthParams } from '../utils/apiUtils';

// Interface for configuration profiles
interface ConfigProfile {
  name: string;
  config: NauthilusConfig;
}

// Define the context type
interface ConfigContextType {
  config: NauthilusConfig | null;
  loading: boolean;
  error: string | null;
  hasUnsavedChanges: boolean;
  profiles: ConfigProfile[];
  currentProfileName: string;
  refreshConfig: () => Promise<void>;
  updateConfig: (config: NauthilusConfig) => Promise<void>;
  updateConfigSection: (section: string, data: any) => Promise<void>;
  uploadConfig: (file: File, profileName?: string) => Promise<void>;
  downloadConfig: () => void;
  resetConfig: () => Promise<void>;
  loadConfigFromBackend: (connectionConfig: any) => Promise<void>;
  setHasUnsavedChanges: (value: boolean) => void;
  setError: (error: string | null) => void;
  validateConfigSection: (section: string, config: NauthilusConfig) => string[];
  createProfile: (name: string, config?: NauthilusConfig) => Promise<void>;
  switchProfile: (name: string) => Promise<void>;
  renameProfile: (oldName: string, newName: string) => Promise<void>;
  deleteProfile: (name: string) => Promise<void>;
}

// Create the context with a default value
const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

// Storage keys for the configuration (kept for backward compatibility)
const DEFAULT_PROFILE_NAME = 'Default';

// Helper function to get the current user ID
const getCurrentUserId = async (): Promise<string> => {
  // Always return default-user since we're storing userId-Session-Infos only in browser
  return 'default-user';
};

// Default empty configuration
const DEFAULT_CONFIG: NauthilusConfig = {
  server: {
    address: '127.0.0.1:8080',
    instance_name: 'nauthilus',
    max_concurrent_requests: 100,
    max_password_history_entries: 10,
    backends: ['cache'],
    redis: {
      database_number: 0,
      prefix: 'nt:',
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

export const ConfigProvider = ({ children }: ConfigProviderProps): React.JSX.Element => {
  const [config, setConfig] = useState<NauthilusConfig | null>(null);
  const [profiles, setProfiles] = useState<ConfigProfile[]>([]);
  const [currentProfileName, setCurrentProfileName] = useState<string>(DEFAULT_PROFILE_NAME);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);

  // Helper function to wrap operations with error handling
  const withErrorHandling = useCallback(async <T,>(
    operation: () => Promise<T> | T,
    errorMessage: string
  ): Promise<T | undefined> => {
    return apiWithErrorHandling(setLoading, setError, operation, errorMessage);
  }, [setLoading, setError]);

  // Helper functions for validation
  const validateServerBasics = (config: NauthilusConfig, errors: string[]): void => {
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
  };

  const validateRedisConfiguration = (config: NauthilusConfig, errors: string[]): void => {
    if (!config.server.redis) {
      errors.push('Redis configuration is required');
      return;
    }

    // Determine which Redis setup type is being used
    const isMasterConfigured = config.server.redis.master && 
      (config.server.redis.master.address || 
       config.server.redis.master.username || 
       config.server.redis.master.password);

    const isReplicaConfigured = config.server.redis.replica && 
      (config.server.redis.replica.address || 
       (config.server.redis.replica.addresses && config.server.redis.replica.addresses.length > 0));

    const isSentinelConfigured = config.server.redis.sentinels && 
      (config.server.redis.sentinels.master || 
       (config.server.redis.sentinels.addresses && config.server.redis.sentinels.addresses.length > 0));

    const isClusterConfigured = config.server.redis.cluster && 
      (config.server.redis.cluster.addresses && config.server.redis.cluster.addresses.length > 0);

    // Validate the specific Redis setup type that's being configured
    if (isMasterConfigured && !config.server.redis.master?.address) {
      errors.push('Redis Master address is required when using Standalone Master configuration');
    }

    if (isReplicaConfigured && 
        !config.server.redis.replica?.address && 
        (!config.server.redis.replica?.addresses || config.server.redis.replica.addresses.length === 0)) {
      errors.push('At least one Redis Replica address is required when using Standalone Replica configuration');
    }

    if (isSentinelConfigured) {
      if (!config.server.redis.sentinels?.master) {
        errors.push('Redis Sentinel master name is required when using Sentinel configuration');
      }
      if (!config.server.redis.sentinels?.addresses || config.server.redis.sentinels.addresses.length === 0) {
        errors.push('At least one Redis Sentinel address is required when using Sentinel configuration');
      }
    }

    if (isClusterConfigured) {
      if (!config.server.redis.cluster?.addresses || config.server.redis.cluster.addresses.length === 0) {
        errors.push('At least one Redis Cluster address is required when using Cluster configuration');
      }
    }

    // Only validate that at least one type is configured if none of the specific types are being configured
    if (!isMasterConfigured && !isReplicaConfigured && !isSentinelConfigured && !isClusterConfigured) {
      errors.push('At least one Redis setup type (Master, Replica, Sentinel, or Cluster) must be configured');
    }

    // Validate Redis TLS configuration if enabled
    if (config.server.redis.tls?.enabled) {
      if (!config.server.redis.tls.cert) {
        errors.push('TLS certificate is required when Redis TLS is enabled');
      }
      if (!config.server.redis.tls.key) {
        errors.push('TLS key is required when Redis TLS is enabled');
      }
    }
  };

  const validateAuthConfigurations = (config: NauthilusConfig, errors: string[]): void => {
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
  };

  const validateLdapConfiguration = (config: NauthilusConfig, errors: string[]): void => {
    if (config.ldap) {
      // Validate LDAP configuration
      if (!config.ldap.config.lookup_pool_size || config.ldap.config.lookup_pool_size < 1) {
        errors.push('LDAP lookup pool size must be at least 1');
      }
      if (!config.ldap.config.server_uri || config.ldap.config.server_uri.length === 0) {
        errors.push('At least one LDAP server URI is required');
      }

      // Validate search protocols if they exist
      if (config.ldap.search && config.ldap.search.length > 0) {
        config.ldap.search.forEach((search, index) => {
          if (!search.protocol || search.protocol.length === 0) {
            errors.push(`Search protocol ${index + 1} must have at least one protocol`);
          }
          if (!search.cache_name) {
            errors.push(`Search protocol ${index + 1} must have a cache name`);
          }
          if (!search.base_dn) {
            errors.push(`Search protocol ${index + 1} must have a base DN`);
          }
          if (!search.mapping.account_field) {
            errors.push(`Search protocol ${index + 1} must have an account field mapping`);
          }
          if (!search.attribute || search.attribute.length === 0) {
            errors.push(`Search protocol ${index + 1} must have at least one attribute`);
          }
        });
      }
    }
  };

  const validateLuaConfiguration = (config: NauthilusConfig, errors: string[]): void => {
    if (config.lua) {
      // Validate Lua configuration
      if (config.lua.search && config.lua.search.length > 0) {
        config.lua.search.forEach((search, index) => {
          if (!search.protocol || search.protocol.length === 0) {
            errors.push(`Lua search protocol ${index + 1} must have at least one protocol`);
          }
          if (!search.cache_name) {
            errors.push(`Lua search protocol ${index + 1} must have a cache name`);
          }
        });
      }
    }
  };

  // Function to validate the configuration
  const validateConfig = useCallback((config: NauthilusConfig): string[] => {
    const errors: string[] = [];

    // Validate server configuration
    validateServerBasics(config, errors);

    // Validate that at least one backend is configured
    if (!config.server.backends || config.server.backends.length === 0) {
      errors.push('At least one backend must be configured');
    }

    // Validate Redis configuration
    validateRedisConfiguration(config, errors);

    // Validate auth configurations
    validateAuthConfigurations(config, errors);

    return errors;
  }, []);

  // Function to validate a specific section of the configuration
  const validateConfigSection = useCallback((section: string, config: NauthilusConfig): string[] => {
    const errors: string[] = [];

    switch (section) {
      case 'server':
        // Validate server configuration
        validateServerBasics(config, errors);
        validateRedisConfiguration(config, errors);
        validateAuthConfigurations(config, errors);
        break;

      case 'ldap':
        validateLdapConfiguration(config, errors);
        break;

      case 'lua':
        validateLuaConfiguration(config, errors);
        break;

      default:
        // For other sections, use the general validation
        errors.push(...validateConfig(config));
        break;
    }

    return errors;
  }, [validateConfig]);

  // Function to load the configuration profiles from MongoDB
  const refreshConfig = useCallback(async () => {
    await withErrorHandling(async () => {
      const userId = await getCurrentUserId();
      let profilesArray: ConfigProfile[];
      let currentProfile: string;

      try {
        // Try to load from API
        const response = await axios.get(`/api/profiles/${userId}`);
        profilesArray = response.data.profiles;
        currentProfile = response.data.currentProfileName;
      } catch (error) {
        console.log('Failed to load from API, creating default profile:', error);

        // Create a default profile if none exists
        profilesArray = [{ name: DEFAULT_PROFILE_NAME, config: DEFAULT_CONFIG }];
        currentProfile = DEFAULT_PROFILE_NAME;

        // Save to API for future use
        try {
          await axios.post(`/api/profiles/${userId}`, {
            profiles: profilesArray,
            currentProfileName: currentProfile
          });
          console.log('Created default profile in MongoDB');
        } catch (saveError) {
          console.error('Failed to save default profiles to API:', saveError);
          throw new Error('Failed to initialize profiles in MongoDB');
        }
      }

      // Make sure the current profile exists in the profiles-array
      if (!profilesArray.some(profile => profile.name === currentProfile)) {
        currentProfile = profilesArray.length > 0 ? profilesArray[0].name : DEFAULT_PROFILE_NAME;
      }

      setProfiles(profilesArray);
      setCurrentProfileName(currentProfile);

      // Set the current config
      const profileConfig = profilesArray.find(profile => profile.name === currentProfile)?.config;
      setConfig(profileConfig || null);

      return profilesArray;
    }, 'Failed to load configuration profiles. Please try again.');
  }, [withErrorHandling, setProfiles, setCurrentProfileName, setConfig]);

  // Helper function to update profiles with a new config
  const updateProfilesWithConfig = useCallback(async (newConfig: NauthilusConfig) => {
    const updatedProfiles = profiles.map(profile => 
      profile.name === currentProfileName 
        ? { ...profile, config: newConfig } 
        : profile
    );

    // Update in MongoDB
    const userId = await getCurrentUserId();
    try {
      await axios.post(`/api/profiles/${userId}`, {
        profiles: updatedProfiles,
        currentProfileName: currentProfileName
      });
    } catch (error) {
      console.error('Failed to save profiles to API:', error);
      throw new Error('Failed to save profiles to MongoDB');
    }

    setProfiles(updatedProfiles);
    setConfig(newConfig);

    // Reset the unsaved changes flag since we've just saved
    setHasUnsavedChanges(false);

    return updatedProfiles;
  }, [profiles, currentProfileName, setProfiles, setConfig, setHasUnsavedChanges]);

  // Function to update the entire configuration
  const updateConfig = useCallback(async (newConfig: NauthilusConfig) => {
    await withErrorHandling(
      async () => await updateProfilesWithConfig(newConfig),
      'Failed to update configuration. Please try again.'
    );
  }, [withErrorHandling, updateProfilesWithConfig]);

  // Function to update a specific section of the configuration
  const updateConfigSection = useCallback(async (section: string, data: any) => {
    await withErrorHandling(async () => {
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

      // Validate the configuration before saving
      const validationErrors = validateConfigSection(section, newConfig);
      if (validationErrors.length > 0) {
        throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
      }

      return await updateProfilesWithConfig(newConfig);
    }, `Failed to update ${section} configuration. Please try again.`);
  }, [withErrorHandling, config, updateProfilesWithConfig, validateConfigSection]);

  // Helper function to filter out unknown settings
  const filterUnknownSettings = (config: NauthilusConfig): NauthilusConfig => {
    // Create a new config object with only the known properties
    const filteredConfig: NauthilusConfig = {
      server: {
        redis: { database_number: 0, prefix: 'nt:' }
      }
    };

    // Copy known server properties
    if (config.server) {
      const serverProps = [
        'address', 'max_concurrent_requests', 'max_password_history_entries',
        'http3', 'haproxy_v2', 'disabled_endpoints', 'tls', 'basic_auth',
        'jwt_auth', 'instance_name', 'log', 'backends', 'features',
        'brute_force_protocols', 'ory_hydra_admin_url', 'dns', 'insights',
        'redis', 'master_user', 'frontend', 'prometheus_timer',
        'default_http_request_header', 'http_client', 'compression', 'keep_alive'
      ];

      serverProps.forEach(prop => {
        const key = prop as keyof typeof config.server;
        if (config.server[key] !== undefined) {
          // Use type assertion to help TypeScript understand the assignment
          (filteredConfig.server as any)[key] = config.server[key];
        }
      });
    }

    // Copy other known top-level properties
    const knownProps = [
      'ldap', 'lua', 'oauth2', 'brute_force', 'realtime_blackhole_lists',
      'relay_domains', 'backend_server_monitoring', 'cleartext_networks'
    ];

    knownProps.forEach(prop => {
      const key = prop as keyof NauthilusConfig;
      if (config[key] !== undefined) {
        // Use type assertion to help TypeScript understand the assignment
        (filteredConfig as any)[key] = config[key];
      }
    });

    return filteredConfig;
  };

  // Helper function to initialize feature configurations
  const initializeFeatureConfigurations = (config: NauthilusConfig): NauthilusConfig => {
    const newConfig = { ...config };

    if (newConfig.server?.features) {
      // Handle RBL configuration
      if (newConfig.server.features.includes('rbl')) {
        // Initialize RBL configuration if it doesn't exist
        if (!newConfig.realtime_blackhole_lists) {
          newConfig.realtime_blackhole_lists = {
            lists: [],
            threshold: 0,
            ip_whitelist: [],
            soft_whitelist: {}
          };
        }

        // Ensure the "lists" array is properly initialized
        if (!newConfig.realtime_blackhole_lists.lists) {
          newConfig.realtime_blackhole_lists.lists = [];
        }

        // Ensure the ip_whitelist array is properly initialized
        if (!newConfig.realtime_blackhole_lists.ip_whitelist) {
          newConfig.realtime_blackhole_lists.ip_whitelist = [];
        }

        // Ensure the soft_whitelist object is properly initialized
        if (!newConfig.realtime_blackhole_lists.soft_whitelist) {
          newConfig.realtime_blackhole_lists.soft_whitelist = {};
        }
      }

      // Handle Relay Domains configuration
      if (newConfig.server.features.includes('relay_domains')) {
        // Initialize Relay Domains configuration if it doesn't exist
        if (!newConfig.relay_domains) {
          newConfig.relay_domains = {
            static: [],
            soft_whitelist: {}
          };
        }

        // Ensure the static array is properly initialized
        if (!newConfig.relay_domains.static) {
          newConfig.relay_domains.static = [];
        }

        // Ensure the soft_whitelist object is properly initialized
        if (!newConfig.relay_domains.soft_whitelist) {
          newConfig.relay_domains.soft_whitelist = {};
        }
      }

      // Handle Backend Server Monitoring configuration
      if (newConfig.server.features.includes('backend_server_monitoring')) {
        // Initialize Backend Server Monitoring configuration if it doesn't exist
        if (!newConfig.backend_server_monitoring) {
          newConfig.backend_server_monitoring = {
            backend_servers: []
          };
        }

        // Ensure the backend_servers array is properly initialized
        if (!newConfig.backend_server_monitoring.backend_servers) {
          newConfig.backend_server_monitoring.backend_servers = [];
        }
      }

      // Handle Brute Force configuration
      if (newConfig.server.features.includes('brute_force')) {
        // Initialize Brute Force configuration if it doesn't exist
        if (!newConfig.brute_force) {
          newConfig.brute_force = {
            buckets: [],
            ip_whitelist: [],
            soft_whitelist: {},
            custom_tolerations: []
          };
        }

        // Ensure the "buckets" array is properly initialized
        if (!newConfig.brute_force.buckets) {
          newConfig.brute_force.buckets = [];
        }

        // Ensure the ip_whitelist array is properly initialized
        if (!newConfig.brute_force.ip_whitelist) {
          newConfig.brute_force.ip_whitelist = [];
        }

        // Ensure the soft_whitelist object is properly initialized
        if (!newConfig.brute_force.soft_whitelist) {
          newConfig.brute_force.soft_whitelist = {};
        }

        // Ensure the custom_tolerations array is properly initialized
        if (!newConfig.brute_force.custom_tolerations) {
          newConfig.brute_force.custom_tolerations = [];
        }
      }

      // Handle TLS Encryption configuration
      if (newConfig.server.features.includes('tls_encryption')) {
        // Ensure the cleartext_networks array is properly initialized
        if (!newConfig.cleartext_networks) {
          newConfig.cleartext_networks = [];
        }
      }
    }

    return newConfig;
  };

  // Function to upload a configuration file
  const uploadConfig = useCallback(async (file: File, profileName?: string) => {
    await withErrorHandling(async () => {
      const fileContent = await file.text();
      let newConfig: NauthilusConfig;

      // Parse the file content based on the file extension
      if (file.name.endsWith('.json')) {
        newConfig = JSON.parse(fileContent);
      } else if (file.name.endsWith('.yml') || file.name.endsWith('.yaml')) {
        newConfig = yaml.load(fileContent) as NauthilusConfig;

        // Handle realtime_blackhole_lists (map to rbl)
        if ((newConfig as any).realtime_blackhole_lists) {
          newConfig.realtime_blackhole_lists = (newConfig as any).realtime_blackhole_lists;
          delete (newConfig as any).realtime_blackhole_lists;

          // Ensure server.features includes 'rbl'
          if (!newConfig.server) {
            newConfig.server = { redis: { database_number: 0, prefix: 'nt_', master: { address: '127.0.0.1:6379' } } };
          }
          if (!newConfig.server.features) {
            newConfig.server.features = [];
          }
          if (!newConfig.server.features.includes('rbl')) {
            newConfig.server.features.push('rbl');
          }
        }

        // Fix the backend configuration format if it's an array of objects with the 'backend' property
        if (newConfig.server?.backends && Array.isArray(newConfig.server.backends)) {
          // Check if the backends are objects with 'backend' property instead of strings
          const firstBackend = newConfig.server.backends[0];
          if (firstBackend && typeof firstBackend === 'object' && 'backend' in firstBackend) {
            // Convert objects with 'backend' property to strings
            newConfig.server.backends = newConfig.server.backends.map((backend: any) => backend.backend);
          }
        }

        // Filter out unknown settings
        newConfig = filterUnknownSettings(newConfig);

        // Initialize feature configurations
        newConfig = initializeFeatureConfigurations(newConfig);
      } else {
        throw new Error('Unsupported file format. Please upload a JSON or YAML file.');
      }

      // Determine which profile to update
      const targetProfileName = profileName || currentProfileName;

      // Check if the profile exists
      let updatedProfiles = [...profiles];
      const profileIndex = updatedProfiles.findIndex(p => p.name === targetProfileName);

      if (profileIndex >= 0) {
        // Update existing profile
        updatedProfiles[profileIndex] = {
          ...updatedProfiles[profileIndex],
          config: newConfig
        };
      } else {
        // Create a new profile if it doesn't exist
        updatedProfiles.push({
          name: targetProfileName,
          config: newConfig
        });
      }

      // Save profiles to MongoDB
      const userId = await getCurrentUserId();
      try {
        await axios.post(`/api/profiles/${userId}`, {
          profiles: updatedProfiles,
          currentProfileName: targetProfileName === currentProfileName ? currentProfileName : targetProfileName
        });
      } catch (error) {
        console.error('Failed to save profiles to API:', error);
        throw new Error('Failed to save profiles to MongoDB');
      }

      setProfiles(updatedProfiles);

      // If updating the current profile, update the current config
      if (targetProfileName === currentProfileName) {
        setConfig(newConfig);
      } else {
        // Switch to the new/updated profile
        setCurrentProfileName(targetProfileName);
        setConfig(newConfig);
      }

      // Reset the unsaved changes flag since we've just saved
      setHasUnsavedChanges(false);

      return updatedProfiles;
    }, 'Failed to upload configuration. Please check the file format.');
  }, [withErrorHandling, profiles, currentProfileName, setProfiles, setCurrentProfileName, setConfig, setHasUnsavedChanges]);

  // Function to download the current configuration
  const downloadConfig = useCallback(() => {
    // This function doesn't use async/await, so we'll handle errors manually
    try {
      if (!config) {
        setError('No configuration to download');
        return;
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

      // Exclude connection and hooks settings from the download
      delete configToDownload.connection;
      if (configToDownload.lua && configToDownload.lua.hooks) {
        delete configToDownload.lua.hooks;
      }

      // Add a profile name as a comment in the YAML
      const profileComment = `# Profile: ${currentProfileName}`;

      // Ensure brute_force_protocols are lowercase
      if (configToDownload.server?.brute_force_protocols) {
        configToDownload.server.brute_force_protocols = configToDownload.server.brute_force_protocols.map((protocol: string) => 
          protocol.toLowerCase()
        );
      }

      // Ensure refresh_token_expiry is set if refresh_token is enabled
      if (configToDownload.server?.jwt_auth?.refresh_token && !configToDownload.server.jwt_auth.refresh_token_expiry) {
        if (!configToDownload.server.jwt_auth) {
          configToDownload.server.jwt_auth = {};
        }
        configToDownload.server.jwt_auth.refresh_token_expiry = '24h'; // Default value
      }

      // Convert the configuration to YAML
      const yamlContent = yaml.dump(configToDownload);

      // Create a blob and download the link with the profile comment at the top
      const contentWithComment = `${profileComment}\n\n${yamlContent}`;
      const blob = new Blob([contentWithComment], { type: 'text/yaml' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `nauthilus-${currentProfileName.toLowerCase().replace(/\s+/g, '-')}.yml`;
      document.body.appendChild(a);
      a.click();

      // Clean up
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to download configuration.');
      console.error('Error downloading configuration:', err);
    }
  }, [config, hasUnsavedChanges, validateConfig, currentProfileName, setError]);

  // Function to reset the configuration to default
  const resetConfig = useCallback(async () => {
    // Reset only the current profile by default
    await withErrorHandling(
      () => updateProfilesWithConfig(DEFAULT_CONFIG),
      'Failed to reset configuration. Please try again.'
    );
  }, [withErrorHandling, updateProfilesWithConfig]);

  // Function to create a new profile
  const createProfile = useCallback(async (name: string, configData?: NauthilusConfig) => {
    await withErrorHandling(async () => {
      // Check if the profile with this name already exists
      if (profiles.some(profile => profile.name === name)) {
        throw new Error(`A profile with the name "${name}" already exists.`);
      }

      // Create new profile with provided config or default
      const newProfile: ConfigProfile = {
        name,
        config: configData || DEFAULT_CONFIG
      };

      // Add a new profile to the list
      const updatedProfiles = [...profiles, newProfile];

      // Save to MongoDB
      const userId = await getCurrentUserId();
      try {
        await axios.post(`/api/profiles/${userId}`, {
          profiles: updatedProfiles,
          currentProfileName: name
        });
      } catch (error) {
        console.error('Failed to save profiles to API:', error);
        throw new Error('Failed to save profiles to MongoDB');
      }

      setProfiles(updatedProfiles);

      // Switch to the new profile
      setCurrentProfileName(name);
      setConfig(newProfile.config);
      setHasUnsavedChanges(false);

      return updatedProfiles;
    }, 'Failed to create profile. Please try again.');
  }, [withErrorHandling, profiles, setProfiles, setCurrentProfileName, setConfig, setHasUnsavedChanges]);

  // Function to switch to a different profile
  const switchProfile = useCallback(async (name: string) => {
    await withErrorHandling(async () => {
      // Find the profile
      const profile = profiles.find(p => p.name === name);
      if (!profile) {
        throw new Error(`Profile "${name}" not found.`);
      }

      // Check for unsaved changes
      if (hasUnsavedChanges) {
        throw new Error('Please save your changes before switching profiles.');
      }

      // Switch to the profile
      setCurrentProfileName(name);
      setConfig(profile.config);

      // Save to MongoDB
      const userId = await getCurrentUserId();
      try {
        await axios.post(`/api/profiles/${userId}`, {
          profiles,
          currentProfileName: name
        });
      } catch (error) {
        console.error('Failed to save current profile to API:', error);
        throw new Error('Failed to save current profile to MongoDB');
      }

      setHasUnsavedChanges(false);

      return profile;
    }, 'Failed to switch profile. Please try again.');
  }, [withErrorHandling, profiles, hasUnsavedChanges, setCurrentProfileName, setConfig, setHasUnsavedChanges]);

  // Function to rename a profile
  const renameProfile = useCallback(async (oldName: string, newName: string) => {
    await withErrorHandling(async () => {
      // Check if a new name already exists
      if (profiles.some(profile => profile.name === newName)) {
        throw new Error(`A profile with the name "${newName}" already exists.`);
      }

      // Find and rename the profile
      const updatedProfiles = profiles.map(profile => 
        profile.name === oldName 
          ? { ...profile, name: newName } 
          : profile
      );

      // Save to MongoDB
      const userId = await getCurrentUserId();
      try {
        await axios.post(`/api/profiles/${userId}`, {
          profiles: updatedProfiles,
          currentProfileName: currentProfileName === oldName ? newName : currentProfileName
        });
      } catch (error) {
        console.error('Failed to save profiles to API:', error);
        throw new Error('Failed to save profiles to MongoDB');
      }

      setProfiles(updatedProfiles);

      // If the renamed profile is the current one, update the currentProfileName
      if (currentProfileName === oldName) {
        setCurrentProfileName(newName);
      }

      return updatedProfiles;
    }, 'Failed to rename profile. Please try again.');
  }, [withErrorHandling, profiles, currentProfileName, setProfiles, setCurrentProfileName]);

  // Function to delete a profile
  const deleteProfile = useCallback(async (name: string) => {
    await withErrorHandling(async () => {
      // Prevent deleting the last profile
      if (profiles.length <= 1) {
        throw new Error('Cannot delete the only profile. At least one profile must exist.');
      }

      // Remove the profile
      const updatedProfiles = profiles.filter(profile => profile.name !== name);

      // If the deleted profile is the current one, prepare to switch to another profile
      const newCurrentProfileName = currentProfileName === name ? updatedProfiles[0].name : currentProfileName;
      const newCurrentProfileConfig = currentProfileName === name ? updatedProfiles[0].config : config;

      // Save to MongoDB
      const userId = await getCurrentUserId();
      try {
        await axios.post(`/api/profiles/${userId}`, {
          profiles: updatedProfiles,
          currentProfileName: newCurrentProfileName
        });
      } catch (error) {
        console.error('Failed to save profiles to API:', error);
        throw new Error('Failed to save profiles to MongoDB');
      }

      setProfiles(updatedProfiles);

      // If the deleted profile is the current one, switch to another profile
      if (currentProfileName === name) {
        setCurrentProfileName(newCurrentProfileName);
        setConfig(newCurrentProfileConfig);
      }

      return updatedProfiles;
    }, 'Failed to delete profile. Please try again.');
  }, [withErrorHandling, profiles, currentProfileName, config, setProfiles, setCurrentProfileName, setConfig]);

  // Load the configuration when the component mounts
  useEffect(() => {
    // Create a flag to track if the component is mounted
    let isMounted = true;

    // Call refreshConfig and handle the Promise
    refreshConfig().then(() => {
      // Only update state if the component is still mounted
      if (isMounted) {
        // No additional action needed as refreshConfig already updates the state
      }
    }).catch(err => {
      // Only update state if the component is still mounted
      if (isMounted) {
        console.error('Error in refreshConfig:', err);
      }
    });

    // Cleanup function to handle component unmounting
    return () => {
      isMounted = false;
    };
  }, [refreshConfig]);

  // Function to load configuration from the backend
  const loadConfigFromBackend = useCallback(async (connectionConfig: any) => {
    await withErrorHandling(async () => {
      if (!connectionConfig.backend_url) {
        throw new Error('No backend URL configured');
      }

      // Prepare authentication parameters for the proxy
      const { authType, authValue } = prepareAuthParams(connectionConfig);

      // Use the proxy endpoint to make the request server-side
      const proxyUrl = new URL('/proxy/config/load', window.location.origin);
      proxyUrl.searchParams.append('url', connectionConfig.backend_url);

      if (authType && authValue) {
        proxyUrl.searchParams.append('authType', authType);
        proxyUrl.searchParams.append('authValue', authValue);
      }

      const response = await fetch(proxyUrl.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));

        // Extract detailed error information
        let errorMessage = errorData.error || response.statusText;
        let errorDetails = '';

        // Check for detailed error information from our enhanced proxy
        if (errorData.details) {
          errorDetails = errorData.details;
        } else if (errorData.code) {
          errorDetails = `Error code: ${errorData.code}`;
        }

        // Check for error information in the result field
        if (errorData.result && typeof errorData.result === 'object') {
          if (errorData.result.error) {
            errorDetails += errorDetails ? `, ${errorData.result.error}` : errorData.result.error;
          } else if (typeof errorData.result === 'string') {
            errorDetails += errorDetails ? `, ${errorData.result}` : errorData.result;
          } else if (JSON.stringify(errorData.result) !== '{}') {
            errorDetails += errorDetails ? `, ${JSON.stringify(errorData.result)}` : JSON.stringify(errorData.result);
          }
        }

        // Construct a comprehensive error message
        const fullErrorMessage = errorDetails 
          ? `Failed to load configuration from backend: ${errorMessage} (${errorDetails})`
          : `Failed to load configuration from backend: ${errorMessage}`;

        console.error('Configuration loading error:', errorData);
        throw new Error(fullErrorMessage);
      }

      const data = await response.json();

      if (!data.result) {
        throw new Error('Invalid response from backend');
      }

      // Parse the configuration
      let newConfig: NauthilusConfig;

      // If the result is a string (YAML), parse it
      if (typeof data.result === 'string') {
        newConfig = yaml.load(data.result) as NauthilusConfig;
      }
      // If the result is already an object, use it directly
      else if (typeof data.result === 'object') {
        newConfig = data.result as NauthilusConfig;
      }
      else {
        throw new Error('Unexpected response format');
      }

      try {
        // Filter out unknown settings
        newConfig = filterUnknownSettings(newConfig);

        // Initialize feature configurations
        newConfig = initializeFeatureConfigurations(newConfig);

        // Check for custom hooks in the loaded configuration
        if (newConfig.lua?.custom_hooks && newConfig.lua?.custom_hooks.length > 0) {
          console.log('Found custom hooks in loaded configuration:', newConfig.lua?.custom_hooks);

          // Initialize lua and hooks objects if they don't exist
          if (!newConfig.lua) {
            newConfig.lua = {};
          }
          if (!newConfig.lua.hooks) {
            newConfig.lua.hooks = {};
          }

          // Map script filenames to hook names
          const scriptToHookMap: Record<string, keyof LuaHooksConfig> = {
            'distributed-brute-force-admin.lua': 'distributed_brute_force_admin',
            'distributed-brute-force-test.lua': 'distributed_brute_force_test',
            'learning-mode.lua': 'learning_mode',
            'neural-feedback.lua': 'neural_feedback',
            'train-neural-network.lua': 'train_neural_network'
          };

          // Check each custom hook
          newConfig.lua?.custom_hooks?.forEach(customHook => {
            // Extract the script filename from the path
            const scriptPath = customHook.script_path;
            const scriptName = scriptPath.split('/').pop();

            if (scriptName && scriptToHookMap[scriptName]) {
              const hookName = scriptToHookMap[scriptName];
              console.log(`Found matching hook: ${scriptName} -> ${hookName}`);

              // Get the current hook configuration if it exists
              const currentHook = config?.lua?.hooks?.[hookName];
              const newHook = newConfig.lua?.hooks?.[hookName];

              // Create or update the hook configuration
              if (newConfig.lua && newConfig.lua.hooks) {
                // If the hook already exists in the current config, preserve its enabled state
                if (currentHook) {
                  newConfig.lua.hooks[hookName] = {
                    ...newHook,
                    endpoint_path: newHook?.endpoint_path || '',
                    enabled: currentHook.enabled
                  };
                } else {
                  // If the hook doesn't exist in the current config or is not properly configured,
                  // create it and enable it since it's defined in custom_hooks
                  const httpLocation = customHook.http_location || '';
                  newConfig.lua.hooks[hookName] = {
                    enabled: true,
                    endpoint_path: httpLocation
                  };
                  console.log(`Enabled hook ${hookName} with endpoint ${httpLocation}`);
                }
              }
            }
          });
        }

        // Preserve the enabled state of hooks if they exist in the current configuration
        if (config?.lua?.hooks && newConfig.lua?.hooks) {
          // For each hook in the new config that also exists in the current config
          Object.keys(newConfig.lua?.hooks).forEach(hookName => {
            const typedHookName = hookName as keyof LuaHooksConfig;
            const currentHook = config?.lua?.hooks?.[typedHookName];
            const newHook = newConfig.lua?.hooks?.[typedHookName];

            if (currentHook && newHook) {
              // Preserve the enabled state from the current config
              if (newConfig.lua && newConfig.lua.hooks) {
                newConfig.lua.hooks[typedHookName] = {
                  ...newHook,
                  endpoint_path: newHook?.endpoint_path || '',
                  enabled: currentHook.enabled
                };
              }
            }
          });
        }

        // Update the current profile with the new configuration
        return updateProfilesWithConfig(newConfig);
      } catch (error) {
        console.error('Error parsing configuration:', error);
        throw new Error(`Failed to parse configuration: ${error instanceof Error ? error.message : String(error)}`);
      }
    }, 'Failed to load configuration from backend. Please try again.');
  }, [withErrorHandling, config?.lua?.hooks, updateProfilesWithConfig]);

  // Provide the context value
  const contextValue: ConfigContextType = {
    config,
    loading,
    error,
    hasUnsavedChanges,
    profiles,
    currentProfileName,
    refreshConfig,
    updateConfig,
    updateConfigSection,
    uploadConfig,
    downloadConfig,
    resetConfig,
    loadConfigFromBackend,
    setHasUnsavedChanges,
    setError,
    validateConfigSection,
    createProfile,
    switchProfile,
    renameProfile,
    deleteProfile,
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
