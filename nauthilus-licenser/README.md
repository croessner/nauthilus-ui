# nauthilus-licenser

Standalone licensing server in Go with MongoDB and Mollie integration.

Features
- RS256-signed JWT license tokens with JWKS endpoint for verification
- Admin endpoint to issue General-JWT (permanent, perm:true, role:admin)
- Access/Refresh token flow (7d/90d default)
- Mollie webhook handler validating resource via Mollie API and updating license state
- MongoDB repositories for users, subscriptions, licenses, keys, refresh tokens, blacklist, webhook events
- Clean architecture with interfaces and services

Quick start
- Requirements: Go 1.22+, MongoDB, Mollie API key (test or live)
- Env vars:
  - LICENSE_ADDR (:8080)
  - MONGODB_URI (mongodb://localhost:27017)
  - MONGODB_DB (nauthilus_licenser)
  - MOLLIE_API_KEY (set!)
  - LICENSE_ISSUER (public base URL)
  - ADMIN_API_KEY (for admin endpoint)

Run
  go run ./nauthilus-licenser/cmd/server

Endpoints
- GET /.well-known/jwks.json
- POST /api/license/validate
- POST /api/auth/token { userId | refresh_token }
- POST /api/auth/refresh { refresh_token }
- POST /api/admin/license/general (header X-Admin-Key)
- POST /api/webhooks/mollie (id in form or JSON)

JWT claims (access)
- iss, sub, iat, nbf, exp
- lic: { download: bool, runtime: bool }
- scope: "download runtime" (optional)
- plan, subscriptionId (optional)
- jti

General-JWT
- perm:true, role:admin, no exp

Testing
  go test ./...

Notes
- Webhooks are idempotent by storing processed id in webhook_events.
- Key rotation supported by storing multiple active keys; JWKS contains all actives with kid.
- Entitlements mapping from plan should be configured (left as TODO for business mapping).

See docs/ for detailed architecture and API.
