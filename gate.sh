#!/usr/bin/env bash
# Step-7 gate: the seven checks every frontend change must pass. CI (ci.yml)
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

echo "=== gate 1/7 — syntax: node --check over own JS (vendored three excluded)"
find hmi viewer apps/dev-host/src/avisualizer/web/static tools tests/js \
     \( -name '*.js' -o -name '*.mjs' \) \
     -not -path '*/vendor/*' -not -path '*/dist/*' -print0 \
  | xargs -0 -r -n1 node --check

echo "=== gate 2/7 — imports: every module specifier resolves (incl. /hmi, /viewer)"
node tools/check_imports.mjs

echo "=== gate 3/7 — contract: every emitted machine command is declared"
node tools/check_contract.mjs

echo "=== gate 4/7 — boundaries: hmi/ never imports three; viewer/ no DOM outside overlays/"
node tools/check_boundaries.mjs

echo "=== gate 5/7 — lint: eslint (errors fail; warnings tolerated)"
npm run --silent lint

echo "=== gate 6/7 — unit tests + build proof (esbuild resolves the whole graph)"
node --test "tests/js/**/*.test.mjs"
npm run --silent build

# Gate 6 leaves urdf.html pointing at the freshly built (gitignored) bundle, so
# this must run AFTER it and after build:dev restores the committed state —
# otherwise the gate would flag its own side effect. `main` ships the raw-source
# entry; the bundle is a build proof here and the artefact on `release`.
echo "=== gate 7/7 — entry: urdf.html references only files a fresh clone gets"
npm run --silent build:dev
node tools/check_entry.mjs

echo "gate: all seven gates green."
