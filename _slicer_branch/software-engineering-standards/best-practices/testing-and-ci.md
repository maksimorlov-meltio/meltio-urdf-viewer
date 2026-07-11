# Testing and CI Best Practices

## Local validation
- Define minimal required validation commands per subsystem.
- Keep commands easy to run from repo root.
- Validate the changed area first, then broader checks as needed.

## CI baseline
- Run the same required validation commands in CI.
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
