# Local setup (no Docker)

## Requirements
- Node.js 18+

## Setup
1) Configure env:
   - `cp .env.example .env`
   - `cp .env backend/.env` (Prisma reads `.env` from `backend`)
2) Install deps:
   - `npm run setup`

## Run
- `npx prisma migrate dev --schema backend/prisma/schema.prisma`
- `npm run dev`

Open `http://127.0.0.1:5173/`.

## MVP note
- Matching needs lat/lng on trainings and trainers. Geocoding uses Nominatim; you can still enter coordinates manually.

## Login
- Visit `http://127.0.0.1:5173/login/` and use the admin credentials from `.env`.
