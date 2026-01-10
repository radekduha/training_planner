# Architecture

## Overview
Single web application with server-rendered pages. The core is a matching engine
that filters and ranks trainers for a training session.

## Components
- UI (templates + HTMX): list views, forms, and a simple calendar view.
- Domain services:
  - Matching service: hard filters + scoring.
  - Geocoding service: address to lat/lng, cached.
- Data access: Django ORM.

## Data flow (create training)
1. User creates a training with address and time.
2. Address is geocoded (lat/lng stored on the training).
3. Matching service evaluates trainers:
   - Hard filters (type, time conflict, weekend rule, max distance).
   - Score (distance, workload, price, long trips).
4. UI shows sorted candidates with a short explanation.

## Modules
- `trainings` - training CRUD, status transitions, calendar view.
- `trainers` - trainer CRUD, rules, and skills.
- `matching` - filtering and scoring logic.
- `geocoding` - provider wrapper and caching.

## Non-functional notes
- Use DB indexes on dates and status for fast list views.
- Keep pages under 2s on a typical LTE connection.
