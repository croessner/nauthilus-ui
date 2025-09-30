#!/usr/bin/env node
import { glob } from 'glob';
import { readFile, writeFile } from 'node:fs/promises';

const GRID_IMPORT_RE = /import\s*\{([^}]+)\}\s*from\s*['"]@mui\/material['"];?/g;

function ensureGridDefaultImport(src) {
  // If there's already a default import for Grid, do nothing.
  if (/import\s+Grid\s+from\s+['"]@mui\/material\/Grid['"];?/.test(src)) return src;

  let modified = src;
  let replacedAny = false;

  modified = modified.replace(GRID_IMPORT_RE, (m, inside) => {
    // Remove Grid from named list
    const items = inside.split(',').map(s => s.trim()).filter(Boolean);
    const filtered = items.filter(name => !/^Grid(\s+as\s+\w+)?$/.test(name));
    if (filtered.length !== items.length) {
      replacedAny = true;
      if (filtered.length > 0) {
        return `import { ${filtered.join(', ')} } from '@mui/material';`;
      } else {
        return '';
      }
    }
    return m;
  });

  if (replacedAny) {
    // Insert default import near the top (after first import)
    const firstImportIdx = modified.indexOf('import');
    if (firstImportIdx !== -1) {
      // Place after last leading import block
      const importBlocks = [...modified.matchAll(/^import[^\n]*\n?/gm)];
      const last = importBlocks.length ? importBlocks[importBlocks.length - 1] : null;
      const insertPos = last ? last.index + last[0].length : 0;
      modified = modified.slice(0, insertPos) + `import Grid from '@mui/material/Grid';\n` + modified.slice(insertPos);
    } else {
      modified = `import Grid from '@mui/material/Grid';\n` + modified;
    }
  }

  return modified;
}

function transformGridTags(src) {
  // Replace <Grid ... xs={...} md={...} ...> with size prop and remove item prop.
  // Also handle self-closing tags.
  return src.replace(/<Grid\b([^<>]*?)(\/)?>/gs, (full, props, selfClose) => {
    let p = props || '';

    // Work only on prop string, avoid altering strings by naive regex (best-effort).
    // Remove `item` prop (item or item={true})
    p = p.replace(/\bitem(\s*=\s*\{?\s*true\s*\}?)?\b/g, '');

    const bps = {};

    const keys = ['xs', 'sm', 'md', 'lg', 'xl'];
    for (const key of keys) {
      // {value}
      const re1 = new RegExp(`\\s${key}\\s*=\\s*\\{([^}]+)\\}`, 'g');
      p = p.replace(re1, (_m, val) => {
        bps[key] = (val || '').trim();
        return '';
      });
      // "value"
      const re2 = new RegExp(`\\s${key}\\s*=\\s*"([^"]+)"`, 'g');
      p = p.replace(re2, (_m, val) => {
        // Quote string literal explicitly
        bps[key] = JSON.stringify(val);
        return '';
      });
    }

    // Clean duplicated spaces
    p = p.replace(/\s+/g, ' ').trim();
    if (p.length) p = ' ' + p;

    let sizeInsert = '';
    const present = keys.filter(k => bps[k] !== undefined);
    if (present.length === 1 && present[0] === 'xs') {
      sizeInsert = ` size={${bps['xs']}}`;
    } else if (present.length >= 1) {
      const parts = present.map(k => `${k}: ${bps[k]}`);
      sizeInsert = ` size={{ ${parts.join(', ')} }}`;
    }

    const closing = selfClose ? ' /' : '';
    return `<Grid${p}${sizeInsert}${closing}>`;
  });
}

async function run() {
  const files = await glob('src/**/*.tsx');
  let changed = 0;
  for (const file of files) {
    let src = await readFile(file, 'utf8');
    const before = src;
    src = ensureGridDefaultImport(src);
    src = transformGridTags(src);
    if (src !== before) {
      await writeFile(file, src, 'utf8');
      changed++;
      console.log(`migrated: ${file}`);
    }
  }
  console.log(`Done. Files changed: ${changed}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
