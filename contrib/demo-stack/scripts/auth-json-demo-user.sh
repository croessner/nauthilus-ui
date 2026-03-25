#!/usr/bin/env bash
set -euo pipefail

NAUTHILUS_URL="${NAUTHILUS_URL:-http://localhost:8080}"
BACKCHANNEL_USER="${BACKCHANNEL_USER:-demo-backchannel}"
BACKCHANNEL_PASS="${BACKCHANNEL_PASS:-demoBackchannelPass01}"

curl -sS \
  -u "${BACKCHANNEL_USER}:${BACKCHANNEL_PASS}" \
  -H 'Content-Type: application/json' \
  -d '{"username":"demo-user","password":"demo-password","service":"demo","protocol":"http"}' \
  "${NAUTHILUS_URL%/}/api/v1/auth/json"

echo
