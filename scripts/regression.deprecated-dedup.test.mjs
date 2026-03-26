#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import yaml from 'js-yaml';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

function readText(relativePath) {
  return fs.readFileSync(path.resolve(repoRoot, relativePath), 'utf8');
}

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function assertNoDemoDedup(relativePath) {
  const source = readText(relativePath);
  const parsed = yaml.load(source) ?? {};
  const serverConfig = typeof parsed === 'object' && parsed !== null ? parsed.server : undefined;

  if (serverConfig && typeof serverConfig === 'object' && 'dedup' in serverConfig) {
    fail(`${relativePath} must not define server.dedup.`);
  }

  if (source.includes('in_process_enabled')) {
    fail(`${relativePath} must not contain in_process_enabled.`);
  }
}

function assertUiDoesNotExposeDedup() {
  const configTypes = readText('src/types/config.ts');
  if (configTypes.includes('dedup?: DedupConfig')) {
    fail('src/types/config.ts must not expose server.dedup.');
  }

  if (configTypes.includes('export interface DedupConfig')) {
    fail('src/types/config.ts must not define DedupConfig.');
  }

  const configContext = readText('src/contexts/ConfigContext.tsx');
  if (!configContext.includes('delete (normalizedConfig.server as any).dedup;')) {
    fail('src/contexts/ConfigContext.tsx must drop legacy server.dedup during normalization.');
  }

  if (configContext.match(/'dedup'/)) {
    fail('src/contexts/ConfigContext.tsx must not keep dedup in the known server property allowlist.');
  }
}

assertNoDemoDedup('contrib/demo-stack/nauthilus/nauthilus.yml');
assertNoDemoDedup('contrib/demo-stack/gitea/seed-nauthilus.yml');
assertUiDoesNotExposeDedup();

if (!process.exitCode) {
  console.log('PASS: deprecated dedup settings are removed from UI and demo stack.');
}
