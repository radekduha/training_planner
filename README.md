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
- Python 3.9+

1) Create a virtualenv:
   - `python3 -m venv .venv`
   - `source .venv/bin/activate`
2) Install dependencies:
   - `pip install -r requirements.txt -r requirements-dev.txt`
3) Configure env:
   - `cp .env.example .env`

Shortcut:
- `scripts/dev_setup.sh`

Run the app:
- `python app/manage.py makemigrations`
- `python app/manage.py migrate`
- `python app/manage.py createsuperuser`
- `python app/manage.py runserver`

MVP note:
- Matching needs lat/lng on trainings and trainers. Geocoding uses Nominatim; you can still enter coordinates manually.

Login:
- Visit `http://127.0.0.1:8000/login/` and use the superuser credentials.

## Repo structure
- `app/` - Application code (Django project will live here).
- `docs/` - Product, architecture, and engineering docs.
- `infra/` - Deployment and ops configuration.
- `scripts/` - Helper scripts (seed data, local tools).
