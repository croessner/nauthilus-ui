# Dependency Updates Guide (Vite/React)

This guide explains how to check for deprecated/outdated packages and safely update dependencies in this Vite/React project. It also covers the provided automation script.

Audience: Developers maintaining this repository.


## Prerequisites
- Node.js 18+ (Node 20+ recommended)
- npm 9/10 (or pnpm if you prefer; the script auto-detects)
- A clean working tree (commit your changes before running bulk updates)


## Quick commands
- Overview health check: npm run deps:check
- Safe (minor/patch) upgrades: npm run deps:safe-upgrade
- Latest (including majors): npm run deps:upgrade:latest
- Interactive majors: npm run deps:upgrade:i
- Full helper script (recommmended): npm run deps:update


## The helper script: scripts/update-deps.sh
The script automates a common, safe flow. It will:
1) Detect your package manager (pnpm preferred if installed, otherwise npm)
2) Show status (outdated, deprecated, audit)
3) Optional: run depcheck for unused dependencies
4) Upgrade only minor/patch versions
5) Build the app to catch issues early
6) Offer an interactive step to choose major upgrades

Run it from the repo root:

```bash
npm run deps:update
# or directly
bash scripts/update-deps.sh
```

What to expect:
- Deprecation warnings from transitive packages are informational
- After minor/patch upgrades, a production build is executed (vite build)
- For major upgrades, accept changes interactively and re-build


## Recommended workflow
1) Create a branch
```bash
git checkout -b chore/deps-YYYYMMDD
```

2) Check current status
```bash
npm run deps:check
```

3) Apply minor/patch upgrades and build
```bash
npm run deps:safe-upgrade
```

4) Major upgrades (interactive)
```bash
npm run deps:upgrade:i
npm i
npm run build
```

Tips:
- Upgrade majors in sensible batches (e.g., tooling → UI libs → router)
- Read migration notes for big stacks (Vite, React Router, MUI, TypeScript)
- After each batch, build and smoke test


## Common issues and fixes
- Peer dependency conflicts: Prefer removing dev‑only helpers that pin old majors, or upgrade them. Avoid --legacy-peer-deps unless necessary.
- Vite build fails on non-module scripts in index.html: Add type="module" or use a data-src + inline loader with data-vite-ignore.
- React Router 7: Remove old future props; standard <BrowserRouter> works.
- QR code component (qrcode.react >= v4): Use named export (QRCodeCanvas or QRCodeSVG) instead of default export.


## CI/Automation
Consider enabling Renovate or Dependabot to keep dependencies fresh. Policy suggestion:
- Auto-merge patch/minor updates
- Open PRs for majors with migration checklists


## Rollback
If an upgrade breaks the build and you need to revert quickly:
```bash
git restore package.json
rm -f package-lock.json
npm i
```
Then redo upgrades selectively.


## Support
If a dependency is deprecated or no longer supported:
1) Replace it with an actively maintained alternative
2) Upgrade to the project’s successor if one exists
3) As a last resort, vendor a minimal replacement or fork and patch

Open an issue with the package name and error output if you need help deciding the path forward.
