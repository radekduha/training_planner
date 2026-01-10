# Testing strategy

## Principles
- Focus on matching correctness and edge cases.
- Prefer fast tests that run under 5 seconds.
- Use realistic seed data for manual testing.

## Unit tests
- Hard filters (weekend, distance, conflicts).
- Scoring function (distance, workload, price).
- Long trip counting and limits.

## Integration tests
- Create/update training flow.
- Create/update trainer flow.
- Assign trainer and status transitions.

## Manual checks (before release)
- Create training and see recommendations.
- Change a trainer rule and re-run recommendations.
- Cancel training and ensure workload updates.
