# ADR 0002: React SPA frontend

Status: accepted

## Context
We need richer interactivity (calendar, filters, inline updates) and want to
move fast before the UI grows. The project is still early, so switching the
frontend now is lower risk than later.

## Decision
Use a React SPA built with Vite, backed by Express JSON APIs. Authentication
remains session-based with CSRF protection. The Node backend owns the domain
logic, matching services, and data access via Prisma.

## Consequences
- Adds a Node-based build step for the frontend.
- Requires API contracts and versioned JSON responses.
- UI can evolve independently from backend templates.
- Production serves the SPA build from the Node backend.
