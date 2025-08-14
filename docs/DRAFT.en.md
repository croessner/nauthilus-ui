# DRAFT: Partial Licensing (SaaS) with a dedicated License Server and Mollie Subscriptions

Status: 2025-08-14

Goal: Introduce licensing for specific feature areas only (Download button and Runtime area) using a separate license server that integrates with Mollie for subscriptions. Licenses are issued as JWTs, can be entered in the frontend, support renewals/refresh while a subscription is active, and include an administrative "General JWT" without an expiry.

Note on "valid information": All product- and API-related statements below reflect Mollie public documentation and common JWT standards as of today. Mollie docs: https://docs.mollie.com/


## 1) Overview & Architecture

- Components
  - License Server (a new, separate service; NOT the existing Go backend)
  - Mollie (Payments, Mandates, Subscriptions, Webhooks)
  - UI/Frontend (this repository)
  - Optional: the existing Go backend remains unchanged; the License Server is independent and exposes its own endpoints.

- High-level flow
  1. The customer starts a subscription (via checkout/onboarding flow). Recurring payments in Mollie require a mandate (e.g., SEPA) depending on the payment method.
  2. Mollie triggers webhooks to our License Server for payment events. The License Server validates the webhook by fetching the referenced resource via the Mollie API, checks the status, and updates the local subscription/license state.
  3. The License Server issues license JWTs (short-lived) and, if needed, refresh tokens.
  4. The frontend provides an input field for the license JWT and stores it locally (e.g., localStorage). The Download/Runtime sections are enabled only when a valid JWT with the proper entitlements is present.
  5. Periodically or at app start, the frontend requests renewal from the License Server (with a refresh token or existing JWT). The server checks the subscription status (from DB maintained by webhooks and/or via Mollie API) and issues a fresh license JWT if the subscription is active.
  6. An admin can manually issue a permanent "General JWT" and distribute it as needed.


## 2) Mollie – relevant facts (as of 2025)

- Basics
  - Mollie supports recurring payments via mandates. See: https://docs.mollie.com/payments/recurring
  - An initial payment flow creates/updates the mandate; afterwards, subscriptions can be created: https://docs.mollie.com/reference/v2/subscriptions-api/create-subscription

- Subscriptions
  - Documented subscription statuses include: `active`, `pending`, `canceled`, `suspended`, `completed`.
  - For each subscription period Mollie creates payments for which webhooks are sent.

- Payments & Webhooks
  - Mollie calls our webhook URL via POST and provides a resource ID (e.g., `id=tr_xxx` for payments) as `application/x-www-form-urlencoded` or JSON depending on headers/implementation. See: https://docs.mollie.com/overview/webhooks
  - Mollie does not include an HMAC signature header for webhooks. Validation is done by retrieving the referenced resource using our API key and verifying its status: https://docs.mollie.com/overview/webhooks#securing-your-webhook-endpoint
  - Relevant payment statuses: `paid`, `authorized` (rare, payment-method specific), `open`, `pending`, `failed`, `canceled`, `expired`, `refunded`, `charged_back`. For licensing, `paid` is typically decisive.

- Customer/subscription linkage
  - Use `metadata` on payments/subscriptions to store our internal user/license IDs. See: https://docs.mollie.com/overview/metadata


## 3) License Server – Design

- Requirements
  - Standalone service with a database (e.g., PostgreSQL or MongoDB). Store users, subscriptions, license states, optional token blacklist, cryptographic key management (signing keys), and audit logs.
  - Issue and verify JWTs (recommend RS256). Private keys remain on the License Server. Public keys are exposed as JWKS.
  - Endpoints for: onboarding/checkout (optional), webhook handler, token issuance/refresh, license validation, admin functions (e.g., issue General JWT), and JWKS.

- JWT format (license JWT)
  - Algorithm: RS256.
  - Claims (suggested):
    - `iss`: license server issuer URL (e.g., `https://license.example.com`)
    - `sub`: internal user ID
    - `lic`: object with license attributes, e.g., `{ download: true, runtime: true }`
    - `scope`: string or array (e.g., `download runtime`)
    - `exp`: expiration (short-lived, e.g., 7 days)
    - `iat`, `nbf`
    - `jti`: token ID
    - `plan`: plan/product identifier
    - `subscriptionId`: Mollie subscription ID (if applicable)
    - `entitlements`: optional list of granular rights
  - Signature: RS256 with current private key; include `kid` header for key rotation.

- General JWT (admin, "no expiration")
  - For security, permanent tokens should be explicitly marked and restricted. Options:
    1) Omit `exp` and include `perm: true` plus `role: admin`. Validators accept "permanent" only if both are present and the token comes from the admin endpoint.
    2) Alternatively, use a very long lifetime (e.g., 30 years). Since the requirement is "no expiration", option 1 is recommended.
  - Additional safeguards: only dedicated admins may request issuance; audit logging; manual revocation capability (blacklist by `jti`).

- JWKS (public keys)
  - Endpoint: `GET /.well-known/jwks.json` with all active public keys so clients/other services can verify tokens offline.

- Key rotation
  - Maintain at least two active key pairs in rotation.
  - Rotate every 3–6 months (example cadence).
  - Keep old keys in JWKS until all short-lived tokens have expired.

- Minimal data model
  - `users`: id, email, createdAt, status
  - `subscriptions`: id, userId, mollieCustomerId, mollieSubscriptionId, planId, status, currentPeriodEnd, createdAt, updatedAt
  - `licenses`: userId, entitlements (download/runtime), lastIssuedAt, validUntil, source (subscription/admin)
  - `keys`: kid, publicKey, privateKey (secure storage), createdAt, active, rotatedAt
  - `token_blacklist` (optional for revocation): jti, reason, createdAt
  - `webhook_events`: rawPayloadHash, resourceId, type, processedAt, result


## 4) License Server – Endpoints (API)

- Public endpoints
  - `GET /.well-known/jwks.json`: JWKS with active public keys.
  - `POST /api/license/validate` (optional): server-side JWT validation; respond with valid/invalid and claims (for support/debug).

- License flow endpoints
  - `POST /api/auth/token` – issue a license JWT based on a valid refresh token or admin credentials.
    - Request: `{ refresh_token?: string }` or admin auth (see admin endpoints).
    - Response: `{ access_token: <JWT>, expires_in: <sec>, refresh_token?: <token> }`.
  - `POST /api/auth/refresh` – renew via refresh token.
  - `POST /api/license/redeem` – optional: redeem a code/link from checkout, linking user ↔ subscription.

- Mollie webhook endpoint
  - `POST /api/webhooks/mollie`
    - Expect an ID (e.g., payment ID). The server fetches the payment/subscription from Mollie API and validates status/metadata.
    - Update DB: subscription status, next period, entitlements.
    - Idempotent (safe to call multiple times without duplicate effects).

- Admin endpoints (secured, e.g., via mTLS or OIDC admin login)
  - `POST /api/admin/license/general` – issue a permanent General JWT for a defined scope/user/group.
  - `POST /api/admin/keys/rotate` – trigger key rotation.
  - `POST /api/admin/token/revoke` – add a `jti` to blacklist.


## 5) Mollie integration – implementation steps

1) Account/PSP preparation
   - Maintain Mollie account and live/test API keys. Store API keys securely (e.g., in a secret manager). See: https://docs.mollie.com/overview/authentication

2) Customer and mandate creation
   - Create a customer: https://docs.mollie.com/reference/v2/customers-api/create-customer
   - Start an initial payment flow to create a mandate (depending on payment method). Use `sequenceType` = `first`: https://docs.mollie.com/reference/v2/payments-api/create-payment
   - Set `metadata`: internal userId, planId.

3) Create subscription
   - After successful first payment/mandate, create a subscription: https://docs.mollie.com/reference/v2/subscriptions-api/create-subscription
   - Also include `metadata` (userId, planId). Define `amount`, `interval`, `startDate`, etc.

4) Implement webhook
   - Register `POST /api/webhooks/mollie` (configure URL in Mollie dashboard or per payment/subscription).
   - On webhook: read `id`; fetch payment/subscription using Mollie API and our API key; verify status. Examples:
     - Get payment: https://docs.mollie.com/reference/v2/payments-api/get-payment
     - Get subscription: https://docs.mollie.com/reference/v2/subscriptions-api/get-subscription
   - Update DB based on `status`: on `paid` extend the period / confirm subscription `active`; on `canceled`/`suspended` revoke accordingly.
   - Ensure idempotency (unique constraint per event ID or hash).

5) Derive entitlements
   - Derive entitlements (download/runtime) from plan/assignment and persist for the user.


## 6) Token strategy (access + refresh)

- Access token (license JWT)
  - Short-lived (e.g., 7 days) to simplify key rotation and revocation.
  - Stored in the frontend (localStorage). Include as `Authorization: Bearer` for any backend calls that enforce licensing, or use it locally to gate UI features.

- Refresh token
  - Longer-lived (e.g., 90 days, rotating). Store hashed server-side. Bind to user and client.
  - `/api/auth/refresh` issues a new access token if the subscription is active.

- Grace period
  - Optional 3–7 days of leniency for billing issues (e.g., `pending`). This is a business policy choice; implement via claim/server logic.

- Revocation
  - Use a blacklist by `jti` or rotate the signing key (global). For targeted revocation, prefer a blacklist.


## 7) Frontend integration (this repo)

- UX
  - "Enter license" dialog/page: input for JWT, validate syntax/expiry, show entitlements/status.
  - Only render/enable buttons/runtime when a valid license with required rights is present.

- Storage
  - Persist in `localStorage` (key: `license.jwt`) or IndexedDB. Prefer storing only the JWT. Storing refresh tokens in the client is a convenience trade-off.

- Validation
  - Client-side: decode JWT (no secret), check `exp`, `iss`, `kid` and `aud` (if used). Optionally, verify signature using JWKS from the License Server (bundle-size trade-off); otherwise, rely on a server validation where applicable.
  - Server-side: do not trust the client; enforce decisions server-side for protected operations (e.g., serving downloads).

- Refresh flow in the frontend
  - At app start and proactively before `exp`, call `/api/auth/refresh`.
  - On failure: mark license as expired and inform the user.


## 8) Security & compliance

- Transport: HTTPS only. Enable HSTS.
- Secrets: keep API/private keys in a secret manager. Never commit secrets to repos.
- Time: ensure NTP/time sync (for `exp`/`nbf`).
- Rate limiting/brute-force protection for auth/refresh.
- Audit logs: admin actions, token issuance, webhook events.
- Data protection (EU/GDPR): minimize personal data in `metadata`, have a DPA with Mollie, retention policies.
- Backup/restore of DB and keys. Incident plan for key compromise (rotation, revocation, forced refresh).


## 9) Step-by-step implementation

1) Infrastructure & basics
   - Create a separate repository for the License Server.
   - Set up CI/CD, secret storage, and the database.

2) Key management
   - Generate RS256 key pairs and store them securely. Implement JWKS endpoint.

3) DB schema & models
   - Create tables/collections: users, subscriptions, licenses, keys, webhook_events, token_blacklist.

4) Mollie client
   - HTTP client with retry/timeout. API key from secrets. Implement calls for payments/subscriptions.

5) Webhook endpoint
   - Implement `POST /api/webhooks/mollie`. Validate by fetching payment/subscription, check status, update DB, idempotent.

6) Token endpoints
   - Implement `POST /api/auth/token` and `/api/auth/refresh`. Issue access token (JWT, 7 days) and refresh token (90 days, rotating).

7) Admin endpoints
   - `POST /api/admin/license/general`: issue General JWT with `perm: true`, `role: admin`, without `exp`.
   - `POST /api/admin/token/revoke`, `POST /api/admin/keys/rotate`.

8) Frontend changes (this repo)
   - License entry UI, local storage, entitlement display.
   - UI gates for Download/Runtime.
   - Optional: client-side JWKS verification or server-side enforcement.
   - Refresh timer/hook.

9) Tests
   - Unit tests for JWT, webhook parser, status transitions.
   - Integration tests with Mollie Sandbox (test keys) and simulated webhooks.
   - E2E: checkout → webhook → active license → refresh.

10) Monitoring & operations
   - Metrics (webhook latency, token issuance), logs, alerts (failed webhooks, key expiry).


## 10) Policy decisions

- Entitlements
  - Plan → `download` and/or `runtime`. Configure mapping on the server.

- Grace period
  - Recommend 3 days.

- Token lifetimes
  - Access: 7 days; Refresh: 90 days; Admin General: permanent (`perm: true`, no `exp`).

- Revocation
  - Blacklist by `jti`. Provide admin UI for revocation.


## 11) Example: JWT header & payload

Header:
```
{
  "alg": "RS256",
  "kid": "2025-06-k1",
  "typ": "JWT"
}
```

Payload (regular license):
```
{
  "iss": "https://license.example.com",
  "sub": "user_123",
  "lic": { "download": true, "runtime": true },
  "scope": "download runtime",
  "plan": "pro-monthly",
  "subscriptionId": "sub_ABC123",
  "iat": 1755177600,
  "nbf": 1755177600,
  "exp": 1755782400,
  "jti": "a2f3e..."
}
```

Payload (Admin General JWT):
```
{
  "iss": "https://license.example.com",
  "sub": "admin",
  "role": "admin",
  "perm": true,
  "lic": { "download": true, "runtime": true },
  "scope": "*",
  "iat": 1755177600,
  "nbf": 1755177600,
  "jti": "adm-..."
}
```


## 12) Acceptance checklist

- [ ] Mollie Sandbox flow: Customer → Payment (paid) → Subscription (active)
- [ ] Webhook processes payment events idempotently
- [ ] License state derived correctly in DB
- [ ] JWT issuance correctly signed (RS256), JWKS reachable
- [ ] Frontend can enter JWT, stores it, gates Download/Runtime to valid licenses
- [ ] Refresh works while subscription is active
- [ ] General JWT can be issued and accepted, revocation possible
- [ ] Key rotation without downtime
- [ ] Monitoring/alerts in place


## 13) References (Mollie)

- Authentication: https://docs.mollie.com/overview/authentication
- Webhooks: https://docs.mollie.com/overview/webhooks
- Metadata: https://docs.mollie.com/overview/metadata
- Customers API: https://docs.mollie.com/reference/v2/customers-api/create-customer
- Payments API: https://docs.mollie.com/reference/v2/payments-api/create-payment
- Get Payment: https://docs.mollie.com/reference/v2/payments-api/get-payment
- Subscriptions API: https://docs.mollie.com/reference/v2/subscriptions-api/create-subscription
- Get Subscription: https://docs.mollie.com/reference/v2/subscriptions-api/get-subscription


## 14) Notes on implementation language

- The License Server can be implemented in any language (Node.js, Go, etc.). Because it is independent from the existing Go backend, use a separate codebase.

End of draft.
