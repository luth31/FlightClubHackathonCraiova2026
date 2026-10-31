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
    monkeypatch.setattr(settings, 'oidc_issuer', 'http://127.0.0.1:8180/realms/craiova')
    monkeypatch.setattr(settings, 'oidc_internal_issuer', 'http://craiova-identity:8080/realms/craiova')
    monkeypatch.setattr(settings, 'keycloak_provisioning_client_secret', SecretStr('private-service-secret'))
    monkeypatch.setattr(settings, 'keycloak_activation_email', False)
    person=SimpleNamespace(id='emp-test',name='Mara Test',email='mara@example.test',airport_id='craiova',
        identity_subject=None,identity_issuer=None,active=False)
    calls=[]
    users=[]
    def transport(method,url,**kwargs):
        calls.append((method,url,kwargs))
        if url.endswith('/token'): return httpx.Response(200,json={'access_token':'private-service-token'})
        if method=='GET':
            if url.endswith('/users'): return httpx.Response(200,json=users)
            matches = [user for user in users if url.endswith('/' + user['id'])]
            return httpx.Response(200,json=matches[0]) if matches else httpx.Response(404)
        if method=='POST':
            users.append({'id':'subject-test',**kwargs['json']})
            return httpx.Response(201)
        if method=='PUT' and url.endswith('/subject-test'):
            users[0].update(kwargs['json'])
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


def test_provisioning_preserves_given_names_and_compound_surname(provider):
    person, calls, _ = provider
    person.name = 'Ana Maria De la Cruz'
    person.first_name, person.middle_name, person.last_name = 'Ana', 'Maria', 'De la Cruz'
    provisioning.provision(person)
    payload = next(kwargs['json'] for method, url, kwargs in calls if method == 'POST' and url.endswith('/users'))
    assert payload['firstName'] == 'Ana Maria'
    assert payload['lastName'] == 'De la Cruz'


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
    person.identity_subject, person.identity_issuer = 'subject-test', settings.oidc_issuer
    users.append({'id':'subject-test','username':provisioning.username(person),'enabled':False})
    result=provisioning.provision(person)
    assert result['subject']=='subject-test'
    assert any(method=='PUT' and url.endswith('/subject-test') and kwargs.get('json')=={'enabled':True}
        for method,url,kwargs in calls)


def test_login_username_is_normalized_email_local_part(provider):
    person, _, _ = provider
    person.email = ' D.Voicu@arm.ro '
    assert provisioning.username(person) == 'd.voicu'


def test_sign_in_url_has_only_a_username_hint_and_requires_an_active_oidc_account(provider, monkeypatch):
    from urllib.parse import urlsplit, parse_qs
    person, _, _ = provider
    monkeypatch.setattr(settings, 'auth_mode', 'oidc')
    monkeypatch.setattr(settings, 'oidc_frontend_url', 'https://portal.example/')
    person.active = True
    person.identity_subject, person.identity_issuer = 'subject-test', settings.oidc_issuer
    url = urlsplit(provisioning.sign_in_url(person))
    assert url.scheme == 'https' and url.netloc == 'portal.example'
    assert url.path == '/api/auth/oidc/login'
    assert parse_qs(url.query) == {'login_hint':['mara']}
    person.active = False
    assert provisioning.sign_in_url(person) is None


def test_bound_user_is_found_by_subject_and_can_be_renamed_without_password_reset(provider):
    person, calls, users = provider
    person.identity_subject, person.identity_issuer = 'subject-test', settings.oidc_issuer
    users.append({'id':'subject-test', 'username':'employee-emp-test', 'enabled':True})
    assert provisioning.owned_user('http://provider/users', {}, person)['id'] == 'subject-test'
    provisioning.rename_username(person)
    assert users[0]['username'] == 'mara'
    assert not any(url.endswith('/reset-password') for _, url, _ in calls)


def test_provisioning_legacy_bound_account_updates_username_before_credentials(provider):
    person, calls, users = provider
    person.identity_subject, person.identity_issuer = 'subject-test', settings.oidc_issuer
    users.append({'id':'subject-test', 'username':'employee-emp-test', 'enabled':True})
    result = provisioning.provision(person)
    assert result['subject'] == 'subject-test'
    assert users[0]['username'] == 'mara'
    rename = next(i for i, (method, url, kwargs) in enumerate(calls) if method == 'PUT' and kwargs.get('json') == {'username':'mara'})
    reset = next(i for i, (_, url, _) in enumerate(calls) if url.endswith('/reset-password'))
    assert rename < reset


def test_username_rename_collision_preserves_existing_identity(provider, monkeypatch):
    person, _, users = provider
    person.identity_subject, person.identity_issuer = 'subject-test', settings.oidc_issuer
    users.append({'id':'subject-test', 'username':'old-username', 'enabled':True})
    original = provisioning.request
    def transport(method, url, **kwargs):
        if method == 'PUT' and url.endswith('/subject-test'): return httpx.Response(409)
        return original(method, url, **kwargs)
    monkeypatch.setattr(provisioning, 'request', transport)
    with pytest.raises(DomainError) as exc: provisioning.rename_username(person)
    assert exc.value.status == 409
    assert users[0]['username'] == 'old-username'


def test_offboarding_does_not_touch_another_identity(provider):
    person,calls,users=provider
    person.identity_issuer='https://wrong.example/realms/craiova'
    with pytest.raises(DomainError): provisioning.set_enabled(person)
    assert not calls


@pytest.mark.parametrize('airport',['craiova','sibiu'])
def test_realm_service_client_has_only_user_management_scope(airport):
    realm=json.loads((Path(__file__).resolve().parents[2]/'deploy/keycloak'/f'{airport}-realm.json').read_text(encoding='utf-8'))
    client=next(c for c in realm['clients'] if c['clientId']=='flyleaf-provisioner')
    assert not client['publicClient'] and client['serviceAccountsEnabled']
    assert not client['standardFlowEnabled'] and not client['fullScopeAllowed']
    assert realm['clientScopeMappings']['realm-management']==[{'client':'flyleaf-provisioner','roles':['manage-users']}]
    profile=json.loads(realm['components']['org.keycloak.userprofile.UserProfileProvider'][0]['config']['kc.user.profile.config'][0])
    assert realm['editUsernameAllowed'] is True
    username_attribute=next(a for a in profile['attributes'] if a['name']=='username')
    assert username_attribute['permissions']=={'view':['admin','user'],'edit':['admin']}
    for name in ('flyleaf_user_id','flyleaf_airport_id'):
        attribute=next(a for a in profile['attributes'] if a['name']==name)
        assert attribute['permissions']=={'view':['admin'],'edit':['admin']}
