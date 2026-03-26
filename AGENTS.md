# AGENTS.md

Binding working instructions for AI agents in the `nauthilus-ui` repository.

## 1. Purpose

This document defines how AI agents must work in this project. It is the central governance for:

- project understanding (UI + server)
- build chain
- testing strategy
- engineering principles (strict OOP + DRY)
- current best-practice security-by-design

Additional mandatory policies:

- `POLICY-UI.md` for frontend/UI changes
- `POLICY-SERVER.md` for Go server changes

For full-stack changes, both policies apply.

## 2. Project Composition (Current State)

- Frontend: React 19 + TypeScript + Vite + MUI (`src/`)
- Backend: Go 1.26 + Gin (`server/`)
- Database: MongoDB
- Runtime:
  - Vite dev server on `3000`
  - Go frontend/API/proxy server on `3001`
- Production artifact:
  - `npm run build` creates `build/`
  - Go server serves static assets from `build/`

## 3. Build Chain

Local development:

1. `npm install`
2. `npm run dev` (UI)
3. `cd server && go run .` (API + proxy)

Container/deployment:

- Multi-stage `Dockerfile`:
  - stage 1: React build
  - stage 2: Go build
  - stage 3: Alpine runtime with Chromium
- `docker-compose.yml` starts `api` + `mongo`

## 4. Testing Landscape (Current State)

- Go unit tests exist (`server/**/*_test.go`)
- Confirmed runnable: `cd server && go test ./...`
- Frontend unit runner is currently **not** configured (`npm test` is a placeholder)
- Repo smoke check exists: `npm run smoke:auth`
- E2E smoke exists: `npm run e2e:smoke` (Playwright)
  - prerequisite: free ports `3000` and `3001`
  - Playwright is configured with `reuseExistingServer: false`
- Demo integration stack is available in `contrib/demo-stack`
  - start with: `docker compose -f contrib/demo-stack/docker-compose.yml up --build -d`
  - includes: `nauthilus-ui`, `mongodb`, `nauthilus:v2.0.17`, `valkey`, `gitea` (with automatic SSH key/bootstrap)
  - use for manual end-to-end checks of UI login, Runtime connection setup, and Git SSH integration

## 5. Mandatory Rules for All AI Agents

1. Do not change generated or external artifacts unless explicitly requested:
   - `node_modules/`, `build/`, `server/vendor/`
2. Develop in strict OOP style:
   - clear responsibilities per class/struct/module
   - constructor-based dependency injection
   - no new god objects or monolithic functions
3. DRY is mandatory:
   - no duplicated validation, mapping, or auth logic
   - extract reusable building blocks
4. Every bug fix requires automated tests:
   - unit test in the same change set is mandatory
   - keep useful existing tests
5. Run smoke tests whenever technically possible.
6. If a required test/smoke cannot run:
   - document the reason and blocker explicitly
   - provide exact follow-up commands
7. Code documentation is mandatory:
   - production code must be documented at module/type/function level where relevant
8. Code comments must always be written in English.
9. Security-by-design is mandatory and must follow current best practice:
   - secure by default and deny by default
   - least privilege for data, endpoints, and runtime permissions
   - validate and sanitize all untrusted input
   - never expose secrets, tokens, or sensitive internals in logs/responses
   - keep existing security controls intact (auth, CSRF, CORS, SSRF protections)

## 6. Minimum Gates by Change Type

- UI only:
  - `npm run quality-check`
  - `npm run build`
  - `npm run smoke:auth`
- Server only:
  - `cd server && go test ./...`
- Auth/session/proxy/navigation:
  - all UI and server gates
  - plus `npm run e2e:smoke` (if environment is available)

## 7. Definition of Done (DoD)

An AI change is done only when:

1. the relevant policy (`POLICY-UI.md` and/or `POLICY-SERVER.md`) is followed
2. OOP and DRY rules are clearly applied
3. bug-fix tests are present and useful
4. relevant smoke checks were executed or documented as blocked
5. required build/tests are green
6. code documentation is present and comments are in English
7. security-by-design constraints are applied and security controls remain intact
