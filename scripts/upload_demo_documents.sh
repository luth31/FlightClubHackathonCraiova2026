#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

for python in backend/.venv/bin/python backend/.venv/Scripts/python.exe python3 python; do
  if command -v "$python" >/dev/null 2>&1; then
    exec "$python" -X utf8 "$PROJECT_DIR/scripts/upload_demo_documents.py" "$@"
  fi
done

printf '%s\n' 'Python was not found. Install Python 3 or create the backend virtual environment, then retry.' >&2
exit 1
