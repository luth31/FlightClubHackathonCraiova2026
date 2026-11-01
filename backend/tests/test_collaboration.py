"""Partner coordination: real independent stores, pull transport, authority and retry."""
from contextlib import contextmanager
from copy import deepcopy
from types import SimpleNamespace

import httpx
import pytest
from sqlalchemy import create_engine, delete, func, select
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.database import Base
from app.collaboration import service
from app.collaboration.models import CollaborationEvent as Event, CollaborationSync as Sync, CollaborationThread as Thread
from app.collaboration.schemas import CreateRequest, MessageRequest, StatusRequest
from app.core.exceptions import DomainError
from conftest import login
from test_exchange import gateway_headers


@pytest.fixture(autouse=True)
def clear_coordination(client, db):
    for model in (Event, Thread, Sync):
        db.execute(delete(model))
    db.commit()


@pytest.fixture
def connected(monkeypatch, tmp_path):
    token = tmp_path / 'coordination-token'
    token.write_text('test-coordination-token')
    monkeypatch.setattr(settings, 'exchange_token_file', token)
    monkeypatch.setattr(settings, 'exchange_url', 'http://private-gateway:8082')
    calls = []
    def get(url, **kwargs):
        calls.append((url, kwargs))
        return httpx.Response(200, json={'source_airport_id': 'sibiu', 'recipient_airport_id': 'craiova',
            'source_airport_name':'Aeroportul Sibiu', 'departments':[{'name':'Tehnic','label':'Tehnic și operațiuni'}], 'events': [], 'next_cursor': kwargs['params']['after'], 'acknowledged_cursor': 0, 'has_more': False})
    monkeypatch.setattr(service.httpx, 'get', get)
    return calls


def request_payload(key='request-key-0001'):
    return {'recipient_airport_id': 'sibiu', 'recipient_department': 'Tehnic', 'subject': 'Cum confirmați echipamentul de rezervă?', 'topic': 'Echipamente',
        'body': 'Avem nevoie de un exemplu de checklist aprobat pentru analiză locală.', 'idempotency_key': key}


def test_local_authority_payload_limits_idempotence_and_no_private_auto_share(admin, db, connected):
    created = admin.post('/api/collaboration', json=request_payload())
    assert created.status_code == 201, created.text
    value = created.json()
    assert value['pending_delivery'] and value['messages'][0]['delivery'] == 'pending'
    assert value['messages'][0]['attachment'] is None
    assert value['can_resolve'] and not value['can_decline']
    repeated = admin.post('/api/collaboration', json=request_payload())
    assert repeated.json()['id'] == value['id']
    assert db.scalar(select(func.count()).select_from(Event)) == 1
    conflict = admin.post('/api/collaboration', json={**request_payload(), 'body': 'Alt mesaj.'})
    assert conflict.status_code == 409
    for payload in ({**request_payload('key-too-long-1'), 'body': 'a' * 3001},
                    {**request_payload('key-control-1'), 'body': 'ascuns\u202etext'},
                    {**request_payload('key-empty-1'), 'body': '   '},
                    {**request_payload('key-spoof-1'), 'requester_airport_id': 'sibiu'}):
        assert admin.post('/api/collaboration', json=payload).status_code == 422
    # No HTML is executed or inserted by the API; it is returned as plain JSON text.
    literal = admin.post(f"/api/collaboration/{value['id']}/messages", json={
        'body': '<script>alert(1)</script>', 'idempotency_key': 'plain-text-message-1'})
    assert literal.status_code == 201
    assert literal.json()['messages'][-1]['body'] == '<script>alert(1)</script>'
    assert all('/outgoing/collaboration' in url for url, _ in connected)
    assert all(call['follow_redirects'] is False for _, call in connected)
    assert 'Cookie' not in connected[0][1]['headers']
    for actor in ('technician', 'finance'):
        login(admin, actor)
        assert admin.get('/api/collaboration').status_code == 403
        assert admin.post('/api/collaboration', json=request_payload()).status_code == 403
        assert admin.get(f"/api/collaboration/{value['id']}").status_code == 403


def test_gateway_requires_authenticated_peer_and_collaboration_authority(admin, connected, monkeypatch, tmp_path):
    admin.post('/api/collaboration', json=request_payload())
    headers = gateway_headers(monkeypatch, tmp_path)
    assert admin.get('/api/exchange/collaboration', headers=headers).status_code == 403  # reviewer, no department
    permitted = {**headers, 'X-Requester-Department': 'Conformitate'}
    result = admin.get('/api/exchange/collaboration', headers=permitted)
    assert result.status_code == 200 and len(result.json()['events']) == 1
    assert result.json()['events'][0]['author_role'] == 'director'
    assert 'author_id' not in result.json()['events'][0]
    for change in ({'Authorization': 'Bearer wrong'}, {'X-Peer-Airport': 'craiova'},
                   {'X-Peer-Airport': 'other'}, {'X-Requester-Roles': 'technician'},
                   {'X-Requester-Department': 'Achizitii'}):
        assert admin.get('/api/exchange/collaboration', headers={**permitted, **change}).status_code in (401, 403)
    assert admin.post('/api/exchange/collaboration', headers=permitted, json={}).status_code == 405


def test_offline_preserves_local_inbox_and_retry_does_not_duplicate(admin, connected, monkeypatch):
    created = admin.post('/api/collaboration', json=request_payload()).json()
    def unavailable(*args, **kwargs):
        raise httpx.ConnectError('offline')
    monkeypatch.setattr(service.httpx, 'get', unavailable)
    result = admin.get('/api/collaboration')
    assert result.status_code == 200
    assert not result.json()['connected'] and not result.json()['can_create']
    assert result.json()['requests'][0]['id'] == created['id']
    detail = admin.get(f"/api/collaboration/{created['id']}").json()
    assert not detail['can_reply'] and detail['messages']
    assert admin.post('/api/collaboration', json=request_payload('new-key-offline')).status_code == 503
    # A request whose first response was lost remains safely retryable while offline.
    assert admin.post('/api/collaboration', json=request_payload()).json()['id'] == created['id']
    monkeypatch.setattr(settings, 'exchange_url', '')
    assert 'configurată' in admin.get('/api/collaboration').json()['sync_error']


def test_status_authority_terminal_state_and_unknown_tenant(admin, db, connected):
    identifier = admin.post('/api/collaboration', json=request_payload()).json()['id']
    assert admin.post(f'/api/collaboration/{identifier}/status', json={
        'status': 'declined', 'idempotency_key': 'bad-decline-key'}).status_code == 403
    resolved = admin.post(f'/api/collaboration/{identifier}/status', json={
        'status': 'resolved', 'body': 'Am primit informația necesară.', 'idempotency_key': 'resolved-key-1'})
    assert resolved.status_code == 200 and resolved.json()['status'] == 'resolved'
    assert not resolved.json()['can_reply']
    assert admin.post(f'/api/collaboration/{identifier}/messages', json={
        'body': 'Mesaj tardiv', 'idempotency_key': 'late-reply-key'}).status_code == 409
    thread = db.get(Thread, identifier); thread.airport_id = 'sibiu'; db.commit()
    assert admin.get(f'/api/collaboration/{identifier}').status_code == 404
    assert admin.post(f'/api/collaboration/{identifier}/messages', json={
        'body': 'Alt aeroport', 'idempotency_key': 'tenant-reply-key'}).status_code == 404


def create_grant(admin, department=None):
    preview = admin.post('/api/documents/test-procedure/share-preview', json={'redact_terms': ['SecretAccount123']})
    assert preview.status_code == 200, preview.text
    result = admin.post('/api/documents/test-procedure/shares', json={'preview_id': preview.json()['preview_id'],
        'reviewed': True, 'expires_at': '2026-12-31', 'recipient_airport_id': 'sibiu', 'recipient_department': department})
    assert result.status_code == 201, result.text
    return result.json()['id']


def test_attachment_uses_only_existing_reviewed_active_unscoped_grant(admin, db, connected):
    identifier = admin.post('/api/collaboration', json=request_payload()).json()['id']
    grant = create_grant(admin)
    reply = {'body': 'Copia verificată este disponibilă aici.', 'share_id': grant, 'idempotency_key': 'attachment-key-1'}
    result = admin.post(f'/api/collaboration/{identifier}/messages', json=reply)
    assert result.status_code == 201, result.text
    attachment = result.json()['messages'][-1]['attachment']
    assert attachment['share_id'] == grant and attachment['source_version'] == 1
    assert attachment['file_url'] == f'/api/shares/{grant}/file'
    assert 'document_id' not in attachment
    scoped = create_grant(admin, 'Conformitate')
    assert admin.post(f'/api/collaboration/{identifier}/messages', json={**reply,
        'share_id': scoped, 'idempotency_key': 'scoped-attachment-key'}).status_code == 409
    admin.post(f'/api/shares/{grant}/revoke')
    assert admin.post(f'/api/collaboration/{identifier}/messages', json={**reply,
        'idempotency_key': 'revoked-attachment-key'}).status_code == 409
    current = admin.get(f'/api/collaboration/{identifier}').json()
    assert current['messages'][-1]['attachment']['status'] == 'revoked'
    assert admin.get(f'/api/shares/{grant}/file').status_code == 403
    feed = service.outgoing(db, SimpleNamespace(airport_id='sibiu'))
    assert all(event['attachment'] is None for event in feed['events'])
    assert admin.post(f'/api/collaboration/{identifier}/messages', json={**reply,
        'share_id': 'share-unknown', 'idempotency_key': 'unknown-attachment-key'}).status_code == 404
    # Original documents cannot be passed in place of reviewed grants.
    assert admin.post(f'/api/collaboration/{identifier}/messages', json={**reply,
        'share_id': 'test-contract', 'idempotency_key': 'private-document-key'}).status_code == 422


@pytest.fixture
def two_airports(monkeypatch, tmp_path):
    stores = {}
    for airport in ('craiova', 'sibiu'):
        engine = create_engine(f'sqlite:///{tmp_path / (airport + ".db")}')
        Base.metadata.create_all(engine)
        stores[airport] = sessionmaker(bind=engine, expire_on_commit=False)()
        from app.people.models import Department
        stores[airport].add(Department(id='dept-tehnic',name='Tehnic',airport_id=airport,head_user_id=None))
        stores[airport].commit()
    token = tmp_path / 'two-airport-token'; token.write_text('private-test-token')
    monkeypatch.setattr(settings, 'exchange_token_file', token)
    monkeypatch.setattr(settings, 'exchange_url', 'http://private-gateway:8082')
    @contextmanager
    def airport_context(airport):
        before = settings.airport_id
        settings.airport_id = airport
        try:
            yield stores[airport], SimpleNamespace(id='director', name='Director demo', active=True,
                roles=['director'], department='Conducere', airport_id=airport)
        finally:
            settings.airport_id = before
    def transport(url, **kwargs):
        requesting = settings.airport_id
        remote = 'sibiu' if requesting == 'craiova' else 'craiova'
        assert url == 'http://private-gateway:8082/outgoing/collaboration'
        with airport_context(remote) as (remote_db, _):
            payload = service.outgoing(remote_db, SimpleNamespace(airport_id=requesting), kwargs['params']['after'])
        return httpx.Response(200, json=payload)
    monkeypatch.setattr(service.httpx, 'get', transport)
    yield airport_context, stores
    for db in stores.values():
        db.close()


def test_two_independent_airport_databases_request_reply_ack_and_resolution(two_airports):
    airport, stores = two_airports
    with airport('craiova') as (db, user):
        created = service.create(db, user, CreateRequest(**request_payload()))
        identifier = created['id']
        assert created['pending_delivery']
    assert stores['sibiu'].scalar(select(func.count()).select_from(Thread)) == 0
    with airport('sibiu') as (db, user):
        incoming = service.listing(db, user)
        assert incoming['connected'] and incoming['requests'][0]['direction'] == 'incoming'
        received = service.detail(db, user, identifier)
        assert received['can_decline'] and not received['can_resolve']
        assert not received['messages'][0]['is_local']
        reply = service.append(db, user, identifier, MessageRequest(body='Trimitem după revizuirea copiei.', idempotency_key='reply-from-sibiu-1'))
        assert reply['messages'][-1]['delivery'] == 'pending'
        # Repeated pulls neither recreate the request nor duplicate messages.
        service.listing(db, user); service.listing(db, user)
        assert db.scalar(select(func.count()).select_from(Event)) == 2
    with airport('craiova') as (db, user):
        received = service.detail(db, user, identifier)
        assert len(received['messages']) == 2 and not received['pending_delivery']
        assert received['messages'][0]['delivery'] == 'received'
        assert received['messages'][1]['author_airport_id'] == 'sibiu'
        service.append(db, user, identifier, StatusRequest(status='resolved', idempotency_key='resolve-request-1'), status_change=True)
    with airport('sibiu') as (db, user):
        received = service.detail(db, user, identifier)
        assert received['status'] == 'resolved' and not received['can_reply']
        assert received['messages'][1]['delivery'] == 'received'
    assert all(store.scalar(select(func.count()).select_from(Thread)) == 1 for store in stores.values())
    assert all(store.scalar(select(func.count()).select_from(Event)) == 3 for store in stores.values())


def wire_request():
    stamp = '2026-11-01T10:00:00+00:00'
    return {'source_airport_id': 'sibiu', 'recipient_airport_id': 'craiova', 'next_cursor': 4,
        'acknowledged_cursor': 0, 'has_more': False, 'events': [{
            'id': 'collab-sibiu-' + 'a' * 32, 'sequence': 4, 'author_airport_id': 'sibiu',
            'author_role': 'Conformitate', 'kind': 'request', 'body': 'Solicităm un exemplu verificat.',
            'created_at': stamp, 'attachment': None, 'thread': {
                'id': 'request-sibiu-' + 'b' * 32, 'requester_airport_id': 'sibiu', 'recipient_airport_id': 'craiova',
                'subject': 'Exemplu checklist', 'topic': 'Proceduri', 'created_at': stamp}}]}


def test_recipient_declines_and_both_databases_converge(two_airports):
    airport, _ = two_airports
    with airport('craiova') as (db, user):
        identifier = service.create(db, user, CreateRequest(**request_payload()))['id']
    with airport('sibiu') as (db, user):
        service.listing(db, user)
        result = service.append(db, user, identifier, StatusRequest(status='declined',
            body='Nu avem încă o procedură validată pentru acest caz.', idempotency_key='decline-request-1'), status_change=True)
        assert result['status'] == 'declined' and result['pending_delivery']
    with airport('craiova') as (db, user):
        result = service.detail(db, user, identifier)
        assert result['status'] == 'declined' and not result['can_reply'] and not result['can_resolve']


@pytest.mark.parametrize('mutation', ['author', 'recipient', 'resolve', 'missing_request', 'attachment', 'cursor', 'empty_more', 'no_timezone'])
def test_untrusted_feed_rejected_atomically_without_advancing_cursor(db, mutation):
    payload = wire_request()
    event = payload['events'][0]
    if mutation == 'author': event['author_airport_id'] = 'craiova'
    elif mutation == 'recipient': payload['recipient_airport_id'] = 'sibiu'
    elif mutation == 'resolve': event['kind'] = 'resolved'; event['thread']['requester_airport_id'] = 'craiova'
    elif mutation == 'missing_request': event['kind'] = 'reply'
    elif mutation == 'attachment': event['attachment'] = {'share_id': 'share-fake', 'title': 'Secret', 'source_airport_id': 'craiova', 'source_version': 1}
    elif mutation == 'cursor': payload['next_cursor'] = 999
    elif mutation == 'empty_more': payload.update(events=[], next_cursor=0, has_more=True)
    elif mutation == 'no_timezone': event['created_at'] = '2026-11-01T10:00:00'
    with pytest.raises(DomainError):
        service.import_feed(db, payload, 0)
    assert db.scalar(select(func.count()).select_from(Thread)) == 0
    assert db.scalar(select(func.count()).select_from(Event)) == 0
    assert db.get(Sync, 'craiova:sibiu') is None


def test_replayed_batches_duplicate_requests_and_changed_headers(db):
    payload = wire_request()
    service.import_feed(db, payload, 0)
    service.import_feed(db, payload, 0)  # a concurrent poll received the same response
    assert db.scalar(select(func.count()).select_from(Event)) == 1
    assert db.get(Sync, 'craiova:sibiu').received_cursor == 4
    invalid = deepcopy(payload)
    invalid['next_cursor'] = 5
    invalid['events'][0].update(sequence=5, id='collab-sibiu-' + 'c' * 32)
    with pytest.raises(DomainError):
        service.import_feed(db, invalid, 4)
    assert db.get(Sync, 'craiova:sibiu').received_cursor == 4
    invalid['events'][0]['kind'] = 'reply'
    invalid['events'][0]['thread']['subject'] = 'Schimbat fără autorizare'
    with pytest.raises(DomainError):
        service.import_feed(db, invalid, 4)
    assert db.scalar(select(func.count()).select_from(Event)) == 1


def test_overlapping_polls_refresh_cached_cursors_under_write_lock(admin, db, connected):
    # Both HTTP requests read cursor 0 before either network response arrives.
    # Sessions retain ORM objects after commit, matching the app's SessionLocal.
    admin.post('/api/collaboration', json=request_payload())
    factory = sessionmaker(bind=db.get_bind(), expire_on_commit=False)
    with factory() as first, factory() as second:
        cached_first = first.get(Sync, 'craiova:sibiu')
        cached_second = second.get(Sync, 'craiova:sibiu')
        assert cached_first.received_cursor == cached_second.received_cursor == 0
        payload = wire_request()
        payload['acknowledged_cursor'] = 1
        service.import_feed(first, payload, 0)
        assert cached_second.received_cursor == 0  # another request has committed meanwhile
        older_response = deepcopy(payload)
        older_response['acknowledged_cursor'] = 0
        service.import_feed(second, older_response, 0)
        assert cached_second.received_cursor == 4
        assert cached_second.acknowledged_cursor == 1
        assert second.scalar(select(func.count()).select_from(Event)) == 2


def test_departments_are_required_and_validated_against_verified_partner_directory(admin, connected):
    for patch in ({'recipient_airport_id':'craiova'}, {'recipient_airport_id':'unknown'}, {'recipient_department':'Unknown'}):
        assert admin.post('/api/collaboration',json={**request_payload(),**patch}).status_code == 422
    missing=request_payload();missing.pop('recipient_department')
    assert admin.post('/api/collaboration',json=missing).status_code == 422
    result=admin.get('/api/collaboration').json()
    assert result['partners'][0]['id']=='sibiu'
    assert result['partners'][0]['connected'] is True
    assert result['partners'][0]['last_synced_at']
    assert result['partners'][0]['departments']==[{'name':'Tehnic','label':'Tehnic și operațiuni'}]


def test_current_department_heads_can_create_but_ordinary_reviewers_cannot(admin, db, connected):
    from app.people.models import Department
    login(admin,'technical-head')
    assert admin.get('/api/collaboration').json()['can_create'] is True
    created=admin.post('/api/collaboration',json=request_payload())
    assert created.status_code==201,created.text
    assert created.json()['requester_department']=='Tehnic'
    assert created.json()['recipient_department']=='Tehnic'
    assert created.json()['messages'][0]['author_role']=='department_head'
    login(admin,'manager')
    assert admin.get('/api/collaboration').json()['requests']==[]
    assert admin.get('/api/collaboration/'+created.json()['id']).status_code==404
    # Compliance readers retain oversight, but only their appointed head can write.
    dept=db.get(Department,'dept-conformitate');original=dept.head_user_id
    try:
        dept.head_user_id='admin';db.commit()
        login(admin,'reviewer')
        assert admin.get('/api/collaboration').json()['can_create'] is False
        assert admin.post('/api/collaboration',json=request_payload('compliance-reader-key')).status_code==403
    finally:
        dept.head_user_id=original;db.commit()


def test_incoming_department_routing_filters_inbox_detail_and_reply(admin, db, connected):
    payload=wire_request();payload['events'][0]['thread'].update(requester_department='Achiziții',recipient_department='Tehnic')
    service.import_feed(db,payload,0)
    identifier=payload['events'][0]['thread']['id']
    login(admin,'technical-head')
    result=admin.get('/api/collaboration').json()
    assert len(result['requests'])==1
    assert admin.get('/api/collaboration/'+identifier).json()['can_reply'] is True
    assert admin.post('/api/collaboration/'+identifier+'/messages',json={'body':'Verificăm procedura.','idempotency_key':'dept-reply-0001'}).status_code==201
    login(admin,'manager')
    assert admin.get('/api/collaboration').json()['requests']==[]
    assert admin.get('/api/collaboration/'+identifier).status_code==404
    assert admin.post('/api/collaboration/'+identifier+'/messages',json={'body':'Nu este departamentul meu.','idempotency_key':'dept-reply-0002'}).status_code==404
