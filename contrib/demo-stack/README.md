# Demo Docker Stack

This stack runs a full demo environment for `nauthilus-ui` with:

- `nauthilus-ui` (`ghcr.io/croessner/nauthilus-ui:v2.1.0` by default)
- `mongodb` (UI data store)
- `nauthilus:v2.1.0` (CSV-backed test backend)
- `valkey`
- `clickhouse` (LTS server + schema init job)
- `tempo` (trace storage + OTLP ingest)
- `loki` (log storage)
- `grafana-alloy` (Docker log collector to Loki)
- `grafana` (pre-provisioned with Tempo + Loki datasources)
- `gitea` + automatic bootstrap
- `nauthilus-gitops-deployer` (Gitea webhook listener for tag-based runtime deploy)

The bootstrap job generates an SSH key at deployment time, stores it in a shared Docker volume, adds the key to Gitea user `gitadmin`, creates a demo repository, seeds `nauthilus.yml`, and configures a repository webhook for tag-triggered deployment.
The tracked seed file `contrib/demo-stack/nauthilus/nauthilus.yml` is copied once to local runtime file `contrib/demo-stack/nauthilus/nauthilus.runtime.yml` (git-ignored).

## Start

From repository root:

```bash
docker compose -f contrib/demo-stack/docker-compose.yml up -d
```

`nauthilus-ui` image tag is configurable via `NAUTHILUS_UI_IMAGE_TAG` (default: `v2.1.0`):

```bash
NAUTHILUS_UI_IMAGE_TAG=v2.1.0 docker compose -f contrib/demo-stack/docker-compose.yml up -d
```

Optional local build for `nauthilus-ui`:

```bash
docker compose -f contrib/demo-stack/docker-compose.yml build nauthilus-ui
docker compose -f contrib/demo-stack/docker-compose.yml up -d
```

Check bootstrap logs once:

```bash
docker compose -f contrib/demo-stack/docker-compose.yml logs gitea-bootstrap
```

## Access

- Nauthilus UI: http://localhost:3001
- Gitea Web: http://localhost:3003
- Nauthilus API: http://localhost:8080
- ClickHouse HTTP: http://localhost:8123
- Grafana: http://localhost:3004
- Tempo HTTP API: http://localhost:3200
- Loki HTTP API: http://localhost:3100
- Alloy UI: http://localhost:12345
- Gitea SSH: `localhost:2222`

## Demo Credentials

- UI login:
  - username: `admin`
  - password: `admin`
- Gitea login:
  - username: `gitadmin`
  - password: `gitadmin`
- Grafana login:
  - username: `admin`
  - password: `admin`
- Nauthilus CSV demo user:
  - username: `demo-user`
  - password: `demo-password`
- ClickHouse SQL user:
  - username: `nauthilus`
  - password: `nauthilus_clickhouse_password`

## UI Demo Flow

1. Login to UI at http://localhost:3001 with `admin`/`admin`.
2. Configure Runtime connection to Nauthilus:
   - backend URL: `http://nauthilus:8080`
   - backend auth: Basic
   - username: `demo-backchannel`
   - password: `demoBackchannelPass01`
3. Use Git integration in UI with SSH:
   - auth mode: `SSH` (not `HTTPS`)
   - repository URL: `ssh://git@gitea:22/gitadmin/nauthilus-config-demo.git`
   - branch: `main`
   - file path: `nauthilus.yml`

If you use `HTTPS` mode with an `ssh://...` URL, the API returns `400 Bad Request` with `Repository URL is invalid or unsupported`.

The UI config already maps the generated key for user `admin` in both:

- `integrations.git.ssh.users`
- `integrations.runtime.ssh.users`

## Tag-Based Runtime Deploy

The demo stack includes an internal webhook service (`nauthilus-gitops-deployer`) that listens for Gitea push events.

- Non-tag pushes (`refs/heads/...`) are ignored.
- Tag pushes (`refs/tags/...`) are processed only if the tag matches `^v[0-9]+\.[0-9]+\.[0-9]+$`.
- On accepted tag:
  - `nauthilus.yml` is fetched from that exact tag in `gitadmin/nauthilus-config-demo`
  - `contrib/demo-stack/nauthilus/nauthilus.runtime.yml` is replaced atomically
  - container `nauthilus-ui-demo-nauthilus` is restarted via Docker API

This keeps the repository seed file stable while allowing local runtime updates during demo usage.

Practical flow:

1. Push updated config from UI with a tag like `v1.0.0`.
2. Check deployer logs:

```bash
docker compose -f contrib/demo-stack/docker-compose.yml logs -f nauthilus-gitops-deployer
```

3. Verify Nauthilus restart:

```bash
docker compose -f contrib/demo-stack/docker-compose.yml ps nauthilus
```

Security notes:

- Webhook payloads are protected by HMAC (`X-Gitea-Signature`).
- Keep `DEPLOYER_WEBHOOK_SECRET` private and rotate it for non-demo setups.
- Configure protected tags in Gitea (e.g. `v*`) so only trusted users can deploy.
- Gitea must allow internal webhook destinations. This demo sets `GITEA__webhook__ALLOWED_HOST_LIST=private`.

## ClickHouse Demo Flow

The stack enables both Lua integrations in Nauthilus:

- post action: `server/lua-plugins.d/actions/clickhouse.lua` (write auth events)
- custom hook: `server/lua-plugins.d/hooks/clickhouse-query.lua` (query from UI/API)

1. Trigger a login event (example with CSV demo user):

```bash
curl -sS -u demo-backchannel:demoBackchannelPass01 \
  -H 'Content-Type: application/json' \
  -d '{"username":"demo-user","password":"demo-password","service":"demo","protocol":"http"}' \
  http://localhost:8080/api/v1/auth/json
```

Or use the provided helper scripts:

```bash
./contrib/demo-stack/scripts/auth-json-demo-user.sh
./contrib/demo-stack/scripts/auth-json-invalid-user.sh
```

2. Query recent rows via Nauthilus custom hook:

```bash
curl -sS -u demo-backchannel:demoBackchannelPass01 \
  "http://localhost:8080/api/v1/custom/clickhouse-query?action=recent&limit=20"
```

3. Optional direct ClickHouse check:

```bash
curl -sS "http://localhost:8123/?user=nauthilus&password=nauthilus_clickhouse_password&query=SELECT%20count()%20FROM%20nauthilus.logins"
```

## Tracing Demo Flow (Grafana + Tempo)

Nauthilus is preconfigured with:

- `server.insights.tracing.enabled: true`
- `server.insights.tracing.exporter: otlphttp`
- `server.insights.tracing.endpoint: tempo:4318`

1. Generate a few requests against Nauthilus (this creates spans):

```bash
./contrib/demo-stack/scripts/auth-json-demo-user.sh
./contrib/demo-stack/scripts/auth-json-invalid-user.sh
```

2. Open Grafana at http://localhost:3004 and login with `admin` / `admin`.

3. Open `Explore`, select datasource `Tempo`, and run a TraceQL query like:

```traceql
{ resource.service.name = "nauthilus-demo" }
```

If you deployed runtime config from Git repository, service name is:

```text
nauthilus-demo-from-git
```

## Logs Demo Flow (Grafana + Loki + Alloy)

Grafana Alloy is preconfigured to scrape Docker logs from these Compose services:

- `nauthilus`
- `nauthilus-ui`

and forwards them to Loki.

1. Trigger runtime activity to generate logs:

```bash
./contrib/demo-stack/scripts/auth-json-demo-user.sh
./contrib/demo-stack/scripts/auth-json-invalid-user.sh
```

2. Open Grafana at http://localhost:3004 and login with `admin` / `admin`.

3. Open `Explore`, select datasource `Loki`, and run one of these LogQL queries:

```logql
{service="nauthilus"}
```

```logql
{service="nauthilus-ui"}
```

Optional: check Alloy target/debug state at http://localhost:12345.

## Stop And Remove

```bash
docker compose -f contrib/demo-stack/docker-compose.yml down -v
```
