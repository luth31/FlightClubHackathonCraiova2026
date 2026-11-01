#!/usr/bin/env python3
"""Apply Compose origins to existing local Keycloak realms without resetting users.

Run with backend/.venv/bin/python. Requires local Docker administration access.
Stops this project's services, backs up state/identity volumes, applies the exact
configured origins, then restarts. Temporary bootstrap access is removed.
"""
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import time
from urllib.parse import urlsplit

import httpx

ROOT = Path(__file__).resolve().parents[1]
AIRPORTS = {'craiova': ('dunarea', 8180), 'sibiu': ('carpati', 8181)}
COMPOSE = ['docker', 'compose']
ALIAS_ONLY = False


def command(args, *, env=None):
    if args[:2] == ['docker', 'compose']:
        args = COMPOSE + args[2:]
    result = subprocess.run(args, cwd=ROOT, env=env, capture_output=True, text=True)
    if result.returncode:
        # Docker output can contain environment values. Keep diagnostics private.
        diagnostic = ROOT / '.runtime/identity-configuration-error.log'
        diagnostic.parent.mkdir(exist_ok=True)
        diagnostic.write_text(result.stdout + result.stderr)
        diagnostic.chmod(0o600)
        raise RuntimeError(f'Command failed: {args[:3]}. See {diagnostic}.')
    return result.stdout


def origin_for(config, airport):
    environment = config['services'][airport + '-identity']['environment']
    origin = environment['FLYLEAF_PUBLIC_URL']
    parsed = urlsplit(origin)
    if (parsed.scheme not in ('http', 'https') or not parsed.hostname
            or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment
            or (parsed.scheme == 'http' and parsed.hostname not in ('127.0.0.1', 'localhost'))):
        raise ValueError(f'{airport}: use an HTTPS origin without a path or trailing slash (HTTP is local-only).')
    api = config['services'][airport + '-api']['environment']
    if parsed.scheme == 'https' and str(api.get('FLYLEAF_COOKIE_SECURE')).lower() != 'true':
        raise ValueError('HTTPS requires FLYLEAF_COOKIE_SECURE=true.')
    return origin


def configure(config, airport, bootstrap, secret):
    legacy, _ = AIRPORTS[airport]
    identity = config['services'][airport + '-identity']
    port = next(p['published'] for p in identity['ports'] if p['target'] == 8080)
    relative_path = identity['environment'].get('KC_HTTP_RELATIVE_PATH', '').rstrip('/')
    origin = origin_for(config, airport)
    client = httpx.Client(base_url=f'http://127.0.0.1:{port}{relative_path}/', timeout=20, trust_env=False)
    deadline = time.monotonic() + 150
    while True:
        try:
            if client.get('realms/master/.well-known/openid-configuration').status_code == 200:
                break
        except httpx.HTTPError:
            pass
        if time.monotonic() > deadline:
            raise RuntimeError(f'{airport}: identity service did not become ready.')
        time.sleep(1)
    token = client.post('realms/master/protocol/openid-connect/token', data={
        'grant_type': 'client_credentials', 'client_id': bootstrap, 'client_secret': secret})
    token.raise_for_status()
    client.headers['Authorization'] = 'Bearer ' + token.json()['access_token']

    def request(method, path, **kwargs):
        response = client.request(method, path, **kwargs)
        if response.status_code >= 400:
            raise RuntimeError(f'{airport}: identity configuration request failed ({response.status_code}).')
        return response.json() if response.content else None

    try:
        # An imported realm is not reapplied on restart. Update the existing one.
        current = client.get(f'admin/realms/{airport}')
        old_prefix = f'admin/realms/{airport}'
        if current.status_code == 404:
            old_prefix = f'admin/realms/{legacy}'
            current = client.get(old_prefix)
        current.raise_for_status()
        realm = current.json()
        realm.update(realm=airport, displayName=f'FlyLeaf · Aeroportul {airport.title()}', loginTheme='flyleaf')
        request('PUT', old_prefix, json=realm)
        prefix = f'admin/realms/{airport}'
        web = request('GET', prefix + '/clients', params={'clientId': 'flyleaf-web'})
        if len(web) != 1:
            raise RuntimeError(f'{airport}: expected one existing FlyLeaf browser client.')
        web = request('GET', prefix + '/clients/' + web[0]['id'])
        previous = web['redirectUris']
        if not previous or any(not value.endswith('/api/auth/oidc/callback') for value in previous):
            raise RuntimeError(f'{airport}: ambiguous prior origin; configure this custom deployment manually.')
        if ALIAS_ONLY and origin + '/api/auth/oidc/callback' not in previous:
            raise RuntimeError(f'{airport}: primary local callback is missing; reconcile this installation first.')
        prior_origin = previous[0].removesuffix('/api/auth/oidc/callback')
        aliases = json.loads(config['services'][airport + '-api']['environment'].get('FLYLEAF_OIDC_EXTRA_ORIGINS', '[]'))
        for alias in aliases:
            parsed = urlsplit(alias)
            if (parsed.scheme != 'https' or not parsed.hostname or parsed.path or parsed.query
                    or parsed.fragment or parsed.username or parsed.password):
                raise ValueError('Additional identity origins must be exact HTTPS origins.')
        origins = list(dict.fromkeys([origin, *aliases]))
        web.update(redirectUris=[value + '/api/auth/oidc/callback' for value in origins], webOrigins=origins)
        web.setdefault('attributes', {})['post.logout.redirect.uris'] = '##'.join(value + '/' for value in origins)
        request('PUT', prefix + '/clients/' + web['id'], json=web)
        if ALIAS_ONLY:
            print(f'{airport.title()}: local and Tailscale callbacks registered on the existing realm.', flush=True)
            return
        # User-management clients keep their IDs and role grants; preserve passwords.
        provision = request('GET', prefix + '/clients', params={'clientId': 'flyleaf-provisioner'})
        if len(provision) != 1:
            raise RuntimeError(f'{airport}: expected the existing provisioning client.')
        provision = request('GET', prefix + '/clients/' + provision[0]['id'])
        provision['secret'] = config['services'][airport + '-api']['environment']['FLYLEAF_KEYCLOAK_PROVISIONING_CLIENT_SECRET']
        request('PUT', prefix + '/clients/' + provision['id'], json=provision)
        first = 0
        while True:
            users = request('GET', prefix + '/users', params={'first': first, 'max': 100})
            for user in users:
                changed = False
                attrs = user.get('attributes', {})
                if attrs.get('flyleaf_airport_id') == [legacy]:
                    attrs['flyleaf_airport_id'] = [airport]
                    user['attributes'] = attrs
                    changed = True
                if user.get('email', '').endswith('@' + legacy + '.example'):
                    user['email'] = user['email'].removesuffix('@' + legacy + '.example') + '@' + airport + '.example'
                    changed = True
                if changed:
                    request('PUT', prefix + '/users/' + user['id'], json=user)
            if len(users) < 100:
                break
            first += 100
        # Alembic performs the tenant rename. Rebind only the previous configured
        # issuer of this very realm; foreign issuers never become trusted aliases.
        program = '''from alembic import command
from alembic.config import Config
from app.database import engine
from sqlalchemy import text
from app.config import settings
import os
command.upgrade(Config('alembic.ini'), 'head')
with engine.begin() as db:
    db.execute(text('UPDATE users SET identity_issuer=:new WHERE airport_id=:airport AND identity_issuer=:old'),
        dict(new=settings.oidc_issuer, old=os.environ['PREVIOUS_ISSUER'], airport=settings.airport_id))
    unknown=db.execute(text('SELECT count(*) FROM users WHERE airport_id=:airport AND identity_issuer IS NOT NULL AND identity_issuer != :issuer'),
        dict(airport=settings.airport_id, issuer=settings.oidc_issuer)).scalar()
    if unknown: raise RuntimeError('Existing accounts reference another issuer; explicit reconciliation required.')
    db.execute(text('DELETE FROM sessions'))
    db.execute(text('DELETE FROM oidc_login_transactions'))
'''
        command(['docker', 'compose', 'run', '--rm', '--no-deps', '-T', '-e',
                 f'PREVIOUS_ISSUER={prior_origin}/auth/realms/{airport}', airport + '-api', 'python', '-c', program])
        print(f'{airport.title()}: account IDs and passwords retained; browser origin {origin}', flush=True)
    finally:
        # Also remove credentials left by an interrupted previous invocation.
        temporary = request('GET', 'admin/realms/master/clients')
        # Deleting the active client revokes its token; remove it last.
        for item in sorted(temporary, key=lambda value: value.get('clientId') == bootstrap):
            if re.fullmatch(r'flyleaf-config-[0-9a-f]{12}', item.get('clientId', '')):
                request('DELETE', 'admin/realms/master/clients/' + item['id'])
        client.close()


def main():
    config = json.loads(command(['docker', 'compose', 'config', '--format', 'json']))
    for airport in AIRPORTS:
        origin_for(config, airport)
    volumes = {name: entry.get('name', f'{config["name"]}_{name}') for name, entry in config['volumes'].items()}
    existing = set(command(['docker', 'volume', 'ls', '--format', '{{.Name}}']).splitlines())
    required = [volumes[f'{airport}-{kind}'] for airport in AIRPORTS for kind in ('state', 'identity')]
    if not all(name in existing for name in required):
        raise RuntimeError('Start a fresh installation first, or migrate all four existing volumes. No empty volumes were created.')
    command(['docker', 'compose', 'stop'])
    stamp = time.strftime('%Y%m%d%H%M%S') + '-' + secrets.token_hex(2)
    for volume in required:
        backup = f'{volume}-backup-{stamp}'
        command(['docker', 'volume', 'create', backup])
        command(['docker', 'run', '--rm', '-v', volume + ':/source:ro', '-v', backup + ':/target',
                 'nginx:1.28-alpine', 'sh', '-c', 'cp -a /source/. /target/'])
    print(f'Four stopped-volume backups created (suffix backup-{stamp}).', flush=True)
    bootstrap, secret = 'flyleaf-config-' + secrets.token_hex(6), secrets.token_urlsafe(48)
    env = {**os.environ, 'FLYLEAF_BOOTSTRAP_SECRET': secret}
    for airport in AIRPORTS:
        # File bind mounts leave empty placeholders in the underlying data
        # volume. A renamed import otherwise makes --import-realm parse these
        # obsolete empty files on the next normal startup.
        command(['docker', 'run', '--rm', '-v', volumes[airport + '-identity'] + ':/identity',
                 'nginx:1.28-alpine', 'sh', '-c',
                 'for file in /identity/import/*-realm.json; do '
                 'if [ -f "$file" ] && [ ! -s "$file" ]; then rm "$file"; fi; done'])
        command(['docker', 'run', '--rm', '-e', 'FLYLEAF_BOOTSTRAP_SECRET', '-e', 'JAVA_OPTS_KC_HEAP=-Xms128m -Xmx384m',
                 '-v', volumes[airport + '-identity'] + ':/opt/keycloak/data', 'quay.io/keycloak/keycloak:26.8.1',
                 'bootstrap-admin', 'service', '--client-id', bootstrap, '--client-secret:env', 'FLYLEAF_BOOTSTRAP_SECRET',
                 '--no-prompt', '--db', 'dev-file'], env=env)
    # Skip realm import while renaming existing realms: importing a new name first
    # would create duplicate fixture subjects and hide the original accounts.
    for airport in AIRPORTS:
        command(['docker', 'compose', 'run', '-d', '--no-deps', '--service-ports', '--name', 'flyleaf-config-' + airport,
                 airport + '-identity', 'start-dev'])
    try:
        for airport in AIRPORTS:
            configure(config, airport, bootstrap, secret)
    finally:
        for airport in AIRPORTS:
            command(['docker', 'rm', '-f', 'flyleaf-config-' + airport])
    command(['docker', 'compose', 'up', '-d'])
    with httpx.Client(timeout=3, trust_env=False) as client:
        for airport in AIRPORTS:
            identity = config['services'][airport + '-identity']
            port = next(p['published'] for p in identity['ports'] if p['target'] == 8080)
            path = identity['environment'].get('KC_HTTP_RELATIVE_PATH', '').rstrip('/')
            issuer = config['services'][airport + '-api']['environment']['FLYLEAF_OIDC_ISSUER']
            deadline = time.monotonic() + 150
            while True:
                try:
                    response = client.get(f'http://127.0.0.1:{port}{path}/realms/{airport}/.well-known/openid-configuration')
                    if response.status_code == 200 and response.json().get('issuer') == issuer:
                        break
                except (httpx.HTTPError, ValueError):
                    pass
                if time.monotonic() > deadline:
                    raise RuntimeError(f'{airport}: final identity startup failed; inspect Compose logs.')
                time.sleep(1)
    print('Identity configuration complete. Sign in again at the configured origins.', flush=True)


if __name__ == '__main__':
    import argparse
    import fcntl
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tailscale', action='store_true', help='Add Tailscale browser origins to the existing local installation.')
    args = parser.parse_args()
    if args.tailscale:
        ALIAS_ONLY = True
        if not (ROOT / '.env.tailscale').is_file():
            parser.error('Create .env.tailscale from deploy/tailscale.env.example first.')
        COMPOSE += ['--project-name', 'flyleaf', '-f', 'compose.yaml', '-f', 'compose.tailscale.yaml']
        if (ROOT / '.env').is_file():
            COMPOSE += ['--env-file', '.env']
        from tailscale_origins import prepare_origins
        COMPOSE += ['--env-file', str(prepare_origins())]
    lock_path = ROOT / '.runtime/identity-configuration.lock'
    lock_path.parent.mkdir(exist_ok=True)
    with lock_path.open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        main()
