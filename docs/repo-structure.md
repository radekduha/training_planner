# Repo structure

This layout keeps the app simple and focused while leaving room for growth.

## Directories
- `app/` - Django project and app modules.
- `docs/` - Product, architecture, and engineering docs.
- `frontend/` - React SPA source (Vite build).
- `infra/` - Deployment files (Docker, hosting config).
- `scripts/` - Local tooling (seed data, migrations helpers).

## Conventions
- Keep domain logic in a dedicated module (matching, geocoding).
- Prefer small, focused apps: `trainings`, `trainers`, `matching`.
- Docs are part of the product; update them with code changes.

## Root files
- `requirements.txt` and `requirements-dev.txt` for dependencies.
- `.env.example` for local configuration.
- `LICENSE` for usage terms.
