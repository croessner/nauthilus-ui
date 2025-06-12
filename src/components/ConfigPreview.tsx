import React from 'react';
import { Box, Paper, Typography, useTheme, Alert, List, ListItem, ListItemIcon, ListItemText, Divider } from '@mui/material';
import yaml from 'js-yaml';
import { useConfig } from '../contexts/ConfigContext';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

const ConfigPreview: React.FC = () => {
  const { config, validateConfigSection } = useConfig();
  const theme = useTheme();

  // Convert config to YAML
  const yamlContent = config ? yaml.dump(config) : '';

  // Validate essential settings
  const validateEssentialSettings = () => {
    if (!config) return { isValid: false, errors: ['No configuration loaded'] };

    // Collect validation errors from different sections
    const serverErrors = validateConfigSection('server', config);

    // Check for specific essential settings
    const essentialErrors = [];

    // Check if backends are configured
    if (!config.server?.backends || config.server.backends.length === 0) {
      essentialErrors.push('No backends configured. At least one backend is required for operation.');
    } else {
      // Check if all backends have a valid backend property
      const invalidBackends = config.server.backends.filter(backend => 
        !backend || typeof backend !== 'object' || !backend.backend || typeof backend.backend !== 'string' || backend.backend.trim() === ''
      );

      if (invalidBackends.length > 0) {
        essentialErrors.push('Some backends are not properly configured. Each backend must have a valid backend property.');
      }
    }

    // Redis configuration is validated in validateConfigSection('server', config)

    // Check if LDAP is configured when LDAP backend is used
    const hasLdapBackend = config.server?.backends?.some(backend => {
      if (typeof backend === 'object' && backend !== null) {
        if (typeof backend.backend === 'string') {
          return backend.backend === 'ldap' || backend.backend.startsWith('ldap(');
        }
      }
      return false;
    });

    if (hasLdapBackend) {
      // Check if standard LDAP is configured
      const hasStandardLdapBackend = config.server?.backends?.some(backend => {
        if (typeof backend === 'object' && backend !== null) {
          if (typeof backend.backend === 'string') {
            return backend.backend === 'ldap';
          }
        }
        return false;
      });

      if (hasStandardLdapBackend && (!config.ldap || !config.ldap.config || !config.ldap.config.server_uri)) {
        essentialErrors.push('LDAP backend is configured but LDAP configuration is missing or incomplete.');
      }

      // Check if LDAP pool is configured
      const ldapPoolRegex = /^ldap\((.+)\)$/;
      config.server?.backends?.forEach(backend => {
        if (typeof backend === 'object' && backend !== null && typeof backend.backend === 'string') {
          const match = backend.backend.match(ldapPoolRegex);
          if (match) {
            const poolName = match[1];
            if (!config.ldap || !config.ldap.optional_ldap_pools || !config.ldap.optional_ldap_pools[poolName]) {
              essentialErrors.push(`LDAP pool "${poolName}" is configured as a backend but the pool configuration is missing.`);
            }
          }
        }
      });
    }

    // Check if Lua is configured when Lua backend is used
    const hasLuaBackend = config.server?.backends?.some(backend => {
      if (typeof backend === 'object' && backend !== null) {
        if (typeof backend.backend === 'string') {
          return backend.backend === 'lua' || backend.backend.startsWith('lua(');
        }
      }
      return false;
    });

    if (hasLuaBackend) {
      // Check if standard Lua backend is configured
      const hasStandardLuaBackend = config.server?.backends?.some(backend => {
        if (typeof backend === 'object' && backend !== null) {
          if (typeof backend.backend === 'string') {
            return backend.backend === 'lua';
          }
        }
        return false;
      });

      if (hasStandardLuaBackend && (!config.lua || !config.lua.search || config.lua.search.length === 0)) {
        essentialErrors.push('Lua backend is configured but Lua configuration is missing or incomplete.');
      }

      // Check if optional Lua backends are configured
      const luaBackendRegex = /^lua\((.+)\)$/;
      config.server?.backends?.forEach(backend => {
        if (typeof backend === 'object' && backend !== null && typeof backend.backend === 'string') {
          const match = backend.backend.match(luaBackendRegex);
          if (match) {
            const backendName = match[1];
            if (!config.lua || !config.lua.optional_lua_backends || !config.lua.optional_lua_backends[backendName]) {
              essentialErrors.push(`Lua backend "${backendName}" is configured but the backend configuration is missing.`);
            }
          }
        }
      });
    }

    // Check if features are properly configured
    if (config.server?.features && Array.isArray(config.server.features)) {
      // Check RBL feature
      if (config.server.features.includes('rbl')) {
        if (!config.rbl) {
          essentialErrors.push('RBL feature is enabled but RBL configuration is missing.');
        } else if (!config.rbl.lists || !Array.isArray(config.rbl.lists) || config.rbl.lists.length === 0) {
          essentialErrors.push('RBL feature is enabled but RBL lists configuration is missing or empty.');
        }
      }

      // Check relay_domains feature
      if (config.server.features.includes('relay_domains')) {
        if (!config.relay_domains) {
          essentialErrors.push('Relay Domains feature is enabled but Relay Domains configuration is missing.');
        } else if (!config.relay_domains.static || !Array.isArray(config.relay_domains.static)) {
          essentialErrors.push('Relay Domains feature is enabled but static domains configuration is missing or invalid.');
        }
      }

      // Check brute_force feature
      if (config.server.features.includes('brute_force')) {
        if (!config.brute_force) {
          essentialErrors.push('Brute Force feature is enabled but Brute Force configuration is missing.');
        } else if (!config.brute_force.buckets || !Array.isArray(config.brute_force.buckets) || config.brute_force.buckets.length === 0) {
          essentialErrors.push('Brute Force feature is enabled but buckets configuration is missing or empty.');
        }
      }

      // Check tls_encryption feature
      if (config.server.features.includes('tls_encryption')) {
        if (!config.cleartext_networks && (!config.server.tls || !config.server.tls.enabled)) {
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
            wordBreak: 'break-word'
          }}
        >
          {yamlContent}
        </pre>
      </Paper>
    </Box>
  );
};

export default ConfigPreview;
