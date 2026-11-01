"""The Tailscale overlay must not fork persisted airport state or local endpoints."""
import json
from pathlib import Path
import subprocess
import shutil
import pytest

pytestmark = pytest.mark.skipif(shutil.which("docker") is None, reason="Compose CLI required for deployment validation")

ROOT = Path(__file__).resolve().parents[2]


def compose(*files):
    args = ['docker', 'compose', '--env-file', 'deploy/tailscale.env.example']
    for file in files:
        args += ['-f', file]
    result = subprocess.run([*args, 'config', '--format', 'json'], cwd=ROOT,
        capture_output=True, text=True, check=True)
    return json.loads(result.stdout)


def test_optional_entrances_share_state_and_keep_local_access():
    local = compose('compose.yaml')
    remote = compose('compose.yaml', 'compose.tailscale.yaml')
    assert local['name'] == remote['name'] == 'flyleaf'
    assert local['volumes'] == remote['volumes']
    assert set(remote['services']) - set(local['services']) == {'craiova-tailweb', 'sibiu-tailweb'}
    for airport in ('craiova', 'sibiu'):
        for kind in ('api', 'identity'):
            name = airport + '-' + kind
            assert local['services'][name]['volumes'] == remote['services'][name]['volumes']
        for kind in ('web', 'identity'):
            name = airport + '-' + kind
            assert local['services'][name]['ports'] == remote['services'][name]['ports']
        for setting in ('FLYLEAF_OIDC_ISSUER', 'FLYLEAF_OIDC_REDIRECT_URI', 'FLYLEAF_OIDC_FRONTEND_URL', 'GOOGLE_MAPS_API_KEY'):
            assert local['services'][airport+'-api']['environment'][setting] == remote['services'][airport+'-api']['environment'][setting]
        assert remote['services'][airport+'-tailweb']['environment']['API_HOST'] == airport+'-api'
        assert all(volume['type'] == 'bind' for volume in remote['services'][airport+'-tailweb']['volumes'])


def test_tailscale_file_cannot_override_shared_provider_keys(tmp_path, monkeypatch):
    import importlib.util
    spec = importlib.util.spec_from_file_location('tailscale_origins', ROOT/'scripts/tailscale_origins.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setattr(module, 'ROOT', tmp_path)
    (tmp_path/'.env.tailscale').write_text('''FLYLEAF_CRAIOVA_PUBLIC_URL="https://craiova.tailnet.test"
FLYLEAF_SIBIU_PUBLIC_URL=https://sibiu.tailnet.test
GOOGLE_MAPS_API_KEY=must-not-override-local
OPENAI_API_KEY=must-not-override-local
COMPOSE_PROJECT_NAME=separate-database
''')
    content = module.prepare_origins().read_text()
    assert content == ('FLYLEAF_CRAIOVA_PUBLIC_URL=https://craiova.tailnet.test\n'
        'FLYLEAF_SIBIU_PUBLIC_URL=https://sibiu.tailnet.test\n')
