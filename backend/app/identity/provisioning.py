"""Backend-only, bounded Keycloak user provisioning; no provider roles are imported."""
import secrets
from urllib.parse import urlsplit, quote, urlencode, urljoin
import httpx
from app.config import settings
from app.core.exceptions import DomainError


class ProvisioningFailure(DomainError):
    """Preserve an already confirmed identity when credential setup fails."""
    def __init__(self, message, status, subject):
        super().__init__(message, status)
        self.identity_subject = subject


def username(person):
    return person.email.strip().lower().split('@', 1)[0]


def sign_in_url(person):
    if (settings.auth_mode != 'oidc' or not person.active or not person.identity_subject
        or person.identity_issuer != settings.oidc_issuer
        or getattr(person, 'provisioning_status', 'ready') != 'ready'):
        return None
    return urljoin(settings.oidc_frontend_url, '/api/auth/oidc/login') + '?' + urlencode({'login_hint': username(person)})


def request(method, url, **kwargs):
    try:
        with httpx.Client(timeout=8, follow_redirects=False, trust_env=False) as client:
            response = client.request(method, url, **kwargs)
            if len(response.content) > 1_000_000:
                raise ValueError('Response too large')
            return response
    except (httpx.HTTPError, ValueError) as exc:
        raise DomainError('Serviciul de identitate nu este disponibil. Poți reîncerca.', 502) from exc


def connection():
    issuer = settings.oidc_internal_issuer or settings.oidc_issuer
    parsed = urlsplit(issuer)
    if (parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username
        or parsed.password or parsed.query or parsed.fragment or '/realms/' not in parsed.path
        or not settings.keycloak_provisioning_client_secret.get_secret_value()):
        raise DomainError('Provisionarea Keycloak necesită configurarea clientului de serviciu.', 503)
    base, realm = issuer.rsplit('/realms/', 1)
    if not realm or '/' in realm or '%' in realm:
        raise DomainError('Realm-ul pentru provisionare nu este valid.', 503)
    response = request('POST', issuer + '/protocol/openid-connect/token', data={
        'grant_type': 'client_credentials', 'client_id': settings.keycloak_provisioning_client_id,
        'client_secret': settings.keycloak_provisioning_client_secret.get_secret_value()})
    try:
        token = response.json()['access_token'] if response.status_code == 200 else None
        if not isinstance(token, str) or not token: raise ValueError()
    except (ValueError, KeyError, TypeError) as exc:
        raise DomainError('Clientul de provisionare Keycloak nu poate fi autentificat.', 502) from exc
    return f'{base}/admin/realms/{realm}/users', {'Authorization': f'Bearer {token}'}


def owned_user(base, headers, person):
    subject = getattr(person, 'identity_subject', None)
    if subject:
        if getattr(person, 'identity_issuer', None) != settings.oidc_issuer:
            raise DomainError('Identitatea contului aparține altei configurații Keycloak.', 409)
        response = request('GET', base + '/' + quote(subject, safe=''), headers=headers)
        if response.status_code == 404:
            raise DomainError('Identitatea asociată nu mai există. Solicită administratorului verificarea.', 409)
    else:
        response = request('GET', base, headers=headers, params={'username': username(person), 'exact': 'true'})
    try:
        users = response.json() if response.status_code == 200 else None
        if subject:
            if (not isinstance(users, dict) or users.get('id') != subject
                or not isinstance(users.get('username'), str) or not users['username']):
                raise ValueError()
            return users
        if not isinstance(users, list): raise ValueError()
        if not users: return None
        if (len(users) != 1 or users[0].get('username') != username(person)
            or (users[0].get('attributes', {}).get('aerodesk_user_id') != [person.id]
                or users[0].get('attributes', {}).get('aerodesk_airport_id') != [person.airport_id])
            or not isinstance(users[0].get('id'), str) or not users[0]['id']):
            raise DomainError('Identitatea existentă nu aparține acestui cont. Solicită administratorului verificarea.', 409)
        return users[0]
    except (ValueError, KeyError, TypeError) as exc:
        raise DomainError('Răspunsul serviciului de identitate nu poate fi verificat.', 502) from exc


def rename_username(person):
    if not getattr(person, 'identity_subject', None):
        raise DomainError('Contul nu are o identitate Keycloak asociată.', 409)
    base, headers = connection()
    existing = owned_user(base, headers, person)
    desired = username(person)
    if existing['username'] == desired: return False
    response = request('PUT', base + '/' + quote(person.identity_subject, safe=''), headers=headers,
        json={'username': desired})
    if response.status_code == 409:
        raise DomainError('Numele de utilizator este deja folosit. Alege o altă adresă de email.', 409)
    if response.status_code != 204:
        raise DomainError('Numele de utilizator Keycloak nu a putut fi actualizat.', 502)
    if owned_user(base, headers, person).get('username') != desired:
        raise DomainError('Numele de utilizator actualizat nu a putut fi confirmat.', 502)
    return True


def provision(person):
    base, headers = connection()
    existing = owned_user(base, headers, person)
    if not existing:
        from app.people.names import person_names
        names = person_names(person)
        first = ' '.join(part for part in (names['first_name'], names['middle_name']) if part)
        last = names['last_name']
        response = request('POST', base, headers=headers, json={'username': username(person),
            'firstName': first, 'lastName': last, 'email': person.email, 'enabled': True,
            'emailVerified': False, 'requiredActions': ['UPDATE_PASSWORD'],
            'attributes': {'aerodesk_user_id': [person.id], 'aerodesk_airport_id': [person.airport_id]}})
        if response.status_code not in (201, 409):
            raise DomainError('Contul Keycloak nu a putut fi creat. Poți reîncerca.', 502)
        existing = owned_user(base, headers, person)
        if not existing: raise DomainError('Contul Keycloak creat nu poate fi confirmat. Poți reîncerca.', 502)
    subject = existing['id']
    if getattr(person, 'identity_subject', None) and person.identity_subject != subject:
        raise DomainError('Identitatea existentă diferă de asocierea contului.', 409)
    if existing.get('username') != username(person):
        rename_username(person)
    user_url = base + '/' + quote(subject, safe='')
    if existing.get('enabled') is False:
        try:
            response = request('PUT', user_url, headers=headers, json={'enabled': True})
        except DomainError as exc:
            raise ProvisioningFailure(exc.message, exc.status, subject) from exc
        if response.status_code != 204:
            raise ProvisioningFailure('Contul Keycloak nu a putut fi reactivat.', 502, subject)
    if settings.keycloak_activation_email:
        try:
            response = request('PUT', user_url + '/execute-actions-email', headers=headers,
                params={'client_id': settings.oidc_client_id, 'redirect_uri': settings.oidc_frontend_url},
                json=['VERIFY_EMAIL', 'UPDATE_PASSWORD'])
        except DomainError:
            return {'subject': subject, 'invitation_status': 'failed'}
        return {'subject': subject, 'invitation_status': 'sent' if response.status_code == 204 else 'failed'}
    password = secrets.token_urlsafe(18)
    try:
        response = request('PUT', user_url + '/reset-password', headers=headers,
            json={'type': 'password', 'value': password, 'temporary': True})
    except DomainError as exc:
        raise ProvisioningFailure(exc.message, exc.status, subject) from exc
    if response.status_code != 204:
        raise ProvisioningFailure('Parola inițială nu a putut fi configurată. Poți reîncerca.', 502, subject)
    return {'subject': subject, 'temporary_password': password, 'invitation_status': 'temporary_password'}


def set_enabled(person):
    if person.identity_issuer != settings.oidc_issuer:
        raise DomainError('Identitatea contului aparține altei configurații Keycloak.', 409)
    base, headers = connection()
    existing = owned_user(base, headers, person)
    if not existing or existing['id'] != person.identity_subject:
        raise DomainError('Identitatea contului nu poate fi confirmată.', 409)
    response = request('PUT', base + '/' + quote(person.identity_subject, safe=''),
        headers=headers, json={'enabled': person.active})
    if response.status_code != 204:
        raise DomainError('Starea contului Keycloak nu a putut fi sincronizată.', 502)


def find_subject(person):
    base, headers = connection()
    existing = owned_user(base, headers, person)
    return existing['id'] if existing else None
