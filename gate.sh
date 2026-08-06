#!/usr/bin/env bash
# Step-7 gate: the six checks every frontend change must pass. CI (ci.yml)
# runs the same commands as separate steps; the release workflow refuses to
# publish unless this script exits 0. Run locally from the repo root:
#
#   bash gate.sh            # Git Bash on Windows, or any POSIX shell
#
# Python backends have their own pytest suites (apps/dev-host/tests,
# _slicer_branch/.../tests, tests/smoke) — run those with pytest; this gate is
# the frontend contract only, so it stays fast and dependency-light (node+npm).
set -euo pipefail
cd "$(dirname "$0")"

echo "=== gate 1/6 — syntax: node --check over own JS (vendored three excluded)"
find hmi viewer apps/dev-host/src/avisualizer/web/static tools tests/js \
     \( -name '*.js' -o -name '*.mjs' \) \
     -not -path '*/vendor/*' -not -path '*/dist/*' -print0 \
  | xargs -0 -r -n1 node --check

echo "=== gate 2/6 — imports: every module specifier resolves (incl. /hmi, /viewer)"
node tools/check_imports.mjs

echo "=== gate 3/6 — contract: every emitted machine command is declared"
node tools/check_contract.mjs

echo "=== gate 4/6 — boundaries: hmi/ never imports three; viewer/ no DOM outside overlays/"
node tools/check_boundaries.mjs

echo "=== gate 5/6 — lint: eslint (errors fail; warnings tolerated)"
npm run --silent lint

echo "=== gate 6/6 — unit tests + build proof (esbuild resolves the whole graph)"
node --test "tests/js/**/*.test.mjs"
npm run --silent build

echo "gate: all six gates green."
