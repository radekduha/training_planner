# Development standards

## Branching and commits
- `main` is always deployable.
- Feature branches: `feature/<short-name>` or `v1-<topic>`.
- Commit messages are imperative and specific (e.g., "Add trainer rules").

## Code style
- Format with Prettier and lint with ESLint (add when the repo stabilizes).
- Prefer explicit naming over short names.
- Use JSDoc annotations for core domain services.

## Testing
- Unit tests for matching, scoring, and rule evaluation.
- Integration tests for create/update flows.
- Do not merge if tests are red.

## Migrations
- Every schema change has a migration.
- Keep migrations small and reversible.

## Definition of done
- Tests pass.
- Docs updated if behavior changes.
- No TODOs left in production code.
