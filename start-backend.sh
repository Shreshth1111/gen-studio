#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/servers/fastapi"

# Load env
if [ -f "$ROOT/.env" ]; then
  export $(grep -v '^#' "$ROOT/.env" | xargs)
fi

mkdir -p "$ROOT/app_data/presentations"
mkdir -p "$ROOT/app_data/images"

cd "$BACKEND"

if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi
source .venv/bin/activate
pip install -q -r requirements.txt

APP_DATA_DIR="$ROOT/app_data" \
  uvicorn main:app \
  --host 0.0.0.0 \
  --port "${FAST_API_PORT:-8000}" \
  --reload

