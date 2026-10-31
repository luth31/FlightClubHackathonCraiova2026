"""Authorization-code OIDC for a pinned Keycloak realm, with S256 PKCE.

Only the configured issuer and its same-realm endpoints are trusted. Provider
roles, email and usernames never provision accounts or grant application roles.
"""
import base64
import hashlib
import hmac
import json
import logging
import math
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode, urlsplit
from uuid import NAMESPACE_URL, uuid5

import httpx
import jwt
from sqlalchemy import delete

from app.config import settings
from app.core.security import token_hash
from app.identity.models import LoginTransaction
from app.people.models import User


DEMO_USER_IDS = ('admin', 'manager', 'reviewer', 'finance', 'hr', 'technician')
FLOW_SECONDS = 300
logger = logging.getLogger(__name__)


class IdentityError(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def now():
    return datetime.now(timezone.utc)


def subject_map():
    if settings.oidc_subject_map is not None:
        return settings.oidc_subject_map
    return {str(uuid5(NAMESPACE_URL, f'aerodesk:{settings.airport_id}:{user_id}')):user_id
        for user_id in DEMO_USER_IDS}


def provider_logout_url():
    validate_configuration()
    # An exact registered redirect and client identify the RP. No ID token is
    # persisted or placed in the URL; Keycloak can ask for logout confirmation.
    return settings.oidc_issuer + '/protocol/openid-connect/logout?' + urlencode({
        'client_id':settings.oidc_client_id,
        'post_logout_redirect_uri':settings.oidc_frontend_url,
        'ui_locales':'ro'})


def validate_configuration():
    if settings.auth_mode != 'oidc':
        return
    for value in (settings.oidc_issuer, settings.oidc_redirect_uri, settings.oidc_frontend_url):
        parsed = urlsplit(value)
        if (parsed.scheme not in ('http', 'https') or not parsed.hostname
                or parsed.username or parsed.password or parsed.query or parsed.fragment
                or (parsed.scheme == 'http' and parsed.hostname not in ('localhost', '127.0.0.1', '::1'))):
            raise IdentityError('configuration_error')
    internal = urlsplit(settings.oidc_internal_issuer or settings.oidc_issuer)
    if (internal.scheme not in ('http', 'https') or not internal.hostname
            or internal.username or internal.password or internal.query or internal.fragment):
        raise IdentityError('configuration_error')
    if not settings.oidc_client_id or settings.oidc_issuer.endswith('/'):
        raise IdentityError('configuration_error')
    if (any(urlsplit(value).scheme == 'https' for value in
            (settings.oidc_issuer, settings.oidc_redirect_uri, settings.oidc_frontend_url))
            and not settings.cookie_secure):
        raise IdentityError('configuration_error')


def provider_json(method, url, data=None):
    """Bounded transport; never follow redirects to a different trust boundary."""
    try:
        with httpx.Client(timeout=8, follow_redirects=False, trust_env=False) as client:
            with client.stream(method, url, data=data, headers={'Accept':'application/json'}) as response:
                response.raise_for_status()
                chunks, size = [], 0
                for chunk in response.iter_bytes():
                    size += len(chunk)
                    if size > 1_000_000:
                        raise IdentityError('provider_unavailable')
                    chunks.append(chunk)
                result = json.loads(b''.join(chunks))
                if not isinstance(result, dict):
                    raise ValueError('Object expected')
                return result
    except (httpx.HTTPError, ValueError, TypeError) as exc:
        raise IdentityError('provider_unavailable') from exc


def transport_url(public_url):
    prefix = settings.oidc_issuer + '/'
    if not isinstance(public_url, str) or not public_url.startswith(prefix):
        raise IdentityError('invalid_provider')
    parsed = urlsplit(public_url)
    if parsed.query or parsed.fragment or '/..' in parsed.path or '%' in parsed.path:
        raise IdentityError('invalid_provider')
    return (settings.oidc_internal_issuer or settings.oidc_issuer).rstrip('/') + public_url[len(settings.oidc_issuer):]


def discovery():
    validate_configuration()
    internal = (settings.oidc_internal_issuer or settings.oidc_issuer).rstrip('/')
    metadata = provider_json('GET', internal + '/.well-known/openid-configuration')
    if metadata.get('issuer') != settings.oidc_issuer:
        raise IdentityError('invalid_provider')
    for name in ('authorization_endpoint', 'token_endpoint', 'jwks_uri'):
        transport_url(metadata.get(name))
    if 'S256' not in metadata.get('code_challenge_methods_supported', []):
        raise IdentityError('invalid_provider')
    return metadata


def start_login(db):
    metadata = discovery()
    state, browser, nonce, verifier = (secrets.token_urlsafe(48) for _ in range(4))
    created = now()
    db.execute(delete(LoginTransaction).where(LoginTransaction.expires_at <= created.isoformat()))
    db.add(LoginTransaction(state_hash=token_hash(state), browser_hash=token_hash(browser),
        nonce=nonce, verifier=verifier, issuer=settings.oidc_issuer, client_id=settings.oidc_client_id,
        redirect_uri=settings.oidc_redirect_uri, created_at=created.isoformat(),
        expires_at=(created + timedelta(seconds=FLOW_SECONDS)).isoformat()))
    db.commit()
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode('ascii')).digest()).rstrip(b'=').decode()
    query = urlencode({'client_id':settings.oidc_client_id, 'response_type':'code',
        'redirect_uri':settings.oidc_redirect_uri, 'scope':'openid profile', 'state':state,
        'nonce':nonce, 'code_challenge':challenge, 'code_challenge_method':'S256',
        'prompt':'login', 'max_age':'0', 'ui_locales':'ro'})
    return metadata['authorization_endpoint'] + '?' + query, browser


def consume_transaction(db, state, browser):
    if not state or not browser:
        raise IdentityError('invalid_state')
    # One atomic delete commits before the network exchange: concurrent callbacks
    # can never redeem the same transaction twice, including after failed tokens.
    row = db.execute(delete(LoginTransaction).where(
        LoginTransaction.state_hash == token_hash(state),
        LoginTransaction.browser_hash == token_hash(browser),
        LoginTransaction.expires_at > now().isoformat(),
        LoginTransaction.issuer == settings.oidc_issuer,
        LoginTransaction.client_id == settings.oidc_client_id,
        LoginTransaction.redirect_uri == settings.oidc_redirect_uri,
    ).returning(LoginTransaction)).scalar_one_or_none()
    db.commit()
    if row is None:
        raise IdentityError('invalid_state')
    return row


def validate_id_token(encoded, jwks, transaction):
    stage = 'token_format'
    try:
        if not isinstance(encoded, str) or len(encoded) > 32_768:
            raise ValueError('Missing or excessive ID token')
        stage = 'token_header'
        header = jwt.get_unverified_header(encoded)
        if header.get('alg') != 'RS256' or not header.get('kid') or header.get('crit'):
            raise ValueError('Unsupported token header')
        stage = 'signing_key'
        keys = [key for key in jwks.get('keys', []) if isinstance(key, dict)
            and key.get('kid') == header['kid'] and key.get('kty') == 'RSA'
            and key.get('use', 'sig') == 'sig' and key.get('alg', 'RS256') == 'RS256']
        if len(keys) != 1:
            raise ValueError('Signing key is not unique')
        key = jwt.PyJWK.from_dict(keys[0], algorithm='RS256').key
        stage = 'signature_and_claims'
        claims = jwt.decode(encoded, key, algorithms=['RS256'], audience=settings.oidc_client_id,
            issuer=settings.oidc_issuer, leeway=30,
            options={'require':['iss','aud','sub','iat','exp','nonce','auth_time']})
        stage = 'nonce'
        if not hmac.compare_digest(claims['nonce'], transaction.nonce):
            raise ValueError('Nonce mismatch')
        stage = 'authorized_party'
        audience = claims['aud']
        if (claims.get('azp', settings.oidc_client_id) != settings.oidc_client_id
                or isinstance(audience, list) and len(audience) > 1 and 'azp' not in claims):
            raise ValueError('Authorized party mismatch')
        stage = 'authentication_freshness'
        auth_time = claims['auth_time']
        if (not isinstance(auth_time, (int, float)) or isinstance(auth_time, bool)
                or not math.isfinite(auth_time)
                or auth_time < datetime.fromisoformat(transaction.created_at).timestamp() - 30
                or auth_time > now().timestamp() + 30):
            raise ValueError('Fresh authentication required')
        return claims
    except (jwt.PyJWTError, ValueError, TypeError, KeyError, OverflowError) as exc:
        # Log only our fixed stage, exception class and a known claim NAME.
        # Never log the exception text, token, code, nonce, state or claim values.
        missing = getattr(exc, 'claim', None)
        missing = missing if missing in ('iss','aud','sub','iat','exp','nonce','auth_time') else '-'
        logger.warning('OIDC validation rejected: stage=%s exception=%s missing_claim=%s',
            stage, type(exc).__name__, missing)
        raise IdentityError('invalid_token') from exc


def complete_login(db, transaction, code):
    metadata = discovery()
    tokens = provider_json('POST', transport_url(metadata['token_endpoint']), {
        'grant_type':'authorization_code', 'code':code, 'client_id':transaction.client_id,
        'redirect_uri':transaction.redirect_uri, 'code_verifier':transaction.verifier})
    jwks = provider_json('GET', transport_url(metadata['jwks_uri']))
    claims = validate_id_token(tokens.get('id_token'), jwks, transaction)
    user_id = subject_map().get(claims['sub'])
    user = db.get(User, user_id) if user_id else None
    if not user or not user.active or user.airport_id != settings.airport_id:
        raise IdentityError('account_unavailable')
    return user
