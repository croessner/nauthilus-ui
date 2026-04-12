import yaml from 'js-yaml';
import type { NauthilusConfig } from '../types/config';
import { sanitizeDisabledEndpoints } from './serverConfigNormalization';
import { toObjectBasedFrontendSecurityHeaders } from './securityHeaders';

const DEFAULT_YAML_FLOW_LEVEL = 3;
const MIN_YAML_FLOW_LEVEL = -1;
const MAX_YAML_FLOW_LEVEL = 10;
const YAML_FLOW_LEVEL_ENV_KEY = 'REACT_APP_YAML_FLOW_LEVEL';

const parseYamlFlowLevel = (rawValue: unknown): number | null => {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return null;
  }

  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed)) {
    return null;
  }

  return parsed;
};

/**
 * Returns the configured YAML flow level for config serialization.
 *
 * Precedence:
 * 1. runtime-injected `window._env_`
 * 2. build/runtime environment (`process.env`)
 * 3. default value (`3`)
 */
export const getYamlFlowLevel = (): number => {
  const runtimeEnvValue = typeof window !== 'undefined' ? window._env_?.[YAML_FLOW_LEVEL_ENV_KEY] : undefined;
  const processEnvValue = typeof process !== 'undefined' ? (process as { env?: Record<string, string | undefined> }).env?.[YAML_FLOW_LEVEL_ENV_KEY] : undefined;
  const parsed = parseYamlFlowLevel(runtimeEnvValue ?? processEnvValue);

  if (parsed === null) {
    return DEFAULT_YAML_FLOW_LEVEL;
  }

  if (parsed < MIN_YAML_FLOW_LEVEL) {
    return MIN_YAML_FLOW_LEVEL;
  }

  if (parsed > MAX_YAML_FLOW_LEVEL) {
    return MAX_YAML_FLOW_LEVEL;
  }

  return parsed;
};

/**
 * Preserves the admin-defined bucket order during export operations.
 * This is intentionally defensive: even if intermediate transformations
 * change array ordering, we restore the original bucket sequence here.
 */
const preserveBruteForceBucketOrder = (
  sourceConfig: NauthilusConfig,
  targetConfig: NauthilusConfig,
): void => {
  const sourceBuckets = sourceConfig.brute_force?.buckets;
  const targetBuckets = targetConfig.brute_force?.buckets;

  if (!Array.isArray(sourceBuckets) || !Array.isArray(targetBuckets)) {
    return;
  }

  if (sourceBuckets.length !== targetBuckets.length) {
    return;
  }

  if (sourceBuckets.length <= 1) {
    return;
  }

  const bucketsByName = new Map<string, any[]>();
  targetBuckets.forEach((bucket) => {
    const name = typeof bucket?.name === 'string' ? bucket.name : '';
    const existing = bucketsByName.get(name);
    if (existing) {
      existing.push(bucket);
      return;
    }
    bucketsByName.set(name, [bucket]);
  });

  const usedBuckets = new Set<any>();
  const orderedBuckets: any[] = [];

  sourceBuckets.forEach((sourceBucket) => {
    const name = typeof sourceBucket?.name === 'string' ? sourceBucket.name : '';
    const candidates = bucketsByName.get(name);
    const next = candidates?.shift();
    if (next !== undefined) {
      orderedBuckets.push(next);
      usedBuckets.add(next);
      return;
    }

    const fallback = targetBuckets.find((bucket) => !usedBuckets.has(bucket));
    if (fallback !== undefined) {
      orderedBuckets.push(fallback);
      usedBuckets.add(fallback);
    }
  });

  if (orderedBuckets.length === targetBuckets.length && targetConfig.brute_force) {
    targetConfig.brute_force.buckets = orderedBuckets;
  }
};

/**
 * Recursively removes empty-string values from config exports.
 *
 * This keeps optional fields out of generated YAML when the UI currently
 * stores them as "", which avoids runtime parsers treating empty durations
 * and similar fields as invalid explicit values.
 */
const pruneEmptyStrings = (value: any): any => {
  if (value === '') {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => pruneEmptyStrings(entry))
      .filter((entry) => entry !== undefined);
  }

  if (value && typeof value === 'object') {
    const sanitized: Record<string, any> = {};

    Object.keys(value).forEach((key) => {
      const nextValue = pruneEmptyStrings(value[key]);
      if (nextValue !== undefined) {
        sanitized[key] = nextValue;
      }
    });

    return sanitized;
  }

  return value;
};

export const orderTopLevelConfigKeys = (config: Record<string, any>): string[] => {
  const fixedKeys = ['server', 'backend_server_monitoring', 'brute_force', 'idp', 'lua', 'ldap'];
  const featureKeys = Object.keys(config)
    .filter(key => !fixedKeys.includes(key))
    .sort();

  const remainingKeys = ['backend_server_monitoring', 'brute_force', 'idp', 'lua', 'ldap']
    .filter(key => config[key] !== undefined);

  const orderedKeys: string[] = [];
  if (config.server !== undefined) {
    orderedKeys.push('server');
  }

  orderedKeys.push(...featureKeys);
  orderedKeys.push(...remainingKeys);

  return orderedKeys;
};

/**
 * Formats the Nauthilus configuration as a YAML string with specific sorting and layout.
 * 
 * Sorting order:
 * 1. Server section
 * 2. Other features (alphabetical)
 * 3. Backend Server Monitoring
 * 4. Brute Force
 * 5. IdP Settings
 * 6. Lua
 * 7. LDAP
 * 
 * Additionally, main sections are separated by an empty line.
 * 
 * @param config The configuration object to format
 * @returns A formatted YAML string
 */
export const formatConfigAsYaml = (config: NauthilusConfig): string => {
  const yamlFlowLevel = getYamlFlowLevel();

  // Create a deep copy to avoid modifying the original config
  const configCopy = JSON.parse(JSON.stringify(config));

  // --- Apply common transformations ---
  
  // Exclude UI-only connection and hooks settings
  delete configCopy.connection;
  if (configCopy.lua && configCopy.lua.hooks) {
    delete configCopy.lua.hooks;
  }

  // Migrate and drop deprecated Lua number_of_workers on export
  if (configCopy.lua?.config) {
    const c = configCopy.lua.config as any;
    if (!c.backend_number_of_workers && typeof c.number_of_workers === 'number') {
      c.backend_number_of_workers = c.number_of_workers;
    }
    delete c.number_of_workers; // drop deprecated
  }
  if (configCopy.lua?.optional_lua_backends) {
    Object.values(configCopy.lua.optional_lua_backends).forEach((backend: any) => {
      if (!backend.backend_number_of_workers && typeof backend.number_of_workers === 'number') {
        backend.backend_number_of_workers = backend.number_of_workers;
      }
      delete backend.number_of_workers; // drop deprecated
    });
  }

  // Ensure brute_force_protocols are lowercase
  if (configCopy.server?.brute_force_protocols) {
    configCopy.server.brute_force_protocols = configCopy.server.brute_force_protocols.map((protocol: string) => 
      protocol.toLowerCase()
    );
  }

  // Drop legacy auth config after migration to server.oidc_auth
  if (configCopy.server?.jwt_auth) {
    delete configCopy.server.jwt_auth;
  }

  // Keep only currently supported endpoint toggle keys.
  if (configCopy.server) {
    const sanitizedDisabledEndpoints = sanitizeDisabledEndpoints(configCopy.server.disabled_endpoints);
    if (sanitizedDisabledEndpoints) {
      configCopy.server.disabled_endpoints = sanitizedDisabledEndpoints;
    } else {
      delete configCopy.server.disabled_endpoints;
    }
  }

  // Always export frontend security header partials in object form.
  if (configCopy.server?.frontend?.security_headers) {
    configCopy.server.frontend.security_headers = toObjectBasedFrontendSecurityHeaders(
      configCopy.server.frontend.security_headers,
    );
  }

  // Preserve admin-defined bucket order for preview/download/git export.
  preserveBruteForceBucketOrder(config, configCopy);

  // Remove empty-string placeholders before serialization.
  const sanitizedConfig = pruneEmptyStrings(configCopy);

  // --- Sort the object keys ---
  const sortedConfig: any = {};
  
  orderTopLevelConfigKeys(sanitizedConfig).forEach(key => {
    if (sanitizedConfig[key] !== undefined) {
      // Special sorting for lua and ldap: put "config" at the top of the section
      if ((key === 'lua' || key === 'ldap') && sanitizedConfig[key].config) {
        const section = sanitizedConfig[key];
        const sortedSection: any = {};
        sortedSection.config = section.config;
        Object.keys(section).forEach(k => {
          if (k !== 'config') {
            sortedSection[k] = section[k];
          }
        });
        sortedConfig[key] = sortedSection;
      } else {
        sortedConfig[key] = sanitizedConfig[key];
      }
    }
  });

  // --- Dump to YAML ---
  const yamlString = yaml.dump(sortedConfig, {
    indent: 2,
    flowLevel: yamlFlowLevel,
    lineWidth: -1, // Disable line wrapping
    noRefs: true,  // Prevent aliases/anchors
    sortKeys: false, // We handled sorting manually
    forceQuotes: true, // Keep all string values explicitly quoted
    quotingType: '"'
  });

  // --- Post-process: Insert empty lines between sections and second-level elements ---
  const lines = yamlString.split('\n');
  const resultLines = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (i > 0 && line.length > 0) {
      const isTopLevel = /^[a-z0-9_]+:/.test(line);
      const isSecondLevel = /^  [a-z0-9_]+:/.test(line);
      
      if (isTopLevel) {
        if (resultLines[resultLines.length - 1] !== '') {
          resultLines.push('');
        }
      } else if (isSecondLevel) {
        const prevLine = lines[i - 1];
        const isPrevTopLevel = /^[a-z0-9_]+:/.test(prevLine);
        const isPrevSecondLevel = /^  [a-z0-9_]+:/.test(prevLine);
        
        // If current element is second-level and has children (ends with :)
        // AND previous element was second-level but had NO children (didn't end with :)
        // THEN add a newline.
        const currentHasChildren = line.trimEnd().endsWith(':');
        const prevWasSecondLevelNoChildren = isPrevSecondLevel && !prevLine.trimEnd().endsWith(':');

        if (!isPrevTopLevel && (!isPrevSecondLevel || (currentHasChildren && prevWasSecondLevelNoChildren)) && resultLines[resultLines.length - 1] !== '') {
          resultLines.push('');
        }
      }
    }
    
    resultLines.push(line);
  }

  const finalYaml = resultLines.join('\n');
  return finalYaml;
};
