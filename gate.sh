#!/usr/bin/env bash
# Step-7 gate: the nine checks every frontend change must pass. CI (ci.yml)
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

echo "=== gate 1/9 — syntax: node --check over own JS (vendored three excluded)"
find hmi viewer apps/dev-host/src/avisualizer/web/static tools tests/js \
     \( -name '*.js' -o -name '*.mjs' \) \
     -not -path '*/vendor/*' -not -path '*/dist/*' -print0 \
  | xargs -0 -r -n1 node --check

echo "=== gate 2/9 — imports: every module specifier resolves (incl. /hmi, /viewer)"
node tools/check_imports.mjs

echo "=== gate 3/9 — contract: every emitted machine command is declared"
node tools/check_contract.mjs

echo "=== gate 4/9 — boundaries: hmi/ never imports three; viewer/ no DOM outside overlays/"
node tools/check_boundaries.mjs

echo "=== gate 5/9 — lint: eslint (errors fail; warnings tolerated)"
npm run --silent lint

echo "=== gate 6/9 — unit tests + build proof (esbuild resolves the whole graph)"
node --test "tests/js/**/*.test.mjs"
npm run --silent build

# Gate 6 leaves urdf.html pointing at the freshly built (gitignored) bundle, so
# this must run AFTER it and after build:dev restores the committed state —
# otherwise the gate would flag its own side effect. `main` ships the raw-source
# entry; the bundle is a build proof here and the artefact on `release`.
echo "=== gate 7/9 — entry: urdf.html references only files a fresh clone gets"
npm run --silent build:dev
node tools/check_entry.mjs

echo "=== gate 8/9 — dom contract: contract-dom.json matches what hmi/+viewer/ need"
# Compare the file against a fresh generation, NOT against git: a developer who
# has correctly regenerated but not staged yet must pass, while a stale file
# (committed or not) must fail. CI runs the git-diff form on a clean checkout.
# tr -d '\r': compare content, not line endings. .gitattributes pins this file
# to LF, but a clone made before that would still check it out with CRLF.
before=$(tr -d '\r' < contract-dom.json 2>/dev/null || true)
node tools/gen_dom_contract.mjs
if [ "$before" != "$(tr -d '\r' < contract-dom.json)" ]; then
  echo "contract-dom.json was stale — the published modules' DOM/deps contract changed."
  echo "It has been regenerated; review and commit it (the C# host embeds against it)."
  git --no-pager diff --stat -- contract-dom.json
  exit 1
fi

echo "=== gate 9/9 — dead lookups: every id hmi/+viewer/ look up exists in urdf.html"
node tools/check_dead_lookups.mjs

echo "gate: all nine gates green."
