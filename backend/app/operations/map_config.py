"""Browser map configuration, available only inside an authenticated workspace.

This must be a Google Maps browser key restricted to the deployment referrers and
Map Tiles API. It is intentionally supplied to the renderer, unlike server keys.
"""
from fastapi import APIRouter, Depends
from app.config import settings
from app.core.security import current_user

router = APIRouter(prefix='/api/operations', tags=['operations'])


@router.get('/map-config')
def map_config(user=Depends(current_user)):
    key = settings.google_maps_api_key.get_secret_value()
    return {
        'airport_id': user.airport_id,
        'google_api_key': key or None,
        'photorealistic_available': bool(key),
        'default_mode': 'photorealistic' if key else 'model',
        'cache_policy': 'provider-headers-and-session-memory',
    }
