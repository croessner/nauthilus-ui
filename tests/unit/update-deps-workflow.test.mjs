import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const scriptPath = path.join(repoRoot, 'scripts', 'update-deps.sh');
const qualityScriptPath = path.join(repoRoot, 'check-quality.sh');
const packageJsonPath = path.join(repoRoot, 'package.json');

function readScript() {
  return fs.readFileSync(scriptPath, 'utf8');
}

function readPackageJson() {
  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
}

function readQualityScript() {
  return fs.readFileSync(qualityScriptPath, 'utf8');
}

test('dependency updater avoids remote npx or pnpm dlx execution', () => {
  const source = readScript();
  assert.doesNotMatch(source, /\bnpx\b/);
  assert.doesNotMatch(source, /pnpm\s+dlx/);
});

test('dependency updater enforces npm ci with safe flags', () => {
  const source = readScript();
  assert.match(source, /npm ci --legacy-peer-deps --ignore-scripts --no-audit --no-fund/);
  assert.match(source, /npm install --legacy-peer-deps --package-lock-only --ignore-scripts --no-audit --no-fund/);
});

test('package scripts default to sandboxed dependency updates', () => {
  const pkg = readPackageJson();
  assert.equal(pkg.scripts['deps:update'], 'bash scripts/update-deps.sh --sandbox');
  assert.ok(!Object.prototype.hasOwnProperty.call(pkg.scripts, 'deps:update:host'));
  assert.equal(
    pkg.scripts['deps:update:host:unsafe'],
    'NAUTHILUS_ALLOW_HOST_DEP_UPDATES=1 bash scripts/update-deps.sh --host'
  );
  assert.match(pkg.scripts['deps:upgrade:minor'], /\bncu\b/);
  assert.doesNotMatch(pkg.scripts['deps:upgrade:minor'], /\bnpx\b/);
});

test('quality check script does not fall back to npx execution', () => {
  const source = readQualityScript();
  assert.doesNotMatch(source, /\bnpx\b/);
});

test('dependency updater blocks host mode unless explicit override is set', () => {
  const source = readScript();
  assert.match(source, /Host mode is disabled by policy/);
  assert.match(source, /NAUTHILUS_ALLOW_HOST_DEP_UPDATES=1/);
});

test('package scripts expose production audit gate command', () => {
  const pkg = readPackageJson();
  assert.equal(
    pkg.scripts['deps:audit:gate:prod'],
    'node scripts/audit-gate.mjs --omit=dev --baseline security/npm-audit-baseline.json'
  );
  assert.equal(
    pkg.scripts['deps:audit:gate:full'],
    'node scripts/audit-gate.mjs --baseline security/npm-audit-baseline-full.json'
  );
});
