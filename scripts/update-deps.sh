#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

MODE="sandbox"
INTERACTIVE_MAJORS=0

usage() {
  cat <<'EOF'
Usage: bash scripts/update-deps.sh [--sandbox|--host] [--interactive-majors]

Options:
  --sandbox             Run updates in an ephemeral Docker container (default)
  --host                Run updates directly on the host
  --interactive-majors  Add an interactive major-upgrade step after minor/patch upgrades
  -h, --help            Show this help text
EOF
}

run() {
  echo "+ $*"
  "$@"
}

run_optional() {
  echo "+ $*"
  if ! "$@"; then
    echo "Command failed but is non-blocking in this step."
  fi
}

ensure_repo_root() {
  if [ ! -f "${REPO_ROOT}/package.json" ] || [ ! -f "${REPO_ROOT}/package-lock.json" ]; then
    echo "Expected package.json and package-lock.json in repo root: ${REPO_ROOT}" >&2
    exit 1
  fi
}

ensure_npm() {
  if ! command -v npm >/dev/null 2>&1; then
    echo "npm is required but not found in PATH." >&2
    exit 1
  fi
}

ensure_local_tool() {
  local tool_name="$1"
  if [ ! -x "${REPO_ROOT}/node_modules/.bin/${tool_name}" ]; then
    echo "Missing local tool '${tool_name}'. Install dependencies first via 'npm ci'." >&2
    exit 1
  fi
}

ensure_host_mode_allowed() {
  if [ "${NAUTHILUS_DEP_UPDATE_CONTEXT:-}" = "sandbox-container" ]; then
    return
  fi

  if [ "${NAUTHILUS_ALLOW_HOST_DEP_UPDATES:-}" != "1" ]; then
    echo "Host mode is disabled by policy." >&2
    echo "Use sandbox mode (default) or set NAUTHILUS_ALLOW_HOST_DEP_UPDATES=1 for an explicit one-off override." >&2
    exit 1
  fi
}

run_host_workflow() {
  cd "${REPO_ROOT}"
  ensure_npm
  ensure_host_mode_allowed

  echo "== Reproducible base install (npm ci, no lifecycle scripts) =="
  run npm ci --legacy-peer-deps --ignore-scripts --no-audit --no-fund

  ensure_local_tool "ncu"
  ensure_local_tool "depcheck"

  echo "== Dependency health check =="
  run_optional npm outdated
  run_optional node_modules/.bin/ncu --deprecated
  run_optional npm audit --audit-level=high
  run_optional npm audit --omit=dev --audit-level=high

  echo "== Depcheck (unused dependencies) =="
  run_optional node_modules/.bin/depcheck

  echo "== Upgrade minor/patch dependencies =="
  run node_modules/.bin/ncu --target minor -u
  run npm install --legacy-peer-deps --package-lock-only --ignore-scripts --no-audit --no-fund
  run npm ci --legacy-peer-deps --ignore-scripts --no-audit --no-fund

  echo "== Verify build and quality gates =="
  run npm run quality-check
  run npm run build

  if [ "${INTERACTIVE_MAJORS}" -eq 1 ]; then
    echo "== Interactive major upgrades =="
    run node_modules/.bin/ncu --interactive
    run npm install --legacy-peer-deps --package-lock-only --ignore-scripts --no-audit --no-fund
    run npm ci --legacy-peer-deps --ignore-scripts --no-audit --no-fund
    run npm run quality-check
    run npm run build
  fi

  echo "== Done =="
  echo "Review changes in package.json/package-lock.json and run smoke/e2e checks if needed."
}

run_sandbox_workflow() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker is required for sandbox mode. Use '--host' to run locally." >&2
    exit 1
  fi

  local tty_flags=()
  if [ -t 0 ] && [ -t 1 ]; then
    tty_flags=(-it)
  fi

  local nested_args=(--host)
  if [ "${INTERACTIVE_MAJORS}" -eq 1 ]; then
    nested_args+=(--interactive-majors)
  fi

  echo "== Running dependency update workflow in Docker sandbox =="
  run docker run --rm "${tty_flags[@]}" \
    --user "$(id -u):$(id -g)" \
    --env NAUTHILUS_DEP_UPDATE_CONTEXT=sandbox-container \
    --workdir /workspace \
    --volume "${REPO_ROOT}:/workspace" \
    --cap-drop ALL \
    --security-opt no-new-privileges \
    --tmpfs /tmp:rw,noexec,nosuid,size=256m \
    node:24-bookworm \
    bash scripts/update-deps.sh "${nested_args[@]}"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --sandbox)
      MODE="sandbox"
      ;;
    --host)
      MODE="host"
      ;;
    --interactive-majors)
      INTERACTIVE_MAJORS=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

ensure_repo_root

if [ "${MODE}" = "sandbox" ]; then
  run_sandbox_workflow
else
  run_host_workflow
fi
