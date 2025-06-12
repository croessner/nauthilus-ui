import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { NauthilusConfig } from '../types/config';
import yaml from 'js-yaml';

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
  resetConfig: () => void;
  setHasUnsavedChanges: (value: boolean) => void;
  setError: (error: string | null) => void;
  validateConfigSection: (section: string, config: NauthilusConfig) => string[];
  createProfile: (name: string, config?: NauthilusConfig) => void;
  switchProfile: (name: string) => void;
  renameProfile: (oldName: string, newName: string) => void;
  deleteProfile: (name: string) => void;
}

// Create the context with a default value
const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

// Storage keys for the configuration
const PROFILES_STORAGE_KEY = 'nauthilus-profiles';
const CURRENT_PROFILE_KEY = 'nauthilus-current-profile';
const DEFAULT_PROFILE_NAME = 'Default';

// Default empty configuration
const DEFAULT_CONFIG: NauthilusConfig = {
  server: {
    address: '127.0.0.1:8080',
    instance_name: 'nauthilus',
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
  const [profiles, setProfiles] = useState<ConfigProfile[]>([]);
  const [currentProfileName, setCurrentProfileName] = useState<string>(DEFAULT_PROFILE_NAME);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);

  // Function to load the configuration profiles from local storage
  const refreshConfig = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load profiles from localStorage
      const storedProfiles = localStorage.getItem(PROFILES_STORAGE_KEY);
      let profilesArray: ConfigProfile[] = [];

      if (storedProfiles) {
        profilesArray = JSON.parse(storedProfiles);
      } else {
        // Create default profile if none exists
        profilesArray = [{ name: DEFAULT_PROFILE_NAME, config: DEFAULT_CONFIG }];
        localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(profilesArray));
      }

      setProfiles(profilesArray);

      // Load current profile name
      const storedCurrentProfile = localStorage.getItem(CURRENT_PROFILE_KEY);
      let currentProfile = storedCurrentProfile || DEFAULT_PROFILE_NAME;

      // Make sure the current profile exists in the profiles array
      if (!profilesArray.some(profile => profile.name === currentProfile)) {
        currentProfile = profilesArray.length > 0 ? profilesArray[0].name : DEFAULT_PROFILE_NAME;
      }

      setCurrentProfileName(currentProfile);

      // Set the current config
      const profileConfig = profilesArray.find(profile => profile.name === currentProfile)?.config;
      setConfig(profileConfig || null);
    } catch (err) {
      setError('Failed to load configuration profiles. Please try again.');
      console.error('Error loading configuration profiles:', err);
    } finally {
      setLoading(false);
    }
  };

  // Function to update the entire configuration
  const updateConfig = async (newConfig: NauthilusConfig) => {
    try {
      setLoading(true);
      setError(null);

      // Update the current profile with the new config
      const updatedProfiles = profiles.map(profile => 
        profile.name === currentProfileName 
          ? { ...profile, config: newConfig } 
          : profile
      );

      localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(updatedProfiles));
      setProfiles(updatedProfiles);
      setConfig(newConfig);

      // Reset unsaved changes flag since we've just saved
      setHasUnsavedChanges(false);
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

      // Validate the configuration before saving
      const validationErrors = validateConfigSection(section, newConfig);
      if (validationErrors.length > 0) {
        throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
      }

      // Update the current profile with the new config
      const updatedProfiles = profiles.map(profile => 
        profile.name === currentProfileName 
          ? { ...profile, config: newConfig } 
          : profile
      );

      localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(updatedProfiles));
      setProfiles(updatedProfiles);
      setConfig(newConfig);

      // Reset unsaved changes flag since we've just saved
      setHasUnsavedChanges(false);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Validation failed:')) {
        setError(err.message);
      } else {
        setError(`Failed to update ${section} configuration. Please try again.`);
      }
      console.error(`Error updating ${section} configuration:`, err);
    } finally {
      setLoading(false);
    }
  };

  // Function to upload a configuration file
  const uploadConfig = async (file: File, profileName?: string) => {
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

        // Handle realtime_blackhole_lists (map to rbl)
        if ((newConfig as any).realtime_blackhole_lists) {
          newConfig.rbl = (newConfig as any).realtime_blackhole_lists;
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

        // Fix backend configuration format if it's an array of strings
        if (newConfig.server?.backends && Array.isArray(newConfig.server.backends)) {
          // Check if the backends are strings instead of objects
          const firstBackend = newConfig.server.backends[0];
          if (typeof firstBackend === 'string') {
            // Convert string backends to objects with 'backend' property
            // Use type assertion to tell TypeScript that the array contains strings
            newConfig.server.backends = (newConfig.server.backends as unknown as string[]).map(backend => ({
              backend: backend
            }));
          }
        }

        // Ensure feature configurations are properly initialized
        if (newConfig.server?.features) {
          // Handle RBL configuration
          if (newConfig.server.features.includes('rbl')) {
            // Initialize RBL configuration if it doesn't exist
            if (!newConfig.rbl) {
              newConfig.rbl = {
                lists: [],
                threshold: 0,
                ip_whitelist: [],
                soft_whitelist: {}
              };
            }

            // Ensure lists array is properly initialized
            if (!newConfig.rbl.lists) {
              newConfig.rbl.lists = [];
            }

            // Ensure ip_whitelist array is properly initialized
            if (!newConfig.rbl.ip_whitelist) {
              newConfig.rbl.ip_whitelist = [];
            }

            // Ensure soft_whitelist object is properly initialized
            if (!newConfig.rbl.soft_whitelist) {
              newConfig.rbl.soft_whitelist = {};
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

            // Ensure static array is properly initialized
            if (!newConfig.relay_domains.static) {
              newConfig.relay_domains.static = [];
            }

            // Ensure soft_whitelist object is properly initialized
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

            // Ensure backend_servers array is properly initialized
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

            // Ensure buckets array is properly initialized
            if (!newConfig.brute_force.buckets) {
              newConfig.brute_force.buckets = [];
            }

            // Ensure ip_whitelist array is properly initialized
            if (!newConfig.brute_force.ip_whitelist) {
              newConfig.brute_force.ip_whitelist = [];
            }

            // Ensure soft_whitelist object is properly initialized
            if (!newConfig.brute_force.soft_whitelist) {
              newConfig.brute_force.soft_whitelist = {};
            }

            // Ensure custom_tolerations array is properly initialized
            if (!newConfig.brute_force.custom_tolerations) {
              newConfig.brute_force.custom_tolerations = [];
            }
          }

          // Handle TLS Encryption configuration
          if (newConfig.server.features.includes('tls_encryption')) {
            // Ensure cleartext_networks array is properly initialized
            if (!newConfig.cleartext_networks) {
              newConfig.cleartext_networks = [];
            }
          }
        }
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
        // Create new profile if it doesn't exist
        updatedProfiles.push({
          name: targetProfileName,
          config: newConfig
        });
      }

      // Save profiles to localStorage
      localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(updatedProfiles));
      setProfiles(updatedProfiles);

      // If updating the current profile, update the current config
      if (targetProfileName === currentProfileName) {
        setConfig(newConfig);
      } else {
        // Switch to the new/updated profile
        setCurrentProfileName(targetProfileName);
        setConfig(newConfig);
        localStorage.setItem(CURRENT_PROFILE_KEY, targetProfileName);
      }

      // Reset unsaved changes flag since we've just saved
      setHasUnsavedChanges(false);
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

      // Add profile name as a comment in the YAML
      const profileComment = `# Profile: ${currentProfileName}`;

      // Ensure brute_force_protocols are lowercase
      if (configToDownload.server?.brute_force_protocols) {
        configToDownload.server.brute_force_protocols = configToDownload.server.brute_force_protocols.map((protocol: string) => 
          protocol.toLowerCase()
        );
      }

      // Convert the configuration to YAML
      const yamlContent = yaml.dump(configToDownload);

      // Create a blob and download link with the profile comment at the top
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

    // Validate that at least one backend is configured
    if (!config.server.backends || config.server.backends.length === 0) {
      errors.push('At least one backend must be configured');
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

  // Function to validate a specific section of the configuration
  const validateConfigSection = (section: string, config: NauthilusConfig): string[] => {
    const errors: string[] = [];

    switch (section) {
      case 'server':
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

        // Validate Redis configuration if it's part of the server section
        if (config.server.redis) {
          // Determine which Redis setup type is being used
          // We'll infer this from the data structure rather than requiring all types to be configured

          // Check if master configuration is being used (has specific fields set)
          const isMasterConfigured = config.server.redis.master && 
            (config.server.redis.master.address || 
             config.server.redis.master.username || 
             config.server.redis.master.password);

          // Check if replica configuration is being used
          const isReplicaConfigured = config.server.redis.replica && 
            (config.server.redis.replica.address || 
             (config.server.redis.replica.addresses && config.server.redis.replica.addresses.length > 0));

          // Check if sentinel configuration is being used
          const isSentinelConfigured = config.server.redis.sentinels && 
            (config.server.redis.sentinels.master || 
             (config.server.redis.sentinels.addresses && config.server.redis.sentinels.addresses.length > 0));

          // Check if cluster configuration is being used
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
        break;

      case 'ldap':
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
        break;

      case 'lua':
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
        break;

      default:
        // For other sections, use the general validation
        errors.push(...validateConfig(config));
        break;
    }

    return errors;
  };

  // Function to reset the configuration to default
  const resetConfig = () => {
    // Reset only the current profile to default
    const updatedProfiles = profiles.map(profile => 
      profile.name === currentProfileName 
        ? { ...profile, config: DEFAULT_CONFIG } 
        : profile
    );

    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(updatedProfiles));
    setProfiles(updatedProfiles);
    setConfig(DEFAULT_CONFIG);
    setHasUnsavedChanges(false);
  };

  // Function to create a new profile
  const createProfile = (name: string, configData?: NauthilusConfig) => {
    try {
      // Check if profile with this name already exists
      if (profiles.some(profile => profile.name === name)) {
        setError(`A profile with the name "${name}" already exists.`);
        return;
      }

      // Create new profile with provided config or default
      const newProfile: ConfigProfile = {
        name,
        config: configData || DEFAULT_CONFIG
      };

      // Add new profile to the list
      const updatedProfiles = [...profiles, newProfile];
      localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(updatedProfiles));
      setProfiles(updatedProfiles);

      // Switch to the new profile
      switchProfile(name);
    } catch (err) {
      setError('Failed to create profile. Please try again.');
      console.error('Error creating profile:', err);
    }
  };

  // Function to switch to a different profile
  const switchProfile = (name: string) => {
    try {
      // Find the profile
      const profile = profiles.find(p => p.name === name);
      if (!profile) {
        setError(`Profile "${name}" not found.`);
        return;
      }

      // Check for unsaved changes
      if (hasUnsavedChanges) {
        setError('Please save your changes before switching profiles.');
        return;
      }

      // Switch to the profile
      setCurrentProfileName(name);
      setConfig(profile.config);
      localStorage.setItem(CURRENT_PROFILE_KEY, name);
      setHasUnsavedChanges(false);
    } catch (err) {
      setError('Failed to switch profile. Please try again.');
      console.error('Error switching profile:', err);
    }
  };

  // Function to rename a profile
  const renameProfile = (oldName: string, newName: string) => {
    try {
      // Check if new name already exists
      if (profiles.some(profile => profile.name === newName)) {
        setError(`A profile with the name "${newName}" already exists.`);
        return;
      }

      // Find and rename the profile
      const updatedProfiles = profiles.map(profile => 
        profile.name === oldName 
          ? { ...profile, name: newName } 
          : profile
      );

      localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(updatedProfiles));
      setProfiles(updatedProfiles);

      // If the renamed profile is the current one, update currentProfileName
      if (currentProfileName === oldName) {
        setCurrentProfileName(newName);
        localStorage.setItem(CURRENT_PROFILE_KEY, newName);
      }
    } catch (err) {
      setError('Failed to rename profile. Please try again.');
      console.error('Error renaming profile:', err);
    }
  };

  // Function to delete a profile
  const deleteProfile = (name: string) => {
    try {
      // Prevent deleting the last profile
      if (profiles.length <= 1) {
        setError('Cannot delete the only profile. At least one profile must exist.');
        return;
      }

      // Remove the profile
      const updatedProfiles = profiles.filter(profile => profile.name !== name);
      localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(updatedProfiles));
      setProfiles(updatedProfiles);

      // If the deleted profile is the current one, switch to another profile
      if (currentProfileName === name) {
        const newCurrentProfile = updatedProfiles[0];
        setCurrentProfileName(newCurrentProfile.name);
        setConfig(newCurrentProfile.config);
        localStorage.setItem(CURRENT_PROFILE_KEY, newCurrentProfile.name);
      }
    } catch (err) {
      setError('Failed to delete profile. Please try again.');
      console.error('Error deleting profile:', err);
    }
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
    profiles,
    currentProfileName,
    refreshConfig,
    updateConfig,
    updateConfigSection,
    uploadConfig,
    downloadConfig,
    resetConfig,
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
