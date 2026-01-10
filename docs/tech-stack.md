# Tech stack

## Summary
- Backend: Python 3.9+, Django 4.2 LTS
- UI: React SPA (Vite build) consuming Django JSON APIs
- Styling: custom CSS (no runtime JS dependency)
- DB: PostgreSQL 16 (prod), SQLite (dev)
- Testing: pytest + pytest-django
- Lint/format: ruff
- Geocoding: OpenStreetMap Nominatim (cached)
- Hosting: single container + managed Postgres (low cost)

## Why this stack
- Fast delivery: Django admin, forms, migrations, ORM.
- Clear UX: SPA keeps the primary flow fast and predictable.
- Easy to maintain: JSON APIs encapsulate domain services.
- Progressive adoption: Django keeps auth/session handling and safety defaults.
- Safe defaults: built-in CSRF, sessions, and validation.

## Notes
- Local development uses venv + SQLite plus Vite for the frontend.
- No task queue in MVP. Use synchronous jobs for geocoding; add a queue later if needed.
- Frontend is a separate build, served by Django in production.
