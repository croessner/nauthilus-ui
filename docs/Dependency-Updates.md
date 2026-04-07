# Dependency Updates Guide (Hardened npm Workflow)

This project uses a hardened dependency-update workflow to reduce supply-chain risk on developer machines.

Audience: Developers maintaining this repository.


## Security Goals

- Do not execute dependency helper tools directly from the network (`npx`, `pnpm dlx`).
- Use reproducible installs from `package-lock.json` (`npm ci`).
- Prefer update execution in a disposable Docker sandbox.
- Keep audit output visible, but do not confuse audit findings with complete malware protection.


## Prerequisites

- Node.js 24+ (aligned with Docker/build image)
- npm 10+
- Docker (recommended for sandbox mode)
- Clean working tree before bulk updates


## Quick Commands

- Reproducible install: `npm run deps:install:ci`
- Reproducible install without dependency lifecycle scripts: `npm run deps:install:ci:safe`
- Dependency status and audit checks: `npm run deps:check`
- Security gate against new high findings (prod tree): `npm run deps:audit:gate:prod`
- Security gate against new high findings (full tree): `npm run deps:audit:gate:full`
- Safe minor/patch update + lock refresh: `npm run deps:safe-upgrade`
- Full sandboxed updater (default): `npm run deps:update`
- Full updater on host (explicit unsafe override): `npm run deps:update:host:unsafe`
- Sandboxed updater with interactive majors: `npm run deps:update:major`


## Update Script

`scripts/update-deps.sh` runs this flow:

1. Start in Docker sandbox by default (`node:24-bookworm`, ephemeral container, dropped Linux caps).
2. Install from lockfile with `npm ci --legacy-peer-deps --ignore-scripts`.
3. Run health checks (`npm outdated`, `ncu --deprecated`, `npm audit`).
4. Run `depcheck` as optional informational check.
5. Apply minor/patch upgrades using local `ncu` binary from `node_modules/.bin`.
6. Refresh lockfile with `npm install --package-lock-only`.
7. Re-install reproducibly with `npm ci`.
8. Run `npm run quality-check` and `npm run build`.

Major updates are only executed when explicitly requested (`--interactive-majors`).

Host-mode updates are policy-disabled unless explicitly overridden with `NAUTHILUS_ALLOW_HOST_DEP_UPDATES=1`.


## Why `npm ci` Instead of `npm install`

- `npm ci` installs exactly what is in `package-lock.json`.
- It fails when `package.json` and lockfile diverge.
- It avoids drift between machines and CI.
- It is faster and more deterministic for automation.

Use `npm install` only when intentionally changing dependency definitions and lockfile resolution.


## What `npm audit` Does (and Does Not)

`npm audit` checks installed package versions against the npm advisory database and reports known CVEs/security advisories.

Important limitations:

- It does not detect unknown zero-day malware.
- It does not prove package maintainer trustworthiness.
- It does not replace sandboxing, lockfiles, review, and least-privilege runtime controls.

Treat `npm audit` as one signal in a layered defense model.

To avoid permanently red pipelines for known legacy findings, this repository enforces a baseline gate for production dependencies:

- Baseline file: `security/npm-audit-baseline.json`
- Gate script: `scripts/audit-gate.mjs`
- CI check: `.github/workflows/dependency-security.yml`

The gate fails on new high/critical advisories that are not yet in the baseline.

For the full dependency tree (including dev dependencies), an additional baseline and gate are enabled:

- Baseline file: `security/npm-audit-baseline-full.json`
- Command: `npm run deps:audit:gate:full`


## Recommended Operating Model

1. Run dependency updates in Docker sandbox (`npm run deps:update`).
2. Keep lockfile in version control and review lockfile diffs.
3. Keep update helper tools pinned in `devDependencies`.
4. Run required quality gates after updates.
5. Use small update batches and short-lived branches.


## Rollback

If an upgrade breaks:

```bash
git restore package.json package-lock.json
npm run deps:install:ci
```

Then retry with smaller upgrade batches.
