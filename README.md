# Training Planner

Internal web app for a single owner to plan trainings and assign trainers fast and safely.
Focus: clear workflow, predictable rules, and minimal manual checks.

## Goals
- Find a usable trainer in 2 minutes or less.
- Provide a clear "why this trainer" explanation.
- Keep the workflow simple and low-stress.

## Non-goals (MVP)
- Multi-user roles and permissions.
- Trainer notifications or auto-confirmations.
- Complex pricing models.

## Documentation
- PRD: `PRD.md`
- MVP scope: `docs/mvp-scope.md`
- User stories: `docs/user-stories.md`
- Glossary: `docs/glossary.md`
- Tech stack: `docs/tech-stack.md`
- Architecture: `docs/architecture.md`
- Data model: `docs/data-model.md`
- UX guidelines: `docs/ux-guidelines.md`
- Development standards: `docs/development-standards.md`
- Testing strategy: `docs/testing-strategy.md`
- Security and performance: `docs/security-performance.md`
- Repo structure: `docs/repo-structure.md`
- Decision log: `docs/decision-log.md`
- ADRs: `docs/adr/0001-tech-stack.md`
- Local setup: `docs/local-setup.md`

## Local setup (no Docker)
Requirements:
- Node.js 18+

1) Configure env:
   - `cp .env.example .env`
   - `cp .env backend/.env` (Prisma reads `.env` from `backend`)
2) Install deps:
   - `npm run setup`

Run the app:
- `npx prisma migrate dev --schema backend/prisma/schema.prisma`
- `npm run dev`

Open `http://127.0.0.1:5173/`.

MVP note:
- Matching needs lat/lng on trainings and trainers. Geocoding uses Nominatim; you can still enter coordinates manually.

Login:
- Visit `http://127.0.0.1:5173/login/` and use the admin credentials from `.env`.

## Repo structure
- `backend/` - Express + Prisma backend (JSON APIs, matching, geocoding).
- `app/` - Legacy Django backend (kept for reference during migration).
- `docs/` - Product, architecture, and engineering docs.
- `frontend/` - React SPA (Vite build).
- `infra/` - Deployment and ops configuration.
- `scripts/` - Helper scripts (seed data, local tools).
