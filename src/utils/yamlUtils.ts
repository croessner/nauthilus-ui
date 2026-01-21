import yaml from 'js-yaml';
import { NauthilusConfig } from '../types/config';

/**
 * Formats the Nauthilus configuration as a YAML string with specific sorting and layout.
 * 
 * Sorting order:
 * 1. Server section
 * 2. Other features (alphabetical)
 * 3. Backend Server Monitoring
 * 4. Brute Force
 * 5. OAuth2 Settings
 * 6. Lua
 * 7. LDAP
 * 
 * Additionally, main sections are separated by an empty line.
 * 
 * @param config The configuration object to format
 * @returns A formatted YAML string
 */
export const formatConfigAsYaml = (config: NauthilusConfig): string => {
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

  // Ensure refresh_token_expiry is set if refresh_token is enabled
  if (configCopy.server?.jwt_auth?.refresh_token && !configCopy.server.jwt_auth.refresh_token_expiry) {
    if (!configCopy.server.jwt_auth) {
      configCopy.server.jwt_auth = {};
    }
    configCopy.server.jwt_auth.refresh_token_expiry = '24h'; // Default value
  }

  // --- Sort the object keys ---
  const sortedConfig: any = {};
  
  // 1. Server section always comes first
  if (configCopy.server) {
    sortedConfig.server = configCopy.server;
  }
  
  // 2. Features/sections that are not in the fixed list follow alphabetically
  const fixedKeys = ['server', 'backend_server_monitoring', 'brute_force', 'oauth2', 'lua', 'ldap'];
  const featureKeys = Object.keys(configCopy)
    .filter(key => !fixedKeys.includes(key))
    .sort();
  
  featureKeys.forEach(key => {
    sortedConfig[key] = configCopy[key];
  });
  
  // 3-7. Remaining sections in fixed order
  const remainingKeys = ['backend_server_monitoring', 'brute_force', 'oauth2', 'lua', 'ldap'];
  remainingKeys.forEach(key => {
    if (configCopy[key] !== undefined) {
      // Special sorting for lua and ldap: put "config" at the top of the section
      if ((key === 'lua' || key === 'ldap') && configCopy[key].config) {
        const section = configCopy[key];
        const sortedSection: any = {};
        sortedSection.config = section.config;
        Object.keys(section).forEach(k => {
          if (k !== 'config') {
            sortedSection[k] = section[k];
          }
        });
        sortedConfig[key] = sortedSection;
      } else {
        sortedConfig[key] = configCopy[key];
      }
    }
  });

  // --- Dump to YAML ---
  const yamlString = yaml.dump(sortedConfig, {
    indent: 2,
    lineWidth: -1, // Disable line wrapping
    noRefs: true,  // Prevent aliases/anchors
    sortKeys: false // We handled sorting manually
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
        if (!isPrevTopLevel && resultLines[resultLines.length - 1] !== '') {
          resultLines.push('');
        }
      }
    }
    
    resultLines.push(line);
  }

  const finalYaml = resultLines.join('\n');
  return finalYaml;
};
