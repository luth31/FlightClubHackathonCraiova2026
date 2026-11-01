from contextlib import contextmanager
from copy import deepcopy
from types import SimpleNamespace
from urllib.parse import urlsplit
import httpx
import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from app.config import settings
from app.database import Base
from app.people.models import User
from app.collaboration import service, participation
from app.collaboration.models import CollaborationParticipation, CollaborationThread, CollaborationSync
from app.collaboration.schemas import CreateRequest, MessageRequest, ParticipationRequest
from app.collaboration.schemas import MailboxStateRequest
from app.core.exceptions import DomainError
from app.exchange.registry import AIRPORTS


@pytest.fixture
def network(monkeypatch,tmp_path,client):
    stores={}
    for identifier in AIRPORTS:
        engine=create_engine(f'sqlite:///{tmp_path / (identifier+".db")}')
        Base.metadata.create_all(engine)
        db=sessionmaker(bind=engine,expire_on_commit=False)()
        db.add(User(id='admin',name='Director '+identifier,email=f'admin@{identifier}.example',
            airport_id=identifier,active=True,department='Conducere',job_title='Director aeroport',
            role='director',roles=['director'],password_hash='unused'))
        db.add(CollaborationParticipation(airport_id=identifier,enabled=identifier!='iasi'))
        db.commit();stores[identifier]=db
    token=tmp_path/'gateway-token';token.write_text('private-demo-test-token')
    monkeypatch.setattr(settings,'exchange_token_file',token)
    @contextmanager
    def airport(identifier):
        old=settings.airport_id,settings.airport_name,settings.exchange_peers
        settings.airport_id=identifier;settings.airport_name=AIRPORTS[identifier]
        settings.exchange_peers={key:f'http://{key}.test' for key in AIRPORTS if key!=identifier}
        try:yield stores[identifier],stores[identifier].get(User,'admin')
        finally:settings.airport_id,settings.airport_name,settings.exchange_peers=old
    offline=set()
    def transport(url,**kwargs):
        source=settings.airport_id;target=urlsplit(url).hostname.split('.')[0]
        if target in offline:raise httpx.ConnectError('offline')
        with airport(target) as (db,_):
            data=service.outgoing(db,SimpleNamespace(airport_id=source),kwargs['params']['after'])
        return httpx.Response(200,json=data)
    monkeypatch.setattr(service.httpx,'get',transport)
    yield airport,stores,offline
    for db in stores.values():db.close()


def create(db,user,recipient,key):
    return service.create(db,user,CreateRequest(recipient_airport_id=recipient,recipient_user_id='admin',
        subject='Model document '+recipient,body='Putem primi un exemplu verificat?',idempotency_key=key))


def test_four_airports_three_enabled_and_disabled_airport_publishes_no_contacts(network):
    airport,_,_=network
    with airport('craiova') as (db,user):
        inbox=service.listing(db,user)
        peers={p['id']:p for p in inbox['partners']}
        assert set(peers)=={'sibiu','cluj','iasi'}
        assert peers['sibiu']['contacts'] and peers['cluj']['contacts']
        assert peers['iasi']['connected'] and not peers['iasi']['participation_enabled']
        assert peers['iasi']['contacts']==[] and not peers['iasi']['sharing_enabled']
        with pytest.raises(DomainError):create(db,user,'iasi','disabled-airport-key')
    with airport('iasi') as (db,user):
        inbox=service.listing(db,user)
        assert not inbox['can_create'] and all(not p['contacts'] for p in inbox['partners'])
        participation.update(db,user,ParticipationRequest(enabled=True,revision=0))
    with airport('craiova') as (db,user):
        assert create(db,user,'iasi','activated-airport-key')['recipient_airport_id']=='iasi'


def test_messages_and_acknowledgements_are_isolated_per_airport_pair(network):
    airport,stores,_=network
    with airport('craiova') as (db,user):
        sibiu=create(db,user,'sibiu','message-for-sibiu')
        cluj=create(db,user,'cluj','message-for-cluj')
        feed=service.outgoing(db,SimpleNamespace(airport_id='cluj'))
        assert [e['thread']['id'] for e in feed['events']]==[cluj['id']]
    with airport('cluj') as (db,user):
        incoming=service.listing(db,user)
        assert [t['id'] for t in incoming['requests']]==[cluj['id']]
        reply=service.append(db,user,cluj['id'],MessageRequest(body='Răspuns Cluj',idempotency_key='reply-from-cluj'))
        assert reply['partner']['id']=='craiova'
        unrelated=create(db,user,'sibiu','cluj-to-sibiu-only')
    with airport('craiova') as (db,user):
        cluj_detail=service.detail(db,user,cluj['id'])
        assert not cluj_detail['pending_delivery'] and cluj_detail['messages'][-1]['body']=='Răspuns Cluj'
        assert service.detail(db,user,sibiu['id'])['pending_delivery']
        assert db.get(CollaborationThread,unrelated['id']) is None
    with airport('sibiu') as (db,user):
        incoming=service.listing(db,user)
        assert {t['id'] for t in incoming['requests']}=={sibiu['id'],unrelated['id']}
        assert db.get(CollaborationThread,cluj['id']) is None
    assert stores['craiova'].get(CollaborationSync,'craiova:cluj').received_cursor>0


def test_offline_peer_does_not_block_another_airport_and_relay_cannot_relabel_messages(network):
    airport,stores,offline=network
    offline.add('sibiu')
    with airport('craiova') as (db,user):
        result=create(db,user,'cluj','available-cluj-key')
        inbox=service.listing(db,user)
        assert inbox['can_create'] and result['partner']['id']=='cluj' and result['can_reply']
        with pytest.raises(DomainError):create(db,user,'sibiu','unavailable-sibiu-key')
        forged=deepcopy(service.outgoing(db,SimpleNamespace(airport_id='cluj')))
    with airport('sibiu') as (db,user):
        forged['recipient_airport_id']='sibiu'
        with pytest.raises(DomainError):service.import_feed(db,forged,0,'craiova')
        assert db.scalar(select(CollaborationThread.id)) is None


def test_mailbox_state_is_personal_and_new_remote_reply_becomes_unread(network):
    airport,_,_=network
    with airport('craiova') as (db,user):
        request=create(db,user,'sibiu','mailbox-state-example')
        service.update_mailbox(db,user,request['id'],MailboxStateRequest(starred=True,archived=True))
        item=service.listing(db,user)['requests'][0]
        assert item['starred'] and item['archived'] and not item['unread']
        assert item['in_sent'] and not item['in_inbox']
    with airport('sibiu') as (db,user):
        item=service.listing(db,user)['requests'][0]
        assert item['unread'] and not item['starred'] and not item['archived']
        assert item['in_inbox'] and not item['in_sent']
        service.update_mailbox(db,user,item['id'],MailboxStateRequest(read_sequence=item['last_sequence']))
        assert not service.detail(db,user,item['id'])['unread']
        with pytest.raises(DomainError):service.update_mailbox(db,user,item['id'],MailboxStateRequest(read_sequence=999999))
        service.append(db,user,request['id'],MessageRequest(body='Atașăm un exemplu.',idempotency_key='mailbox-first-response'))
    with airport('craiova') as (db,user):
        answered=service.detail(db,user,request['id'])
        assert answered['in_inbox'] and answered['in_sent'] and answered['unread']
        service.append(db,user,request['id'],MessageRequest(body='Mai avem o întrebare.',idempotency_key='mailbox-followup-new'))
    with airport('sibiu') as (db,user):
        assert service.detail(db,user,request['id'])['unread']
        other=User(id='another-director',name='Other director',email='other@sibiu.example',airport_id='sibiu',active=True,department='Conducere',job_title='Director',role='director',roles=['director'],password_hash='unused')
        db.add(other);db.commit()
        with pytest.raises(DomainError):service.update_mailbox(db,other,request['id'],MailboxStateRequest(starred=True))


def test_airport_directory_search_pagination_and_opt_in(network):
    airport,_,_=network
    with airport('craiova') as (db,user):
        available=service.airport_directory(db,user)
        assert {p['id'] for p in available['items']}=={'sibiu','cluj'}
        assert service.airport_directory(db,user,q='IAS',available=False)['items'][0]['contacts']==[]
        assert service.airport_directory(db,user,q='iași',available=False)['items'][0]['id']=='iasi'
        assert service.airport_directory(db,user,q='SBZ')['items'][0]['id']=='sibiu'
        page=service.airport_directory(db,user,limit=1,offset=1)
        assert len(page['items'])==1 and page['total']==2
        assert service.airport_directory(db,user,q='absent')['total']==0
