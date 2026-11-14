#!/usr/bin/env bash
# Single quality gate used by CI and by build-lab before every push:
# format check, lint, typecheck, unit tests, production build.
# E2E (Playwright) runs separately: `npm run e2e` (CI job "e2e").
set -euo pipefail
cd "$(dirname "$0")"
[ -d node_modules ] || npm ci
npx prettier --check .
npx eslint .
npx tsc --noEmit
npx vitest run
npx vite build
node scripts/budget.mjs
