# Testing and CI Best Practices

## Local validation
- Define minimal required validation commands per subsystem.
- Keep commands easy to run from repo root.
- Validate the changed area first, then broader checks as needed.
- For interpreted / no-build-step frontends (code served as-is), a syntax check
  is not enough: add a **module/import-resolution gate** to local validation. A
  missing or misspelled import fails at load time, not at syntax-check time.
- Give critical or irreversible logic (safety, money, physical actuation)
  contract tests even when no broad suite exists — it is the code where a silent
  regression costs the most.

## CI baseline
- Prefer running the same required validation commands in CI.
- **If there is no CI, the local validation commands ARE the contract** —
  document them in one canonical place and run them before every change.
- Fail fast on build/test failures.
- Keep CI deterministic and non-interactive.

## Scope discipline
- Fix root-cause issues in the changed area.
- Do not mix unrelated fixes in the same PR.
- If unrelated failures block merging, document them clearly.

## Artifacts and logs
- Keep CI logs readable and concise.
- Publish only useful artifacts (coverage, release assets, packaged outputs).

## Definition of green
- Required checks pass
- Docs updated if behavior changed
- No ignored failing checks
