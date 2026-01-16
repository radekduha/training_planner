# Tech stack

## Summary
- Backend: Node.js 18+, Express + Prisma
- UI: React SPA (Vite build) consuming JSON APIs
- Styling: custom CSS (no runtime JS dependency)
- DB: PostgreSQL 16 (prod), SQLite (dev)
- Testing: TBD (Vitest + Supertest planned)
- Geocoding: OpenStreetMap Nominatim (cached)
- Hosting: single container + managed Postgres (low cost)

## Why this stack
- Fast delivery: Prisma migrations + simple Express APIs.
- Clear UX: SPA keeps the primary flow fast and predictable.
- Easy to maintain: JSON APIs encapsulate domain services.
- Safe defaults: session auth + CSRF on writes.

## Notes
- Local development uses SQLite plus Vite for the frontend.
- No task queue in MVP. Use synchronous jobs for geocoding; add a queue later if needed.
- Frontend is a separate build, served by the Node backend in production.
