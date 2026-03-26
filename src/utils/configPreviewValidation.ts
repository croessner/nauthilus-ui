import yaml from 'js-yaml';
import type { NauthilusConfig } from '../types/config';
import { isValidNauthilusSecret } from './configSecrets';
import { formatConfigAsYaml } from './yamlUtils';

export interface EssentialValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface ConfigValidationFinding {
  code: string;
  path: string;
  message: string;
  source: 'required_tag' | 'required_if_tag' | 'custom_validation';
  blocking: boolean;
}

export interface ConfigValidationReport {
  isValid: boolean;
  findings: ConfigValidationFinding[];
  blockingFindings: ConfigValidationFinding[];
  normalizedConfig: NauthilusConfig | null;
  yamlContent: string;
}

const pushFinding = (
  findings: ConfigValidationFinding[],
  code: string,
  path: string,
  message: string,
  source: ConfigValidationFinding['source'],
  blocking = true,
): void => {
  findings.push({ code, path, message, source, blocking });
};

const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const hasText = (value: unknown): value is string => {
  return typeof value === 'string' && value.trim() !== '';
};

/**
 * Normalizes config values that may be provided as either a scalar string
 * or an explicit string list (Go-Viper compatible behavior).
 */
const toTextList = (value: unknown): string[] => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const toList = (value: unknown): unknown[] => {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === undefined || value === null) {
    return [];
  }

  return [value];
};

const hasAnyKeys = (value: unknown): boolean => {
  return isObject(value) && Object.keys(value).length > 0;
};

const toValidationConfig = (config: NauthilusConfig): { normalizedConfig: NauthilusConfig; yamlContent: string } => {
  try {
    const yamlContent = formatConfigAsYaml(config);
    const parsed = yaml.load(yamlContent);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { normalizedConfig: parsed as NauthilusConfig, yamlContent };
    }
  } catch {
    // Fall back to clone below if normalization fails.
  }

  const fallback = JSON.parse(JSON.stringify(config)) as NauthilusConfig & { server?: { jwt_auth?: unknown } };
  if (fallback.server?.jwt_auth) {
    delete fallback.server.jwt_auth;
  }

  return {
    normalizedConfig: fallback,
    yamlContent: formatConfigAsYaml(fallback),
  };
};

const normalizedBackends = (config: NauthilusConfig): string[] => {
  return toTextList(config.server?.backends);
};

const hasServerFeature = (features: unknown, featureName: string): boolean => {
  return toList(features).some((feature) => {
    if (typeof feature === 'string') {
      return feature === featureName;
    }

    return typeof feature === 'object' && feature !== null && 'name' in feature && (feature as { name?: unknown }).name === featureName;
  });
};

const validateRedis = (config: NauthilusConfig, findings: ConfigValidationFinding[]): void => {
  const redis = config.server?.redis;
  if (!redis) {
    pushFinding(findings, 'required.server.redis', 'server.redis', 'Redis configuration is required.', 'required_tag');
    return;
  }

  if (!isValidNauthilusSecret(redis.password_nonce)) {
    pushFinding(
      findings,
      'required.server.redis.password_nonce',
      'server.redis.password_nonce',
      'Redis password nonce is required and must be at least 16 characters without whitespace.',
      'required_tag',
    );
  }

  if (!isValidNauthilusSecret(redis.encryption_secret)) {
    pushFinding(
      findings,
      'required.server.redis.encryption_secret',
      'server.redis.encryption_secret',
      'Redis encryption secret is required and must be at least 16 characters without whitespace.',
      'required_tag',
    );
  }

  const masterAddress = redis.master?.address;
  const replicaAddresses = toTextList(redis.replica?.addresses);
  const sentinelAddresses = toTextList(redis.sentinels?.addresses);
  const clusterAddresses = toTextList(redis.cluster?.addresses);

  const isMasterConfigured = hasText(masterAddress);
  const isReplicaConfigured = hasText(redis.replica?.address) || replicaAddresses.length > 0;
  const isSentinelConfigured = hasAnyKeys(redis.sentinels);
  const isClusterConfigured = hasAnyKeys(redis.cluster);

  if (!isMasterConfigured && !isReplicaConfigured && !isSentinelConfigured && !isClusterConfigured) {
    pushFinding(
      findings,
      'required.server.redis.connection_target',
      'server.redis',
      'At least one Redis setup type (master, replica, sentinels, or cluster) must be configured.',
      'custom_validation',
    );
  }

  if (hasAnyKeys(redis.master) && !hasText(masterAddress)) {
    pushFinding(
      findings,
      'required.server.redis.master.address',
      'server.redis.master.address',
      'Redis master address is required when master settings are present.',
      'custom_validation',
    );
  }

  if (isSentinelConfigured) {
    if (!hasText(redis.sentinels?.master)) {
      pushFinding(
        findings,
        'required.server.redis.sentinels.master',
        'server.redis.sentinels.master',
        'Redis sentinel master name is required when sentinel settings are present.',
        'required_tag',
      );
    }

    if (sentinelAddresses.length === 0) {
      pushFinding(
        findings,
        'required.server.redis.sentinels.addresses',
        'server.redis.sentinels.addresses',
        'At least one Redis sentinel address is required when sentinel settings are present.',
        'required_tag',
      );
    }
  }

  if (isClusterConfigured && clusterAddresses.length === 0) {
    pushFinding(
      findings,
      'required.server.redis.cluster.addresses',
      'server.redis.cluster.addresses',
      'At least one Redis cluster address is required when cluster settings are present.',
      'required_tag',
    );
  }

  if (redis.tls?.enabled) {
    if (!hasText(redis.tls.cert)) {
      pushFinding(
        findings,
        'required.server.redis.tls.cert',
        'server.redis.tls.cert',
        'Redis TLS certificate is required when Redis TLS is enabled.',
        'custom_validation',
      );
    }

    if (!hasText(redis.tls.key)) {
      pushFinding(
        findings,
        'required.server.redis.tls.key',
        'server.redis.tls.key',
        'Redis TLS key is required when Redis TLS is enabled.',
        'custom_validation',
      );
    }
  }
};

const validateFrontend = (config: NauthilusConfig, findings: ConfigValidationFinding[]): void => {
  const frontend = config.server?.frontend;
  if (!frontend?.enabled) {
    return;
  }

  if (!isValidNauthilusSecret(frontend.encryption_secret)) {
    pushFinding(
      findings,
      'required_if.server.frontend.encryption_secret',
      'server.frontend.encryption_secret',
      'Frontend encryption secret is required when frontend is enabled (minimum 16 characters, no whitespace).',
      'required_if_tag',
    );
  }
};

const validateLDAP = (config: NauthilusConfig, findings: ConfigValidationFinding[], backends: string[]): void => {
  const hasLdapBackend = backends.some((backend) => backend === 'ldap' || backend.startsWith('ldap('));
  if (!hasLdapBackend && !config.ldap) {
    return;
  }

  if (hasLdapBackend && !config.ldap) {
    pushFinding(
      findings,
      'required.ldap.section',
      'ldap',
      'LDAP backend is configured but the ldap section is missing.',
      'custom_validation',
    );
    return;
  }

  if (!config.ldap?.config) {
    pushFinding(
      findings,
      'required.ldap.config',
      'ldap.config',
      'LDAP config section is required.',
      'required_tag',
    );
    return;
  }

  const ldapConfig = config.ldap.config;
  if (!Number.isInteger(ldapConfig.lookup_pool_size) || ldapConfig.lookup_pool_size < 1) {
    pushFinding(
      findings,
      'required.ldap.config.lookup_pool_size',
      'ldap.config.lookup_pool_size',
      'LDAP lookup_pool_size is required and must be at least 1.',
      'required_tag',
    );
  }

  const serverUris = toTextList(ldapConfig.server_uri);
  if (serverUris.length === 0) {
    pushFinding(
      findings,
      'required.ldap.config.server_uri',
      'ldap.config.server_uri',
      'At least one LDAP server URI is required.',
      'required_tag',
    );
  }

  if (hasAnyKeys(config.ldap.optional_ldap_pools)) {
    Object.keys(config.ldap.optional_ldap_pools ?? {}).forEach((poolName) => {
      if (poolName === 'default' || poolName === 'ldap') {
        pushFinding(
          findings,
          'validate.ldap.optional_ldap_pools.default_name',
          `ldap.optional_ldap_pools.${poolName}`,
          `LDAP optional pool "${poolName}" is invalid; reserved names are not allowed.`,
          'custom_validation',
        );
      }
    });
  }

  const searches = Array.isArray(config.ldap.search) ? config.ldap.search : [];
  searches.forEach((search, index) => {
    const basePath = `ldap.search[${index}]`;
    if (toTextList(search.protocol).length === 0) {
      pushFinding(
        findings,
        'required.ldap.search.protocol',
        `${basePath}.protocol`,
        'LDAP search protocol list is required.',
        'required_tag',
      );
    }

    if (!hasText(search.cache_name)) {
      pushFinding(
        findings,
        'required.ldap.search.cache_name',
        `${basePath}.cache_name`,
        'LDAP search cache_name is required.',
        'required_tag',
      );
    }

    if (!hasText(search.base_dn)) {
      pushFinding(
        findings,
        'required.ldap.search.base_dn',
        `${basePath}.base_dn`,
        'LDAP search base_dn is required.',
        'required_tag',
      );
    }

    if (!isObject(search.filter)) {
      pushFinding(
        findings,
        'required.ldap.search.filter',
        `${basePath}.filter`,
        'LDAP search filter object is required.',
        'required_tag',
      );
    }

    if (!isObject(search.mapping)) {
      pushFinding(
        findings,
        'required.ldap.search.mapping',
        `${basePath}.mapping`,
        'LDAP search mapping object is required.',
        'required_tag',
      );
    } else if (!hasText(search.mapping.account_field)) {
      pushFinding(
        findings,
        'required.ldap.search.mapping.account_field',
        `${basePath}.mapping.account_field`,
        'LDAP search mapping.account_field is required.',
        'required_tag',
      );
    }

    if (toTextList(search.attribute).length === 0) {
      pushFinding(
        findings,
        'required.ldap.search.attribute',
        `${basePath}.attribute`,
        'LDAP search attribute list is required.',
        'required_tag',
      );
    }
  });

  const requiresLdapEncryptionSecret = searches.some((search) => {
    return hasText(search.mapping?.totp_secret_field) || hasText(search.mapping?.totp_recovery_field);
  });
  if (requiresLdapEncryptionSecret && !isValidNauthilusSecret(ldapConfig.encryption_secret)) {
    pushFinding(
      findings,
      'validate.ldap.config.encryption_secret_for_totp',
      'ldap.config.encryption_secret',
      'LDAP encryption_secret is required when TOTP fields are configured in LDAP mappings.',
      'custom_validation',
    );
  }
};

const validateLua = (config: NauthilusConfig, findings: ConfigValidationFinding[], backends: string[]): void => {
  const hasLuaBackend = backends.some((backend) => backend === 'lua' || backend.startsWith('lua('));
  if (!hasLuaBackend && !config.lua) {
    return;
  }

  if (hasLuaBackend && !config.lua) {
    pushFinding(
      findings,
      'required.lua.section',
      'lua',
      'Lua backend is configured but the lua section is missing.',
      'custom_validation',
    );
    return;
  }

  const lua = config.lua;
  if (!lua) {
    return;
  }

  if (backends.includes('lua') && (!Array.isArray(lua.search) || lua.search.length === 0)) {
    pushFinding(
      findings,
      'required.lua.search',
      'lua.search',
      'Lua backend is configured but lua.search is missing or empty.',
      'custom_validation',
    );
  }

  backends
    .filter((backend) => /^lua\(.+\)$/.test(backend))
    .forEach((backend) => {
      const backendName = backend.slice(4, -1).trim();
      if (!backendName) {
        return;
      }

      if (!lua.optional_lua_backends || !lua.optional_lua_backends[backendName]) {
        pushFinding(
          findings,
          'required.lua.optional_lua_backends',
          `lua.optional_lua_backends.${backendName}`,
          `Lua backend "${backendName}" is referenced but missing in lua.optional_lua_backends.`,
          'custom_validation',
        );
      }
    });

  const validateScriptEntries = (entries: any[] | undefined, pathRoot: string): void => {
    if (!Array.isArray(entries)) {
      return;
    }

    entries.forEach((entry, index) => {
      const basePath = `${pathRoot}[${index}]`;
      if (!hasText(entry?.name)) {
        pushFinding(
          findings,
          `required.${pathRoot}.name`,
          `${basePath}.name`,
          `${pathRoot} entry requires a name.`,
          'required_tag',
        );
      }

      if (!hasText(entry?.script_path)) {
        pushFinding(
          findings,
          `required.${pathRoot}.script_path`,
          `${basePath}.script_path`,
          `${pathRoot} entry requires a script_path.`,
          'required_tag',
        );
      }
    });
  };

  validateScriptEntries(lua.actions, 'lua.actions');
  validateScriptEntries(lua.features, 'lua.features');
  validateScriptEntries(lua.filters, 'lua.filters');

  if (Array.isArray(lua.custom_hooks)) {
    lua.custom_hooks.forEach((hook, index) => {
      const basePath = `lua.custom_hooks[${index}]`;
      if (!hasText(hook?.http_location)) {
        pushFinding(
          findings,
          'required.lua.custom_hooks.http_location',
          `${basePath}.http_location`,
          'Custom hook requires http_location.',
          'required_tag',
        );
      }
      if (!hasText(hook?.http_method)) {
        pushFinding(
          findings,
          'required.lua.custom_hooks.http_method',
          `${basePath}.http_method`,
          'Custom hook requires http_method.',
          'required_tag',
        );
      }
      if (!hasText(hook?.script_path)) {
        pushFinding(
          findings,
          'required.lua.custom_hooks.script_path',
          `${basePath}.script_path`,
          'Custom hook requires script_path.',
          'required_tag',
        );
      }
    });
  }

  if (hasAnyKeys(lua.optional_lua_backends)) {
    Object.entries(lua.optional_lua_backends ?? {}).forEach(([backendName, backendConfig]) => {
      if (hasText(backendConfig?.package_path) || hasText(backendConfig?.init_script_path)) {
        pushFinding(
          findings,
          'validate.lua.optional_lua_backends.restricted_fields',
          `lua.optional_lua_backends.${backendName}`,
          `Optional Lua backend "${backendName}" must not define package_path or init_script_path.`,
          'custom_validation',
        );
      }
    });
  }
};

const validateFeatureDependentSections = (config: NauthilusConfig, findings: ConfigValidationFinding[]): void => {
  const serverFeatures = toList(config.server?.features);
  if (serverFeatures.length === 0) {
    return;
  }

  if (hasServerFeature(serverFeatures, 'rbl')) {
    if (!config.realtime_blackhole_lists || toTextList(config.realtime_blackhole_lists.lists).length === 0) {
      pushFinding(
        findings,
        'required.realtime_blackhole_lists.lists',
        'realtime_blackhole_lists.lists',
        'RBL feature is enabled but realtime_blackhole_lists.lists is missing or empty.',
        'required_tag',
      );
    }
  }

  if (hasServerFeature(serverFeatures, 'relay_domains')) {
    if (!config.relay_domains || toTextList(config.relay_domains.static).length === 0) {
      pushFinding(
        findings,
        'required.relay_domains.static',
        'relay_domains.static',
        'Relay Domains feature is enabled but relay_domains.static is missing or empty.',
        'required_tag',
      );
    }
  }

  if (hasServerFeature(serverFeatures, 'brute_force')) {
    if (!config.brute_force || !Array.isArray(config.brute_force.buckets) || config.brute_force.buckets.length === 0) {
      pushFinding(
        findings,
        'required.brute_force.buckets',
        'brute_force.buckets',
        'Brute Force feature is enabled but brute_force.buckets is missing or empty.',
        'required_tag',
      );
    }
  }

  if (hasServerFeature(serverFeatures, 'tls_encryption')) {
    if (toTextList(config.cleartext_networks).length === 0 && !config.server?.tls?.enabled) {
      pushFinding(
        findings,
        'required.tls_encryption.prerequisite',
        'server.tls',
        'TLS Encryption feature is enabled but TLS is not enabled and cleartext_networks is missing.',
        'custom_validation',
      );
    }
  }
};

const validateIDP = (config: NauthilusConfig, findings: ConfigValidationFinding[]): void => {
  const oidc = config.idp?.oidc;
  if (oidc?.enabled && !hasText(oidc.issuer)) {
    pushFinding(
      findings,
      'required_if.idp.oidc.issuer',
      'idp.oidc.issuer',
      'idp.oidc.issuer is required when OIDC is enabled.',
      'required_if_tag',
    );
  }

  if (Array.isArray(oidc?.custom_scopes)) {
    oidc?.custom_scopes.forEach((scope, index) => {
      const basePath = `idp.oidc.custom_scopes[${index}]`;
      if (!hasText(scope?.name)) {
        pushFinding(
          findings,
          'required.idp.oidc.custom_scopes.name',
          `${basePath}.name`,
          'OIDC custom scope requires name.',
          'required_tag',
        );
      }
      if (!hasText(scope?.description)) {
        pushFinding(
          findings,
          'required.idp.oidc.custom_scopes.description',
          `${basePath}.description`,
          'OIDC custom scope requires description.',
          'required_tag',
        );
      }
      if (toTextList(scope?.claims).length === 0) {
        pushFinding(
          findings,
          'required.idp.oidc.custom_scopes.claims',
          `${basePath}.claims`,
          'OIDC custom scope requires at least one claim.',
          'required_tag',
        );
      }
    });
  }

  const saml2 = config.idp?.saml2;
  if (saml2?.enabled) {
    if (!hasText(saml2.entity_id)) {
      pushFinding(
        findings,
        'required_if.idp.saml2.entity_id',
        'idp.saml2.entity_id',
        'idp.saml2.entity_id is required when SAML2 is enabled.',
        'required_if_tag',
      );
    }

    if (!hasText(saml2.cert) && !hasText(saml2.cert_file)) {
      pushFinding(
        findings,
        'required_if.idp.saml2.cert_or_cert_file',
        'idp.saml2.cert',
        'Either idp.saml2.cert or idp.saml2.cert_file is required when SAML2 is enabled.',
        'required_if_tag',
      );
    }

    if (!hasText(saml2.key) && !hasText(saml2.key_file)) {
      pushFinding(
        findings,
        'required_if.idp.saml2.key_or_key_file',
        'idp.saml2.key',
        'Either idp.saml2.key or idp.saml2.key_file is required when SAML2 is enabled.',
        'required_if_tag',
      );
    }
  }
};

const dedupeFindings = (findings: ConfigValidationFinding[]): ConfigValidationFinding[] => {
  const unique = new Map<string, ConfigValidationFinding>();
  findings.forEach((finding) => {
    const key = `${finding.code}|${finding.path}|${finding.message}`;
    if (!unique.has(key)) {
      unique.set(key, finding);
    }
  });

  return [...unique.values()];
};

export const validateConfigForExport = (config: NauthilusConfig | null): ConfigValidationReport => {
  if (!config) {
    const finding: ConfigValidationFinding = {
      code: 'required.config',
      path: 'root',
      message: 'No configuration loaded.',
      source: 'custom_validation',
      blocking: true,
    };

    return {
      isValid: false,
      findings: [finding],
      blockingFindings: [finding],
      normalizedConfig: null,
      yamlContent: '',
    };
  }

  const { normalizedConfig, yamlContent } = toValidationConfig(config);
  const findings: ConfigValidationFinding[] = [];
  const backends = normalizedBackends(normalizedConfig);

  if (!normalizedConfig.server) {
    pushFinding(findings, 'required.server', 'server', 'Server section is required.', 'required_tag');
  } else if (backends.length === 0) {
    pushFinding(
      findings,
      'custom.server.backends_required',
      'server.backends',
      'At least one backend should be configured for normal operation.',
      'custom_validation',
    );
  }

  validateRedis(normalizedConfig, findings);
  validateFrontend(normalizedConfig, findings);
  validateLDAP(normalizedConfig, findings, backends);
  validateLua(normalizedConfig, findings, backends);
  validateFeatureDependentSections(normalizedConfig, findings);
  validateIDP(normalizedConfig, findings);

  const uniqueFindings = dedupeFindings(findings);
  const blockingFindings = uniqueFindings.filter((finding) => finding.blocking);

  return {
    isValid: blockingFindings.length === 0,
    findings: uniqueFindings,
    blockingFindings,
    normalizedConfig,
    yamlContent,
  };
};

export const validateEssentialConfigSettings = (
  config: NauthilusConfig | null,
): EssentialValidationResult => {
  const report = validateConfigForExport(config);
  return {
    isValid: report.isValid,
    errors: report.blockingFindings.map((finding) => finding.message),
  };
};
