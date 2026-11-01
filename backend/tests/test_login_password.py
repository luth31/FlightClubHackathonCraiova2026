def test_new_session_requires_nonempty_correct_password(client):
    assert client.get('/api/session').json()['current_user'] is None
    assert client.get('/api/session').json()['users'] == []
    for password in ('','   ','incorrect-password'):
        response=client.post('/api/auth/login',json={'user_id':'admin','password':password})
        assert response.status_code in (401,422)
        assert client.get('/api/session').json()['current_user'] is None
    assert client.post('/api/auth/login',json={'user_id':'admin','password':'FlyLeaf2026!'}).status_code==200
    assert client.get('/api/session').json()['current_user']['id']=='admin'
    assert client.post('/api/auth/logout').status_code==200
    assert client.get('/api/session').json()['current_user'] is None


def test_name_login_normalizes_spacing_case_and_diacritics_and_keeps_real_identity(client,db):
    from app.people.models import User
    user=db.get(User,'admin');original=user.name
    try:
        user.name='Ana Ioneșcu';db.commit()
        response=client.post('/api/auth/login',json={'user_id':'  ANA   IONESCU  ','password':'FlyLeaf2026!'})
        assert response.status_code==200,response.text
        assert response.json()['current_user']['id']=='admin'
        assert [u['id'] for u in response.json()['users']]==['admin']
    finally:
        user.name=original;db.commit()


def test_duplicate_names_require_an_unambiguous_identity_and_inactive_accounts_cannot_login(client,db):
    from app.people.models import User
    admin=db.get(User,'admin');other=db.get(User,'manager');original_name,original_active=other.name,admin.active
    try:
        other.name=admin.name;db.commit()
        assert client.post('/api/auth/login',json={'user_id':admin.name,'password':'FlyLeaf2026!'}).status_code==401
        assert client.post('/api/auth/login',json={'user_id':admin.email,'password':'FlyLeaf2026!'}).status_code==200
        admin.active=False;db.commit()
        assert client.post('/api/auth/login',json={'user_id':admin.email,'password':'FlyLeaf2026!'}).status_code==401
    finally:
        other.name=original_name;admin.active=original_active;db.commit()
