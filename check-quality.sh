#!/usr/bin/env bash
set -euo pipefail

# Ensure output directory exists
mkdir -p quality

# Make Node a bit more resilient in constrained environments
export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=2048"

# Run only local binaries from node_modules to avoid remote code execution.
if [ -x "node_modules/.bin/eslint" ]; then
  echo "Running ESLint (local binary)..."
  # Limit to project sources and common extensions to keep it quick
  # Preserve JSON output even if ESLint exits non-zero (e.g., parse/lint errors)
  node_modules/.bin/eslint \
    --no-error-on-unmatched-pattern \
    --config eslint.config.js \
    "src/**/*.{ts,tsx,js,jsx}" \
    --format json > quality/eslint-report.json || true
else
  echo "Local ESLint binary missing. Run 'npm run deps:install:ci' first." >&2
  echo "[]" > quality/eslint-report.json
fi

# Always run TypeScript type checks if available
if [ -x "node_modules/.bin/tsc" ]; then
  echo "Running TypeScript type check..."
  node_modules/.bin/tsc --noEmit --pretty false > quality/typescript-errors.txt || true
else
  echo "Local TypeScript compiler missing. Run 'npm run deps:install:ci' first." >&2
  : > quality/typescript-errors.txt
fi
