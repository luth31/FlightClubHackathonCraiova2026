"""Opt-in, professional directory and participant-only conversations."""
from copy import deepcopy
from types import SimpleNamespace
import httpx
import pytest
from sqlalchemy import delete, select
from app.collaboration import participation, service
from app.collaboration.models import CollaborationParticipation, CollaborationEvent, CollaborationThread, CollaborationSync
from app.core.exceptions import DomainError
from app.people.models import User, Department
from conftest import login
from test_collaboration import connected, request_payload, create_grant, REMOTE_CONTACT, wire_request


@pytest.fixture(autouse=True)
def reset(client, db):
    for model in (CollaborationEvent, CollaborationThread, CollaborationSync, CollaborationParticipation):
        db.execute(delete(model))
    db.commit()
    yield
    db.rollback()
    db.execute(delete(CollaborationParticipation))
    db.commit()


def activate(admin, enabled=True, revision=0):
    response = admin.patch('/api/collaboration/participation', json={'enabled':enabled,'revision':revision})
    assert response.status_code == 200, response.text
    return response.json()


def test_disabled_by_default_and_only_director_can_enable_with_revision(admin, db, connected):
    inbox=admin.get('/api/collaboration').json()
    assert inbox['participation']=={'enabled':False,'revision':0,'can_manage':True,'updated_at':None}
    assert not inbox['can_create'] and inbox['partner']['contacts']==[]
    assert service.outgoing(db, SimpleNamespace(airport_id='sibiu'))['contacts']==[]
    assert admin.post('/api/collaboration',json=request_payload()).status_code==409
    login(admin,'technical-head')
    assert admin.get('/api/collaboration').status_code==403
    assert admin.patch('/api/collaboration/participation',json={'enabled':True,'revision':0}).status_code==403
    login(admin)
    assert activate(admin)['revision']==1
    assert admin.patch('/api/collaboration/participation',json={'enabled':False,'revision':0}).status_code==409
    assert admin.get('/api/collaboration').json()['participation']['enabled']
    login(admin,'technical-head')
    assert admin.get('/api/collaboration').json()['can_create']
    assert admin.get('/api/session').json()['current_user']['permissions']['pages']['sharing']


def test_directory_only_publishes_current_main_heads_and_professional_fields(admin,db,connected):
    activate(admin)
    contacts=service.outgoing(db,SimpleNamespace(airport_id='sibiu'))['contacts']
    identifiers={c['id'] for c in contacts}
    assert {'admin','technical-head'} <= identifiers
    assert 'technician' not in identifiers and 'finance' not in identifiers
    assert all(set(c)=={'id','name','email','department','job_title','role'} for c in contacts)
    head=db.get(User,'technical-head');dept=db.get(Department,head.department_id);original=dept.head_user_id
    try:
        dept.head_user_id=None;db.commit()
        # Retaining a stale role label is insufficient after losing the appointment.
        assert 'technical-head' not in {c['id'] for c in participation.directory(db)}
        login(admin,'technical-head')
        assert admin.get('/api/collaboration').status_code==403
    finally:
        dept.head_user_id=original;db.commit()


def test_named_thread_is_not_visible_to_other_heads_or_director(admin,db,connected):
    activate(admin);login(admin,'technical-head')
    response=admin.post('/api/collaboration',json={**request_payload(),'category':'problem'})
    assert response.status_code==201,response.text
    thread=response.json();identifier=thread['id']
    assert thread['requester_contact']['id']=='technical-head' and thread['recipient_contact']==REMOTE_CONTACT
    assert thread['category']=='problem'
    for actor in ('admin','manager'):
        login(admin,actor)
        assert not admin.get('/api/collaboration').json()['requests']
        assert admin.get('/api/collaboration/'+identifier).status_code==404
        assert admin.post('/api/collaboration/'+identifier+'/messages',json={'body':'Nu este conversația mea.','idempotency_key':'unauthorized-send'}).status_code==404
    login(admin,'technical-head')
    assert admin.get('/api/collaboration/'+identifier).status_code==200


def test_disabling_hides_contacts_stops_delivery_and_preserves_local_history(admin,db,connected):
    activate(admin)
    identifier=admin.post('/api/collaboration',json=request_payload()).json()['id']
    assert service.outgoing(db,SimpleNamespace(airport_id='sibiu'))['events']
    activate(admin,False,1)
    feed=service.outgoing(db,SimpleNamespace(airport_id='sibiu'))
    assert not feed['participation_enabled'] and feed['contacts']==[] and feed['events']==[]
    history=admin.get('/api/collaboration/'+identifier).json()
    assert history['messages'] and not history['can_reply']
    assert admin.post('/api/collaboration/'+identifier+'/messages',json={'body':'Nou','idempotency_key':'disabled-send-key'}).status_code==409
    assert admin.get('/api/collaboration').json()['partner']['contacts']==[]
    assert db.scalar(select(CollaborationThread.id))==identifier


def test_peer_disable_removed_recipient_and_outage_do_not_leave_stale_contacts_writable(admin,db,connected,monkeypatch):
    activate(admin)
    identifier=admin.post('/api/collaboration',json=request_payload()).json()['id']
    def feed(enabled,contacts):
        return lambda url,**kw:httpx.Response(200,json={'source_airport_id':'sibiu','recipient_airport_id':'craiova',
            'participation_enabled':enabled,'contacts':contacts,'events':[],'next_cursor':kw['params']['after'],'acknowledged_cursor':0,'has_more':False})
    for enabled,contacts in ((True,[]),(False,[])):
        monkeypatch.setattr(service.httpx,'get',feed(enabled,contacts))
        assert not admin.get('/api/collaboration/'+identifier).json()['can_reply']
        assert admin.post('/api/collaboration/'+identifier+'/messages',json={'body':'Test','idempotency_key':'recipient-removed-key'}).status_code==409
    monkeypatch.setattr(service.httpx,'get',feed(True,[REMOTE_CONTACT]))
    assert admin.get('/api/collaboration').json()['partner']['contacts']
    def offline(*a,**k):raise httpx.ConnectError('offline')
    monkeypatch.setattr(service.httpx,'get',offline)
    result=admin.get('/api/collaboration').json()
    assert not result['can_create'] and result['partner']['contacts']==[] and result['requests']


def test_document_category_requires_reviewed_attachment_and_from_cannot_be_spoofed(admin,connected):
    activate(admin)
    payload={**request_payload(),'category':'document'}
    assert admin.post('/api/collaboration',json=payload).status_code==422
    assert admin.post('/api/collaboration',json={**payload,'requester_contact':REMOTE_CONTACT}).status_code==422
    grant=create_grant(admin)
    result=admin.post('/api/collaboration',json={**payload,'share_id':grant})
    assert result.status_code==201,result.text
    assert result.json()['messages'][0]['attachment']['share_id']==grant
    assert result.json()['requester_contact']['id']=='admin'


def test_peer_cannot_spoof_named_author_or_rewrite_participant(admin,db,connected):
    activate(admin)
    payload=wire_request();event=payload['events'][0]
    local=participation.contact(db.get(User,'admin'))
    event.update(author_id=REMOTE_CONTACT['id'],author_role=REMOTE_CONTACT['role'])
    event['thread'].update(requester_contact=REMOTE_CONTACT,recipient_contact=local,
        requester_department=REMOTE_CONTACT['department'],recipient_department=local['department'])
    bad=deepcopy(payload);bad['events'][0]['author_id']='unrelated-person'
    with pytest.raises(DomainError):service.import_feed(db,bad,0)
    assert not db.scalar(select(CollaborationThread.id))
    service.import_feed(db,payload,0)
    bad=deepcopy(payload);bad['events'][0].update(sequence=5,id='collab-sibiu-'+'e'*32,kind='reply');bad['next_cursor']=5
    bad['events'][0]['thread']['recipient_contact']['id']='manager'
    with pytest.raises(DomainError):service.import_feed(db,bad,4)
    assert db.get(CollaborationSync,'craiova:sibiu').received_cursor==4
