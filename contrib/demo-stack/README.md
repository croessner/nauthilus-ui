# Demo Docker Stack

This stack runs a full demo environment for `nauthilus-ui` with:

- `nauthilus-ui` (this repository, built from local source)
- `mongodb` (UI data store)
- `nauthilus:v2.0.17` (CSV-backed test backend)
- `valkey`
- `clickhouse` (LTS server + schema init job)
- `gitea` + automatic bootstrap

The bootstrap job generates an SSH key at deployment time, stores it in a shared Docker volume, adds the key to Gitea user `gitadmin`, creates a demo repository, and seeds `nauthilus.yml`.

## Start

From repository root:

```bash
docker compose -f contrib/demo-stack/docker-compose.yml up --build -d
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
- Gitea SSH: `localhost:2222`

## Demo Credentials

- UI login:
  - username: `admin`
  - password: `admin`
- Gitea login:
  - username: `gitadmin`
  - password: `gitadmin`
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

## Stop And Remove

```bash
docker compose -f contrib/demo-stack/docker-compose.yml down -v
```
