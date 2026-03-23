import React from 'react';
import { Box, Paper, Typography, useTheme, Alert, List, ListItem, ListItemIcon, ListItemText, Divider } from '@mui/material';
import yaml from 'js-yaml';
import { formatConfigAsYaml } from '../utils/yamlUtils';
import { useConfig } from '../contexts/ConfigContext';
import { BackendConfig } from '../types/config';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

const ConfigPreview = (): React.JSX.Element => {
  const { config, validateConfigSection } = useConfig();
  const theme = useTheme();

  // Convert config to YAML
  const yamlContent = config ? formatConfigAsYaml(config) : '';

  // Validate essential settings
  const validateEssentialSettings = () => {
    if (!config) return { isValid: false, errors: ['No configuration loaded'] };

    // Create a deep copy of the config object with the same modifications as for YAML generation
    const configCopy = JSON.parse(JSON.stringify(config));

    // Drop legacy auth config after migration to server.oidc_auth
    if (configCopy.server?.jwt_auth) {
      delete configCopy.server.jwt_auth;
    }

    // Collect validation errors from different sections using the modified config
    const serverErrors = validateConfigSection('server', configCopy);

    // Check for specific essential settings
    const essentialErrors = [];

    // Check if backends are configured
    if (!configCopy.server?.backends || configCopy.server.backends.length === 0) {
      essentialErrors.push('No backends configured. At least one backend is required for operation.');
    } else {
      // Check if all backends are valid strings
      const invalidBackends = configCopy.server.backends.filter((backend: BackendConfig) => 
        !backend || backend.trim() === ''
      );

      if (invalidBackends.length > 0) {
        essentialErrors.push('Some backends are not properly configured. Each backend must be a valid string.');
      }
    }

    // Redis configuration is validated in validateConfigSection('server', configCopy)

    // Check if LDAP is configured when LDAP backend is used
    const hasLdapBackend = configCopy.server?.backends?.some((backend: BackendConfig) => {
      return backend === 'ldap' || backend.startsWith('ldap(');
    });

    if (hasLdapBackend) {
      // Check if standard LDAP is configured
      const hasStandardLdapBackend = configCopy.server?.backends?.some((backend: BackendConfig) => {
        return backend === 'ldap';
      });

      if (hasStandardLdapBackend && (!configCopy.ldap || !configCopy.ldap.config || !configCopy.ldap.config.server_uri)) {
        essentialErrors.push('LDAP backend is configured but LDAP configuration is missing or incomplete.');
      }

      // Check if an LDAP pool is configured
      const ldapPoolRegex = /^ldap\((.+)\)$/;
      configCopy.server?.backends?.forEach((backend: BackendConfig) => {
        const match = backend.match(ldapPoolRegex);
        if (match) {
          const poolName = match[1];
          if (!configCopy.ldap || !configCopy.ldap.optional_ldap_pools || !configCopy.ldap.optional_ldap_pools[poolName]) {
            essentialErrors.push(`LDAP pool "${poolName}" is configured as a backend but the pool configuration is missing.`);
          }
        }
      });
    }

    // Check if Lua is configured when Lua backend is used
    const hasLuaBackend = configCopy.server?.backends?.some((backend: BackendConfig) => {
      return backend === 'lua' || backend.startsWith('lua(');
    });

    if (hasLuaBackend) {
      // Check if a standard Lua backend is configured
      const hasStandardLuaBackend = configCopy.server?.backends?.some((backend: BackendConfig) => {
        return backend === 'lua';
      });

      if (hasStandardLuaBackend && (!configCopy.lua || !configCopy.lua.search || configCopy.lua.search.length === 0)) {
        essentialErrors.push('Lua backend is configured but Lua configuration is missing or incomplete.');
      }

      // Check if optional Lua backends are configured
      const luaBackendRegex = /^lua\((.+)\)$/;
      configCopy.server?.backends?.forEach((backend: BackendConfig) => {
        const match = backend.match(luaBackendRegex);
        if (match) {
          const backendName = match[1];
          if (!configCopy.lua || !configCopy.lua.optional_lua_backends || !configCopy.lua.optional_lua_backends[backendName]) {
            essentialErrors.push(`Lua backend "${backendName}" is configured but the backend configuration is missing.`);
          }
        }
      });
    }

    // Check if features are properly configured
    if (configCopy.server?.features && Array.isArray(configCopy.server.features)) {
      // Check RBL feature
      if (configCopy.server.features.includes('realtime_blackhole_lists')) {
        if (!configCopy.rbl) {
          essentialErrors.push('RBL feature is enabled but RBL configuration is missing.');
        } else if (!configCopy.rbl.lists || !Array.isArray(configCopy.rbl.lists) || configCopy.rbl.lists.length === 0) {
          essentialErrors.push('RBL feature is enabled but RBL lists configuration is missing or empty.');
        }
      }

      // Check the relay_domains feature
      if (configCopy.server.features.includes('relay_domains')) {
        if (!configCopy.relay_domains) {
          essentialErrors.push('Relay Domains feature is enabled but Relay Domains configuration is missing.');
        } else if (!configCopy.relay_domains.static || !Array.isArray(configCopy.relay_domains.static)) {
          essentialErrors.push('Relay Domains feature is enabled but static domains configuration is missing or invalid.');
        }
      }

      // Check brute_force feature
      if (configCopy.server.features.includes('brute_force')) {
        if (!configCopy.brute_force) {
          essentialErrors.push('Brute Force feature is enabled but Brute Force configuration is missing.');
        } else if (!configCopy.brute_force.buckets || !Array.isArray(configCopy.brute_force.buckets) || configCopy.brute_force.buckets.length === 0) {
          essentialErrors.push('Brute Force feature is enabled but buckets configuration is missing or empty.');
        }
      }

      // Check tls_encryption feature
      if (configCopy.server.features.includes('tls_encryption')) {
        if (!configCopy.cleartext_networks && (!configCopy.server.tls || !configCopy.server.tls.enabled)) {
          essentialErrors.push('TLS Encryption feature is enabled but neither TLS configuration nor cleartext networks are configured.');
        }
      }
    }

    // Combine all errors and remove duplicates
    const combinedErrors = [...serverErrors, ...essentialErrors];
    const allErrors = Array.from(new Set(combinedErrors));

    return {
      isValid: allErrors.length === 0,
      errors: allErrors
    };
  };

  const validationResult = validateEssentialSettings();

  return (
    <Box sx={{ width: '100%', mt: 2 }}>
      <Typography variant="h5" gutterBottom>
        Configuration Preview (nauthilus.yml)
      </Typography>

      {/* Configuration Status */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Configuration Status
        </Typography>

        {validationResult.isValid ? (
          <Alert severity="success" sx={{ mb: 2 }}>
            All essential settings are configured correctly. The configuration is ready for operation.
          </Alert>
        ) : (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Some essential settings are missing or incomplete. Please review the issues below.
          </Alert>
        )}

        {validationResult.errors.length > 0 && (
          <List dense>
            {validationResult.errors.map((error, index) => (
              <ListItem key={index}>
                <ListItemIcon>
                  <ErrorOutlineIcon color="error" />
                </ListItemIcon>
                <ListItemText primary={error} />
              </ListItem>
            ))}
          </List>
        )}

        {validationResult.isValid && (
          <List dense>
            <ListItem>
              <ListItemIcon>
                <CheckCircleOutlineIcon color="success" />
              </ListItemIcon>
              <ListItemText primary="Server configuration is valid" />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <CheckCircleOutlineIcon color="success" />
              </ListItemIcon>
              <ListItemText primary="Backend configuration is valid" />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <CheckCircleOutlineIcon color="success" />
              </ListItemIcon>
              <ListItemText primary="Redis configuration is valid" />
            </ListItem>
          </List>
        )}

        <Alert severity="info" sx={{ mt: 2 }}>
          <Typography variant="body2">
            This preview shows the current configuration and validates essential settings required for operation.
          </Typography>
        </Alert>
      </Box>

      <Divider sx={{ my: 2 }} />

      <Typography variant="body2" color="text.secondary" paragraph>
        This is a read-only preview of your current configuration in YAML format.
      </Typography>
      <Paper 
        elevation={3} 
        sx={{ 
          p: 2, 
          mt: 2, 
          maxHeight: '70vh', 
          overflow: 'auto',
          backgroundColor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#f5f5f5',
          borderRadius: 1
        }}
      >
        <pre 
          style={{ 
            margin: 0, 
            fontFamily: '"Roboto Mono", monospace',
            fontSize: '0.875rem',
            color: theme.palette.mode === 'dark' ? '#d4d4d4' : '#333333',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            MozUserSelect: 'none',
            msUserSelect: 'none',
            pointerEvents: 'none'
          }}
        >
          {yamlContent}
        </pre>
      </Paper>
    </Box>
  );
};

export default ConfigPreview;
