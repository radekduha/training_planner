# ADR 0001: Tech stack

Status: accepted

## Context
We need a simple internal web app with fast development, low operating cost,
and clear, predictable behavior for a single user.

## Decision
Use Django 4.2 LTS (Python 3.9+) with server-rendered HTML and HTMX for small
interactive updates. PostgreSQL is the production database; SQLite is used for
local development. Styling is handled by Tailwind CSS.

## Consequences
- Fast CRUD delivery with minimal custom JS.
- Easy to keep UX predictable and performant.
- Requires a small Node toolchain for CSS compilation.
- We can add a task queue later if geocoding or matching needs async work.
