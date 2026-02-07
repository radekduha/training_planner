# Architecture

## Overview
Single web application with a React SPA frontend and Express JSON APIs.
The core is an availability-first matching engine that ranks trainer+slot candidates for request windows.

## Components
- UI (React SPA): request list, request detail, trainer management, planner calendar.
- API layer (Express JSON endpoints) with session auth + CSRF.
- Domain services:
  - Matching service: hard filters + fairness scoring + match percentage.
  - Assignment service: atomic slot assignment and conflict detection.
  - Realtime service: push updates to connected planners.
- Data access: Prisma ORM.

## Data flow (create request and assign)
1. Planner creates request with topic, location, and optional time window.
2. If window is missing, API defaults to next 30 days.
3. Matching service evaluates trainer availability slots:
   - Hard filters (topic capability, slot duration fit, slot in window, slot free).
   - Score (fairness first, then slot suitability).
4. UI shows ranked trainer+slot candidates with match percentage and explanation.
5. Planner assigns one candidate.
6. Assignment service performs atomic "slot still free" check and commit.
7. Realtime service broadcasts update to all connected planners.

## Modules
- `requests` - request CRUD, status transitions.
- `trainers` - trainer CRUD, skills, availability slots.
- `topics` - topic CRUD with fixed durations.
- `matching` - candidate generation and ranking logic.
- `assignments` - transactional assignment and conflict handling.
- `realtime` - event broadcasting to planner clients.

## Non-functional notes
- Use DB indexes on slot times, request status, and assignment foreign keys.
- Keep matching responses small and deterministic.
- Target near-real-time planner synchronization under normal load.
