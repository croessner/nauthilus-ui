import test from 'node:test';
import assert from 'node:assert/strict';
import { validateConfigForExport, validateEssentialConfigSettings } from '../../src/utils/configPreviewValidation.ts';

const validBaseConfig = () => ({
  server: {
    address: '127.0.0.1:8080',
    instance_name: 'nauthilus',
    max_concurrent_requests: 100,
    max_password_history_entries: 10,
    backends: ['cache'],
    redis: {
      database_number: 0,
      prefix: 'nt:',
      password_nonce: '1234567890abcdef',
      encryption_secret: 'fedcba0987654321',
      master: { address: '127.0.0.1:6379' },
    },
  },
});

test('returns valid for a minimal valid base configuration', () => {
  const config = validBaseConfig();
  const result = validateEssentialConfigSettings(config);

  assert.equal(result.isValid, true);
  assert.deepEqual(result.errors, []);
});

test('normalizes exported config and drops UI-only fields', () => {
  const config = validBaseConfig();
  config.server.jwt_auth = { enabled: true };
  config.connection = { backend_url: 'https://example.invalid' };

  const report = validateConfigForExport(config);

  assert.equal(report.isValid, true);
  assert.equal(report.normalizedConfig.server?.jwt_auth, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(report.normalizedConfig, 'connection'), false);
});

test('detects missing Lua section when lua backend is enabled', () => {
  const config = validBaseConfig();
  config.server.backends = ['lua'];

  const result = validateEssentialConfigSettings(config);

  assert.equal(result.isValid, false);
  assert.ok(result.errors.includes('Lua backend is configured but the lua section is missing.'));
});

test('detects required Redis secrets', () => {
  const config = validBaseConfig();
  delete config.server.redis.password_nonce;
  delete config.server.redis.encryption_secret;

  const report = validateConfigForExport(config);

  assert.equal(report.isValid, false);
  assert.ok(report.blockingFindings.some((finding) => finding.path === 'server.redis.password_nonce'));
  assert.ok(report.blockingFindings.some((finding) => finding.path === 'server.redis.encryption_secret'));
});

test('accepts scalar string values for backend and LDAP string-list fields', () => {
  const config = validBaseConfig();
  config.server.backends = 'ldap';
  config.ldap = {
    config: {
      lookup_pool_size: 2,
      server_uri: 'ldap://127.0.0.1:389',
    },
    search: [
      {
        protocol: 'imap',
        cache_name: 'default',
        base_dn: 'dc=example,dc=org',
        filter: { user: '(uid=%s)' },
        mapping: { account_field: 'uid' },
        attribute: 'mail',
      },
    ],
  };

  const report = validateConfigForExport(config);

  assert.equal(report.isValid, true);
  assert.ok(!report.blockingFindings.some((finding) => finding.path === 'ldap.search[0].protocol'));
});

test('accepts scalar string values for feature-dependent string lists', () => {
  const config = validBaseConfig();
  config.server.features = 'relay_domains';
  config.relay_domains = {
    static: 'example.org',
  };

  const report = validateConfigForExport(config);

  assert.equal(report.isValid, true);
  assert.ok(!report.blockingFindings.some((finding) => finding.path === 'relay_domains.static'));
});

test('accepts scalar object value for RBL lists', () => {
  const config = validBaseConfig();
  config.server.features = 'rbl';
  config.realtime_blackhole_lists = {
    lists: {
      name: 'spamhaus',
      rbl: 'zen.spamhaus.org',
      return_codes: ['127.0.0.2'],
    },
  };

  const report = validateConfigForExport(config);

  assert.equal(report.isValid, true);
  assert.ok(!report.blockingFindings.some((finding) => finding.path === 'realtime_blackhole_lists.lists'));
});

test('accepts scalar object value for OIDC custom scope claims', () => {
  const config = validBaseConfig();
  config.idp = {
    oidc: {
      custom_scopes: [
        {
          name: 'profile',
          description: 'Profile scope',
          claims: {
            name: 'sub',
            type: 'string',
          },
        },
      ],
    },
  };

  const report = validateConfigForExport(config);

  assert.equal(report.isValid, true);
  assert.ok(!report.blockingFindings.some((finding) => finding.path === 'idp.oidc.custom_scopes[0].claims'));
});

test('accepts scalar object value for LDAP search list', () => {
  const config = validBaseConfig();
  config.server.backends = 'ldap';
  config.ldap = {
    config: {
      lookup_pool_size: 2,
      server_uri: 'ldap://127.0.0.1:389',
    },
    search: {
      protocol: 'imap',
      cache_name: 'default',
      base_dn: 'dc=example,dc=org',
      filter: { user: '(uid=%s)' },
      mapping: { account_field: 'uid' },
      attribute: 'mail',
    },
  };

  const report = validateConfigForExport(config);

  assert.equal(report.isValid, true);
  assert.ok(!report.blockingFindings.some((finding) => finding.path === 'ldap.search[0].protocol'));
});

test('accepts scalar object values for Lua list fields', () => {
  const config = validBaseConfig();
  config.server.backends = 'lua';
  config.lua = {
    search: {
      protocol: 'imap',
      cache_name: 'lua-default',
      backend_name: 'main',
    },
    actions: {
      name: 'allow',
      script_path: '/opt/lua/actions/allow.lua',
      type: 'allow',
    },
    custom_hooks: {
      http_location: '/api/v1/custom/demo',
      http_method: 'POST',
      script_path: '/opt/lua/hooks/demo.lua',
    },
  };

  const report = validateConfigForExport(config);

  assert.equal(report.isValid, true);
  assert.ok(!report.blockingFindings.some((finding) => finding.path === 'lua.search'));
  assert.ok(!report.blockingFindings.some((finding) => finding.path === 'lua.actions[0].name'));
  assert.ok(!report.blockingFindings.some((finding) => finding.path === 'lua.custom_hooks[0].script_path'));
});

test('accepts scalar object value for brute force buckets list', () => {
  const config = validBaseConfig();
  config.server.features = 'brute_force';
  config.brute_force = {
    buckets: {
      name: 'b_1m_ipv4',
      period: '1m',
      cidr: 32,
      failed_requests: 10,
      ipv4: true,
    },
  };

  const report = validateConfigForExport(config);

  assert.equal(report.isValid, true);
  assert.ok(!report.blockingFindings.some((finding) => finding.path === 'brute_force.buckets'));
});
