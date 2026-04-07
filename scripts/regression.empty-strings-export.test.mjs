#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import yaml from 'js-yaml';
import { formatConfigAsYaml } from '../src/utils/yamlUtils.ts';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function assertNoEmptyStrings(value, currentPath = 'root') {
  if (value === '') {
    fail(`${currentPath} must not contain empty-string values after YAML export.`);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoEmptyStrings(entry, `${currentPath}[${index}]`));
    return;
  }

  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, nested]) => {
      assertNoEmptyStrings(nested, `${currentPath}.${key}`);
    });
  }
}

function buildFixtureConfig() {
  return {
    server: {
      address: '127.0.0.1:8080',
      instance_name: 'nauthilus-demo',
      max_concurrent_requests: 100,
      max_password_history_entries: 10,
      lua_script_timeout: '',
      local_cache_auth_ttl: '',
      smtp_backend_address: '',
      trusted_proxies: ['', '10.0.0.0/8'],
      brute_force_protocols: ['IMAP', 'SMTP'],
      tls: {
        enabled: false,
        cert: '',
        key: '',
      },
      redis: {
        database_number: 0,
        prefix: 'nt:',
        master: {
          address: '127.0.0.1:6379',
          username: '',
        },
      },
      timeouts: {
        redis_read: '1s',
        ldap_bind: '',
      },
    },
    backends: ['cache', ''],
    lua: {
      config: {
        backend_script_path: '',
        cache_flush_script_path: '',
        number_of_workers: 4,
      },
      search: [
        {
          protocol: ['imap', ''],
          cache_name: 'default',
        },
      ],
    },
    connection: {
      endpoint: '',
    },
  };
}

function assertDemoConfigHasNoEmptyStringScalars() {
  const demoConfigPath = path.resolve(repoRoot, 'contrib/demo-stack/nauthilus/nauthilus.yml');
  const source = fs.readFileSync(demoConfigPath, 'utf8');
  const parsed = yaml.load(source);
  assertNoEmptyStrings(parsed, 'contrib/demo-stack/nauthilus/nauthilus.yml');
}

const fixtureConfig = buildFixtureConfig();
const yamlOutput = formatConfigAsYaml(fixtureConfig);
const parsedOutput = yaml.load(yamlOutput);

if (parsedOutput == null || typeof parsedOutput !== 'object') {
  fail('YAML export must produce an object.');
} else {
  assertNoEmptyStrings(parsedOutput, 'export');

  const server = parsedOutput.server ?? {};
  if ('lua_script_timeout' in server) {
    fail('server.lua_script_timeout must be omitted when empty.');
  }
  if ('local_cache_auth_ttl' in server) {
    fail('server.local_cache_auth_ttl must be omitted when empty.');
  }

  if (!Array.isArray(parsedOutput.backends) || parsedOutput.backends.length !== 1 || parsedOutput.backends[0] !== 'cache') {
    fail('Empty string entries in arrays must be removed during YAML export.');
  }

  if (!Array.isArray(server.trusted_proxies) || server.trusted_proxies.length !== 1 || server.trusted_proxies[0] !== '10.0.0.0/8') {
    fail('Empty trusted proxies must be removed during YAML export.');
  }

  if (server.redis?.database_number !== 0) {
    fail('Numeric zero values must be preserved during YAML export.');
  }

  if (server.tls?.enabled !== false) {
    fail('Boolean false values must be preserved during YAML export.');
  }

  if (server.instance_name !== 'nauthilus-demo') {
    fail('Non-empty string values must be preserved during YAML export.');
  }
}

if (fixtureConfig.server.lua_script_timeout !== '' || fixtureConfig.server.local_cache_auth_ttl !== '') {
  fail('formatConfigAsYaml must not mutate the source config object.');
}

assertDemoConfigHasNoEmptyStringScalars();

if (!process.exitCode) {
  console.log('PASS: YAML export removes empty-string values while preserving valid scalar values.');
}
