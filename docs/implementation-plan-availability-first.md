# Implementation plan: availability-first matching

## Goal
Refactor the product from "fixed training date -> find trainer" to "request window -> find trainer+free slot" with proportional monthly fairness and real-time team coordination.

## Phase 1: Product and schema alignment
- Freeze terminology in docs and API:
  - request window (from/to),
  - topic fixed duration,
  - trainer availability slot,
  - offered days vs delivered days,
  - match percentage.
- Update data model with explicit availability slots and assignment linkage.
- Define defaulting rule: missing request window => next 30 days.

Deliverable:
- migrated DB schema and updated API contracts.

## Phase 2: Matching engine v2
- Implement hard filters:
  - topic capability,
  - slot duration fit,
  - slot inside request window,
  - slot currently unassigned.
- Implement monthly fairness computation:
  - target share from offered days,
  - actual share from delivered days,
  - fairness gap and tolerance +/-20%.
- Implement candidate scoring and `match_percent` output with explanation.

Deliverable:
- deterministic ranking endpoint returning trainer+slot candidates.

## Phase 3: Assignment consistency and concurrency
- On assign, run atomic transaction with final "slot still free" validation.
- If validation fails, return conflict response and rerun candidate generation.
- Do not implement hold mechanism in MVP.

Deliverable:
- no double-booked slot through concurrent writes.

## Phase 4: Real-time collaboration
- Broadcast request and assignment updates to connected planners.
- Update list/detail views instantly after assignment/reassignment/cancel.
- Add stale-data guards in UI to prevent silent overwrite.

Deliverable:
- 2-3 planners can coordinate with near-real-time state.

## Phase 5: UI and reporting
- Update planner screens to show trainer+slot candidates and match percentages.
- Add trainer fairness panel (offered vs delivered in current month).
- Add explanation text persistence on assignment (`assignment_reason`).

Deliverable:
- transparent assignment decision support.

## Phase 6: Rollout and validation
- Backfill/migrate existing training records where needed.
- Run UAT scenarios:
  - default 30-day window,
  - conflict on concurrent assignment,
  - fairness drift detection,
  - reassignment and cancellation release behavior.
- Monitor first month fairness outcomes against tolerance policy.

Deliverable:
- production-ready release with measurable success checks.

## Suggested implementation order
1. Schema and migrations.
2. Matching endpoint v2.
3. Atomic assignment path.
4. Real-time events.
5. UI updates.
6. UAT + rollout.

## Risks and mitigations
- Risk: inconsistent historical data for fairness.
  - Mitigation: mark legacy records and compute fairness only from cutover date in MVP.
- Risk: race conditions under concurrent actions.
  - Mitigation: DB-level transaction + unique assignment constraints.
- Risk: opaque ranking decisions.
  - Mitigation: keep explanation text mandatory for each candidate/assignment.
