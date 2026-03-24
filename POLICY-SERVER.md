# POLICY-SERVER.md

Binding development and quality policy for Go server work (`server/`).

## 1. Scope

This policy applies to all changes in:

- `server/` (excluding `server/vendor/`)
- server-related build/run config (`Makefile`, `Dockerfile`, `docker-compose.yml`)

## 2. Technical Context (Current State)

- Go 1.26
- Gin HTTP framework
- MongoDB persistence
- Two server listeners in one binary:
  - frontend/API server (`FRONTEND_PORT`, default `3001`)
  - proxy server (`PROXY_PORT`, default `3002`)

## 3. OOP Rules (MUST)

1. Keep clear separation between handlers, business logic, and data access.
2. Inject dependencies via interfaces and constructors (`New...Handler(...)` pattern).
3. Do not place core business logic inside route wiring/middleware setup.
4. New components must have a single clear responsibility (SRP).
5. Public functions/types must have clear and maintainable API boundaries.

## 4. DRY Rules (MUST)

1. No duplicated auth/authorization logic across handlers.
2. Centralize recurring request/response/redaction patterns.
3. Do not reimplement validation rules in slightly different forms.
4. Reuse existing middleware/helpers for security invariants (CORS, CSRF, session, origin checks).

## 5. Security Invariants (MUST NOT be broken)

1. Cookie-based session authentication remains the standard.
2. Mutating cookie-based requests remain CSRF-protected.
3. Proxy access remains protected against SSRF and disallowed legacy auth query params.
4. Header/cookie names and security properties must not be changed silently.

## 6. Documentation and Commenting (MUST)

1. Code must be documented where behavior is non-trivial or security-relevant.
2. New or changed flows must include concise documentation comments where needed.
3. All code comments must be written in English.

## 7. Security-by-Design (MUST, current best practice)

1. Design and implement new/changed endpoints as secure-by-default and deny-by-default.
2. Enforce least privilege for authorization, data access, and operational capabilities.
3. Validate and canonicalize all untrusted input (query/path/body/headers) before use.
4. Preserve and extend existing controls instead of bypassing them:
   - session authentication
   - CSRF checks
   - CORS/origin policy
   - SSRF protections in proxy flows
5. Never log or return secrets, tokens, password hashes, or sensitive internals.
6. Use approved cryptographic libraries only; no custom crypto primitives.
7. Add or update security-focused tests whenever fixing a security-sensitive bug.

## 8. Test Policy

### 8.1 Bug fixes

- Every server bug fix requires at least one unit/package test in the same change set.
- Useful existing tests must stay.
- Test removal is allowed only with equivalent replacement and explicit reasoning.

### 8.2 Required commands

1. `cd server && go test ./...`

For build/release-relevant changes:

2. `make build`

For auth/proxy-sensitive changes:

3. `npm run smoke:auth`
4. `npm run e2e:smoke` (if environment is available)

## 9. Smoke Checks (when possible)

Use at least one of:

1. Playwright smoke (`npm run e2e:smoke`)
2. Manual API smoke against local server:
   - `GET /api/health`
   - `GET /api/health/mongodb`
   - unauthenticated proxy call returns expected `401`/headers

If smoke checks cannot run, document blockers and exact follow-up steps.

## 10. Server Definition of Done

A server change is done only when:

1. OOP and DRY rules are satisfied
2. bug fixes are covered by automated tests
3. `go test ./...` succeeded
4. relevant smoke checks were executed or blocker documented
5. code documentation exists and comments are in English
6. security-by-design constraints are satisfied and no security invariant was weakened
