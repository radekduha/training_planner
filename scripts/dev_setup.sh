#!/usr/bin/env bash
set -euo pipefail

npm install
(cd backend && npm install)
(cd frontend && npm install)

if [ -f ".env" ] && [ ! -f "backend/.env" ]; then
  cp .env backend/.env
fi
