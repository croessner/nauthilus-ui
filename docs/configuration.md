# Configure Nauthilus UI

This guide focuses on practical setup for operators and admins.

## Quick Start

1. Create your runtime config:

```bash
cp config.yaml.example config.yaml
```

2. Edit at least the MongoDB connection:

```yaml
database:
  mongodb:
    uri: mongodb://USER:PASSWORD@HOST:27017/nauthilus-ui?authSource=admin
```

3. Start the server (`go run .` in `server/`) or start the stack with Docker Compose.

## Where `config.yaml` Is Loaded From

The first existing file is used:

1. CLI flag `--config <path>` or `-c <path>`
2. Environment variable `NAUTHILUS_UI_CONFIG_FILE`
3. `./config.yaml`
4. `../config.yaml`
5. `/etc/nauthilus-ui/config.yaml`
6. `/etc/nauthilus/ui/config.yaml`

## Most Used Settings

- `database.mongodb.uri`: MongoDB connection string.
- `server.frontend.address` / `server.frontend.port`: API/frontend listener.
- `server.proxy.address` / `server.proxy.port`: Proxy listener.
- `server.proxy.public_port`: Port exposed to the browser (often `443` behind TLS reverse proxies).
- `security.cors.allowed_origins`: Explicit browser origin allowlist.
- `server.trusted_proxies`: Reverse-proxy IPs/CIDRs whose forwarded headers are trusted.
- `identity.oidc.*`: Optional OIDC login settings.
- `identity.webauthn.*`: WebAuthn RP ID/display name/origins.
- `security.recaptcha.*`: Optional adaptive reCAPTCHA settings.

## Optional Environment Overrides

If needed, individual keys can be overridden via environment variables:

- Prefix: `NAUTHILUS_UI_`
- Mapping: `.` becomes `_`

Examples:

- `server.proxy.public_port` -> `NAUTHILUS_UI_SERVER_PROXY_PUBLIC_PORT`
- `database.mongodb.uri` -> `NAUTHILUS_UI_DATABASE_MONGODB_URI`

For list values, use comma-separated strings:

```bash
export NAUTHILUS_UI_SECURITY_CORS_ALLOWED_ORIGINS="https://ui.example.com,https://admin.example.com"
```

## Docker Compose

Use a local config file mount and point the container to it:

```yaml
volumes:
  - ./config.yaml:/app/config.yaml:ro
environment:
  - NAUTHILUS_UI_CONFIG_FILE=/app/config.yaml
```

## If Startup Fails

Configuration is validated on startup. Common causes:

- invalid port range
- invalid URL/origin format
- `identity.oidc.enabled: true` without `identity.oidc.issuer` and `identity.oidc.client_id`
- only one of `security.recaptcha.secret` / `security.recaptcha.site_key` is set
- malformed regex in `audit.policy.force_path_regex`
