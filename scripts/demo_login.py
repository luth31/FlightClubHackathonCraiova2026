"""Name/password entry point for the four loopback demo instances only."""
from contextlib import closing
from pathlib import Path
import sqlite3
import sys
import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from app.core.login_names import normalize_login

INVALID = {'detail': 'Contul sau parola nu este corectă.'}


def authenticate(nodes, payload, hostname):
    if hostname not in ('127.0.0.1', 'localhost'):
        return 403, INVALID, []
    if (not isinstance(payload, dict) or set(payload) != {'user_id', 'password'}
        or not all(isinstance(payload[key], str) and 0 < len(payload[key]) <= 200 for key in ('user_id', 'password'))):
        return 422, {'detail': 'Introdu numele și parola contului.'}, []
    identifier = normalize_login(payload['user_id'])
    if not identifier or not payload['password'].strip():
        return 401, INVALID, []
    matches = []
    try:
        for airport, node in nodes.items():
            path = Path(node['env']['FLYLEAF_DATABASE_URL'].removeprefix('sqlite:///'))
            with closing(sqlite3.connect(path.as_uri() + '?mode=ro', uri=True)) as db:
                for user_id, name, email in db.execute('SELECT id, name, email FROM users WHERE airport_id=? AND active=1', (airport,)):
                    # Names/emails resolve globally. Local IDs such as "admin" repeat
                    # between airports, so they are deliberately not global logins.
                    if identifier in {normalize_login(name), normalize_login(email or '')}:
                        matches.append((airport, user_id))
    except sqlite3.Error:
        return 503, {'detail': 'Conectarea nu este disponibilă momentan. Încearcă din nou.'}, []
    if len(matches) != 1:
        return 401, INVALID, []
    airport, user_id = matches[0]
    node = nodes[airport]
    try:
        response = httpx.post(f'http://127.0.0.1:{node["api_port"]}/api/auth/login',
            json={'user_id': user_id, 'password': payload['password']}, timeout=10, follow_redirects=False)
        if response.status_code != 200:
            return (401 if response.status_code in (401, 403, 422) else 503), INVALID, []
        result = response.json()
        if result.get('current_user', {}).get('airport_id') != airport:
            return 503, INVALID, []
        cookies = [cookie for cookie in response.headers.get_list('set-cookie')
            if cookie.startswith(f'flyleaf_session_{airport}=') and 'httponly' in cookie.lower()]
        if not cookies:
            return 503, INVALID, []
        # Cookies have no port scope: all demo hosts use the same loopback hostname.
        # Forward the target's HttpOnly cookie, never the password in a URL or storage.
        return 200, {'redirect_url': f'http://{hostname}:{node["web_port"]}/'}, cookies
    except (httpx.HTTPError, ValueError):
        return 503, {'detail': 'Aeroportul contului nu răspunde. Încearcă din nou.'}, []
