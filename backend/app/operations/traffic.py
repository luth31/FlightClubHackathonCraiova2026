"""Bounded, cached read-only ADSB.lol adapter; positions are not flight schedules.

Public provider: https://www.adsb.lol/docs/open-data/api . Requests go only to
its fixed HTTPS origin. Airport coordinates are public; user data is never sent.
"""
from copy import deepcopy
from dataclasses import dataclass, field
from datetime import datetime, timezone
import json
import math
import threading
import time

import httpx

from app.operations.service import airport_for

CACHE_SECONDS = 30
MAX_STALE_SECONDS = 300
MAX_POSITION_AGE_SECONDS = 120
MAX_AIRCRAFT = 200
MAX_BYTES = 2_000_000
RADIUS_NM = 25
PROVIDER_ORIGIN = 'https://api.adsb.lol'
EMERGENCIES = {'general', 'lifeguard', 'minfuel', 'nordo', 'unlawful', 'downed'}
SURFACE_CATEGORIES = {'C1', 'C2', 'C3', 'C4', 'C5'}
SURFACE_TYPES = {'TWR', 'GND', 'GRND', 'SERV', 'EMER'}
ATTRIBUTION = {'name': 'ADSB.lol', 'url': 'https://www.adsb.lol/',
    'license': 'ODbL 1.0', 'license_url': 'https://opendatacommons.org/licenses/odbl/1-0/'}


def numeric(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        return None
    return float(value)


def clean_string(value, limit=40):
    return value.strip()[:limit] if isinstance(value, str) else None


def normalize_aircraft(payload, airport):
    if not isinstance(payload, dict) or not isinstance(payload.get('ac'), list):
        raise ValueError('Unexpected ADSB response shape')
    output = []
    for item in payload['ac'][:2000]:
        if not isinstance(item, dict):
            continue
        category = (clean_string(item.get('category')) or '').upper()
        aircraft_type = (clean_string(item.get('t')) or '').upper()
        # Surface vehicles and fixed beacons are not aircraft. Parked aircraft
        # remain eligible: altitude='ground' or zero speed is not this filter.
        if category in SURFACE_CATEGORIES or aircraft_type in SURFACE_TYPES:
            continue
        lat, lon = numeric(item.get('lat')), numeric(item.get('lon'))
        age = numeric(item.get('seen_pos'))
        if lat is None or lon is None or not -90 <= lat <= 90 or not -180 <= lon <= 180:
            continue
        if age is None or not 0 <= age <= MAX_POSITION_AGE_SECONDS:
            continue
        # Provider is a circle endpoint; enforce a loose local distance bound too.
        distance_nm = math.hypot((lon-airport['lon'])*math.cos(math.radians(airport['lat']))*60,
                                 (lat-airport['lat'])*60)
        if distance_nm > RADIUS_NM+1:
            continue
        identifier = clean_string(item.get('hex'), 16)
        if not identifier:
            continue
        emergency_code = (clean_string(item.get('emergency')) or 'none').lower()
        squawk = clean_string(item.get('squawk'), 4)
        emergency = emergency_code in EMERGENCIES or squawk in {'7500', '7600', '7700'}
        ground = item.get('alt_baro') == 'ground'
        geometric = numeric(item.get('alt_geom'))
        barometric = numeric(item.get('alt_baro'))
        altitude = airport['elevation_m'] if ground else (geometric if geometric is not None else barometric)
        altitude = altitude if ground or altitude is None else altitude*0.3048
        heading, speed = numeric(item.get('track')), numeric(item.get('gs'))
        output.append({'id': 'adsb-'+identifier, 'hex': identifier, 'callsign': clean_string(item.get('flight')) or identifier.upper(),
            'registration': clean_string(item.get('r')), 'aircraft_type': clean_string(item.get('t')),
            'position': {'lat': lat, 'lon': lon, 'altitude_m': altitude, 'heading': heading % 360 if heading is not None else None},
            'altitude_reference': 'airport_elevation' if ground else ('geometric_ellipsoid' if geometric is not None else 'barometric_pressure'),
            'ground': ground, 'ground_speed_knots': max(0, speed) if speed is not None else None,
            'position_age_seconds': age, 'emergency': emergency, 'emergency_code': emergency_code,
            'squawk': squawk, 'severity': 'red' if emergency else 'neutral',
            'delay_minutes': None, 'delay_basis': 'unavailable', 'simulated': False})
        if len(output) >= MAX_AIRCRAFT:
            break
    return output


def fetch_payload(airport):
    url = f"{PROVIDER_ORIGIN}/v2/point/{airport['lat']}/{airport['lon']}/{RADIUS_NM}"
    started = time.monotonic()
    with httpx.Client(timeout=httpx.Timeout(6, connect=3), follow_redirects=False, trust_env=False) as client:
        with client.stream('GET', url, headers={'Accept': 'application/json', 'User-Agent': 'FlyLeaf-airport-demo/1.0'}) as response:
            response.raise_for_status()
            declared = response.headers.get('content-length')
            if declared and int(declared) > MAX_BYTES:
                raise ValueError('ADSB response too large')
            chunks, length = [], 0
            for chunk in response.iter_bytes():
                if time.monotonic()-started > 10:
                    raise httpx.TimeoutException('ADSB response exceeded its time budget')
                length += len(chunk)
                if length > MAX_BYTES:
                    raise ValueError('ADSB response too large')
                chunks.append(chunk)
    return json.loads(b''.join(chunks))


@dataclass
class CacheEntry:
    lock: threading.Lock = field(default_factory=threading.Lock)
    aircraft: list | None = None
    fetched_monotonic: float | None = None
    fetched_at: str | None = None
    retry_at: float = 0
    failures: int = 0
    error: str | None = None


# The tenant set is fixed and public; untrusted input cannot grow the cache.
_cache = {key: CacheEntry() for key in ('craiova', 'sibiu')}


def _response(entry, now):
    age = max(0, now-entry.fetched_monotonic) if entry.fetched_monotonic is not None else None
    usable = entry.aircraft is not None and age is not None and age <= MAX_STALE_SECONDS
    status = 'fresh' if usable and not entry.error and age <= CACHE_SECONDS else ('stale' if usable else 'unavailable')
    aircraft = deepcopy(entry.aircraft) if usable else []
    for item in aircraft:
        item['position_age_seconds'] += age
        item['stale'] = status != 'fresh' or item['position_age_seconds'] > CACHE_SECONDS
    notice = 'Poziții ADS-B publice. Sursa nu furnizează orare, întârzieri sau porți; acoperirea nu este completă.'
    if status == 'stale':
        notice = 'Sursa nu răspunde. Sunt afișate ultimele poziții cunoscute, fără extrapolare. ' + notice
    if status == 'unavailable':
        notice = 'Traficul live este indisponibil; absența pozițiilor nu înseamnă absența aeronavelor.'
    return {'source': 'adsb.lol', 'mode': 'live', 'simulated': False, 'status': status,
        'fetched_at': entry.fetched_at, 'age_seconds': round(age, 1) if age is not None else None,
        'poll_after_seconds': max(1, math.ceil(entry.retry_at-now)), 'aircraft': aircraft,
        'notice': notice, 'attribution': ATTRIBUTION, 'radius_nm': RADIUS_NM,
        'error': entry.error, 'schedule_data_available': False}


def get_traffic(user):
    airport = airport_for(user)
    entry = _cache[airport['id']]
    # Single-flight: simultaneous browsers share one provider request per cache period.
    with entry.lock:
        now = time.monotonic()
        if now >= entry.retry_at:
            try:
                aircraft = normalize_aircraft(fetch_payload(airport), airport)
                now = time.monotonic()
                entry.aircraft, entry.fetched_monotonic = aircraft, now
                entry.fetched_at = datetime.now(timezone.utc).isoformat()
                entry.failures, entry.error = 0, None
                entry.retry_at = now+CACHE_SECONDS
            except (httpx.HTTPError, ValueError, TypeError, OverflowError):
                now = time.monotonic()
                entry.failures += 1
                entry.error = 'provider_unavailable'
                entry.retry_at = now+min(300, CACHE_SECONDS*2**min(entry.failures-1, 4))
        return _response(entry, now)
