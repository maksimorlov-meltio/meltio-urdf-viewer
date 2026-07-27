# Versioning and Release Practices

## Versioning
- Use semantic versioning (`MAJOR.MINOR.PATCH`) unless a different standard is required.
- Increment:
  - `MAJOR` for breaking changes
  - `MINOR` for backward-compatible features
  - `PATCH` for backward-compatible fixes

## Tagging
- Tag releases from a clean, reviewed state.
- Keep tag names consistent (example: `v1.4.2`).
- Ensure release notes map to actual merged changes.

## Release notes
Include only high-signal sections:
- Breaking changes
- New features
- Fixes
- Migration notes (if needed)

## Cached static assets
- For static assets served with caching, bump an explicit version token (query
  string or filename hash) whenever the asset changes, so clients never serve a
  stale copy. Treat forgetting the bump as a defect.

## Stability rules
- Do not release undocumented interface changes.
- Keep changelog/release notes concise and user-impact oriented.
- Prefer frequent small releases over large infrequent drops.
