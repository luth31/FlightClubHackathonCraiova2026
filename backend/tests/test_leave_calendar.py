from uuid import uuid4
from app.people.models import User, LeaveRequest


def test_calendar_shares_dates_without_private_leave_details_and_scopes_airport(admin, db):
    suffix=uuid4().hex[:8]
    def person(code, airport='craiova', active=True):
        p=User(id=code+suffix,name=code,email=code+suffix+'@example.test',department='Tehnic',role='Tehnician',
            roles=['technician'],airport_id=airport,active=active,password_hash='unused')
        db.add(p);db.flush();return p
    peer=person('calendar-peer');foreign=person('calendar-foreign','sibiu');inactive=person('calendar-inactive',active=False)
    for p,status,offset in [(peer,'approved','ok'),(peer,'pending','pending'),(peer,'rejected','rejected'),(foreign,'approved','foreign'),(inactive,'approved','inactive')]:
        db.add(LeaveRequest(id=offset+suffix,user_id=p.id,starts_at='2027-04-02',ends_at='2027-04-05',reason='Private reason: not for colleagues',status=status))
    db.add(LeaveRequest(id='outside'+suffix,user_id=peer.id,starts_at='2027-06-01',ends_at='2027-06-05',reason='Private',status='approved'))
    db.commit()
    admin.post('/api/auth/login',json={'user_id':'technician','password':'FlyLeaf2026!'})
    response=admin.get('/api/people/leave/calendar',params={'starts_at':'2027-04-05','ends_at':'2027-04-06'})
    assert response.status_code==200,response.text
    rows=[row for row in response.json()['items'] if row['id'].endswith(suffix)]
    assert {row['id'] for row in rows}=={'ok'+suffix,'pending'+suffix}
    assert all(set(row)=={'id','user_id','name','department','starts_at','ends_at','status'} for row in rows)
    assert 'Private' not in response.text
    directory=admin.get('/api/people').json()
    private=directory['leaves']
    assert not any(item['user_id']==peer.id for item in private)
    assert not any(item['user_id'] in {foreign.id,inactive.id} for item in directory['leave_calendar'])
    assert admin.post('/api/people/leave/pending'+suffix+'/decision',json={'action':'approve'}).status_code==403


def test_calendar_validates_order_and_bounded_range(admin):
    endpoint='/api/people/leave/calendar'
    assert admin.get(endpoint,params={'starts_at':'2027-02-10','ends_at':'2027-02-09'}).status_code==422
    assert admin.get(endpoint,params={'starts_at':'2027-01-01','ends_at':'2029-01-01'}).status_code==422
    assert admin.get(endpoint,params={'starts_at':'invalid','ends_at':'2027-02-09'}).status_code==422


def test_demo_calendar_seed_preserves_decisions_and_document_versions(admin,db,monkeypatch):
    from importlib.util import module_from_spec,spec_from_file_location
    from pathlib import Path
    from app.people.leave_documents import document_id
    from app.documents.models import Document
    spec=spec_from_file_location('demo_leave_test',Path(__file__).resolve().parents[2]/'scripts'/'demo_leave.py')
    module=module_from_spec(spec);spec.loader.exec_module(module)
    module.install_demo_leave(db,'craiova');db.commit()
    leave=db.get(LeaveRequest,'leave-calendar-craiova-reviewer')
    assert leave and leave.status=='approved'
    document=db.get(Document,document_id(leave.id))
    assert document.version==2 and document.extra['metadata']['request_status']=='approved'
    document_id_value=document.id
    leave.reason='Changed locally';leave.starts_at='2026-12-01';leave.ends_at='2026-12-03'
    db.commit()
    module.install_demo_leave(db,'craiova');db.commit()
    assert leave.reason=='Changed locally' and leave.starts_at=='2026-12-01'
    assert db.get(Document,document_id_value).version==2
