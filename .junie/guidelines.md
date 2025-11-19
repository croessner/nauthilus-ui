Nauthilus UI – Development Guidelines

Audience: senior engineers contributing to this repository. This file captures project-specific build, configuration, testing, and debugging guidance that isn’t obvious from generic React/Go workflows.

1. Build and configuration

- Architecture
  - Frontend: React 19 + Vite 7 + TypeScript (strict), Material UI 7, Emotion.
  - Backend: Go server in ./server that serves the built UI, exposes REST API, and provides a proxy endpoint used by the UI during development and production.
  - Docker: Multi-stage build producing a minimal Alpine image with the Go server binary and the built UI in ./build.

- Local development (no Docker)
  - Install Node and Go:
    - Recommended: Node 20+ (Node 24 is used in Docker). npm 10+.
    - Go 1.25+ (Docker uses 1.25-alpine with vendored modules).
  - Install web dependencies:
    - npm install
  - Start the Vite dev server (port 3000 by default):
    - npm run dev
  - Start the Go API server in another terminal (defaults to 3001):
    - cd server && go run .
  - During dev, Vite proxies API and helper routes to the Go server; the target host/port is derived from FRONTEND_ADDRESS and FRONTEND_PORT loaded in vite.config.ts:
    - FRONTEND_ADDRESS=0.0.0.0 (default) resolves to localhost for dev
    - FRONTEND_PORT=3001 (default Go server port)
  - The Vite proxy includes special handling for:
    - /api → backend API
    - /env-config.js → environment blob served by Go
    - /proxy → backend-aware proxy; Vite injects headers from query params (x-target-url, Authorization for basic/bearer) to mirror authUtils behavior.

- Production build without Docker
  - Build UI assets into ./build:
    - npm run build
  - Build/run the Go server (serves ./build and APIs):
    - cd server && go build -o ../bin/nauthilus-ui && ../bin/nauthilus-ui
  - The server expects configuration via environment variables (.env supported via joho/godotenv). Notable variables (see server/config and README for full list):
    - MONGODB_URI for persistence.
    - PROXY_PORT / REACT_APP_PROXY_PORT for network configuration.

- Docker
  - Quick start:
    - docker-compose up -d
  - Multi-arch build and push via Buildx and docker-bake.hcl:
    - docker buildx bake --push
  - The Dockerfile uses:
    - node:24-alpine to build the UI (vite build)
    - golang:1.25-alpine to build a static server binary (-mod=vendor, ldflags for version), compressed with upx
    - alpine:3.22 runtime image with Chromium installed for server-side PDF rendering (CHROME_PATH/CHROME_BIN envs are provisioned)

2. Testing information

There is intentionally no heavyweight frontend unit test runner configured. The repo provides these practical testing/quality options:

- TypeScript and ESLint checks
  - Run static analysis:
    - npm run quality-check
  - This runs ESLint (if locally installed) and tsc --noEmit and writes reports into ./quality. You can run it selectively or in CI; the script is resilient to missing local binaries.

- Backend tests (Go)
  - Standard Go tests can be added under ./server using *_test.go and executed with:
    - make test
    - or: cd server && go test -v ./...

- Minimal smoke tests for the repo (recommended pattern)
  - Given the absence of a frontend test runner, use lightweight Node-based smoke tests to validate critical invariants across the monorepo. Example test below is self-contained and dependency-free.
  - Usage pattern:
    1) Create scripts/smoke.sample.test.mjs with the following content
       (we verified a functionally identical script during guideline preparation):

       "use strict";
       import { access, readFile } from "node:fs/promises";
       import { constants as FS } from "node:fs";
       import path from "node:path";

       async function assertExists(p) {
         try {
           await access(p, FS.F_OK | FS.R_OK);
           console.log("[ok] exists:", p);
         } catch (e) {
           console.error("[fail] missing:", p);
           throw e;
         }
       }

       async function main() {
         const root = process.cwd();
         // Check key files in this repo
         await assertExists(path.join(root, "package.json"));
         await assertExists(path.join(root, "vite.config.ts"));
         await assertExists(path.join(root, "src", "index.tsx"));
         await assertExists(path.join(root, "server", "main.go"));

         // Sanity-check package.json scripts
         const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
         if (!pkg.scripts || !pkg.scripts.dev || !pkg.scripts.build) {
           throw new Error("package.json must define 'dev' and 'build' scripts");
         }
         console.log("[ok] npm scripts present: dev, build");

         // Emit a deterministic summary useful for CI logs
         console.log(JSON.stringify({ smoke: "ok", time: new Date().toISOString() }));
       }

       main().catch((err) => {
         console.error(err?.stack || String(err));
         process.exit(1);
       });

    2) Run it from the repo root:
       node scripts/smoke.sample.test.mjs

    3) You can add more checks (e.g., ensure a config file parses, ensure a JSON schema validates a sample doc, ping a local dev port) without installing any test framework.

  - Add more smoke tests by cloning this pattern under scripts/ and invoking them via npm scripts (e.g., "smoke": "node scripts/smoke.config.test.mjs").

Notes when running examples in this section
- Keep the repo clean: remove any transient test files or artifacts you created locally once done (e.g., scripts/smoke.sample.test.mjs or quality/* reports) unless you intend to commit them. The quality-check script writes into ./quality; clean it if your workflow requires zero-diff.

3. Additional development information

- Vite proxy and backend integration
  - vite.config.ts computes an API target from FRONTEND_ADDRESS and FRONTEND_PORT and proxies:
    - /api to Go
    - /env-config.js to Go
    - /proxy with header injection logic driven by URL query params (x-target-url, x-auth-type/value, and Authorization for basic/bearer). This mirrors UI auth utilities during exploratory calls.

- Emotion and MUI specifics
  - The Vite config dedupes react, react-dom, @emotion/react, and @emotion/styled and aliases Emotion packages to the workspace node_modules to avoid duplicate Emotion instances at runtime.
  - The React plugin enables the @emotion Babel plugin; JSX source is configured via jsxImportSource in tsconfig.json.

- TypeScript configuration
  - Strict mode is enabled with strictNullChecks, noImplicitAny, and isolatedModules. The TS compiler is configured for bundler moduleResolution. NoEmit is true; type checks are CI/dev-time only.

- Hot module reload hygiene
  - src/index.tsx registers and unregisters session handlers on HMR dispose to avoid listener leaks during rapid dev cycles.

- Build outputs and server expectations
  - npm run build writes to ./build (sourcemaps enabled). The Go server serves static assets from that directory and injects /env-config.js automatically in production.

- Go runtime and PDF support
  - The production image includes Chromium and sets CHROME_PATH/CHROME_BIN. If you render PDFs or capture pages server-side, reuse these envs; in local dev, install Chrome/Chromium accordingly.

- Linting and formatting
  - ESLint config lives in eslint.config.js and the helper script check-quality.sh writes JSON/text reports. Prettier is not enforced; follow conventional TypeScript/MUI style and the existing lint rules.

- Troubleshooting
  - 404 for /env-config.js during dev: ensure the Go server is running; Vite proxies that path to the backend.
  - CORS errors during dev: vite server proxies /api → Go; run both processes and verify FRONTEND_PORT matches the Go port.
  - Emotion style mismatches: ensure single instance via the provided aliasing; avoid adding additional Emotion copies (e.g., via linked packages).
  - Docker build failures on npm i: try adding --legacy-peer-deps; the Dockerfile already does this for reproducibility.

4. Project-wide Conventions (Addendum)

- Comment language
  - All code comments must be written exclusively in English. This applies to Go, TypeScript/React, shell scripts, Dockerfiles, Makefiles, and any configuration files that support comments. Commit messages and PR descriptions should preferably be in English as well.

- Go design principles
  - Object-oriented in the sense of Go idioms: prefer composition over inheritance, implement methods on structs, and use interfaces where it makes sense. Favor interfaces at package/boundary edges; bind concrete implementations in main/wire-up.
  - Keep functions short and compact; avoid “spaghetti” or “god” functions. Rule of thumb: 20–40 lines per function; extract helpers, use guard clauses and early returns for readability.
  - Clear API surfaces: avoid overly long parameter lists; group parameters into clearly named config structs with sensible defaults.
  - Error handling: return errors instead of panicking on the normal path. Wrap errors with %w (fmt.Errorf) for context. Use context.Context for cancellations/timeouts.
  - Concurrency: Use context-aware goroutines, timeouts/deadlines, and select over channels; avoid shared, unsynchronized state. Locally, test with the race detector (go test -race).

- Go formatting and linting
  - Go code must not be “crammed” or unreadably compressed. Follow the standard gofmt/goimports style; avoid artificial one-liners that hurt readability.
  - Before submitting/committing: format and lint the code.
    - Formatting: make fmt (runs go fmt ./... in the server directory)
    - Linting: make lint (runs golangci-lint run ./server/...)
    - Installation (if needed): make install-lint
  - Optional additional checks:
    - golangci-lint run ./server/...
    - go vet ./server/...
    - go test -race ./server/...

Note: If you make extensive changes to Go code, add a brief package documentation comment (package comment) in English and keep export comments consistent (godoc-compatible).

- TypeScript quality and correctness
  - TypeScript code MUST compile without TypeScript errors. Validate local builds/PRs with tsc --noEmit:
    - npm run quality-check (writes reports to ./quality)
  - Error handling: Avoid local throw statements inside try/catch blocks. Prefer clear return paths (e.g., return Promise.reject(err) in async functions) or normalize errors into a Result object.
  - ESLint: The linter is configured to
    - prevent throwing non-literal errors (@typescript-eslint/no-throw-literal = error)
    - warn on throwing inside catch blocks (no-restricted-syntax with CatchClause ThrowStatement = warn)
    - warn on unnecessary catch blocks (no-useless-catch = warn)
  - Acceptance criteria: Only submit code that
    - has no TypeScript errors, and
    - passes the ESLint run without new errors. Please address “Throw in Catch” warnings promptly.
