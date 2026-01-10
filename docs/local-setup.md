# Local setup (no Docker)

## Requirements
- Python 3.12
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

## Run (once Django app exists)
- `python app/manage.py migrate`
- `python app/manage.py runserver`
