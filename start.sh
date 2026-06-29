#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/servers/fastapi"
FRONTEND="$ROOT/servers/nextjs"

echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║         PPT Generator - Starting          ║"
echo "╚═══════════════════════════════════════════╝"
echo ""

# ── Load env ───────────────────────────────────────────────────
if [ -f "$ROOT/.env" ]; then
  export $(grep -v '^#' "$ROOT/.env" | xargs)
  echo "✅ .env loaded"
fi

# ── Check Python ───────────────────────────────────────────────
if ! command -v python3 &>/dev/null; then
  echo "❌ Python3 not found. Please install Python 3.10+."
  exit 1
fi

# ── Check Node ─────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "❌ Node.js not found. Please install Node.js 18+."
  exit 1
fi

# ── Backend setup ──────────────────────────────────────────────
echo ""
echo "📦 Setting up Python backend..."
cd "$BACKEND"

if [ ! -d ".venv" ]; then
  echo "   Creating virtual environment..."
  python3 -m venv .venv
fi

source .venv/bin/activate
echo "   Installing Python dependencies..."
pip install -q -r requirements.txt
echo "✅ Backend dependencies ready"

# ── Frontend setup ─────────────────────────────────────────────
echo ""
echo "📦 Setting up Next.js frontend..."
cd "$FRONTEND"
if [ ! -d "node_modules" ]; then
  echo "   Installing Node dependencies (this may take a moment)..."
  npm install --legacy-peer-deps
fi
echo "✅ Frontend dependencies ready"

# ── Create data dirs ───────────────────────────────────────────
mkdir -p "$ROOT/app_data/presentations"
mkdir -p "$ROOT/app_data/images"
cd "$BACKEND"

# ── Start backend ──────────────────────────────────────────────
echo ""
echo "🚀 Starting FastAPI backend on http://localhost:${FAST_API_PORT:-8000}..."
APP_DATA_DIR="$ROOT/app_data" \
  .venv/bin/uvicorn main:app \
  --host 0.0.0.0 \
  --port "${FAST_API_PORT:-8000}" \
  --reload \
  --reload-dir . &
BACKEND_PID=$!
echo "   Backend PID: $BACKEND_PID"

# Wait for backend to be ready
echo "   Waiting for backend..."
for i in $(seq 1 20); do
  if curl -s "http://localhost:${FAST_API_PORT:-8000}/health" >/dev/null 2>&1; then
    echo "✅ Backend is ready"
    break
  fi
  sleep 1
done

# ── Start frontend ─────────────────────────────────────────────
echo ""
echo "🚀 Starting Next.js frontend on http://localhost:${NEXTJS_PORT:-3000}..."
cd "$FRONTEND"
NEXT_PUBLIC_API_URL="http://localhost:${FAST_API_PORT:-8000}" \
  node_modules/.bin/next dev -p "${NEXTJS_PORT:-3000}" &
FRONTEND_PID=$!
echo "   Frontend PID: $FRONTEND_PID"

echo ""
echo "═══════════════════════════════════════════════"
echo "  🎉 PPT Generator is running!"
echo ""
echo "  Frontend: http://localhost:${NEXTJS_PORT:-3000}"
echo "  Backend:  http://localhost:${FAST_API_PORT:-8000}"
echo "  API Docs: http://localhost:${FAST_API_PORT:-8000}/docs"
echo ""
echo "  Default login: admin / changeme123"
echo "  (set AUTH_USERNAME and AUTH_PASSWORD in .env)"
echo "═══════════════════════════════════════════════"
echo ""
echo "Press Ctrl+C to stop all services."
echo ""

# Cleanup on exit
cleanup() {
  echo ""
  echo "Stopping services..."
  kill $BACKEND_PID  2>/dev/null || true
  kill $FRONTEND_PID 2>/dev/null || true
  echo "Done. Goodbye!"
}
trap cleanup INT TERM

wait
