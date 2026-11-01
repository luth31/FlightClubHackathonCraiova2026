"""Explicit browser origins for alternate entrances to the same Keycloak realm.

Account/session ownership always uses the primary issuer. Only an allowlisted
entrance may select a different browser issuer, callback and secure cookie.
"""
from dataclasses import dataclass
from urllib.parse import urlsplit

from app.config import settings


@dataclass(frozen=True)
class IdentityOrigin:
    issuer: str
    redirect_uri: str
    frontend_url: str
    secure: bool


def primary_origin():
    return IdentityOrigin(settings.oidc_issuer, settings.oidc_redirect_uri,
        settings.oidc_frontend_url, settings.cookie_secure)


def configured_origins():
    origins = [primary_origin()]
    for value in settings.oidc_extra_origins:
        parsed = urlsplit(value)
        if (parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password
                or parsed.path or parsed.query or parsed.fragment):
            raise ValueError('Additional identity origins must be exact HTTPS origins without a path.')
        # The same realm, never a second identity installation.
        origins.append(IdentityOrigin(value + urlsplit(settings.oidc_issuer).path,
            value + '/api/auth/oidc/callback', value + '/', True))
    return origins


def request_origin(request):
    if request is None:
        return primary_origin()
    host = request.headers.get('host', '').lower()
    for origin in configured_origins():
        if host == urlsplit(origin.frontend_url).netloc.lower():
            return origin
    return primary_origin()


def transaction_origin(transaction):
    for origin in configured_origins():
        if (origin.issuer == transaction.issuer and origin.redirect_uri == transaction.redirect_uri
                and transaction.client_id == settings.oidc_client_id):
            return origin
    raise ValueError('Unregistered identity origin')


def provider_headers(issuer):
    parsed = urlsplit(issuer)
    return {'Host': parsed.netloc, 'X-Forwarded-Host': parsed.netloc,
        'X-Forwarded-Proto': parsed.scheme,
        'X-Forwarded-Port': str(parsed.port or (443 if parsed.scheme == 'https' else 80))}
