#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

echo "=== Starting CodeLens Tutor ==="

# 1. Setup & activate Python virtual environment
if [ ! -d "$BACKEND_DIR/.venv" ]; then
  echo "[Backend] Creating Python virtual environment..."
  python3 -m venv "$BACKEND_DIR/.venv" || python -m venv "$BACKEND_DIR/.venv"
fi

if [ -f "$BACKEND_DIR/.venv/bin/activate" ]; then
  # Linux / macOS
  source "$BACKEND_DIR/.venv/bin/activate"
elif [ -f "$BACKEND_DIR/.venv/Scripts/activate" ]; then
  # Windows Git Bash
  source "$BACKEND_DIR/.venv/Scripts/activate"
fi

if ! python -c "import fastapi, uvicorn, httpx, pydantic" >/dev/null 2>&1; then
  echo "[Backend] Installing Python dependencies..."
  pip install -r "$BACKEND_DIR/requirements.txt"
fi

# 2. Setup Frontend dependencies
if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  echo "[Frontend] Installing Node dependencies..."
  (cd "$FRONTEND_DIR" && npm install)
fi

cleanup() {
  echo ""
  echo "Shutting down CodeLens Tutor..."
  if [ -n "${BACKEND_PID:-}" ]; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
  if [ -n "${FRONTEND_PID:-}" ]; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

HOST_ADDR="${HOST:-127.0.0.1}"

# 3. Launch Backend
echo "[Backend] Starting FastAPI on http://${HOST_ADDR}:8000 ..."
(
  cd "$BACKEND_DIR"
  python -m uvicorn app.main:app --host "$HOST_ADDR" --port 8000 --reload
) &
BACKEND_PID=$!

# 4. Launch Frontend
echo "[Frontend] Starting Vite UI on http://${HOST_ADDR}:5173 ..."
(
  cd "$FRONTEND_DIR"
  npm run dev -- --host "$HOST_ADDR" --port 5173
) &
FRONTEND_PID=$!

echo ""
echo "CodeLens Tutor is running:"
echo "  Frontend: http://${HOST_ADDR}:5173"
echo "  Backend:  http://${HOST_ADDR}:8000/docs"
echo "Press Ctrl+C to stop both servers."

wait
