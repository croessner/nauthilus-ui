#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const DEFAULT_BASELINE = path.resolve('security', 'npm-audit-baseline.json');

function parseArgs(argv) {
  const options = {
    baseline: DEFAULT_BASELINE,
    omitDev: false,
    auditLevel: 'high',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--baseline') {
      const next = argv[i + 1];
      if (!next) {
        throw new Error('--baseline requires a file path');
      }
      options.baseline = path.resolve(next);
      i += 1;
      continue;
    }
    if (arg === '--omit=dev' || arg === '--omit-dev' || arg === '--prod') {
      options.omitDev = true;
      continue;
    }
    if (arg === '--audit-level') {
      const next = argv[i + 1];
      if (!next) {
        throw new Error('--audit-level requires a value');
      }
      options.auditLevel = next;
      i += 1;
      continue;
    }
    if (arg === '-h' || arg === '--help') {
      printHelp();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function printHelp() {
  console.log('Usage: node scripts/audit-gate.mjs [--baseline <file>] [--omit=dev] [--audit-level <level>]');
}

function loadBaseline(baselinePath) {
  if (!fs.existsSync(baselinePath)) {
    throw new Error(`Baseline file not found: ${baselinePath}`);
  }

  const parsed = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  const raw = parsed.allowedHighOrCriticalAdvisories;
  if (!Array.isArray(raw)) {
    throw new Error('Baseline must define allowedHighOrCriticalAdvisories as an array');
  }

  const ids = raw.map((entry) => (typeof entry === 'string' ? entry : entry?.id)).filter(Boolean);
  return new Set(ids);
}

function advisoryIdFromUrl(url, source) {
  if (typeof url === 'string' && url.length > 0) {
    const match = url.match(/GHSA-[a-z0-9-]+$/i);
    if (match) {
      return match[0];
    }
    return url;
  }
  if (source !== undefined && source !== null) {
    return `source:${source}`;
  }
  return 'unknown-advisory';
}

function collectHighOrCriticalAdvisories(report) {
  const advisories = new Map();
  const vulnerabilities = report?.vulnerabilities ?? {};

  for (const [packageName, vulnerability] of Object.entries(vulnerabilities)) {
    const viaList = Array.isArray(vulnerability?.via) ? vulnerability.via : [];
    for (const via of viaList) {
      if (!via || typeof via !== 'object') {
        continue;
      }
      const severity = String(via.severity ?? '').toLowerCase();
      if (severity !== 'high' && severity !== 'critical') {
        continue;
      }

      const advisoryId = advisoryIdFromUrl(via.url, via.source);
      if (!advisories.has(advisoryId)) {
        advisories.set(advisoryId, {
          id: advisoryId,
          severity,
          url: via.url ?? '',
          title: via.title ?? advisoryId,
          packages: new Set(),
        });
      }
      advisories.get(advisoryId).packages.add(packageName);
    }
  }

  return advisories;
}

function runAudit(options) {
  const args = ['audit', '--json', '--audit-level', options.auditLevel];
  if (options.omitDev) {
    args.push('--omit=dev');
  }

  const result = spawnSync('npm', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`npm audit failed with exit code ${result.status}\n${result.stderr || ''}`);
  }

  if (!result.stdout || result.stdout.trim().length === 0) {
    throw new Error('npm audit returned no JSON output');
  }

  return JSON.parse(result.stdout);
}

function formatPackages(packageSet) {
  return Array.from(packageSet).sort().join(', ');
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const baseline = loadBaseline(options.baseline);
    const report = runAudit(options);
    const advisories = collectHighOrCriticalAdvisories(report);

    const unknown = Array.from(advisories.values())
      .filter((entry) => !baseline.has(entry.id))
      .sort((a, b) => a.id.localeCompare(b.id));

    const covered = Array.from(advisories.values())
      .filter((entry) => baseline.has(entry.id))
      .sort((a, b) => a.id.localeCompare(b.id));

    console.log(
      `Audit gate scope: ${options.omitDev ? 'prod (omit=dev)' : 'full dependency tree'} | level=${options.auditLevel}`
    );
    console.log(`Detected high/critical advisories: ${advisories.size}`);
    console.log(`Covered by baseline: ${covered.length}`);

    if (unknown.length > 0) {
      console.error('New high/critical advisories detected (not in baseline):');
      for (const advisory of unknown) {
        console.error(`- ${advisory.id} [${advisory.severity}] ${advisory.title}`);
        if (advisory.url) {
          console.error(`  ${advisory.url}`);
        }
        console.error(`  Packages: ${formatPackages(advisory.packages)}`);
      }
      process.exit(1);
    }

    const resolvedFromBaseline = Array.from(baseline.values())
      .filter((id) => !advisories.has(id))
      .sort();
    if (resolvedFromBaseline.length > 0) {
      console.log(`Resolved baseline advisories (cleanup candidate): ${resolvedFromBaseline.join(', ')}`);
    }

    console.log('Audit gate passed: no new high/critical advisories.');
  } catch (error) {
    console.error(`Audit gate failed: ${error.message}`);
    process.exit(1);
  }
}

main();
