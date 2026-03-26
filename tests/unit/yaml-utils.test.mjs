import test from 'node:test';
import assert from 'node:assert/strict';
import yaml from 'js-yaml';
import { formatConfigAsYaml } from '../../src/utils/yamlUtils.ts';

test('keeps brute_force bucket order in YAML export', () => {
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
