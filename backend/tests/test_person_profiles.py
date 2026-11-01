from datetime import datetime, timedelta, timezone
from io import BytesIO

from PIL import Image
import pytest
from sqlalchemy import delete
from conftest import login
from app.people import profile as profiles
from app.people.models import User, UserProfile


@pytest.fixture(autouse=True)
def clean_profiles(client, db):
    db.execute(delete(UserProfile)); db.commit()
    yield
    db.execute(delete(UserProfile)); db.commit()


def person(client, user_id):
    return next(item for item in client.get('/api/people').json()['items'] if item['id'] == user_id)


def photo_bytes():
    output = BytesIO()
    Image.new('RGB', (80, 40), '#316047').save(output, format='PNG')
    return output.getvalue()


def test_own_presence_persists_and_is_visible_to_colleagues(client):
    login(client, 'technician')
    before = person(client, 'technician')
    result = client.patch('/api/people/me/presence', json={'status': 'busy', 'duration_minutes': 60})
    assert result.status_code == 200, result.text
    assert result.json()['presence'] == 'busy'
    assert result.json()['presence_expires_at']
    assert client.get('/api/people/me/profile').json() == result.json()
    login(client, 'reviewer')
    colleague = person(client, 'technician')
    assert colleague['profile']['presence'] == 'busy'
    assert colleague['availability'] == before['availability']
    assert 'photo' not in colleague['profile']


def test_presence_and_message_expire_independently_using_real_time(client, monkeypatch):
    now = datetime(2026, 11, 1, 10, tzinfo=timezone.utc)
    monkeypatch.setattr(profiles, 'utc_now', lambda: now)
    login(client, 'manager')
    assert person(client, 'manager')['availability'] == 'away'
    assert client.patch('/api/people/me/presence', json={'status': 'available', 'duration_minutes': 30}).status_code == 200
    assert client.patch('/api/people/me/status-message', json={'message': 'La verificarea echipamentelor', 'duration_minutes': 60}).status_code == 200
    assert person(client, 'manager')['availability'] == 'away', 'Personal status must not cancel approved leave.'
    now += timedelta(minutes=31)
    current = client.get('/api/people/me/profile').json()
    assert current['presence'] == 'automatic'
    assert current['presence_expires_at'] is None
    assert current['status_message'] == 'La verificarea echipamentelor'
    assert person(client, 'manager')['profile']['presence'] == 'automatic'
    now += timedelta(minutes=30)
    current = client.get('/api/people/me/profile').json()
    assert current['status_message'] == ''
    assert current['message_expires_at'] is None


def test_reset_and_message_clear_do_not_remove_other_profile_fields(client):
    login(client, 'technician')
    client.patch('/api/people/me/presence', json={'status': 'offline'})
    client.patch('/api/people/me/status-message', json={'message': '  Revin după ședință  '})
    result = client.patch('/api/people/me/presence', json={'status': 'automatic'}).json()
    assert result['presence'] == 'automatic'
    assert result['status_message'] == 'Revin după ședință'
    assert result['message_expires_at'] is None
    result = client.patch('/api/people/me/status-message', json={'message': '  ', 'duration_minutes': 30}).json()
    assert result['status_message'] == ''
    assert result['message_expires_at'] is None


def test_profile_changes_require_authentication_and_cannot_target_another_user(client, db):
    assert client.patch('/api/people/me/presence', json={'status': 'busy'}).status_code == 401
    assert client.get('/api/people/technician/photo').status_code == 401
    login(client, 'technician')
    roles = list(db.get(User, 'technician').roles)
    assert client.patch('/api/people/me/presence', json={'status': 'busy', 'user_id': 'admin'}).status_code == 422
    assert client.patch('/api/people/admin/presence', json={'status': 'busy'}).status_code == 404
    assert client.patch('/api/people/me/status-message', json={'message': 'x', 'roles': ['admin']}).status_code == 422
    db.expire_all()
    assert db.get(User, 'technician').roles == roles
    assert db.get(UserProfile, 'admin') is None


@pytest.mark.parametrize('payload', [
    {'status': 'invisible'}, {'status': 'busy', 'duration_minutes': 0},
    {'status': 'busy', 'duration_minutes': 10081}, {'status': 'busy', 'duration_minutes': 1.5},
])
def test_invalid_presence_is_rejected(client, payload):
    login(client, 'technician')
    assert client.patch('/api/people/me/presence', json=payload).status_code == 422


def test_message_length_limit(client):
    login(client, 'technician')
    assert client.patch('/api/people/me/status-message', json={'message': 'x' * 281}).status_code == 422


def test_photo_upload_replacement_and_removal(client):
    login(client, 'technician')
    uploaded = client.post('/api/people/me/photo', files={'file': ('portrait.png', photo_bytes(), 'image/png')})
    assert uploaded.status_code == 200, uploaded.text
    url = uploaded.json()['photo_url']
    second = client.post('/api/people/me/photo', files={'file': ('new.png', photo_bytes(), 'image/png')})
    assert second.json()['photo_url'] != url
    login(client, 'reviewer')
    assert person(client, 'technician')['profile']['photo_url'] == second.json()['photo_url']
    response = client.get(second.json()['photo_url'])
    assert response.status_code == 200
    assert response.headers['content-type'] == 'image/png'
    assert response.headers['cache-control'] == 'no-store'
    with Image.open(BytesIO(response.content)) as image:
        assert image.size == (256, 256)
        assert not image.getexif()
    login(client, 'technician')
    assert client.delete('/api/people/me/photo').json()['photo_url'] is None
    assert client.get(url).status_code == 404


def test_invalid_upload_cannot_replace_existing_photo(client):
    login(client, 'technician')
    url = client.post('/api/people/me/photo', files={'file': ('photo.png', photo_bytes(), 'image/png')}).json()['photo_url']
    for content in [b'not an image', b'<svg xmlns="http://www.w3.org/2000/svg"></svg>', b'x' * (profiles.MAX_PHOTO_BYTES + 1)]:
        assert client.post('/api/people/me/photo', files={'file': ('fake.png', content, 'image/png')}).status_code == 422
    assert client.get('/api/people/me/profile').json()['photo_url'] == url


def test_photo_read_is_scoped_to_the_airport(client, db):
    login(client, 'technician')
    db.add(User(id='external-photo-user', name='External', email='external@example.test', department='Tehnic',
        role='employee', roles=['employee'], airport_id='sibiu', password_hash='unused'))
    db.flush()
    db.add(UserProfile(user_id='external-photo-user', photo=photo_bytes(), photo_revision='test'))
    db.commit()
    try:
        assert client.get('/api/people/external-photo-user/photo').status_code == 404
    finally:
        db.execute(delete(UserProfile).where(UserProfile.user_id == 'external-photo-user'))
        db.execute(delete(User).where(User.id == 'external-photo-user'))
        db.commit()
