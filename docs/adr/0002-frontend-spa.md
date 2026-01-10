# ADR 0002: React SPA frontend

Status: accepted

## Context
We need richer interactivity (calendar, filters, inline updates) and want to
move fast before the UI grows. The project is still early, so switching the
frontend now is lower risk than later.

## Decision
Use a React SPA built with Vite, backed by Django JSON APIs. Authentication
remains session-based with CSRF protection. Django continues to own the domain
logic, matching services, and data access.

## Consequences
- Adds a Node-based build step for the frontend.
- Requires API contracts and versioned JSON responses.
- UI can evolve independently from Django templates.
- Production serves the SPA build from Django static files.
