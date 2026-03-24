# POLICY-UI.md

Binding development and quality policy for frontend work (`src/`).

## 1. Scope

This policy applies to all changes in:

- `src/`
- `tests/e2e/`
- frontend build/tooling (`vite.config.ts`, `eslint.config.js`, `tsconfig.json`, `package.json`)

## 2. Technical Context (Current State)

- React 19 + TypeScript
- Vite 7 build chain
- MUI as UI layer
- API communication through fetch/axios helpers (`src/utils/apiUtils.ts`, `src/utils/axiosConfig.ts`)

## 3. OOP Rules (MUST)

1. UI components are primarily presentation and orchestration layers.
2. Business logic, validation, and transformations belong in reusable modules (service/domain layer), not directly in JSX.
3. New logic must be wrapped behind clear contracts (interfaces/types).
4. Dependencies must be explicit (injected or centrally resolved), never hidden across components.
5. New changes must not create additional god components; split large files into subcomponents/services.

## 4. DRY Rules (MUST)

1. No copy/paste validation logic across components.
2. No duplicated API request/auth header flows.
3. Centralize constants (routes, keys, limits, field names).
4. Reuse existing helpers before introducing new variants.

## 5. Documentation and Commenting (MUST)

1. Code must be documented where it carries non-trivial behavior.
2. New/changed logic must include concise, useful documentation comments when needed.
3. All code comments must be written in English.

## 6. Security-by-Design (MUST, current best practice)

1. Treat all browser input and all backend responses as untrusted data.
2. Validate, sanitize, and safely render user-controlled content (no unsafe HTML injection).
3. Do not introduce secret storage in frontend code (no credentials/tokens in source, bundles, or localStorage/sessionStorage unless explicitly approved).
4. Keep existing security flows intact:
   - cookie-based auth
   - CSRF token handling for mutating requests
   - no client-side bypasses for auth/session checks
5. Do not leak sensitive technical details in UI errors, logs, or debug output.
6. Prefer secure defaults and least privilege when adding feature flags, routes, or client capabilities.

## 7. Test Policy

### 7.1 Bug fixes

- Every bug fix requires at least one automated test in the same change set.
- Useful existing tests must not be removed; if replacement is required, coverage must be at least equivalent.

### 7.2 Current repository gap

- `npm test` is currently a placeholder and not a real unit-test runner.
- Therefore, AI agents must:
  - add/extend a unit-test mechanism for UI logic fixes where appropriate
  - at minimum cover user-critical flows through Playwright smoke checks

## 8. Required Commands Before Completion

1. `npm run quality-check`
2. `npm run build`
3. `npm run smoke:auth`

Additionally for navigation/auth/session/config flows:

4. `npm run e2e:smoke`

If `e2e:smoke` cannot run (for example port conflict on `3000`/`3001` or missing MongoDB), this must be documented as a blocker.

## 9. Minimum Smoke Coverage

When Playwright smoke runs, it must validate at least:

1. login with valid credentials
2. critical routes are reachable (Authentication, Frontend, Connection, Security)
3. session cookies use expected prefix (`nauthilus_ui_*`)
4. no obvious runtime/console errors

## 10. UI Definition of Done

A UI change is done only when:

1. OOP and DRY rules are satisfied
2. bug fixes are covered by automated tests
3. required commands succeeded
4. smoke test executed or blocker documented
5. code documentation exists and comments are in English
6. security-by-design constraints are satisfied and no security control was weakened
