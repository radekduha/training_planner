# Training Planner

Internal web app for a small planning team (up to 3 internal users) to assign trainers to training requests quickly and safely.
Focus: availability-first workflow, predictable rules, and fair trainer utilization.

## Goals
- Find a usable trainer+slot in 2 minutes or less.
- Provide clear "why this trainer and slot" explanation.
- Keep monthly trainer utilization proportionally fair to offered capacity.
- Keep planner collaboration low-friction with real-time updates.

## Non-goals (MVP)
- Temporary slot hold/reservation flow.
- Trainer-side self-service portal.
- Complex pricing optimization.

## Documentation
- PRD: `PRD.md`
- Implementation plan: `docs/implementation-plan-availability-first.md`
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

Login:
- Visit `http://127.0.0.1:5173/login/` and use internal credentials from `.env`.

## Repo structure
- `backend/` - Express + Prisma backend (JSON APIs, matching, realtime events).
- `app/` - Legacy Django backend (kept for reference during migration).
- `docs/` - Product, architecture, and engineering docs.
- `frontend/` - React SPA (Vite build).
- `infra/` - Deployment and ops configuration.
- `scripts/` - Helper scripts (seed data, local tools).
