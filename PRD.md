## 1) Context and Problem

The organizing company runs classroom trainings and works with multiple external trainers.
A small internal planning team (up to 3 people) assigns trainers to incoming training requests.

The planning problem is availability-first:

- organizations request a training topic and a preferred time window,
- trainers provide exact available calendar slots for upcoming periods,
- planners must quickly select the best trainer and slot.

Today, planning is mostly manual (messages, spreadsheets, notes), which is:

- slow,
- error-prone,
- hard to coordinate across 2-3 planners,
- difficult to keep fair across trainers.

Business pain:

- too much time spent searching and double-checking availability,
- uneven trainer utilization,
- weak traceability of why a trainer was selected.

---

## 2) Product Goal (Business)

Build a simple internal web app that:

- finds a suitable trainer and concrete slot within 2 minutes,
- matches requests by topic and real slot availability,
- balances trainer utilization proportionally to trainer-provided capacity,
- gives transparent ranking with a match percentage and explanation,
- synchronizes assignment changes in real time for all internal planners.

---

## 3) Success Metrics

- Tactical metric:
  - planner can assign a trainer+slot within <= 2 minutes for standard requests.
- Operational metrics:
  - most assignments are done without external spreadsheets/notes,
  - no duplicate assignment caused by concurrent edits,
  - monthly utilization per trainer stays within configured fairness tolerance where feasible.
- Qualitative:
  - decision rationale remains understandable months later.

---

## 4) Key Principles

- Availability-first: no assignment without a real free slot.
- Predictable matching: explicit hard filters and transparent scoring.
- Fair-by-design: monthly workload balancing uses proportional target shares.
- Low-friction operations: optimized for small internal team collaboration.
- Real-time consistency: planners immediately see changes made by others.

---

## 5) Core User Flows

### 5.1 Create request and assign trainer

1. Planner creates a new request.
2. Planner fills:
   - training topic,
   - location (onsite),
   - preferred time window (optional).
3. If window is empty, system defaults it to next 30 days from creation date.
4. System uses fixed duration from selected topic.
5. System returns ranked trainer+slot candidates.
6. Planner selects one candidate and saves.
7. Slot becomes assigned immediately (no temporary hold).
8. Change is pushed in real time to other planners.

### 5.2 Edit or cancel assignment

1. Planner opens request detail.
2. Planner can:
   - change topic/window/location,
   - rerun matching,
   - reassign trainer+slot,
   - cancel request.
3. If canceled, previously assigned slot is released.

### 5.3 Maintain trainer supply calendars

1. Planner or admin enters trainer profile.
2. Planner sets:
   - trainer topics (can teach / cannot teach),
   - exact availability slots in calendar.
3. System uses those slots as source of truth for matching.

---

## 6) State Model

- draft: request being prepared.
- open: request ready for matching, no trainer assigned.
- assigned: trainer and exact slot assigned.
- confirmed: assignment confirmed for delivery.
- canceled: request canceled.

Transition rules:

- draft -> open
- open -> assigned
- assigned -> confirmed
- assigned -> open (reassignment)
- any -> canceled

---

## 7) Functional Scope (MVP)

### 7.1 Trainer records

Each trainer has:

- identity and contacts,
- topics they can deliver (boolean mapping),
- exact availability slots (datetime start/end),
- optional notes.

### 7.2 Topic catalog

Each topic defines:

- topic name,
- fixed training duration.

### 7.3 Request records

Each request has:

- requested topic,
- onsite location,
- preferred time window (from/to, optional),
- system default window (next 30 days when missing),
- status,
- assigned trainer (optional),
- assigned slot (optional),
- internal notes.

### 7.4 Matching engine (core)

Step 1: hard filters

Exclude candidates where:

- trainer cannot teach topic,
- no free slot of required duration inside request window,
- trainer slot already assigned.

Step 2: candidate generation

- produce trainer+slot pairs that satisfy hard filters,
- include nearest fitting slots first (earlier slots preferred by default).

Step 3: fairness scoring (monthly)

For each trainer in current month:

- offered_days: number of available training days provided by trainer,
- delivered_days: number of assigned/confirmed training days,
- target_share = offered_days / total_offered_days,
- actual_share = delivered_days / total_delivered_days,
- fairness_gap = actual_share - target_share.

Fairness policy:

- preferred is fairness_gap close to 0,
- underutilized trainers (negative gap) get better score,
- tolerance band is +/-20% against target share.

Step 4: match percentage and ranking

- each candidate gets `match_percent` (0-100),
- output includes:
  - trainer,
  - concrete slot,
  - match_percent,
  - short explanation (for example: "topic fit, slot in window, under target share by 12%"),
- ranking prioritizes:
  1. hard fit completeness,
  2. fairness,
  3. slot suitability in requested window.

### 7.5 Real-time collaboration and consistency

- up to 3 internal planners can work concurrently,
- all assignment changes are broadcast in real time,
- assignment save uses atomic conflict check:
  - "slot still free" must pass at commit time,
  - if failed, user gets conflict message and refreshed candidates.

No temporary hold in MVP.

---

## 8) Views and Navigation

### 8.1 Request list

- table of requests,
- filters by status, topic, date window,
- quick filter "unassigned".

### 8.2 Planner calendar

- monthly default view,
- optional weekly view,
- shows assigned trainings and open requests.

### 8.3 Trainer detail

- topics,
- supplied availability slots,
- monthly offered vs delivered days,
- fairness deviation indicator.

---

## 9) Non-Functional Requirements

- responsive web app (desktop-first, usable on mobile),
- internal team usage (2-3 planners),
- low operating cost,
- backup strategy at DB/hosting level,
- auditable timestamps on key entities,
- real-time update latency suitable for coordination (< a few seconds in normal operation).

---

## 10) Out of Scope (MVP)

- temporary slot holds/reservations,
- trainer-side self-service portal,
- multi-company tenant model,
- complex pricing optimization,
- AI autonomous assignment,
- full Google Calendar sync.

---

## 11) Audit and Traceability (Lightweight)

For requests, trainers, and assignments, store at least:

- created_at,
- updated_at,
- changed_by (internal user),
- assignment_reason (short text from ranking explanation at selection time).

This keeps decisions understandable without heavy audit complexity.
