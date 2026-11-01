#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"
if [ ! -f .runtime/exchange/ready ]; then
  if [ -x backend/.venv/bin/python ]; then
    backend/.venv/bin/python scripts/prepare_exchange.py
  elif command -v uv >/dev/null 2>&1; then
    uv run --with cryptography==50.0.2 python scripts/prepare_exchange.py
  else
    printf '%s\n' 'First run ./scripts/dev.sh to install the Python environment, then retry.' >&2
    exit 1
  fi
fi
docker compose build
docker compose up -d
docker compose exec -T craiova-api python - <<'PY'
import time, urllib.request
urls = [
    'http://craiova-api:8000/api/health',
    'http://craiova-identity:8080/realms/craiova/.well-known/openid-configuration',
]
deadline = time.monotonic() + 90
for url in urls:
    while True:
        try:
            with urllib.request.urlopen(url, timeout=3) as response:
                if response.status == 200: break
        except Exception:
            if time.monotonic() >= deadline:
                raise SystemExit('Services are still starting. Inspect: docker compose logs --tail=30')
            time.sleep(1)
PY
docker compose exec -T sibiu-api python - <<'PY'
import time, urllib.request
deadline = time.monotonic() + 90
for url in ['http://sibiu-api:8000/api/health', 'http://sibiu-identity:8080/realms/sibiu/.well-known/openid-configuration']:
    while True:
        try:
            with urllib.request.urlopen(url, timeout=3) as response:
                if response.status == 200: break
        except Exception:
            if time.monotonic() >= deadline:
                raise SystemExit('Services are still starting. Inspect: docker compose logs --tail=30 sibiu-api sibiu-identity')
            time.sleep(1)
PY
docker compose exec -T craiova-api python -m app.people.sync_demo_organization
docker compose exec -T sibiu-api python -m app.people.sync_demo_organization
printf '%s\n' 'Craiova: http://127.0.0.1:8080' 'Sibiu: http://127.0.0.1:8081'
