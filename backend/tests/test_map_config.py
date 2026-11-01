from pydantic import SecretStr
from app.config import settings


def test_map_configuration_requires_a_session(client):
    response = client.get('/api/operations/map-config')
    assert response.status_code == 401


def test_model_is_available_without_google_credentials(admin, monkeypatch):
    monkeypatch.setattr(settings, 'google_maps_api_key', SecretStr(''))
    response = admin.get('/api/operations/map-config')
    assert response.status_code == 200
    assert response.json()['google_api_key'] is None
    assert response.json()['photorealistic_available'] is False
    assert response.json()['default_mode'] == 'model'
    assert response.headers['cache-control'] == 'no-store'


def test_optional_browser_key_does_not_expose_server_credentials(admin, monkeypatch):
    monkeypatch.setattr(settings, 'google_maps_api_key', SecretStr('browser-map-key'))
    monkeypatch.setattr(settings, 'openai_api_key', SecretStr('private-server-key'))
    response = admin.get('/api/operations/map-config')
    assert response.json()['google_api_key'] == 'browser-map-key'
    assert response.json()['default_mode'] == 'photorealistic'
    assert response.json()['airport_id'] == 'craiova'
    assert 'private-server-key' not in response.text
