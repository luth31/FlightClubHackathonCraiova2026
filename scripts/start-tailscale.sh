#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"
if [ ! -f .env.tailscale ]; then
  cp deploy/tailscale.env.example .env.tailscale
fi
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
# Pin isolation even when a developer exports COMPOSE_PROJECT_NAME for local work.
compose_args=(--project-name flyleaf-presentation -f compose.yaml -f compose.tailscale.yaml)
if [ -f .env ]; then compose_args+=(--env-file .env); fi
compose_args+=(--env-file .env.tailscale)
docker compose "${compose_args[@]}" build
docker compose "${compose_args[@]}" up -d
for airport in craiova sibiu; do
  docker compose "${compose_args[@]}" exec -T "$airport-api" python - <<'PY'
import time, urllib.request
from app.config import settings
urls = ['http://127.0.0.1:8000/api/health', settings.oidc_internal_issuer + '/.well-known/openid-configuration']
deadline = time.monotonic() + 150
for url in urls:
    while True:
        try:
            with urllib.request.urlopen(url, timeout=3) as response:
                if response.status == 200: break
        except Exception:
            if time.monotonic() >= deadline:
                raise SystemExit('Presentation services did not become ready. Inspect the presentation Compose logs.')
            time.sleep(1)
PY
  docker compose "${compose_args[@]}" exec -T "$airport-api" python -m app.people.sync_demo_organization
done
printf '%s\n' 'Presentation stack started separately from local development.' \
  'Craiova upstream: http://127.0.0.1:18080; Sibiu upstream: http://127.0.0.1:18081' \
  'Use the HTTPS Service URLs to sign in. See docs/TAILSCALE.md for Serve commands.'
