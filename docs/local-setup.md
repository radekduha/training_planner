# Local setup (no Docker)

## Requirements
- Python 3.9+
- pip

## Setup
1) Create and activate venv:
   - `python3 -m venv .venv`
   - `source .venv/bin/activate`
2) Install dependencies:
   - `pip install -r requirements.txt -r requirements-dev.txt`
3) Configure env:
   - `cp .env.example .env`

Shortcut:
- `scripts/dev_setup.sh`

## Run
- `python app/manage.py makemigrations`
- `python app/manage.py migrate`
- `python app/manage.py createsuperuser`
- `python app/manage.py runserver`

## MVP note
- Matching needs lat/lng on trainings and trainers. Geocoding uses Nominatim; you can still enter coordinates manually.

## Login
- Visit `http://127.0.0.1:8000/login/` and use the superuser credentials.
