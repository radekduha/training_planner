# Testing strategy

## Principles
- Focus on matching correctness, fairness behavior, and concurrency safety.
- Prefer fast automated tests; keep critical suites short.
- Use realistic fixture data with multiple trainers and overlapping slots.

## Unit tests
- Hard filters (topic capability, slot duration fit, slot in window, slot availability).
- Default window rule (missing window => next 30 days).
- Fairness computation (offered/delivered shares, 20% tolerance behavior).
- Match percentage normalization and explanation generation.

## Integration tests
- Create/update request flow.
- Create/update trainer skills and availability slots.
- Assign trainer+slot with atomic conflict protection.
- Reassign and cancel behavior (slot release and recomputation).
- Realtime event emission on assignment updates.

## Manual checks (before release)
- Create request without window and verify 30-day default.
- Run matching and verify ranked trainer+slot candidates.
- Simulate concurrent assignment from two sessions and verify one fails safely.
- Validate monthly fairness dashboard against fixture expectations.
