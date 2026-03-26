#!/usr/bin/env sh
set -eu

seed_file="/demo/nauthilus/nauthilus.yml"
runtime_file="/demo/nauthilus/nauthilus.runtime.yml"

if [ ! -s "${seed_file}" ]; then
  echo "[nauthilus-config-bootstrap] Missing seed config: ${seed_file}" >&2
  exit 1
fi

if [ -s "${runtime_file}" ]; then
  echo "[nauthilus-config-bootstrap] Runtime config already exists: ${runtime_file}"
  exit 0
fi

cp "${seed_file}" "${runtime_file}"
echo "[nauthilus-config-bootstrap] Created runtime config from seed: ${runtime_file}"
