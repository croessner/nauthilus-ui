"use strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const TARGET = "auth/me2"; // any occurrence is considered a typo/regression

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "build",
  "dist",
  "bin",
  "public",
  "quality",
  "server/vendor",
]);

async function walk(dir, results = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(process.cwd(), full);
    // Skip ignored directories (supports nested paths like server/vendor)
    if (entry.isDirectory()) {
      if ([...IGNORED_DIRS].some((p) => rel === p || rel.startsWith(p + path.sep))) {
        continue;
      }
      await walk(full, results);
    } else if (entry.isFile()) {
      results.push(full);
    }
  }
  return results;
}

async function scanFiles(files) {
  const offenders = [];
  for (const file of files) {
    try {
      // Only scan likely text files by extension
      const ext = path.extname(file).toLowerCase();
      if (!ext || [".ts", ".tsx", ".js", ".jsx", ".go", ".json", ".md", ".yml", ".yaml", ".html", ".css", ".mjs", ".cjs"].includes(ext)) {
        const content = await readFile(file, "utf8");
        if (content.includes(TARGET)) {
          offenders.push(file);
        }
      }
    } catch (e) {
      // ignore unreadable files
    }
  }
  return offenders;
}

async function main() {
  const root = process.cwd();
  const candidates = [path.join(root, "src"), path.join(root, "server")];
  const existing = [];
  for (const d of candidates) {
    try {
      const s = await stat(d);
      if (s.isDirectory()) existing.push(d);
    } catch {
      // skip
    }
  }

  const files = [];
  for (const d of existing) {
    await walk(d, files);
  }
  const offenders = await scanFiles(files);
  if (offenders.length > 0) {
    console.error(`[fail] Found disallowed pattern "${TARGET}" in files:`);
    offenders.forEach((f) => console.error(" -", path.relative(root, f)));
    process.exit(1);
  }
  console.log("[ok] No occurrences of disallowed pattern:", TARGET);
  console.log(JSON.stringify({ smoke: "ok", check: "auth-endpoints", time: new Date().toISOString() }));
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
