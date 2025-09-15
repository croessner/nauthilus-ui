#!/usr/bin/env bash
set -euo pipefail

# Ensure output directory exists
mkdir -p quality

# Try to run ESLint if a local binary is available; otherwise, create an empty report.
# This avoids long npx network installs/timeouts in restricted environments.
if [ -x "node_modules/.bin/eslint" ]; then
  echo "Running ESLint (local binary)..."
  # Limit to project sources and common extensions to keep it quick
  # Preserve JSON output even if ESLint exits non-zero (e.g., parse/lint errors)
  node_modules/.bin/eslint \
    --no-error-on-unmatched-pattern \
    "src/**/*.{ts,tsx,js,jsx}" "server/**/*.js" \
    --format json > quality/eslint-report.json || true
else
  echo "ESLint not installed locally; skipping and writing empty report.\nInstall devDeps (eslint, @typescript-eslint/*, eslint-plugin-react, etc.) to enable full lint locally."
  echo "[]" > quality/eslint-report.json
fi

# Always run TypeScript type checks if available
if [ -x "node_modules/.bin/tsc" ]; then
  echo "Running TypeScript type check..."
  node_modules/.bin/tsc --noEmit --pretty false > quality/typescript-errors.txt || true
else
  echo "TypeScript compiler not found locally; attempting via npx (may require network)..."
  npx tsc --noEmit --pretty false > quality/typescript-errors.txt || true
fi

