# Repo structure

This layout keeps the app simple and focused while leaving room for growth.

## Directories
- `backend/` - Express + Prisma backend (JSON APIs, matching, geocoding).
- `app/` - Legacy Django backend (kept for reference during migration).
- `docs/` - Product, architecture, and engineering docs.
- `frontend/` - React SPA source (Vite build).
- `infra/` - Deployment files (Docker, hosting config).
- `scripts/` - Local tooling (seed data, migrations helpers).

## Conventions
- Keep domain logic in a dedicated module (matching, geocoding).
- Docs are part of the product; update them with code changes.

## Root files
- Root `.env.example` for local configuration.
- `.env.example` for local configuration.
- `LICENSE` for usage terms.
