#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"
mkdir -p .runtime
if [ ! -x backend/.venv/bin/python ]; then
  if command -v uv >/dev/null 2>&1; then
    uv venv --python 3.12 backend/.venv
  elif command -v python3.12 >/dev/null 2>&1; then
    python3.12 -m venv backend/.venv
  else
    printf '%s\n' 'Python 3.12 or uv is required to create the development environment.' >&2
    exit 1
  fi
fi
if command -v uv >/dev/null 2>&1; then
  uv pip install --python backend/.venv/bin/python -q --require-hashes -r backend/requirements.lock
else
  backend/.venv/bin/python -m ensurepip --upgrade
  backend/.venv/bin/python -m pip install -q --require-hashes -r backend/requirements.lock
fi
if [ ! -d frontend/node_modules ]; then
  npm --prefix frontend ci
fi
export FLYLEAF_DATABASE_URL="sqlite:///$PROJECT_DIR/.runtime/flyleaf.db"
export FLYLEAF_STORAGE_DIR="$PROJECT_DIR/.runtime/storage"
export FLYLEAF_CORPUS_DIR="$PROJECT_DIR/data"
PYTHON_BIN="$PROJECT_DIR/backend/.venv/bin/python"
(
  cd backend
  "$PYTHON_BIN" -m alembic upgrade head
  exec "$PYTHON_BIN" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log
) &
API_PID=$!
cleanup() { kill "$API_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
npm --prefix frontend run dev -- --port 5173 --strictPort
