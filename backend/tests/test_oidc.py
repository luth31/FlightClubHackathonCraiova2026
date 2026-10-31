"""Real signed ID tokens, mocked provider transport, application-bound identity."""
import base64
import hashlib
import json
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier
from urllib.parse import parse_qs, urlsplit
from pathlib import Path

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from app.config import settings
from app.core.security import token_hash
from app.identity import service
from app.identity.models import LoginTransaction
from app.main import app
from app.people.models import User


@pytest.mark.parametrize('airport',['dunarea','carpati'])
def test_keycloak_import_supplies_required_identity_claims(airport):
    realm_path=Path(__file__).resolve().parents[2]/'deploy'/'keycloak'/f'{airport}-realm.json'
    realm=json.loads(realm_path.read_text())
    client=next(item for item in realm['clients'] if item['clientId']=='aerodesk-web')
    # Since Keycloak 25, the default basic scope supplies sub/auth_time mappers.
    # Omitting it from an explicit client scope list rejects every real login.
    assert 'basic' in client['defaultClientScopes']


def test_persisted_employee_identity_can_login_without_configured_subject_map(oidc,db):
    from uuid import uuid4
    from sqlalchemy import delete
    from app.people.models import Session
    client,provider=oidc
    uid='emp-'+uuid4().hex
    subject='employee-provider-'+uuid4().hex
    db.add(User(id=uid,name='Mara Persistent',email=f'{uid}@airport.example',department='Tehnic',
        department_id='dept-tehnic',role='Inginer',job_title='Inginer',roles=['employee'],airport_id='dunarea',
        active=True,password_hash='not-a-local-password',avatar='',identity_issuer=settings.oidc_issuer,
        identity_subject=subject,provisioning_status='ready'))
    db.commit()
    try:
        provider['claims']={'sub':subject,'realm_access':{'roles':['admin','signer']}}
        state=begin(oidc)
        assert callback(client,state).status_code==303
        user=client.get('/api/session').json()['current_user']
        assert user['id']==uid and user['roles']==['employee']
    finally:
        db.execute(delete(Session).where(Session.user_id==uid))
        db.delete(db.get(User,uid));db.commit()


@pytest.fixture
def oidc(client, monkeypatch):
    for name, value in {'auth_mode':'oidc',
        'oidc_issuer':'http://127.0.0.1:8180/realms/dunarea',
        'oidc_internal_issuer':'http://dunarea-identity:8080/realms/dunarea',
        'oidc_redirect_uri':'http://127.0.0.1:8080/api/auth/oidc/callback',
        'oidc_frontend_url':'http://127.0.0.1:8080/', 'oidc_client_id':'aerodesk-web',
        'oidc_subject_map':None, 'cookie_secure':False}.items():
        monkeypatch.setattr(settings,name,value)
    key=rsa.generate_private_key(public_exponent=65537,key_size=2048)
    jwk=json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(key.public_key()))
    jwk.update(kid='test-key',use='sig',alg='RS256')
    provider={'key':key,'jwk':jwk,'claims':{},'token_requests':0,'subject_user':'technician'}

    def provider_json(method,url,data=None):
        internal=settings.oidc_internal_issuer
        if method=='GET' and url==internal+'/.well-known/openid-configuration':
            issuer=settings.oidc_issuer
            return {'issuer':provider.get('discovery_issuer',issuer),
                'authorization_endpoint':issuer+'/protocol/openid-connect/auth',
                'token_endpoint':provider.get('token_endpoint',issuer+'/protocol/openid-connect/token'),
                'jwks_uri':issuer+'/protocol/openid-connect/certs',
                'code_challenge_methods_supported':['S256']}
        if method=='GET' and url==internal+'/protocol/openid-connect/certs':
            return {'keys':[jwk]}
        assert method=='POST' and url==internal+'/protocol/openid-connect/token'
        provider['token_requests']+=1
        assert data['code']=='valid-code'
        assert data['client_id']=='aerodesk-web'
        assert data['grant_type']=='authorization_code'
        assert data['redirect_uri']==settings.oidc_redirect_uri
        challenge=base64.urlsafe_b64encode(hashlib.sha256(data['code_verifier'].encode()).digest()).rstrip(b'=').decode()
        assert challenge==provider['query']['code_challenge'][0]
        timestamp=int(time.time())
        subject=next(subject for subject,user_id in service.subject_map().items() if user_id==provider['subject_user'])
        claims={'iss':settings.oidc_issuer,'aud':settings.oidc_client_id,'azp':settings.oidc_client_id,
            'sub':subject,'iat':timestamp,'exp':timestamp+300,'auth_time':timestamp,
            'nonce':provider['query']['nonce'][0], 'realm_access':{'roles':['admin','director']},
            **provider['claims']}
        for absent in provider.get('absent',[]): claims.pop(absent,None)
        return {'id_token':jwt.encode(claims,provider.get('signing_key',key),algorithm='RS256',headers={'kid':'test-key'})}

    monkeypatch.setattr(service,'provider_json',provider_json)
    return client,provider


def begin(oidc):
    client,provider=oidc
    response=client.get('/api/auth/oidc/login',follow_redirects=False)
    assert response.status_code==303,response.text
    query=parse_qs(urlsplit(response.headers['location']).query)
    provider['query']=query
    return query['state'][0]


def callback(client,state,**extra):
    return client.get('/api/auth/oidc/callback',params={'state':state,'code':'valid-code',**extra},follow_redirects=False)


def test_oidc_success_pkce_pinned_subject_and_local_roles(oidc):
    client,provider=oidc
    anonymous=client.get('/api/session').json()
    assert anonymous['auth']['mode']=='oidc' and anonymous['users']==[] and not anonymous['demo']
    assert client.post('/api/auth/login',json={'user_id':'admin','password':'AeroDesk2026!'}).status_code==403
    state=begin(oidc)
    query=provider['query']
    assert query['code_challenge_method']==['S256'] and query['response_type']==['code']
    assert query['prompt']==['login'] and query['max_age']==['0'] and query['ui_locales']==['ro']
    assert 'code_verifier' not in query
    response=callback(client,state)
    assert response.status_code==303 and response.headers['location']==settings.oidc_frontend_url
    current=client.get('/api/session').json()['current_user']
    assert current['id']=='technician' and current['roles']==['technician']
    assert client.get('/api/documents/test-hr/file').status_code==404
    assert provider['token_requests']==1
    assert client.post('/api/auth/logout').status_code==200
    assert client.get('/api/session').json()['current_user'] is None


@pytest.mark.parametrize('overrides,absent',[
    ({'iss':'http://127.0.0.1:8181/realms/carpati'},[]),
    ({'aud':'other-client'},[]),
    ({'azp':'other-client'},[]),
    ({'aud':['aerodesk-web','other-client']},['azp']),
    ({'nonce':'wrong-nonce'},[]),
    ({'exp':int(time.time())-120},[]),
    ({'iat':int(time.time())+300},[]),
    ({'auth_time':int(time.time())-600},[]),
    ({},['sub']),
])
def test_invalid_id_tokens_never_create_session(oidc,overrides,absent):
    client,provider=oidc
    provider['claims']=overrides;provider['absent']=absent
    state=begin(oidc)
    response=callback(client,state)
    assert response.status_code==303 and 'auth_error=invalid_token' in response.headers['location']
    assert client.get('/api/session').json()['current_user'] is None


def test_wrong_signature_and_unknown_subject_rejected(oidc):
    client,provider=oidc
    provider['signing_key']=rsa.generate_private_key(public_exponent=65537,key_size=2048)
    response=callback(client,begin(oidc))
    assert 'auth_error=invalid_token' in response.headers['location']
    del provider['signing_key']
    provider['claims']={'sub':'unprovisioned-subject','preferred_username':'admin','email':'admin@dunarea.example'}
    response=callback(client,begin(oidc))
    assert 'auth_error=account_unavailable' in response.headers['location']
    assert client.get('/api/session').json()['current_user'] is None


def test_validation_diagnostic_excludes_credentials_and_claim_values(oidc,caplog):
    client,provider=oidc
    provider['absent']=['auth_time']
    state=begin(oidc)
    browser=client.cookies.get('aerodesk_oidc_dunarea')
    response=callback(client,state)
    assert 'auth_error=invalid_token' in response.headers['location']
    diagnostic='\n'.join(record.getMessage() for record in caplog.records
        if record.name=='app.identity.service')
    assert 'MissingRequiredClaimError' in diagnostic and 'missing_claim=auth_time' in diagnostic
    assert state not in diagnostic and browser not in diagnostic
    assert provider['query']['nonce'][0] not in diagnostic and 'valid-code' not in diagnostic


def test_state_browser_binding_expiry_and_replay(oidc,db):
    client,provider=oidc
    state=begin(oidc)
    browser=client.cookies.get('aerodesk_oidc_dunarea')
    response=callback(client,'unrecognized-state')
    assert 'auth_error=invalid_state' in response.headers['location']
    client.cookies.set('aerodesk_oidc_dunarea','wrong-browser',domain='testserver.local',path='/api/auth/oidc')
    response=callback(client,state)
    assert 'auth_error=invalid_state' in response.headers['location'] and provider['token_requests']==0
    client.cookies.set('aerodesk_oidc_dunarea',browser,domain='testserver.local',path='/api/auth/oidc')
    transaction=db.get(LoginTransaction,token_hash(state))
    transaction.expires_at=(service.now()-timedelta(seconds=1)).isoformat();db.commit()
    response=callback(client,state)
    assert 'auth_error=invalid_state' in response.headers['location'] and provider['token_requests']==0
    state=begin(oidc);browser=client.cookies.get('aerodesk_oidc_dunarea')
    assert callback(client,state).headers['location']==settings.oidc_frontend_url
    client.cookies.set('aerodesk_oidc_dunarea',browser,domain='testserver.local',path='/api/auth/oidc')
    response=callback(client,state)
    assert 'auth_error=invalid_state' in response.headers['location'] and provider['token_requests']==1


def test_deactivated_account_blocked_at_login_and_existing_session(oidc,db):
    client,provider=oidc
    user=db.get(User,'technician')
    try:
        user.active=False;db.commit()
        response=callback(client,begin(oidc))
        assert 'auth_error=account_unavailable' in response.headers['location']
        user.active=True;db.commit()
        assert callback(client,begin(oidc)).headers['location']==settings.oidc_frontend_url
        user.active=False;db.commit()
        assert client.get('/api/session').json()['current_user'] is None
        assert client.get('/api/documents').status_code==401
    finally:
        user.active=True;db.commit()


def test_configuration_pins_discovery_and_endpoint_origin(oidc):
    client,provider=oidc
    provider['discovery_issuer']='https://evil.example/realms/dunarea'
    result=client.get('/api/auth/oidc/login',follow_redirects=False)
    assert 'auth_error=invalid_provider' in result.headers['location']
    del provider['discovery_issuer']
    provider['token_endpoint']='https://evil.example/token'
    result=client.get('/api/auth/oidc/login',follow_redirects=False)
    assert 'auth_error=invalid_provider' in result.headers['location']
    assert provider['token_requests']==0


def test_provider_logout_uses_only_fixed_registered_destination(oidc):
    client,_=oidc
    assert callback(client,begin(oidc)).headers['location']==settings.oidc_frontend_url
    old_session=client.cookies.get('aerodesk_session_dunarea')
    response=client.post('/api/auth/logout?return_to=https://untrusted.example/',
        json={'redirect_url':'https://untrusted.example/','post_logout_redirect_uri':'https://untrusted.example/'})
    assert response.status_code==200
    redirect=urlsplit(response.json()['redirect_url'])
    assert redirect.scheme=='http' and redirect.netloc=='127.0.0.1:8180'
    assert redirect.path=='/realms/dunarea/protocol/openid-connect/logout'
    parameters=parse_qs(redirect.query)
    assert parameters=={'client_id':['aerodesk-web'],
        'post_logout_redirect_uri':[settings.oidc_frontend_url],'ui_locales':['ro']}
    assert 'id_token_hint' not in parameters
    client.cookies.set('aerodesk_session_dunarea',old_session,domain='testserver.local',path='/api')
    assert client.get('/api/session').json()['current_user'] is None


def test_demo_session_rejected_after_switch_to_oidc(admin,monkeypatch):
    assert admin.get('/api/session').json()['current_user']['id']=='admin'
    monkeypatch.setattr(settings,'auth_mode','oidc')
    assert admin.get('/api/session').json()['current_user'] is None
    assert admin.get('/api/documents').status_code==401


def test_concurrent_callbacks_consume_login_once(oidc):
    client,provider=oidc
    state=begin(oidc)
    browser=client.cookies.get('aerodesk_oidc_dunarea')
    start=Barrier(2)
    with TestClient(app) as first,TestClient(app) as second:
        for other in (first,second):
            other.cookies.set('aerodesk_oidc_dunarea',browser,domain='testserver.local',path='/api/auth/oidc')
        def finish(other):
            start.wait(timeout=5)
            return callback(other,state)
        with ThreadPoolExecutor(max_workers=2) as executor:
            responses=list(executor.map(finish,(first,second)))
    locations=[r.headers['location'] for r in responses]
    assert locations.count(settings.oidc_frontend_url)==1
    assert sum('auth_error=invalid_state' in value for value in locations)==1
    assert provider['token_requests']==1
