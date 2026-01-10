# Tech stack

## Summary
- Backend: Python 3.9+, Django 4.2 LTS
- UI: Server-rendered HTML + HTMX (minimal JS)
- Styling: Tailwind CSS (compiled once, no runtime JS dependency)
- DB: PostgreSQL 16 (prod), SQLite (dev)
- Testing: pytest + pytest-django
- Lint/format: ruff
- Geocoding: OpenStreetMap Nominatim (cached)
- Hosting: single container + managed Postgres (low cost)

## Why this stack
- Fast delivery: Django admin, forms, migrations, ORM.
- Low complexity: server-rendered pages and HTMX for partial updates.
- Easy to maintain: clear domain services, minimal custom JS.
- Good UX: responsive UI without SPA overhead.
- Safe defaults: built-in CSRF, sessions, and validation.

## Notes
- Local development uses venv + SQLite; Docker is optional and deferred.
- No task queue in MVP. Use synchronous jobs for geocoding; add a queue later if needed.
- Keep JS to small progressive enhancements only.
