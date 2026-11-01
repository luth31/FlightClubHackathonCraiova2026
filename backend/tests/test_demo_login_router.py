import importlib.util
from pathlib import Path
import sqlite3
import httpx
import pytest

spec=importlib.util.spec_from_file_location('demo_login',Path(__file__).resolve().parents[2]/'scripts'/'demo_login.py')
demo=importlib.util.module_from_spec(spec);spec.loader.exec_module(demo)


@pytest.fixture
def demo_nodes(tmp_path,monkeypatch):
    nodes={}
    for index,(airport,name) in enumerate((('craiova','Ana Ionescu'),('sibiu','Alexandru Mureșan'),('cluj','Mara Georgescu'),('iasi','Andrei Constantinescu'))):
        path=tmp_path/(airport+'.db')
        db=sqlite3.connect(path)
        db.execute('CREATE TABLE users (id TEXT, name TEXT, email TEXT, airport_id TEXT, active INTEGER)')
        db.execute('INSERT INTO users VALUES (?,?,?,?,?)',('admin',name,'admin@'+airport+'.example',airport,1))
        db.commit();db.close()
        nodes[airport]={'api_port':8014+index,'web_port':5184+index,'env':{'FLYLEAF_DATABASE_URL':'sqlite:///'+path.as_posix()}}
    calls=[]
    def post(url,**kwargs):
        calls.append((url,kwargs))
        if kwargs['json']['password']!='correct':return httpx.Response(401)
        airport=next(key for key,node in nodes.items() if str(node['api_port']) in url)
        return httpx.Response(200,json={'current_user':{'id':'admin','airport_id':airport}},
            headers={'set-cookie':f'flyleaf_session_{airport}=test-token; HttpOnly; Path=/api; SameSite=strict'})
    monkeypatch.setattr(demo.httpx,'post',post)
    return nodes,calls


def test_same_local_ids_resolve_by_typed_name_to_the_correct_airport(demo_nodes):
    nodes,calls=demo_nodes
    for name,airport in [('Ana Ionescu','craiova'),('  ALEXANDRU  MURESAN ','sibiu'),('Mara Georgescu','cluj'),('Andrei Constantinescu','iasi')]:
        status,result,cookies=demo.authenticate(nodes,{'user_id':name,'password':'correct'},'127.0.0.1')
        assert status==200
        assert result=={'redirect_url':f'http://127.0.0.1:{nodes[airport]["web_port"]}/'}
        assert calls[-1][0]==f'http://127.0.0.1:{nodes[airport]["api_port"]}/api/auth/login'
        assert calls[-1][1]['json']=={'user_id':'admin','password':'correct'}
        assert cookies[0].startswith('flyleaf_session_'+airport+'=')


def test_blank_wrong_unknown_and_role_ids_cannot_set_a_session_or_redirect(demo_nodes):
    nodes,calls=demo_nodes
    for name,password in [('Ana Ionescu',''),('Ana Ionescu','   '),('Ana Ionescu','wrong'),('Unknown Person','correct'),('admin','correct'),('','correct')]:
        status,result,cookies=demo.authenticate(nodes,{'user_id':name,'password':password},'127.0.0.1')
        assert status in (401,422) and not cookies and 'redirect_url' not in result
    before=len(calls)
    assert demo.authenticate(nodes,{'user_id':'Ana Ionescu','password':'correct'},'untrusted.example')[0]==403
    assert len(calls)==before


def test_duplicate_names_and_inactive_accounts_do_not_select_an_airport(demo_nodes):
    nodes,calls=demo_nodes
    path=nodes['sibiu']['env']['FLYLEAF_DATABASE_URL'].removeprefix('sqlite:///')
    with sqlite3.connect(path) as db:db.execute('UPDATE users SET name=?',('Ana Ionescu',))
    assert demo.authenticate(nodes,{'user_id':'Ana Ionescu','password':'correct'},'127.0.0.1')[0]==401
    assert not calls
    with sqlite3.connect(path) as db:db.execute('UPDATE users SET active=0')
    assert demo.authenticate(nodes,{'user_id':'admin@sibiu.example','password':'correct'},'127.0.0.1')[0]==401
    result=demo.authenticate(nodes,{'user_id':'admin@craiova.example','password':'correct'},'localhost')
    assert result[0]==200 and result[1]['redirect_url']=='http://localhost:5184/'


def test_unavailable_airport_never_creates_a_session(demo_nodes,monkeypatch):
    nodes,_=demo_nodes
    def unavailable(*args,**kwargs):raise httpx.ConnectError('offline')
    monkeypatch.setattr(demo.httpx,'post',unavailable)
    status,result,cookies=demo.authenticate(nodes,{'user_id':'Ana Ionescu','password':'correct'},'127.0.0.1')
    assert status==503 and not cookies and 'redirect_url' not in result
