"""Explicitly provisioned airport connections; never discover a URL from a message."""
from app.config import settings
from app.core.exceptions import DomainError

AIRPORTS = {'craiova':'Aeroportul Craiova', 'sibiu':'Aeroportul Sibiu',
    'cluj':'Aeroportul Cluj', 'iasi':'Aeroportul Iași'}

AIRPORT_PROFILES = {
    'craiova': {'iata':'CRA','icao':'LRCV','city':'Craiova','country':'România','latitude':44.3181,'longitude':23.8886,'color':'#176b73'},
    'sibiu': {'iata':'SBZ','icao':'LRSB','city':'Sibiu','country':'România','latitude':45.7858,'longitude':24.0856,'color':'#5950a2'},
    'cluj': {'iata':'CLJ','icao':'LRCL','city':'Cluj-Napoca','country':'România','latitude':46.7852,'longitude':23.6862,'color':'#a45c32'},
    'iasi': {'iata':'IAS','icao':'LRIA','city':'Iași','country':'România','latitude':47.1785,'longitude':27.6206,'color':'#32629b'},
}


def airport_profile(identifier):
    return {'id':identifier,'name':AIRPORTS.get(identifier,identifier),**AIRPORT_PROFILES.get(identifier,{})}


def legacy_peer():
    return 'sibiu' if settings.airport_id == 'craiova' else 'craiova'


def peer_urls():
    if settings.exchange_peers:
        if any(key not in AIRPORTS or key == settings.airport_id or not value.startswith(('http://','https://'))
               for key, value in settings.exchange_peers.items()):
            raise DomainError('Configurația legăturilor între aeroporturi este invalidă.', 503)
        return {key:value.rstrip('/') for key,value in settings.exchange_peers.items()}
    return {legacy_peer():settings.exchange_url.rstrip('/')} if settings.exchange_url else {}


def trusted_peer_ids():
    return set(peer_urls()) if settings.exchange_peers else {legacy_peer()}


def peer_url(identifier=None):
    urls = peer_urls()
    identifier = identifier or (next(iter(urls)) if len(urls) == 1 else legacy_peer())
    if identifier not in urls:
        raise DomainError('Legătura cu aeroportul partener nu este configurată.', 503)
    return urls[identifier]
