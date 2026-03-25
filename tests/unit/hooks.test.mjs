import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICAL_CLICKHOUSE_ENDPOINT,
  getKnownHookEndpointSuggestions,
  getKnownHookHttpMethodForEndpoint,
  hasCanonicalClickhouseEndpoint,
  normalizeCustomHookEndpointPath
} from '../../src/utils/hooks.ts';

test('extracts endpoints from runtime hooks and normalizes custom prefix', () => {
  const runtimeHooks = {
    clickhouse_query: { endpoint_path: 'clickhouse-query' },
    custom_hooks: [
      { http_location: '/hooks/distributed-brute-force-test' },
      { http_location: 'clickhouse-query' },
    ],
  };

  const suggestions = getKnownHookEndpointSuggestions(runtimeHooks);

  assert.deepEqual(suggestions, [
    '/api/v1/custom/clickhouse-query',
    '/api/v1/custom/hooks/distributed-brute-force-test',
  ]);
});

test('merges endpoints from multiple sources including lua config', () => {
  const runtimeHooks = {
    clickhouse_query: { endpoint_path: '/api/v1/custom/clickhouse-query' },
  };
  const luaConfig = {
    custom_hooks: [{ http_location: 'new-from-lua' }],
  };

  const suggestions = getKnownHookEndpointSuggestions(runtimeHooks, luaConfig);

  assert.deepEqual(suggestions, [
    '/api/v1/custom/clickhouse-query',
    '/api/v1/custom/new-from-lua',
  ]);
});

test('handles mixed input types and keeps valid string hook locations', () => {
  const suggestions = getKnownHookEndpointSuggestions(null, undefined, { any: 1 }, ['not-a-path']);
  assert.deepEqual(suggestions, ['/api/v1/custom/not-a-path']);
});

test('resolves configured HTTP method for endpoint from hook definitions', () => {
  const runtimeHooks = {
    custom_hooks: [
      { http_location: 'clickhouse-query', http_method: 'GET' },
      { http_location: '/hooks/other', http_method: 'POST' },
    ],
  };

  assert.equal(
    getKnownHookHttpMethodForEndpoint('/api/v1/custom/clickhouse-query', runtimeHooks),
    'GET'
  );
  assert.equal(
    getKnownHookHttpMethodForEndpoint('/api/v1/custom/hooks/other', runtimeHooks),
    'POST'
  );
  assert.equal(
    getKnownHookHttpMethodForEndpoint('/api/v1/custom/unknown', runtimeHooks),
    null
  );
});

test('normalizes legacy clickhouse endpoint paths to canonical custom-hook paths', () => {
  assert.equal(normalizeCustomHookEndpointPath('clickhouse-query'), '/api/v1/custom/clickhouse-query');
  assert.equal(normalizeCustomHookEndpointPath('/clickhouse-query'), '/api/v1/custom/clickhouse-query');
  assert.equal(normalizeCustomHookEndpointPath('/hooks/clickhouse-query'), '/api/v1/custom/hooks/clickhouse-query');
  assert.equal(normalizeCustomHookEndpointPath('/api/v1/custom/clickhouse-query'), '/api/v1/custom/clickhouse-query');
  assert.equal(normalizeCustomHookEndpointPath('   '), '');
});

test('detects canonical clickhouse endpoint in hook sources', () => {
  const withCanonical = {
    custom_hooks: [{ http_location: 'clickhouse-query' }],
  };
  const withoutCanonical = {
    custom_hooks: [{ http_location: '/hooks/another-endpoint' }],
  };

  assert.equal(hasCanonicalClickhouseEndpoint(withCanonical), true);
  assert.equal(hasCanonicalClickhouseEndpoint(withoutCanonical), false);
  assert.equal(hasCanonicalClickhouseEndpoint([{ endpoint_path: CANONICAL_CLICKHOUSE_ENDPOINT }]), true);
});
