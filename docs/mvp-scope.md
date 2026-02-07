# MVP scope

## In scope
- Trainer profiles with topic capability matrix (can teach / cannot teach).
- Trainer availability as exact calendar slots (start/end datetime).
- Topic catalog with fixed duration per topic.
- Request records with optional time window; default window = next 30 days when missing.
- Matching engine for trainer+slot candidates using hard filters and scoring.
- Match percentage (0-100) with short explanation per candidate.
- Monthly proportional fairness by offered days vs delivered days, with 20% tolerance policy.
- Immediate assignment (no hold) with atomic conflict check on save.
- Real-time update propagation for up to 3 internal planners.
- Request list and basic calendar view for planning.

## Out of scope
- Temporary slot hold/soft reservation.
- Trainer-side portal for self-management.
- Complex pricing optimization (price not part of MVP matching).
- Multi-tenant or advanced role systems.
- AI autonomous assignment.
- Full Google Calendar sync (future integration only).
