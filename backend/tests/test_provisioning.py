import json
from types import SimpleNamespace
import pytest
import httpx
from pydantic import SecretStr
from app.config import settings
from app.identity import provisioning
from app.core.exceptions import DomainError
from pathlib import Path


@pytest.fixture
def provider(monkeypatch):
    monkeypatch.setattr(settings, 'oidc_issuer', 'http://127.0.0.1:8180/realms/dunarea')
    monkeypatch.setattr(settings, 'oidc_internal_issuer', 'http://dunarea-identity:8080/realms/dunarea')
    monkeypatch.setattr(settings, 'keycloak_provisioning_client_secret', SecretStr('private-service-secret'))
    monkeypatch.setattr(settings, 'keycloak_activation_email', False)
    person=SimpleNamespace(id='emp-test',name='Mara Test',email='mara@example.test',airport_id='dunarea',
        identity_subject='subject-test',identity_issuer=settings.oidc_issuer,active=False)
    calls=[]
    users=[]
    def transport(method,url,**kwargs):
        calls.append((method,url,kwargs))
        if url.endswith('/token'): return httpx.Response(200,json={'access_token':'private-service-token'})
        if method=='GET': return httpx.Response(200,json=users)
        if method=='POST':
            users.append({'id':'subject-test',**kwargs['json']})
            return httpx.Response(201)
        return httpx.Response(204)
    monkeypatch.setattr(provisioning,'request',transport)
    return person,calls,users


def test_provisioning_has_owned_stable_identity_and_temporary_password(provider):
    person,calls,users=provider
    result=provisioning.provision(person)
    assert result['subject']=='subject-test'
    password=next(kwargs['json'] for method,url,kwargs in calls if url.endswith('/reset-password'))
    assert password['temporary'] is True
    assert password['value']==result['temporary_password']
    assert all('private-service-secret' not in json.dumps(kwargs.get('json',{})) for _,_,kwargs in calls)
    calls.clear()
    assert provisioning.provision(person)['subject']=='subject-test'
    assert not any(method=='POST' and url.endswith('/users') for method,url,_ in calls)


def test_collision_never_links_unowned_provider_account(provider):
    person,calls,users=provider
    users.append({'id':'stranger','username':provisioning.username(person),'attributes':{}})
    with pytest.raises(DomainError) as exc:
        provisioning.provision(person)
    assert exc.value.status == 409
    assert not any(method in ('PUT', 'POST') and '/users' in url for method,url,_ in calls)


def test_invitation_timeout_keeps_provisioned_identity_and_reports_delivery_failure(provider,monkeypatch):
    person,calls,users=provider
    monkeypatch.setattr(settings,'keycloak_activation_email',True)
    original=provisioning.request
    def transport(method,url,**kwargs):
        if url.endswith('/execute-actions-email'): raise DomainError('Timeout',502)
        return original(method,url,**kwargs)
    monkeypatch.setattr(provisioning,'request',transport)
    result=provisioning.provision(person)
    assert result=={'subject':'subject-test','invitation_status':'failed'}


def test_credential_failure_retains_confirmed_identity(provider,monkeypatch):
    person,_,_=provider
    original=provisioning.request
    def transport(method,url,**kwargs):
        if url.endswith('/reset-password'): raise DomainError('Timeout',502)
        return original(method,url,**kwargs)
    monkeypatch.setattr(provisioning,'request',transport)
    with pytest.raises(DomainError) as exc: provisioning.provision(person)
    assert exc.value.identity_subject=='subject-test'


def test_reactivation_provisioning_reenables_owned_disabled_identity(provider):
    person,calls,users=provider
    users.append({'id':'subject-test','username':provisioning.username(person),'enabled':False})
    result=provisioning.provision(person)
    assert result['subject']=='subject-test'
    assert any(method=='PUT' and url.endswith('/subject-test') and kwargs.get('json')=={'enabled':True}
        for method,url,kwargs in calls)


def test_offboarding_does_not_touch_another_identity(provider):
    person,calls,users=provider
    person.identity_issuer='https://wrong.example/realms/dunarea'
    with pytest.raises(DomainError): provisioning.set_enabled(person)
    assert not calls


@pytest.mark.parametrize('airport',['dunarea','carpati'])
def test_realm_service_client_has_only_user_management_scope(airport):
    realm=json.loads((Path(__file__).resolve().parents[2]/'deploy/keycloak'/f'{airport}-realm.json').read_text(encoding='utf-8'))
    client=next(c for c in realm['clients'] if c['clientId']=='aerodesk-provisioner')
    assert not client['publicClient'] and client['serviceAccountsEnabled']
    assert not client['standardFlowEnabled'] and not client['fullScopeAllowed']
    assert realm['clientScopeMappings']['realm-management']==[{'client':'aerodesk-provisioner','roles':['manage-users']}]
    profile=json.loads(realm['components']['org.keycloak.userprofile.UserProfileProvider'][0]['config']['kc.user.profile.config'][0])
    for name in ('aerodesk_user_id','aerodesk_airport_id'):
        attribute=next(a for a in profile['attributes'] if a['name']==name)
        assert attribute['permissions']=={'view':['admin'],'edit':['admin']}
