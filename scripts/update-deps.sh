#!/usr/bin/env bash
set -euo pipefail

# Detect package manager
PM=""
if command -v pnpm >/dev/null 2>&1; then
  PM=pnpm
elif command -v npm >/dev/null 2>&1; then
  PM=npm
else
  echo "Neither pnpm nor npm found." >&2
  exit 1
fi

run() { echo "+ $*"; eval "$*"; }

# Ensure we run from repo root (contains package.json)
if [ ! -f package.json ]; then
  echo "Run this script from the project root containing package.json" >&2
  exit 1
fi

echo "== Dependency health check =="
if [ "$PM" = "pnpm" ]; then
  run "pnpm outdated || true"
  run "pnpm dlx npm-check-updates --deprecated || true"
  run "pnpm audit || true"
else
  run "npm outdated || true"
  run "npx npm-check-updates --deprecated || true"
  run "npm audit || true"
fi

# Optional: check for unused deps (comment out if too noisy)
if command -v npx >/dev/null 2>&1; then
  echo "== depcheck (unused deps) =="
  run "npx depcheck || true"
fi

echo "== Upgrade minor/patch =="
if [ "$PM" = "pnpm" ]; then
  run "pnpm dlx npm-check-updates --target minor -u"
  run "pnpm i"
else
  run "npx npm-check-updates --target minor -u"
  run "npm i"
fi

# Vite build to validate
if [ "$PM" = "pnpm" ]; then
  run "pnpm run build"
else
  run "npm run build"
fi

echo "== Optional: interactive major upgrades =="
printf "Press ENTER to skip, or type 'y' to continue with interactive majors: "
read -r ANSWER || true
if [ "${ANSWER:-}" = "y" ]; then
  if [ "$PM" = "pnpm" ]; then
    run "pnpm dlx npm-check-updates --interactive"
    run "pnpm i"
  else
    run "npx npm-check-updates --interactive"
    run "npm i"
  fi
  if [ "$PM" = "pnpm" ]; then
    run "pnpm run build"
  else
    run "npm run build"
  fi
fi

echo "== Done. Review warnings (peer deps, deprecations) and run tests. =="
