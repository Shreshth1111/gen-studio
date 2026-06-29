#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
FRONTEND="$ROOT/servers/nextjs"

# Load env
if [ -f "$ROOT/.env" ]; then
  export $(grep -v '^#' "$ROOT/.env" | xargs)
fi

cd "$FRONTEND"

if [ ! -d "node_modules" ]; then
  echo "Installing Node dependencies..."
  npm install --legacy-peer-deps
fi

NEXT_PUBLIC_API_URL="http://localhost:${FAST_API_PORT:-8000}" \
  npm run dev
