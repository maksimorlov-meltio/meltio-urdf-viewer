# Software Engineering Standards

Reusable repository best practices extracted from this project and written as generic templates.

Use this folder as a copy base for new repositories.

This folder is the canonical location for generic standards in this repo.

## Template version
- Template-Version: `1.1.0`
- Last-Updated: `2026-07-24`

Version bump rules:
- `MAJOR`: breaking structure or policy changes requiring manual migration
- `MINOR`: new standards documents or new non-breaking sections
- `PATCH`: wording clarifications and small non-breaking edits

Agent policy (automatic on standards changes):
- If any file under `software-engineering-standards/` is changed, agents must update this file in the same PR.
- Agents must bump `Template-Version` (at least `PATCH`) and set `Last-Updated` to the current date.

## What this contains
- `best-practices/documentation.md` — short-doc policy and canonical-doc model
- `best-practices/repository-standards.md` — repo layout and change hygiene
- `best-practices/python-venv.md` — Python virtual environment standard
- `best-practices/testing-and-ci.md` — validation baseline for local + CI
- `best-practices/versioning-and-releases.md` — tagging and release discipline

## Scope
- Best practices only
- No project-specific implementation details
- Minimal, command-first guidance

## How to use in a new repo
1. Copy `software-engineering-standards/` into the new repo root.
2. Keep the docs short and actionable.
3. Replace placeholder commands with project-specific commands.
4. Keep one canonical location per topic and link instead of duplicating.
5. Keep `Template-Version` and `Last-Updated` in sync with your source template repo.

These docs stay generic. Project-specific commands and conventions belong in the
repo's own `CONTRIBUTING.md` (or `docs/DEVELOPMENT.md`), which links back here for
the underlying principles.
