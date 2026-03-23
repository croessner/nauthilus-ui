#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const backendConfigDir = path.resolve(repoRoot, '../nauthilus/server/config');
const manifestPath = path.resolve(repoRoot, 'scripts/config-parity-manifest.json');

const scalarTypeNames = new Set([
  'string',
  'bool',
  'int',
  'int8',
  'int16',
  'int32',
  'int64',
  'uint',
  'uint8',
  'uint16',
  'uint32',
  'uint64',
  'float32',
  'float64',
  'any',
  'time.Duration',
  'secret.Value',
  'Verbosity',
  'Backend',
  'Feature',
  'Protocol',
  'DbgModule',
  'SoftWhitelist',
]);

function listGoFiles(dir) {
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.go') && !name.endsWith('_test.go'))
    .map((name) => path.join(dir, name))
    .sort();
}

function findMatchingBrace(source, openIndex) {
  let depth = 0;

  for (let i = openIndex; i < source.length; i += 1) {
    const char = source[i];

    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;

      if (depth === 0) {
        return i;
      }
    }
  }

  return -1;
}

function parseStructFields(body) {
  const fields = [];
  const lines = body.split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line || line.startsWith('//')) {
      continue;
    }

    const tagMatch = line.match(/`[^`]*mapstructure:"([^"]+)"[^`]*`/);
    if (!tagMatch) {
      continue;
    }

    const tag = tagMatch[1];
    if (!tag || tag === '-' || tag === ',remain') {
      continue;
    }

    const decl = line.slice(0, line.indexOf('`')).trim();
    if (!decl) {
      continue;
    }

    const parts = decl.split(/\s+/);
    let typeExpr;

    if (parts.length === 1) {
      typeExpr = parts[0];
    } else {
      typeExpr = parts.slice(1).join(' ');
    }

    fields.push({ tag, typeExpr });
  }

  return fields;
}

function parseStructs(goFiles) {
  const structs = new Map();

  for (const filePath of goFiles) {
    const source = fs.readFileSync(filePath, 'utf8');
    const regex = /type\s+([A-Za-z0-9_]+)\s+struct\s*\{/g;
    let match;

    while ((match = regex.exec(source)) !== null) {
      const structName = match[1];
      const openBraceIndex = source.indexOf('{', match.index);
      const closeBraceIndex = findMatchingBrace(source, openBraceIndex);

      if (closeBraceIndex === -1) {
        throw new Error(`Could not find end of struct ${structName} in ${filePath}`);
      }

      const body = source.slice(openBraceIndex + 1, closeBraceIndex);
      structs.set(structName, {
        filePath,
        fields: parseStructFields(body),
      });
    }
  }

  return structs;
}

function unwrapType(typeExpr) {
  const compact = typeExpr.replace(/\s+/g, '');

  if (compact.startsWith('[]')) {
    return { container: 'slice', valueType: compact.slice(2) };
  }

  if (compact.startsWith('map[')) {
    const closeBracket = compact.indexOf(']');
    return { container: 'map', valueType: compact.slice(closeBracket + 1) };
  }

  return { container: 'single', valueType: compact };
}

function normalizeNamedType(typeExpr) {
  let value = typeExpr;
  while (value.startsWith('*')) {
    value = value.slice(1);
  }
  return value;
}

function buildLeafPaths(structs, structName, basePath = '', seen = new Set()) {
  const structInfo = structs.get(structName);
  if (!structInfo) {
    return [];
  }

  const recursionKey = `${structName}:${basePath}`;
  if (seen.has(recursionKey)) {
    return [];
  }

  seen.add(recursionKey);

  const paths = [];

  for (const field of structInfo.fields) {
    const { container, valueType } = unwrapType(field.typeExpr);
    const namedType = normalizeNamedType(valueType);
    const nextPath = basePath ? `${basePath}.${field.tag}` : field.tag;
    const childStruct = structs.get(namedType);

    if (!childStruct || scalarTypeNames.has(namedType) || childStruct.fields.length === 0) {
      paths.push(nextPath);
      continue;
    }

    if (container === 'slice') {
      paths.push(...buildLeafPaths(structs, namedType, `${nextPath}[]`, new Set(seen)));
      continue;
    }

    if (container === 'map') {
      paths.push(...buildLeafPaths(structs, namedType, `${nextPath}.*`, new Set(seen)));
      continue;
    }

    paths.push(...buildLeafPaths(structs, namedType, nextPath, new Set(seen)));
  }

  return paths;
}

function loadManifest() {
  if (!fs.existsSync(manifestPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function pathToRegex(pattern) {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/\\\*/g, '[^.]+')}$`);
}

function matchesAny(pathname, patterns) {
  return patterns.some((pattern) => pathToRegex(pattern).test(pathname));
}

function main() {
  const structs = parseStructs(listGoFiles(backendConfigDir));
  const backendPaths = [...new Set(buildLeafPaths(structs, 'FileSettings'))].sort();

  if (process.argv.includes('--dump-paths')) {
    console.log(backendPaths.join('\n'));
    return;
  }

  const manifest = loadManifest();
  if (!manifest) {
    throw new Error(`Missing manifest file: ${manifestPath}`);
  }

  const visible = manifest.supportedVisible ?? [];
  const hidden = manifest.supportedHidden ?? [];
  const hiddenDeprecated = manifest.supportedHiddenDeprecated ?? [];
  const ignored = manifest.ignoredBackendPaths ?? [];
  const declaredPatterns = [...visible, ...hidden, ...hiddenDeprecated, ...ignored];

  const unsupported = backendPaths.filter((backendPath) => !matchesAny(backendPath, declaredPatterns));
  const staleManifestEntries = declaredPatterns.filter((pattern) => !backendPaths.some((backendPath) => pathToRegex(pattern).test(backendPath)));

  if (unsupported.length === 0 && staleManifestEntries.length === 0) {
    console.log(`Config parity OK. Checked ${backendPaths.length} backend config paths.`);
    return;
  }

  if (unsupported.length > 0) {
    console.error('Unsupported backend config paths:');
    for (const item of unsupported) {
      console.error(`  - ${item}`);
    }
  }

  if (staleManifestEntries.length > 0) {
    console.error('Stale manifest entries:');
    for (const item of staleManifestEntries) {
      console.error(`  - ${item}`);
    }
  }

  process.exitCode = 1;
}

main();
