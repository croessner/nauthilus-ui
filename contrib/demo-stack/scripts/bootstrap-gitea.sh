#!/usr/bin/env bash
set -euo pipefail

APP_INI="/data/gitea/conf/app.ini"
SSH_DIR="/demo/ssh"
KEY_PATH="${SSH_DIR}/admin_id_ed25519"
PUB_KEY_PATH="${KEY_PATH}.pub"
KNOWN_HOSTS_PATH="${SSH_DIR}/gitea_known_hosts"
GITEA_API="http://gitea:3000/api/v1"
GITEA_USERNAME="gitadmin"
GITEA_PASSWORD="gitadmin"
REPO_OWNER="${GITEA_USERNAME}"
REPO_NAME="nauthilus-config-demo"

log() {
  printf '[demo-bootstrap] %s\n' "$*"
}

gitea_cli() {
  su-exec git gitea --config "${APP_INI}" "$@"
}

wait_for_gitea() {
  for _ in $(seq 1 120); do
    if [[ -f "${APP_INI}" ]] && curl -fsS "http://gitea:3000/api/healthz" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done

  log "Gitea did not become ready in time"
  exit 1
}

generate_ssh_material() {
  mkdir -p "${SSH_DIR}"
  chmod 700 "${SSH_DIR}"

  if [[ ! -s "${KEY_PATH}" ]]; then
    log "Generating SSH keypair for UI admin user"
    ssh-keygen -q -t ed25519 -N "" -C "admin@nauthilus-ui-demo" -f "${KEY_PATH}"
  fi

  chmod 600 "${KEY_PATH}"
  chmod 644 "${PUB_KEY_PATH}"

  log "Refreshing known_hosts for gitea:22"
  ssh-keyscan -p 22 gitea > "${KNOWN_HOSTS_PATH}.tmp" 2>/dev/null
  mv "${KNOWN_HOSTS_PATH}.tmp" "${KNOWN_HOSTS_PATH}"
  chmod 644 "${KNOWN_HOSTS_PATH}"
}

ensure_admin_user() {
  if gitea_cli admin user list 2>/dev/null | grep -E "(^|[[:space:]])${GITEA_USERNAME}([[:space:]]|$)" >/dev/null; then
    log "Gitea user ${GITEA_USERNAME} already exists"
    return 0
  fi

  log "Creating gitea user ${GITEA_USERNAME}"
  gitea_cli admin user create \
    --username "${GITEA_USERNAME}" \
    --password "${GITEA_PASSWORD}" \
    --email "${GITEA_USERNAME}@example.local" \
    --must-change-password=false >/dev/null
}

generate_admin_token() {
  gitea_cli admin user generate-access-token \
    --username "${GITEA_USERNAME}" \
    --token-name "demo-bootstrap-$(date +%s)" \
    --scopes "write:user,write:repository,read:repository" \
    --raw
}

ensure_repo() {
  local token="$1"

  if curl -fsS -H "Authorization: token ${token}" "${GITEA_API}/repos/${REPO_OWNER}/${REPO_NAME}" >/dev/null 2>&1; then
    log "Repository ${REPO_OWNER}/${REPO_NAME} already exists"
    return 0
  fi

  log "Creating repository ${REPO_OWNER}/${REPO_NAME}"
  curl -fsS -X POST \
    -H "Authorization: token ${token}" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"${REPO_NAME}\",\"private\":false,\"auto_init\":true}" \
    "${GITEA_API}/user/repos" >/dev/null
}

ensure_user_ssh_key() {
  local token="$1"
  local pub_key

  pub_key="$(cat "${PUB_KEY_PATH}")"

  if curl -fsS -H "Authorization: token ${token}" "${GITEA_API}/user/keys" | grep -F "${pub_key}" >/dev/null; then
    log "Generated SSH key is already registered in gitea"
    return 0
  fi

  log "Registering generated SSH key in gitea for ${GITEA_USERNAME}"
  curl -fsS -X POST \
    -H "Authorization: token ${token}" \
    -H "Content-Type: application/json" \
    -d "{\"title\":\"nauthilus-ui-admin-demo\",\"key\":\"${pub_key}\"}" \
    "${GITEA_API}/user/keys" >/dev/null
}

seed_repo_file() {
  local workdir
  workdir="$(mktemp -d)"

  export GIT_SSH_COMMAND="ssh -i ${KEY_PATH} -o StrictHostKeyChecking=yes -o UserKnownHostsFile=${KNOWN_HOSTS_PATH} -o IdentitiesOnly=yes"

  for _ in $(seq 1 30); do
    if git clone "ssh://git@gitea:22/${REPO_OWNER}/${REPO_NAME}.git" "${workdir}/repo" >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done

  if [[ ! -d "${workdir}/repo/.git" ]]; then
    rm -rf "${workdir}"
    log "Could not clone ${REPO_OWNER}/${REPO_NAME} via SSH"
    exit 1
  fi

  if [[ -f "${workdir}/repo/nauthilus.yml" ]]; then
    log "Repository already contains nauthilus.yml"
    rm -rf "${workdir}"
    return 0
  fi

  cp /demo/bootstrap/seed-nauthilus.yml "${workdir}/repo/nauthilus.yml"

  (
    cd "${workdir}/repo"
    git config user.name "Demo Bootstrap"
    git config user.email "demo-bootstrap@nauthilus.local"
    git add nauthilus.yml
    git commit -m "demo: add initial nauthilus.yml" >/dev/null
    git push origin HEAD:main >/dev/null
  )

  rm -rf "${workdir}"
  log "Seeded repository with nauthilus.yml"
}

main() {
  wait_for_gitea
  generate_ssh_material
  ensure_admin_user

  token="$(generate_admin_token)"
  ensure_repo "${token}"
  ensure_user_ssh_key "${token}"
  seed_repo_file

  log "Bootstrap completed"
}

main "$@"
