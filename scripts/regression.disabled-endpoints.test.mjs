#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { sanitizeDisabledEndpoints } from '../src/utils/serverConfigNormalization.ts';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

const removedEndpointKey = ['auth', 'saslauthd'].join('_');

const sanitizedDisabledEndpoints = sanitizeDisabledEndpoints({
  auth_header: true,
  custom_hooks: false,
  [removedEndpointKey]: true,
});

if (!sanitizedDisabledEndpoints) {
  fail('sanitizeDisabledEndpoints must retain supported endpoint keys.');
} else {
  if (sanitizedDisabledEndpoints.auth_header !== true) {
    fail('sanitizeDisabledEndpoints must retain auth_header.');
  }

  if (sanitizedDisabledEndpoints.custom_hooks !== false) {
    fail('sanitizeDisabledEndpoints must retain custom_hooks.');
  }

  if (Object.prototype.hasOwnProperty.call(sanitizedDisabledEndpoints, removedEndpointKey)) {
    fail(`sanitizeDisabledEndpoints must drop unsupported endpoint key ${removedEndpointKey}.`);
  }
}

const configContextSource = fs.readFileSync(path.resolve(repoRoot, 'src/contexts/ConfigContext.tsx'), 'utf8');
if (!configContextSource.includes('sanitizeDisabledEndpoints(config.server.disabled_endpoints)')) {
  fail('ConfigContext normalization must sanitize server.disabled_endpoints.');
}

const yamlUtilsSource = fs.readFileSync(path.resolve(repoRoot, 'src/utils/yamlUtils.ts'), 'utf8');
if (!yamlUtilsSource.includes('sanitizeDisabledEndpoints(configCopy.server.disabled_endpoints)')) {
  fail('YAML export must sanitize server.disabled_endpoints before serialization.');
}

if (!process.exitCode) {
  console.log('PASS: disabled_endpoints is sanitized to supported backend keys.');
}
