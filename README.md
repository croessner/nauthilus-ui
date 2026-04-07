# Nauthilus UI

Web-based configuration and operations UI for Nauthilus.

Nauthilus UI lets administrators manage Nauthilus profiles and related runtime settings through a browser instead of editing YAML by hand. The project consists of a React frontend and a Go server that provides the API, authentication, persistence, and production asset delivery.

## Table of Contents

- [User Documentation](#user-documentation)
  - [What This Project Is](#what-this-project-is)
  - [Core Capabilities](#core-capabilities)
  - [Architecture at a Glance](#architecture-at-a-glance)
  - [Quick Start with Docker Compose](#quick-start-with-docker-compose)
  - [Demo Stack](#demo-stack)
  - [Local Run Without Docker](#local-run-without-docker)
  - [Configuration](#configuration)
  - [Authentication and First Login](#authentication-and-first-login)
  - [Security Notes](#security-notes)
  - [Git Integration and Runtime SSH](#git-integration-and-runtime-ssh)
  - [Health Endpoints](#health-endpoints)
  - [Troubleshooting](#troubleshooting)
  - [Related Documentation](#related-documentation)
- [Developer Documentation](#developer-documentation)
  - [Tech Stack](#tech-stack)
  - [Repository Layout](#repository-layout)
  - [Local Development Workflow](#local-development-workflow)
  - [Scripts and Quality Gates](#scripts-and-quality-gates)
  - [Testing](#testing)
  - [Build and Packaging](#build-and-packaging)
  - [Implementation Notes](#implementation-notes)
- [License](#license)

## User Documentation

### What This Project Is

Nauthilus UI is a standalone administration interface for Nauthilus environments. It is designed for operators and administrators who want to:

- create and edit Nauthilus configuration safely in the browser
- store UI state and profile data persistently in MongoDB
- manage access to the UI itself with its own authentication layer
- import and export configuration files
- connect the UI to runtime and Git workflows

The UI does not require direct YAML editing during normal operation, but YAML remains the portable exchange format for export, import, and Git-based workflows.

### Core Capabilities

- Browser-based configuration management for Nauthilus profiles
- Secure login with server-side sessions and role-based user management
- YAML and JSON import, YAML export
- MongoDB-backed persistence
- Optional WebAuthn support
- Optional OIDC login
- Optional adaptive Google reCAPTCHA for sensitive authentication flows
- Git-based import and export workflows
- Runtime connection support, including optional SSH tunneling
- Health endpoints for service and database monitoring

### Architecture at a Glance

- Frontend: React application served in development by Vite on port `3000`
- Backend: Go server on port `3001`
- Database: MongoDB
- Production mode: the Go server serves the built frontend from `build/` and exposes the API on the same listener

In development, the frontend talks to the Go server through the Vite dev server. In production, the Go server is the single entry point for UI assets, API routes, and proxy-related functionality.

### Quick Start with Docker Compose

For most users, Docker Compose is the fastest path to a working setup.

1. Create a local runtime configuration:

```bash
cp config.yaml.example config.yaml
```

2. Adjust at least the MongoDB settings if needed.

3. Start the stack:

```bash
docker compose up --build -d
```

4. Open the UI:

```text
http://localhost:3001
```

The Compose stack starts:

- `nauthilus-ui` on port `3001`
- `mongo` as the persistent datastore

### Demo Stack

If you want to evaluate the product in a richer live environment, use the demo stack in `contrib/demo-stack/`.

It is intended for users who want to explore the UI together with supporting services such as Git, runtime integration, observability, and example data.

Start it with:

```bash
docker compose -f contrib/demo-stack/docker-compose.yml up -d
```

The demo stack uses the published UI image `ghcr.io/croessner/nauthilus-ui:v2.1.0` by default.

The demo stack includes:

- `nauthilus-ui`
- `mongodb`
- `nauthilus`
- `valkey`
- `clickhouse`
- `tempo`
- `loki`
- `grafana-alloy`
- `grafana`
- `gitea`
- `nauthilus-gitops-deployer`

Full instructions, access URLs, and demo credentials are documented in [`contrib/demo-stack/README.md`](contrib/demo-stack/README.md).

### Local Run Without Docker

Use this mode if you want to run the frontend and backend separately during development or local testing.

#### Prerequisites

- Go `1.26`
- Node.js with npm
- MongoDB

#### Start the frontend

```bash
npm run deps:install:ci
npm run dev
```

The Vite dev server listens on `http://localhost:3000`.

#### Start the backend

```bash
cd server
go run .
```

The Go server listens on `http://localhost:3001`.

### Configuration

Runtime configuration is loaded from `config.yaml`, with optional `NAUTHILUS_UI_*` environment overrides.

Config lookup order:

1. `--config <path>` or `-c <path>`
2. `NAUTHILUS_UI_CONFIG_FILE`
3. `./config.yaml`
4. `../config.yaml`
5. `/etc/nauthilus-ui/config.yaml`
6. `/etc/nauthilus/ui/config.yaml`

Important settings you will usually configure first:

- `database.mongodb.uri`
- `server.frontend.address`
- `server.frontend.port`
- `security.cors.allowed_origins`
- `server.trusted_proxies`
- `identity.oidc.*`
- `identity.webauthn.*`
- `security.recaptcha.*`
- `integrations.git.*`
- `integrations.runtime.ssh.*`

Example environment override:

```bash
export NAUTHILUS_UI_SERVER_FRONTEND_PORT=3001
```

Detailed configuration reference:

- [`docs/configuration.md`](docs/configuration.md)
- [`config.yaml.example`](config.yaml.example)

### Authentication and First Login

The UI has its own authentication system. It is separate from the Nauthilus authentication service you configure through the product.

Default bootstrap credentials:

- Username: `admin`
- Password: `admin`

Change the default password immediately after first login.

The server stores authentication state in secure, server-side sessions bound to cookies. Mutating cookie-authenticated requests are CSRF-protected.

### Security Notes

- The server is secure by default with explicit allowlists for browser origins and trusted reverse proxies.
- If `security.cors.allowed_origins` is empty, only local development origins on `localhost` and `127.0.0.1` for ports `3000` and `3001` are accepted.
- `Forwarded` and `X-Forwarded-*` headers are ignored unless the sender matches `server.trusted_proxies`.
- Adaptive reCAPTCHA is disabled by default and becomes active only when both `security.recaptcha.secret` and `security.recaptcha.site_key` are configured.
- WebAuthn RP ID and origins should be set explicitly for non-local deployments.
- Keep secrets out of Git. Use environment variables or your platform's secret management where possible.

### Git Integration and Runtime SSH

Git synchronization and runtime SSH tunneling are configured independently.

- Git import and export use `integrations.git`
- Runtime SSH tunneling uses `integrations.runtime.ssh`

Operational rules:

- SSH mappings are scoped per UI user
- `private_key_path` and `known_hosts_path` must be absolute paths
- host key verification is strict
- private keys on Unix-like systems must have restrictive permissions, for example `0600`
- passphrase caching for Git and Runtime can be configured independently
- saves with `connection.ssh_tunnel.enabled: true` are rejected if no matching runtime SSH mapping exists for the logged-in user

### Health Endpoints

The Go server exposes simple health endpoints:

- `GET /api/health`
- `GET /api/health/mongodb`

These are useful for load balancers, local smoke checks, and operational diagnostics.

### Troubleshooting

#### UI cannot reach the backend

Symptoms:

- `Failed to fetch`
- `404` or `500` on `/api/*`

Checks:

- confirm the Go server is running on `3001`
- confirm the frontend is running on `3000` in local dev
- confirm the Compose stack is up if you use Docker

#### CORS errors in the browser

Checks:

- add the browser origin to `security.cors.allowed_origins`
- verify that local development uses `localhost` or `127.0.0.1`
- if you run behind a reverse proxy, configure the final browser-facing origin explicitly

#### MongoDB connection failures

Checks:

- verify `database.mongodb.uri`
- confirm MongoDB is reachable from the Go server
- confirm the database user has the required permissions
- call `GET /api/health/mongodb` and inspect server logs

### Related Documentation

- Configuration guide: [`docs/configuration.md`](docs/configuration.md)
- Demo environment: [`contrib/demo-stack/README.md`](contrib/demo-stack/README.md)
- Example configuration: [`config.yaml.example`](config.yaml.example)

## Developer Documentation

### Tech Stack

- Frontend: React `19`, TypeScript, Vite, MUI
- Backend: Go `1.26`, Gin
- Database: MongoDB
- E2E and smoke tests: Playwright plus Node-based smoke scripts

### Repository Layout

```text
.
|-- src/                  React frontend
|-- server/               Go backend
|-- tests/                Playwright and unit-style tests
|-- scripts/              Smoke and maintenance scripts
|-- docs/                 Additional project documentation
|-- contrib/demo-stack/   Full demo environment
|-- config.yaml.example   Runtime configuration template
|-- docker-compose.yml    Local application stack
|-- Dockerfile            Multi-stage production image
```

### Local Development Workflow

1. Install frontend dependencies:

```bash
npm run deps:install:ci
```

2. Start the frontend:

```bash
npm run dev
```

3. Start the backend in another shell:

```bash
cd server
go run .
```

4. Open:

```text
Frontend: http://localhost:3000
Backend:  http://localhost:3001
```

Development behavior:

- Vite proxies API calls to the Go backend
- the Go backend enforces CORS allowlists even in development
- in production, the Go binary serves the frontend assets from `build/`

### Scripts and Quality Gates

Frontend and repository-level commands:

- `npm run dev` - start the Vite development server
- `npm run build` - create the production frontend in `build/`
- `npm run deps:install:ci` - reproducible dependency install from `package-lock.json`
- `npm run deps:update` - run sandboxed dependency update workflow
- `npm run deps:audit:gate:prod` - fail on new high/critical npm advisories in production dependencies
- `npm run deps:audit:gate:full` - fail on new high/critical npm advisories in full dependency tree
- `npm run quality-check` - run ESLint and TypeScript checks through the project quality script
- `npm test` - run the current unit-style frontend tests
- `npm run smoke:auth` - run authentication smoke checks
- `npm run e2e:smoke` - run the Playwright smoke suite
- `npm run e2e` - run the full Playwright suite
- `npm run config:parity` - verify configuration parity checks

Go and build-related commands:

- `cd server && go test ./...` - run backend tests
- `make build` - build the Go server binary into `bin/`
- `make lint` - run `golangci-lint` for Go code
- `make fmt` - format Go code
- `make test` - run verbose Go tests

### Testing

Recommended validation flow by change type:

- UI changes:
  - `npm run quality-check`
  - `npm run build`
  - `npm test`
  - `npm run smoke:auth`
- Backend changes:
  - `cd server && go test ./...`
- Auth, session, proxy, or navigation changes:
  - all relevant UI and backend checks
  - `npm run e2e:smoke` when the environment is available

Notes:

- Playwright smoke tests need free ports `3000` and `3001`
- local MongoDB or the Docker stack may be required depending on the scenario

### Build and Packaging

#### Frontend production build

```bash
npm run build
```

This writes static assets to `build/`.

#### Go binary build

```bash
make build
```

#### Docker image and local stack

```bash
docker compose up --build
```

The repository also includes `docker-bake.hcl` for Buildx-based multi-architecture image builds.

### Implementation Notes

- The frontend and backend are one product and should be documented and tested as such.
- `build/`, `node_modules/`, and `server/vendor/` are generated or external artifacts and should not be edited manually.
- Keep runtime configuration out of version control.
- If you change user-facing behavior, update this README and the deeper docs in `docs/` where appropriate.

## License

This project is released under the MIT License. See [`LICENSE`](LICENSE).
