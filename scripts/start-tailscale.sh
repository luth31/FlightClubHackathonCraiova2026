#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"
if [ ! -f .env.tailscale ]; then
  cp deploy/tailscale.env.example .env.tailscale
fi
if [ -x backend/.venv/bin/python ]; then
  task_python=(backend/.venv/bin/python)
elif command -v uv >/dev/null 2>&1; then
  task_python=(uv run --with httpx --with cryptography==50.0.2 python)
else
  printf '%s\n' 'First run ./scripts/dev.sh to install the Python environment, then retry.' >&2
  exit 1
fi
if [ ! -f .runtime/exchange/ready ]; then
  "${task_python[@]}" scripts/prepare_exchange.py
fi
# Use the same project and persisted volumes as the default Docker installation.
compose_args=(--project-name flyleaf -f compose.yaml -f compose.tailscale.yaml)
if [ -f .env ]; then compose_args+=(--env-file .env); fi
"${task_python[@]}" scripts/tailscale_origins.py
compose_args+=(--env-file .runtime/tailscale.origins.env)
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
                raise SystemExit('Shared services did not become ready. Inspect the flyleaf Compose logs.')
            time.sleep(1)
PY
  docker compose "${compose_args[@]}" exec -T "$airport-api" python -m app.people.sync_demo_organization
done
# Register both browser origins on the existing realm, retaining all users/data.
"${task_python[@]}" scripts/configure_identity.py --tailscale
printf '%s\n' 'Tailscale entrances enabled on the existing FlyLeaf installation.' \
  'Craiova upstream: http://127.0.0.1:18080; Sibiu upstream: http://127.0.0.1:18081' \
  'Local access remains at ports 8080 and 8081. Both routes use the same data.' \
  'See docs/TAILSCALE.md for Serve commands.'
