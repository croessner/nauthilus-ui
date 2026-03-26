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
