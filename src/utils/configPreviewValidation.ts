import yaml from 'js-yaml';
import type { BackendConfig, NauthilusConfig } from '../types/config';

export interface EssentialValidationResult {
  isValid: boolean;
  errors: string[];
}

export type ValidateConfigSectionFn = (section: string, config: NauthilusConfig) => string[];
export type FormatConfigAsYamlFn = (config: NauthilusConfig) => string;

const hasServerFeature = (features: unknown, featureName: string): boolean => {
  if (!Array.isArray(features)) {
    return false;
  }

  return features.some((feature) => {
    if (typeof feature === 'string') {
      return feature === featureName;
    }

    return typeof feature === 'object' && feature !== null && 'name' in feature && (feature as { name?: unknown }).name === featureName;
  });
};

const toValidationConfig = (config: NauthilusConfig, formatConfigAsYaml: FormatConfigAsYamlFn): NauthilusConfig => {
  try {
    const normalizedYaml = formatConfigAsYaml(config);
    const parsed = yaml.load(normalizedYaml);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as NauthilusConfig;
    }
  } catch {
    // Fall back to a plain clone below if normalization fails.
  }

  const fallback = JSON.parse(JSON.stringify(config)) as NauthilusConfig & { server?: { jwt_auth?: unknown } };
  if (fallback.server?.jwt_auth) {
    delete fallback.server.jwt_auth;
  }

  return fallback;
};

const normalizedBackends = (config: NauthilusConfig): string[] => {
  if (!Array.isArray(config.server?.backends)) {
    return [];
  }

  return config.server.backends.filter((backend): backend is string => typeof backend === 'string');
};

export const validateEssentialConfigSettings = (
  config: NauthilusConfig | null,
  validateConfigSection: ValidateConfigSectionFn,
  formatConfigAsYaml: FormatConfigAsYamlFn,
): EssentialValidationResult => {
  if (!config) {
    return { isValid: false, errors: ['No configuration loaded'] };
  }

  const configCopy = toValidationConfig(config, formatConfigAsYaml);
  const serverErrors = validateConfigSection('server', configCopy);
  const essentialErrors: string[] = [];
  const backends = normalizedBackends(configCopy);

  if (backends.length === 0) {
    essentialErrors.push('No backends configured. At least one backend is required for operation.');
  } else if (backends.some((backend: BackendConfig) => !backend || backend.trim() === '')) {
    essentialErrors.push('Some backends are not properly configured. Each backend must be a valid string.');
  }

  const hasLdapBackend = backends.some((backend: BackendConfig) => backend === 'ldap' || backend.startsWith('ldap('));
  if (hasLdapBackend) {
    const hasStandardLdapBackend = backends.some((backend: BackendConfig) => backend === 'ldap');
    if (hasStandardLdapBackend && (!configCopy.ldap || !configCopy.ldap.config || !configCopy.ldap.config.server_uri)) {
      essentialErrors.push('LDAP backend is configured but LDAP configuration is missing or incomplete.');
    }

    const ldapPoolRegex = /^ldap\((.+)\)$/;
    backends.forEach((backend: BackendConfig) => {
      const match = backend.match(ldapPoolRegex);
      if (match) {
        const poolName = match[1];
        if (!configCopy.ldap || !configCopy.ldap.optional_ldap_pools || !configCopy.ldap.optional_ldap_pools[poolName]) {
          essentialErrors.push(`LDAP pool "${poolName}" is configured as a backend but the pool configuration is missing.`);
        }
      }
    });
  }

  const hasLuaBackend = backends.some((backend: BackendConfig) => backend === 'lua' || backend.startsWith('lua('));
  if (hasLuaBackend) {
    const hasStandardLuaBackend = backends.some((backend: BackendConfig) => backend === 'lua');
    if (hasStandardLuaBackend && (!configCopy.lua || !configCopy.lua.search || configCopy.lua.search.length === 0)) {
      essentialErrors.push('Lua backend is configured but Lua configuration is missing or incomplete.');
    }

    const luaBackendRegex = /^lua\((.+)\)$/;
    backends.forEach((backend: BackendConfig) => {
      const match = backend.match(luaBackendRegex);
      if (match) {
        const backendName = match[1];
        if (!configCopy.lua || !configCopy.lua.optional_lua_backends || !configCopy.lua.optional_lua_backends[backendName]) {
          essentialErrors.push(`Lua backend "${backendName}" is configured but the backend configuration is missing.`);
        }
      }
    });
  }

  if (configCopy.server?.features && Array.isArray(configCopy.server.features)) {
    if (hasServerFeature(configCopy.server.features, 'rbl')) {
      if (!configCopy.realtime_blackhole_lists) {
        essentialErrors.push('RBL feature is enabled but RBL configuration is missing.');
      } else if (!configCopy.realtime_blackhole_lists.lists || !Array.isArray(configCopy.realtime_blackhole_lists.lists) || configCopy.realtime_blackhole_lists.lists.length === 0) {
        essentialErrors.push('RBL feature is enabled but RBL lists configuration is missing or empty.');
      }
    }

    if (hasServerFeature(configCopy.server.features, 'relay_domains')) {
      if (!configCopy.relay_domains) {
        essentialErrors.push('Relay Domains feature is enabled but Relay Domains configuration is missing.');
      } else if (!configCopy.relay_domains.static || !Array.isArray(configCopy.relay_domains.static)) {
        essentialErrors.push('Relay Domains feature is enabled but static domains configuration is missing or invalid.');
      }
    }

    if (hasServerFeature(configCopy.server.features, 'brute_force')) {
      if (!configCopy.brute_force) {
        essentialErrors.push('Brute Force feature is enabled but Brute Force configuration is missing.');
      } else if (!configCopy.brute_force.buckets || !Array.isArray(configCopy.brute_force.buckets) || configCopy.brute_force.buckets.length === 0) {
        essentialErrors.push('Brute Force feature is enabled but buckets configuration is missing or empty.');
      }
    }

    if (hasServerFeature(configCopy.server.features, 'tls_encryption')) {
      if (!configCopy.cleartext_networks && (!configCopy.server.tls || !configCopy.server.tls.enabled)) {
        essentialErrors.push('TLS Encryption feature is enabled but neither TLS configuration nor cleartext networks are configured.');
      }
    }
  }

  const allErrors = Array.from(new Set([...serverErrors, ...essentialErrors]));
  return {
    isValid: allErrors.length === 0,
    errors: allErrors,
  };
};
