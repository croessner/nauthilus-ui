import test from 'node:test';
import assert from 'node:assert/strict';
import yaml from 'js-yaml';
import { formatConfigAsYaml } from '../../src/utils/yamlUtils.ts';

const YAML_FLOW_LEVEL_ENV_KEY = 'REACT_APP_YAML_FLOW_LEVEL';

const withYamlFlowLevelEnv = (value, fn) => {
  const previous = process.env[YAML_FLOW_LEVEL_ENV_KEY];
  if (value === null) {
    delete process.env[YAML_FLOW_LEVEL_ENV_KEY];
  } else {
    process.env[YAML_FLOW_LEVEL_ENV_KEY] = value;
  }

  try {
    fn();
  } finally {
    if (previous === undefined) {
      delete process.env[YAML_FLOW_LEVEL_ENV_KEY];
    } else {
      process.env[YAML_FLOW_LEVEL_ENV_KEY] = previous;
    }
  }
};

test('keeps brute_force bucket order in YAML export', () => {
  withYamlFlowLevelEnv(null, () => {
    const config = {
      server: {
        address: '127.0.0.1:8080',
        instance_name: 'nauthilus',
        max_concurrent_requests: 100,
        max_password_history_entries: 10,
        backends: ['cache'],
        redis: {
          database_number: 0,
          prefix: 'nt:',
          master: { address: '127.0.0.1:6379' },
        },
      },
      brute_force: {
        buckets: [
          { name: 'bucket_c', period: '1h', cidr: 32, ipv4: true, ipv6: false, failed_requests: 3 },
          { name: 'bucket_a', period: '2h', cidr: 24, ipv4: true, ipv6: false, failed_requests: 6 },
          { name: 'bucket_b', period: '3h', cidr: 28, ipv4: true, ipv6: false, failed_requests: 9 },
        ],
        ip_whitelist: [],
        soft_whitelist: {},
        custom_tolerations: [],
      },
    };

    const yamlContent = formatConfigAsYaml(config);
    const parsed = yaml.load(yamlContent);
    const names = parsed?.brute_force?.buckets?.map((bucket) => bucket?.name);

    assert.deepEqual(names, ['bucket_c', 'bucket_a', 'bucket_b']);
  });
});

test('uses default flow level 3 when no environment override is configured', () => {
  withYamlFlowLevelEnv(null, () => {
    const config = {
      server: {
        address: '127.0.0.1:8080',
        instance_name: 'nauthilus',
        max_concurrent_requests: 100,
        max_password_history_entries: 10,
        backends: ['cache', 'ldap'],
        redis: {
          database_number: 0,
          prefix: 'nt:',
          master: { address: '127.0.0.1:6379' },
        },
      },
    };

    const yamlContent = formatConfigAsYaml(config);

    assert.match(yamlContent, /backends:\n\s+- "cache"\n\s+- "ldap"/);
    assert.ok(!yamlContent.includes('backends: ["cache", "ldap"]'));
  });
});

test('supports flow style override through REACT_APP_YAML_FLOW_LEVEL', () => {
  withYamlFlowLevelEnv('2', () => {
    const config = {
      server: {
        address: '127.0.0.1:8080',
        instance_name: 'nauthilus',
        max_concurrent_requests: 100,
        max_password_history_entries: 10,
        backends: ['cache', 'ldap'],
        redis: {
          database_number: 0,
          prefix: 'nt:',
          master: { address: '127.0.0.1:6379' },
        },
      },
    };

    const yamlContent = formatConfigAsYaml(config);
    const parsed = yaml.load(yamlContent);

    assert.match(yamlContent, /backends: \["cache", "ldap"\]/);
    assert.deepEqual(parsed?.server?.backends, ['cache', 'ldap']);
  });
});

test('quotes string values while keeping numbers and booleans native', () => {
  withYamlFlowLevelEnv(null, () => {
    const config = {
      server: {
        address: '127.0.0.1:8080',
        instance_name: 'nauthilus',
        max_concurrent_requests: 100,
        max_password_history_entries: 10,
        backends: ['cache'],
        http3: true,
        local_cache_auth_ttl: '5m',
        run_as_user: '1000',
        redis: {
          database_number: 0,
          prefix: 'nt:',
          master: { address: '127.0.0.1:6379' },
        },
      },
      custom_feature: {
        enabled: false,
        retries: 3,
        timeout: '250ms',
        numeric_string: '123',
        bool_string: 'true',
      },
    };

    const yamlContent = formatConfigAsYaml(config);
    const parsed = yaml.load(yamlContent);

    assert.match(yamlContent, /instance_name: "nauthilus"/);
    assert.match(yamlContent, /local_cache_auth_ttl: "5m"/);
    assert.match(yamlContent, /run_as_user: "1000"/);
    assert.match(yamlContent, /timeout: "250ms"/);
    assert.match(yamlContent, /numeric_string: "123"/);
    assert.match(yamlContent, /bool_string: "true"/);

    assert.match(yamlContent, /max_concurrent_requests: 100/);
    assert.match(yamlContent, /http3: true/);
    assert.match(yamlContent, /enabled: false/);
    assert.ok(!yamlContent.includes('max_concurrent_requests: "100"'));
    assert.ok(!yamlContent.includes('http3: "true"'));
    assert.ok(!yamlContent.includes('enabled: "false"'));

    assert.equal(typeof parsed.server.max_concurrent_requests, 'number');
    assert.equal(typeof parsed.server.http3, 'boolean');
    assert.equal(typeof parsed.custom_feature.enabled, 'boolean');
    assert.equal(typeof parsed.custom_feature.retries, 'number');
    assert.equal(typeof parsed.server.local_cache_auth_ttl, 'string');
    assert.equal(typeof parsed.custom_feature.timeout, 'string');
    assert.equal(typeof parsed.custom_feature.numeric_string, 'string');
    assert.equal(typeof parsed.custom_feature.bool_string, 'string');
  });
});

test('exports frontend security headers object partials even for legacy string input', () => {
  withYamlFlowLevelEnv(null, () => {
    const config = {
      server: {
        address: '127.0.0.1:8080',
        instance_name: 'nauthilus',
        max_concurrent_requests: 100,
        max_password_history_entries: 10,
        backends: ['cache'],
        redis: {
          database_number: 0,
          prefix: 'nt:',
          master: { address: '127.0.0.1:6379' },
        },
        frontend: {
          security_headers: {
            enabled: true,
            content_security_policy: "default-src 'none'; connect-src 'self' https://api.example.test",
            strict_transport_security: 'max-age=86400; preload',
            permissions_policy: 'geolocation=(), camera=()',
          },
        },
      },
    };

    const yamlContent = formatConfigAsYaml(config);
    const parsed = yaml.load(yamlContent);
    const securityHeaders = parsed?.server?.frontend?.security_headers;

    assert.equal(typeof securityHeaders?.content_security_policy, 'object');
    assert.equal(typeof securityHeaders?.strict_transport_security, 'object');
    assert.equal(typeof securityHeaders?.permissions_policy, 'object');

    assert.deepEqual(securityHeaders?.content_security_policy?.directives?.['default-src'], ["'none'"]);
    assert.deepEqual(securityHeaders?.content_security_policy?.directives?.['connect-src'], ["'self'", 'https://api.example.test']);

    assert.equal(securityHeaders?.strict_transport_security?.max_age, '86400');
    assert.equal(securityHeaders?.strict_transport_security?.include_subdomains, true);
    assert.equal(securityHeaders?.strict_transport_security?.preload, true);

    assert.equal(securityHeaders?.permissions_policy?.features?.geolocation, '()');
    assert.equal(securityHeaders?.permissions_policy?.features?.camera, '()');
    assert.equal(securityHeaders?.permissions_policy?.features?.microphone, '()');
  });
});
