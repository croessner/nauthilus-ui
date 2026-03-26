import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEssentialConfigSettings } from '../../src/utils/configPreviewValidation.ts';
import { formatConfigAsYaml } from '../../src/utils/yamlUtils.ts';

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
      master: { address: '127.0.0.1:6379' },
    },
  },
});

test('returns valid for a minimal valid base configuration', () => {
  const config = validBaseConfig();
  const result = validateEssentialConfigSettings(config, () => [], formatConfigAsYaml);

  assert.equal(result.isValid, true);
  assert.deepEqual(result.errors, []);
});

test('validates against normalized export config (legacy jwt_auth is ignored)', () => {
  const config = validBaseConfig();
  config.server.jwt_auth = { enabled: true };
  config.connection = { backend_url: 'https://example.invalid' };

  const result = validateEssentialConfigSettings(config, (_section, normalizedConfig) => {
    if (normalizedConfig.server?.jwt_auth) {
      return ['legacy jwt_auth should not be present'];
    }

    if ('connection' in normalizedConfig) {
      return ['ui-only connection should not be present'];
    }

    return [];
  }, formatConfigAsYaml);

  assert.equal(result.isValid, true);
  assert.deepEqual(result.errors, []);
});

test('detects missing Lua section when lua backend is enabled', () => {
  const config = validBaseConfig();
  config.server.backends = ['lua'];

  const result = validateEssentialConfigSettings(config, () => [], formatConfigAsYaml);

  assert.equal(result.isValid, false);
  assert.ok(result.errors.includes('Lua backend is configured but Lua configuration is missing or incomplete.'));
});
