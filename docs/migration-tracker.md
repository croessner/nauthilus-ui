# Migration Tracker (Traceability)

Status: Active tracker; B0 governance baseline completed on 2026-03-17 (B1+ pending)
Source: `migration.md` (line references below)

## Tracking Rules
- Every task has a stable ID.
- Every task maps to at least one source line in `migration.md`.
- No silent assumptions: ambiguities are captured and resolved in the decision log.
- Implementation happens only per approved batch.

## Batch Execution Status

### B0 (Completed 2026-03-17)
- Scope (strict): `MIG-G-001`, `MIG-G-002`, `MIG-R-001`
- Delivery: Governance baseline, phase-gate register, parity test-strategy baseline, active risk register
- Out of scope: All non-B0 MIG IDs

#### B0 Evidence: Phase Gate Register (`MIG-G-001`)

| Phase | Gate status | Sign-off owner | Sign-off date | Notes |
| --- | --- | --- | --- | --- |
| B0 Baseline/Governance | Approved | Migration owner | 2026-03-17 | Tracker baseline established |
| Phase 1 (B1-B4) | Locked | Backend lead + Security | Pending | Requires explicit Phase 1 completion sign-off |
| Phase 2 (B5-B7) | Locked | Frontend/HTMX lead + Security | Pending | Starts only after Phase 1 gate approval |
| Phase 3/4 (B8-B9) | Locked | Frontend lead + QA | Pending | Starts only after Phase 2 gate approval |
| Phase 5 (B10-B11) | Locked | QA + Release owner | Pending | Starts only after Phase 3/4 gate approval |

Gate policy: A phase can start only when the previous phase gate is marked `Approved` with owner and date.

#### B0 Evidence: Core Capability Parity Baseline (`MIG-G-002`)

| Capability domain | Baseline status | Planned validation batches | Evidence target |
| --- | --- | --- | --- |
| Multi-profile management (create/switch/rename/delete) | Baseline captured | B8-B11 | Parity checklist + UAT evidence |
| Per-profile runtime connection config in MongoDB | Baseline captured | B1, B3, B11 | API/integration test results |
| UI authentication (opaque sessions + MFA) | Baseline captured | B8-B11 | Auth flow regression checklist |
| Configuration management pages | Baseline captured | B8-B11 | Page-level parity checks |
| Audit logging and user management | Baseline captured | B8-B11 | CRUD parity + role checks |
| Runtime tools/pages | Baseline captured | B8-B11 | Runtime flow parity checks |

Parity test strategy baseline (B0):
- Automated parity checks are introduced in implementation batches and collected for Phase 5 gate evidence.
- Manual end-to-end checklist and UAT sign-off are mandatory in B11 before final closeout.

#### B0 Evidence: Active Risk Register (`MIG-R-001`)

| Risk ID | Risk | Owner | Trigger | Mitigation | Status |
| --- | --- | --- | --- | --- | --- |
| R-001 | OIDC integration issues | Backend lead | Token exchange/validation failures in test env | Provider contract tests, staged rollout, fallback diagnostics | Open |
| R-002 | MongoDB performance with many profiles | Backend + DB owner | p95 latency above target under seeded load | Index review, query profiling, load tests in B10 | Open |
| R-003 | Complex page migration (Lua/Clickhouse) | Frontend lead | Feature parity drift in migrated pages | Wave-based migration + parity checklist by page cluster | Open |
| R-004 | CSP/CSRF vulnerabilities | Security lead | Failed security scans or blocked legit flows | Policy hardening, automated security tests, manual attack-path checks | Open |
| R-005 | Profile isolation bugs | Backend lead | Cross-user/profile data access in integration tests | Owner/admin authz tests + legacy data migration validation | Open |

Risk review cadence: update status at every batch close and at every phase gate sign-off.

## Requirement Backlog

### Global Scope and Constraints

#### MIG-G-001
- Source: `migration.md:5`, `migration.md:63`, `migration.md:67`, `migration.md:252`, `migration.md:453`, `migration.md:712`, `migration.md:819`
- Requirement: Execute migration in 5 sequential phases (OIDC backend support, HTMX foundation, page migration, frontend cleanup, testing/deployment).
- Target state: Work is delivered in phase order with explicit gates.
- Acceptance criteria: Phase boundaries and deliverables are tracked and signed off before next phase.
- Risk: Parallel, uncoordinated changes create regressions and lost traceability.
- Test case: Review tracker/history shows completed sign-off per phase before next phase starts.
- Batch: B0
- B0 status: Completed
- B0 evidence: `Batch Execution Status -> B0 Evidence: Phase Gate Register`

#### MIG-G-002
- Source: `migration.md:51-57`, `migration.md:923`
- Requirement: Preserve existing core product capabilities during migration:
  - Multi-profile management (create/switch/rename/delete)
  - Per-profile runtime connection config in MongoDB
  - UI authentication (opaque sessions + MFA)
  - Configuration management pages
  - Audit logging and user management
  - Runtime tools/pages
- Target state: Feature parity with React UI for preserved capabilities.
- Acceptance criteria: Functional checklist (Phase 5) passes for all preserved domains.
- Risk: Replatforming to HTMX may regress edge-case behavior.
- Test case: End-to-end manual and automated parity checks against existing behavior.
- Batch: B0, B8-B11
- B0 status: Baseline completed (capability matrix + parity test strategy baseline)
- B0 evidence: `Batch Execution Status -> B0 Evidence: Core Capability Parity Baseline`

#### MIG-G-003
- Source: `migration.md:44-49`, `migration.md:716-755`, `migration.md:921`
- Requirement: Remove React/MUI ecosystem and Ory Hydra references from final system.
- Target state: Zero React runtime/tooling references and no `ory_hydra_admin_url` usage.
- Acceptance criteria: Dependency graph and code search contain no React/MUI/Ory Hydra usage.
- Risk: Hidden transitive dependencies or dead code references remain.
- Test case: `npm ls`/lockfile review + `rg` scan for deprecated identifiers.
- Batch: B1, B9

### Phase 1: Backend OIDC Support

#### MIG-P1-001
- Source: `migration.md:71-135`, `migration.md:969-992`
- Requirement: Update runtime connection schema:
  - Replace `jwt_auth` with `oidc`
  - Keep `basic_auth`
  - Add OIDC fields (`discovery_url`, `client_id`, `client_secret`, `token_endpoint_auth_method`, `scopes`, `token`, `expires_at`)
  - Remove `refresh_token` concept for client credentials flow
- Cutover rule: `jwt_auth` is removed server-side in Phase 1; no compatibility mode. Existing runtime records with `jwt_auth` must be migrated/cleaned during B1.
- Target state: Runtime documents support Basic or OIDC per user+profile.
- Acceptance criteria: Runtime create/read/update only accepts Basic/OIDC schema; records containing `jwt_auth` are migrated or rejected with explicit error.
- Risk: Existing runtime docs break without migration strategy.
- Test case: Migration/cleanup tests for legacy runtime documents containing `jwt_auth`.
- Batch: B1

#### MIG-P1-002
- Source: `migration.md:129`
- Requirement: Exactly one of `basic_auth.enabled` or `oidc.enabled` is true per profile.
- Target state: Mutual exclusivity enforced in validation and persistence.
- Acceptance criteria: Invalid config with both enabled or both disabled is rejected (or normalized by policy).
- Risk: Ambiguous auth path in proxy.
- Test case: Unit tests for all auth-method combinations.
- Batch: B1

#### MIG-P1-003
- Source: `migration.md:130`, `migration.md:1002`
- Requirement: OIDC runtime connection data is stored per profile in MongoDB runtime collection, not server config.
- Target state: No global server-side OIDC connection config for backend proxy auth.
- Acceptance criteria: Config retrieval path resolves by `userId + profileName`.
- Risk: Data leakage across profiles.
- Test case: Two profiles with different OIDC settings produce isolated behavior.
- Batch: B1

#### MIG-P1-004
- Source: `migration.md:131`, `migration.md:1005`
- Requirement: Store token/secret data securely (encryption at rest recommended; security-first principle).
- Target state: Secrets are not exposed in API responses/logging; storage security policy defined.
- Acceptance criteria: Secret masking in responses and logs; encryption/storage handling documented and verified.
- Risk: Credential leakage through API or logs.
- Test case: Security tests verify redaction and storage controls.
- Batch: B2, B10

#### MIG-P1-005
- Source: `migration.md:133`, `migration.md:142-147`
- Requirement: Discover OIDC endpoints from `.well-known/openid-configuration` and cache relevant fields.
- Target state: Discovery and endpoint cache available for token/introspection/JWKS flows.
- Acceptance criteria: Discovery fetch succeeds, includes `introspection_endpoint`, and cached values are reused with refresh policy.
- Risk: Discovery endpoint outages increase request latency/failures.
- Test case: Unit/integration tests with mocked discovery + cache hit/miss behavior.
- Batch: B2

#### MIG-P1-006
- Source: `migration.md:134`, `migration.md:148-152`
- Requirement: Support client auth methods `client_secret_basic` and `client_secret_post` in Phase 1; `private_key_jwt` is deferred behind explicit key-management scope.
- Target state: Token fetch logic branches by configured method.
- Acceptance criteria: `client_secret_basic` and `client_secret_post` work in integration tests; `private_key_jwt` returns explicit "not enabled" error until key-management milestone.
- Risk: `private_key_jwt` requires key management not yet defined.
- Test case: Method-specific tests for request composition and provider compatibility.
- Batch: B2

#### MIG-P1-007
- Source: `migration.md:135`, `migration.md:193-211`
- Requirement: Support Nauthilus backchannel scopes, with recommended defaults (`nauthilus:admin`, `nauthilus:authenticate`).
- Target state: Scope configuration is persisted and applied to token requests.
- Acceptance criteria: Requested scopes appear in token request and resulting authorization behavior.
- Risk: Incorrect scope defaults can over-privilege or break calls.
- Test case: Integration tests with restricted-scope and admin-scope clients.
- Batch: B2

#### MIG-P1-008
- Source: `migration.md:137-171`
- Requirement: Add `server/auth/oidc_client.go` with key functions:
  - `FetchOIDCToken`
  - `ValidateJWTSignature`
  - `IntrospectToken`
- Target state: Dedicated OIDC client package with clear API.
- Acceptance criteria: Functions compile, are covered by tests, and are wired into runtime/proxy flow.
- Risk: Tight coupling to runtime API makes reuse hard.
- Test case: Unit tests per public function + integration path test.
- Batch: B2

#### MIG-P1-009
- Source: `migration.md:152-156`, `migration.md:170`
- Requirement: Validate access tokens before trust/persistence:
  - JWT tokens: validate signature via JWKS + claims (`iss`, `exp`, optional `aud`)
  - Opaque tokens: validate via introspection (`active=true`)
  - For Nauthilus: introspection is mandatory in both cases
- Target state: Unvalidated or non-introspected token is never persisted/used.
- Acceptance criteria: Invalid signature/claims, inactive introspection, or introspection failure are rejected with explicit errors.
- Risk: Accepting forged/expired JWTs or inactive opaque tokens.
- Test case: Negative tests for bad signature, wrong issuer, expired token, invalid audience, opaque inactive token, introspection failure.
- Batch: B2

#### MIG-P1-010
- Source: `migration.md:157-159`, `migration.md:168`
- Requirement: Persist validated access token and auto-renew before expiry via client credentials re-auth.
- Target state: Proxy always has valid bearer token without refresh token flow.
- Acceptance criteria: Expired/near-expiry token triggers re-auth; token is persisted only after successful required validation pipeline (including introspection).
- Risk: Token refresh race conditions under concurrent requests.
- Test case: Concurrency tests for parallel proxy requests near token expiry.
- Batch: B2, B3

#### MIG-P1-011
- Source: `migration.md:172-191`
- Requirement: Update proxy logic to support Basic or OIDC (JWT mode removed), attach correct auth headers, and forward to `backend_url`.
- Target state: Proxy auth dispatch works with runtime config and token lifecycle.
- Acceptance criteria: Requests succeed for both auth modes; OIDC refresh path works.
- Risk: Breaking existing Basic Auth behavior.
- Test case: Integration tests for Basic and OIDC request forwarding.
- Batch: B3

#### MIG-P1-012
- Source: `migration.md:212-223`
- Requirement: Extend runtime API with OIDC endpoints:
  - `POST /api/runtime/:userId/:profileName/oidc/token`
  - `GET /api/runtime/:userId/:profileName/oidc/status`
  - `POST /api/runtime/:userId/:profileName/oidc/introspect`
  - Modify existing runtime GET/POST to include OIDC config without exposing secrets
- Authorization rule: Endpoints require authenticated caller; caller may access own `:userId`, admins may access any user.
- Target state: API supports management and diagnostics for OIDC runtime auth.
- Acceptance criteria: Endpoint contract tests pass; secret fields are redacted where required; authz tests enforce owner-or-admin access.
- Risk: API leaks client secret/token.
- Test case: Endpoint tests for status/token/introspect, redaction behavior, and authorization behavior.
- Batch: B3

#### MIG-P1-013
- Source: `migration.md:225-233`
- Requirement: Remove Ory Hydra admin URL references from:
  - `src/types/config.ts`
  - `src/components/FrontendConfig.tsx`
  - `src/contexts/ConfigContext.tsx`
  - Related TS types/validation
- Target state: No `ory_hydra_admin_url` fields in frontend config model/UI.
- Acceptance criteria: Frontend compiles; forms and validation no longer reference Hydra field.
- Risk: Backend/frontend schema mismatch during transition.
- Test case: Frontend form save/load tests for FrontendConfig after field removal.
- Batch: B1

#### MIG-P1-014
- Source: `migration.md:235-248`
- Requirement: Phase 1 test scope:
  - Unit tests for OIDC client
  - Integration tests against real Nauthilus/provider
  - Manual profile/OIDC token/request flow
  - Backward compatibility test for Basic Auth
- Target state: Phase 1 deliverables validated with automated + manual evidence.
- Acceptance criteria: All phase deliverables marked complete with test results.
- Risk: Real-provider integration not reproducible in CI.
- Test case: CI unit suite + optional integration stage + manual checklist artifact.
- Batch: B4

#### MIG-P1-015
- Source: `migration.md:22-30`, `migration.md:38`, `migration.md:1001`, `src/contexts/ConfigContext.tsx:45-48`, `src/contexts/RuntimeContext.tsx:35-37`
- Requirement: Enforce true user/profile isolation for runtime/profile APIs:
  - eliminate fixed `default-user` identity coupling
  - bind `userId` to authenticated identity (`sub`) with admin override
  - keep migration path for existing `default-user` documents
- Target state: Runtime and profile data are isolated per real user + profile, consistent with architecture.
- Acceptance criteria: Authenticated non-admin user cannot read/write another user's runtime/profile; existing data can be migrated or mapped.
- Risk: Current fixed user ID behavior can cause cross-user data overlap.
- Test case: Integration tests for owner access, admin override, and legacy `default-user` migration mapping.
- Batch: B1, B3, B4

### Phase 2: HTMX Infrastructure

#### MIG-P2-001
- Source: `migration.md:256-290`, `migration.md:946-967`
- Requirement: Create server-side template structure:
  - layouts (`base`, `authenticated`, `public`)
  - components (`nav`, `profile-selector`, `form-field`, `notification`, `modal`)
  - pages (login/dashboard/config/runtime/user)
  - partials for HTMX fragments
- Target state: Consistent SSR template hierarchy under `server/templates`.
- Acceptance criteria: Template loader resolves all layout/component/page/partial paths.
- Risk: Inconsistent naming causes runtime render failures.
- Test case: Template parse/render smoke tests for each directory class.
- Batch: B5

#### MIG-P2-002
- Source: `migration.md:292-297`
- Requirement: Add template data helpers for `CSPNonce`, `CSRFToken`, `User`, `CurrentProfile`, `FlashMessages`.
- Target state: Standard render context available for all authenticated pages.
- Acceptance criteria: Rendered templates can access helpers without nil errors.
- Risk: Missing keys produce runtime template errors.
- Test case: Handler render tests assert helper fields exist in view-model.
- Batch: B5

#### MIG-P2-003
- Source: `migration.md:299-344`
- Requirement: Set up Tailwind + DaisyUI build in `server/styles`:
  - `tailwind.config.js` content paths and plugin
  - `input.css` with Tailwind directives
  - minimal `package.json` scripts (`build:css`, `watch:css`)
  - Makefile build integration (`build-css` before Go build)
- Target state: CSS pipeline builds `server/static/css/styles.css`.
- Acceptance criteria: `npm run build:css` and Makefile build succeed.
- Risk: Build duplication/conflict with root frontend toolchain during transition.
- Test case: CI step for CSS build + file existence assertions.
- Batch: B5

#### MIG-P2-004
- Source: `migration.md:346-359`
- Requirement: Organize static assets under `server/static`:
  - CSS output
  - HTMX library
  - delegated JS (`app.js`)
  - existing images
- Target state: Server serves all required static assets from one root.
- Acceptance criteria: HTTP static routes deliver CSS/JS/image assets.
- Risk: Asset path mismatches break UI interactions.
- Test case: Static file integration tests for expected URLs and cache headers.
- Batch: B5

#### MIG-P2-005
- Source: `migration.md:361-387`
- Requirement: Introduce HTMX handlers (`server/api/htmx_handlers.go`) that return partial HTML for `HX-Request=true` and full page otherwise.
- Target state: One handler supports both SSR full load and HTMX fragment updates.
- Acceptance criteria: Response template changes correctly based on HX header.
- Risk: Fragment/full-page mismatch leads to broken DOM swaps.
- Test case: Handler tests for HX and non-HX request paths.
- Batch: B6

#### MIG-P2-006
- Source: `migration.md:388-415`, `migration.md:924`
- Requirement: Add security middleware with CSP nonce generation/header and CSRF validation for mutating methods.
- Target state: All server-rendered pages and mutating endpoints enforce CSP + CSRF policy.
- Acceptance criteria: Security headers present and invalid CSRF tokens are rejected.
- Risk: False positives blocking legitimate requests or gaps allowing attacks.
- Test case: Security middleware unit/integration tests for nonce and token validation.
- Batch: B6

#### MIG-P2-007
- Source: `migration.md:417-441`
- Requirement: Implement delegated frontend event handlers in `server/static/js/app.js` for confirmation prompts and HTMX lifecycle hooks.
- Target state: Common interactive behaviors work without per-component JS bundles.
- Acceptance criteria: Confirm dialogs and loading lifecycle hooks run on HTMX actions.
- Risk: Event delegation selectors miss dynamically swapped nodes.
- Test case: Browser/manual tests for confirmation and before/after HTMX hooks.
- Batch: B6

#### MIG-P2-008
- Source: `migration.md:443-450`
- Requirement: Phase 2 deliverables complete (templates, CSS pipeline, handler pattern, security middleware, delegated events, static assets).
- Target state: HTMX server-side foundation ready before page migration.
- Acceptance criteria: Deliverable checklist is fully checked and evidenced.
- Risk: Entering Phase 3 without stable foundation amplifies rework.
- Test case: Foundation smoke suite across rendering, assets, security, HTMX.
- Batch: B7

### Phase 3: Page-by-Page Migration

#### MIG-P3-001
- Source: `migration.md:457-505`
- Requirement: Migrate pages in stated order:
  1. Legal
  2. Licenses
  3. Error pages
  4. Login
  5. MFA page
  6. User profile
  7. User management
  8. MFA settings
  9. Connection config
  10. Profile management
  11. Server config
  12. LDAP config
  13. Redis config
  14. Monitoring config
  15. Features config
  16. Backends config
  17. Auth config
  18. Brute force config
  19. Lua config
  20. Frontend config
  21. Config preview
  22. Config wizard
  23. Audit log
  24. Clickhouse runtime
  25. Distributed brute force tools
  26. Hook tester
  27. Main app layout
  28. Navigation
  29. Dashboard
- Dependency override: Build shell prerequisites (`Main app layout`, `Navigation`, `Profile selector`) at the beginning of Phase 3 execution, then continue with page waves.
- Target state: All pages served via HTMX/SSR in defined incremental sequence.
- Acceptance criteria: Page migration tracker shows ordered completion with regression checks.
- Risk: Reordering can block prerequisites (navigation/layout dependencies).
- Test case: Per-page completion checklist with dependency validation.
- Batch: B8-B9

#### MIG-P3-002
- Source: `migration.md:510-515`
- Requirement: For each page, perform React analysis:
  - map state to server-side data
  - map API calls to HTMX endpoints
  - convert validation from Yup to Go
  - map dynamic UI to HTMX swaps
- Target state: Migration design for each page exists before implementation.
- Acceptance criteria: Analysis artifact exists per page and is reviewed.
- Risk: Missing behavior parity due to skipped analysis.
- Test case: Review checklist confirms all four analysis dimensions per page.
- Batch: B8-B9

#### MIG-P3-003
- Source: `migration.md:516-553`
- Requirement: Build HTMX templates using DaisyUI and convert MUI controls to Daisy equivalents.
- Target state: UI components mapped to consistent HTMX + Daisy patterns.
- Acceptance criteria: Visual/function parity and successful HTMX action wiring.
- Risk: Style/interaction drift from previous UX.
- Test case: Visual regression comparisons and interaction smoke tests.
- Batch: B8-B9

#### MIG-P3-004
- Source: `migration.md:554-605`
- Requirement: Create Go handlers for each page mutation/render path (form binding, DB save, success/error partial responses).
- Target state: Server owns state/mutation flow for migrated pages.
- Acceptance criteria: Save/update flows return correct status and notification partials.
- Risk: Incomplete error handling on failed persistence.
- Test case: Handler tests for valid, invalid, and DB-failure paths.
- Batch: B8-B9

#### MIG-P3-005
- Source: `migration.md:607-643`
- Requirement: Move form validation to Go (`validator/v10`, conditional validation like `required_if`).
- Target state: Server-side validation fully replaces Yup/formik logic.
- Acceptance criteria: Validation errors are deterministic and rendered to UI partials.
- Risk: Validation rules diverge from previous frontend behavior.
- Test case: Validation rule equivalence tests for representative forms.
- Batch: B8-B9

#### MIG-P3-006
- Source: `migration.md:645-686`, `migration.md:51`, `migration.md:1001`
- Requirement: Implement profile selector as critical shared component with profile switching handler, session update, and runtime reload.
- Target state: Profile switch remains safe and immediate in HTMX UI.
- Acceptance criteria: Switching profile updates session and subsequent config/runtime context.
- Risk: Profile isolation bugs across user sessions.
- Test case: Integration tests for switching profiles and isolated runtime data.
- Batch: B8

#### MIG-P3-007
- Source: `migration.md:688-694`
- Requirement: Per-page testing includes visual parity, behavior checks, HTMX request/response validation, and validation error rendering.
- Target state: Each migrated page has explicit test evidence.
- Acceptance criteria: Page marked done only after all four test categories pass.
- Risk: Page appears functional but fails edge interactions.
- Test case: Standardized per-page QA checklist execution.
- Batch: B8-B9

#### MIG-P3-008
- Source: `migration.md:695-709`
- Requirement: Remove corresponding React component and route once HTMX page is verified.
- Target state: No dual implementation drift for completed pages.
- Acceptance criteria: Deleted React file/router references for each migrated page.
- Risk: Premature deletion can remove fallback before parity is achieved.
- Test case: Route map and file existence checks after each page cutover.
- Batch: B8-B9

### Phase 4: Frontend Cleanup

#### MIG-P4-001
- Source: `migration.md:716-745`
- Requirement: Remove React-related dependencies from root `package.json` and keep minimal Tailwind/DaisyUI tooling.
- Target state: Package manifests reflect non-React architecture.
- Acceptance criteria: No React/MUI/formik/yup/recharts deps remain.
- Risk: Hidden scripts still depend on removed packages.
- Test case: Install/build pipeline passes after dependency cleanup.
- Batch: B9

#### MIG-P4-002
- Source: `migration.md:747-755`
- Requirement: Remove legacy React source/config files (`src/`, `vite.config.ts`, `tsconfig.json`, `webpack.config.js`, `config-overrides.js`) when migration is complete.
- Target state: No obsolete frontend app scaffold remains.
- Acceptance criteria: Files removed and references cleaned from build/docs.
- Risk: Deleting too early breaks still-unmigrated pages.
- Test case: Pre-delete gate checks all pages migrated and routed via server templates.
- Batch: B9

#### MIG-P4-003
- Source: `migration.md:757-771`
- Requirement: Update Makefile to CSS build + Go build/run workflow.
- Target state: Single, simple build path for production artifact.
- Acceptance criteria: `make build` and `make run` work end-to-end.
- Risk: Divergence from CI or local workflows.
- Test case: CI/local build script verification.
- Batch: B9

#### MIG-P4-004
- Source: `migration.md:773-802`
- Requirement: Update Dockerfile to 3-stage build (CSS builder, Go builder, runtime), include static assets/templates.
- Target state: Docker image contains binary, static, templates with minimal runtime footprint.
- Acceptance criteria: Container starts and serves UI with CSS/templates present.
- Risk: Missing copied assets cause broken UI in container only.
- Test case: Container smoke test for login page + CSS/JS asset load.
- Batch: B9

#### MIG-P4-005
- Source: `migration.md:804-815`
- Requirement: Update docs (`README.md`) for new stack and setup; remove React references.
- Target state: Documentation reflects actual architecture and build steps.
- Acceptance criteria: New contributor can run project from README without React tooling.
- Risk: Outdated docs increase onboarding and ops mistakes.
- Test case: Fresh setup walkthrough using README only.
- Batch: B9

### Phase 5: Testing, Security, Performance, Accessibility, Deployment

#### MIG-P5-001
- Source: `migration.md:823-835`
- Requirement: Execute functional checklist:
  - login + MFA
  - profile management
  - connection config (Basic/OIDC)
  - OIDC token fetch/refresh
  - all config pages save/load/validate
  - config preview/export
  - user management CRUD
  - audit log
  - runtime pages
  - responsive behavior
- Target state: Full functional parity and operability.
- Acceptance criteria: All checklist items pass.
- Risk: Gaps discovered late near deployment.
- Test case: Signed manual QA runbook + automated coverage where available.
- Batch: B10

#### MIG-P5-002
- Source: `migration.md:837-846`
- Requirement: OWASP-focused security review for access control, crypto, injection, misconfiguration, auth, and integrity (CSRF).
- Target state: No critical/high unresolved findings for listed categories.
- Acceptance criteria: Security audit report with findings and dispositions.
- Risk: Release with exploitable security flaws.
- Test case: Structured security test matrix mapped to OWASP items.
- Batch: B10

#### MIG-P5-003
- Source: `migration.md:847-859`
- Requirement: Validate CSP policy and nonce behavior; no CSP violations in browser.
- Target state: Effective CSP without breaking required scripts/styles.
- Acceptance criteria: Required CSP headers present; no console CSP errors in test scenarios.
- Risk: Incomplete CSP allows XSS vectors.
- Test case: Browser security test run including inline nonce validation.
- Batch: B10

#### MIG-P5-004
- Source: `migration.md:860-863`
- Requirement: Enforce CSRF tokens for all POST/PUT/DELETE and validate server-side.
- Target state: Mutating requests without valid token are rejected.
- Acceptance criteria: CSRF bypass attempts fail.
- Risk: Cross-site request forgery on authenticated sessions.
- Test case: Automated tests for missing/invalid/valid token cases.
- Batch: B10

#### MIG-P5-005
- Source: `migration.md:864-872`, `migration.md:928`
- Requirement: Meet frontend performance targets:
  - Lighthouse > 90
  - FCP < 1.5s
  - TTI < 3s
  - CSS bundle < 50KB
  - JS bundle < 30KB
- Target state: HTMX UI meets or exceeds defined client performance budget.
- Acceptance criteria: Benchmarks meet thresholds in agreed environment.
- Risk: Thresholds vary strongly by environment and page selection.
- Test case: Documented benchmark runs with fixed environment/profile.
- Batch: B10

#### MIG-P5-006
- Source: `migration.md:873-877`
- Requirement: Meet backend performance targets:
  - template render < 50ms
  - DB queries < 100ms
  - load test at 100 concurrent users
- Target state: Backend performance sufficient for expected traffic.
- Acceptance criteria: Measured metrics meet targets in load-test environment.
- Risk: Performance regressions under production data volume.
- Test case: Load/perf test suite with reproducible data set.
- Batch: B10

#### MIG-P5-007
- Source: `migration.md:878-885`, `migration.md:927`
- Requirement: Accessibility compliance goals:
  - WCAG 2.1 AA
  - keyboard navigation
  - screen-reader compatibility
  - visible focus indicators
  - sufficient color contrast
- Target state: Accessible UI patterns across migrated pages.
- Acceptance criteria: Accessibility audit passes with no critical issues.
- Risk: Template changes introduce semantic/accessibility regressions.
- Test case: Automated a11y scans + manual keyboard/screen-reader checks.
- Batch: B10

#### MIG-P5-008
- Source: `migration.md:886-897`
- Requirement: Deployment process:
  - staging deploy + full test suite + UAT
  - production blue/green rollout
  - monitor errors/latency with rollback plan ready
- Target state: Controlled, reversible production deployment.
- Acceptance criteria: Staging sign-off completed before production cutover.
- Risk: Insufficient rollback readiness causes prolonged outage.
- Test case: Dry-run rollout + rollback drill in staging.
- Batch: B11

#### MIG-P5-009
- Source: `migration.md:898-904`
- Requirement: Final delivery gate:
  - all tests passing
  - security audit complete
  - performance benchmarks met
  - production deployed
  - monitoring active
- Target state: Migration is production-ready and observable.
- Acceptance criteria: Release checklist fully signed by owners.
- Risk: Premature "done" status without objective evidence.
- Test case: Release gate document with links to test/audit/deploy evidence.
- Batch: B11

### Risk and Success Traceability

#### MIG-R-001
- Source: `migration.md:907-916`
- Requirement: Maintain active mitigation tracking for risks:
  - OIDC integration issues
  - MongoDB performance with many profiles
  - complex page migration (Lua/Clickhouse)
  - CSP/CSRF vulnerabilities
  - profile isolation bugs
- Target state: Risks tracked with owner, trigger, mitigation status.
- Acceptance criteria: Risk register updated through all phases.
- Risk: Known risks become unmanaged debt.
- Test case: Phase review includes risk status and mitigation evidence.
- Batch: B0-B11
- B0 status: Completed (initial register established, cadence defined)
- B0 evidence: `Batch Execution Status -> B0 Evidence: Active Risk Register`

#### MIG-S-001
- Source: `migration.md:919-929`
- Requirement: Satisfy global success criteria:
  - zero React dependencies
  - OIDC client credentials support
  - all functionality preserved
  - CSP + CSRF in place
  - performance better than React baseline
  - security tests passing
  - WCAG 2.1 AA
  - Lighthouse > 90
- Target state: Explicit closeout against all success criteria.
- Acceptance criteria: Each success criterion maps to completed evidence.
- Risk: Completion claimed without measurable validation.
- Test case: Final scorecard mapping criteria -> artifact/evidence.
- Batch: B11

## Decision Log (Proposed For Approval)

### D-001 JWT Transition Handling
- Source question: `migration.md:562`, `migration.md:626`
- Decision: No compatibility mode for `jwt_auth` server-side. Hard cut in Phase 1 with explicit migration/cleanup of existing runtime records.
- Rationale: Server-side JWT auth for runtime backend connection is intentionally removed; keeping it alive would violate the target architecture.
- Tracker impact: `MIG-P1-001` updated with hard cutover rule.

### D-002 Secret Storage and Encryption Scope
- Source question: `migration.md:131`
- Decision: Mandatory in-scope controls are secret redaction, log sanitization, and transport security; at-rest encryption is mandatory at platform/storage layer. Application-level field encryption is deferred unless key-management scope is explicitly approved.
- Rationale: Key-management architecture is not yet defined; blocking migration on new crypto lifecycle would create high delivery risk.
- Tracker impact: `MIG-P1-004` remains in scope with policy documentation and verification requirements.

### D-003 `private_key_jwt` Scope
- Source question: `migration.md:151`
- Decision: Defer `private_key_jwt` to post-Phase-1 hardening with explicit key-management milestone; implement clear "not enabled" response meanwhile.
- Rationale: Secure key provisioning/rotation is not defined in current plan.
- Tracker impact: `MIG-P1-006` narrowed for Phase 1.

### D-004 Introspection Fallback Policy
- Source question: `migration.md:159`
- Decision: Introspection is mandatory for Nauthilus tokens; opaque tokens are supported via introspection, JWT tokens additionally require signature/claims validation.
- Rationale: Access tokens may be opaque; introspection is required to validate token activity and prevent unsafe assumptions.
- Tracker impact: `MIG-P1-005`, `MIG-P1-009`, and `MIG-P1-010` tightened accordingly.

### D-005 OIDC Runtime Endpoint Authorization
- Source question: `migration.md:217-223`
- Decision: Owner-or-admin model: authenticated users can manage only their own `userId`; admins can manage any user.
- Rationale: Aligns with multi-profile, per-user runtime architecture and least-privilege.
- Tracker impact: `MIG-P1-012` updated with authz acceptance/tests.

### D-006 Redaction Contract
- Source question: `migration.md:222`
- Decision: API responses never expose raw `client_secret`, access token, private keys, or derived bearer material. Return booleans/metadata (`has_client_secret`, `token_expires_at`) instead of secret values.
- Rationale: Prevent accidental leakage while preserving operability.
- Tracker impact: `MIG-P1-012` and `MIG-P1-004` acceptance criteria.

### D-007 Phase 3 Dependency Ordering
- Source question: `migration.md:457-505`
- Decision: Implement layout/navigation/profile selector shell at Phase 3 start, then continue page waves.
- Rationale: Many page migrations depend on shared shell/navigation behavior.
- Tracker impact: `MIG-P3-001` updated with dependency override.

### D-008 Performance Gate Definition
- Source question: `migration.md:867-876`
- Decision: Pass/fail is measured in staging on a fixed dataset and fixed runner profile:
  - dataset seed: >= 50 profiles, >= 100 users, >= 50k audit entries
  - frontend benchmark: median of 3 Lighthouse runs per target page
  - backend benchmark: p95 over 5-minute load run (100 concurrent users)
- Rationale: Removes environment ambiguity from thresholds.
- Tracker impact: apply in B10 acceptance evidence.

### D-009 Accessibility Audit Scope
- Source question: `migration.md:880`
- Decision: Mandatory scope includes all top-level routes, login/MFA flow, profile switcher, primary CRUD forms, and all modal/dialog interactions. Tooling: automated axe scan + manual keyboard walkthrough + screen-reader smoke test.
- Rationale: Captures both template-level and interaction-level accessibility risk.
- Tracker impact: apply in `MIG-P5-007` evidence definition.

### D-010 Deployment Runbook Source of Truth
- Source question: `migration.md:894`
- Decision: Add an in-repo deployment runbook (blue/green, switch criteria, rollback triggers, validation checks) as the authoritative reference before B11.
- Rationale: Current repo has no explicit blue/green runbook source.
- Tracker impact: apply in `MIG-P5-008`/`MIG-P5-009` closeout artifacts.

### D-011 User Identity Binding Gap (Newly Identified)
- Source question: discovered during tracker validation (`src/contexts/ConfigContext.tsx:45-48`, `src/contexts/RuntimeContext.tsx:35-37`)
- Decision: Remove fixed `default-user` behavior and bind runtime/profile ownership to authenticated identity with migration for legacy docs.
- Rationale: Fixed user ID conflicts with documented per-user isolation and creates cross-user overwrite risk.
- Tracker impact: new `MIG-P1-015`.

## Proposed Batch Sequence (Small, Reviewable)

1. B0: Baseline and governance setup (tracker approval, risk register, test strategy, explicit decision-log approval).
2. B1: Runtime model + API contract updates + Ory Hydra removal in current React code.
3. B2: OIDC client package (discovery, JWKS, token fetch, validation, introspection, secure storage policy).
4. B3: Proxy integration + runtime OIDC endpoints wiring and redaction behavior.
5. B4: Phase 1 test completion (unit/integration/manual, Basic Auth regression).
6. B5: HTMX foundation (templates, helpers, Tailwind/Daisy build, static assets).
7. B6: HTMX handlers + CSP/CSRF middleware + delegated JS.
8. B7: Phase 2 hardening/smoke tests and sign-off.
9. B8: Page migration wave 1, starting with shell prerequisites (`Main app layout`, `Navigation`, `Profile selector`) followed by pages 1-18.
10. B9: Page migration wave 2 (pages 19-29) + React cleanup + Docker/Makefile/docs.
11. B10: Full QA/security/performance/accessibility gates.
12. B11: Staging->production rollout and final success-criteria closeout.

## Approval Gate

No code implementation should start before:
- Tracker is approved.
- Decision-log items are approved or explicitly deferred with documented decision.
- First implementation batch is explicitly authorized.
