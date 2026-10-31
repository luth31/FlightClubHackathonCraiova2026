from conftest import login
from test_suppliers import create_case,supplier
from app.people.models import User

def assign(client,case,person='finance',revision=1):
    return client.post(f'/api/supplier-reviews/{case["id"]}/assign',json={
        'assigned_to':person,'due_date':'2026-11-01','comment':'Review this case','assignment_revision':revision})

def test_assignment_requires_active_authorized_accessible_person(admin):
    case,_=create_case(admin)
    response=assign(admin,case);assert response.status_code==200,response.text
    assert response.json()['assigned_to']=='finance'
    assert assign(admin,case,revision=1).status_code==409
    assert assign(admin,case,'technician',2).status_code==422
    login(admin,'finance')
    assert assign(admin,case,revision=2).status_code==403

def test_offboarding_flags_open_review_without_completing_it(admin,db):
    case,_=create_case(admin);assert assign(admin,case).status_code==200
    person=db.get(User,'finance')
    try:
        person.active=False;db.commit()
        response=admin.get(f'/api/supplier-reviews/{case["id"]}').json()
        assert response['assignment_state']=='needs_reassignment'
        assert response['status']=='needs_review'
        assert assign(admin,case,'admin',2).status_code==200
    finally:
        person.active=True;db.commit()

def test_verified_case_needs_another_assignee(admin):
    known=supplier(admin);case,_=create_case(admin);assert assign(admin,case).status_code==200
    login(admin,'finance')
    assert admin.post(f'/api/supplier-reviews/{case["id"]}/verify',json={'contact_used':known['verified_contact'],'note':'Independently confirmed demo contact.'}).status_code==200
    login(admin)
    detail=admin.get(f'/api/supplier-reviews/{case["id"]}').json()
    assert detail['assignment_state']=='awaiting_second_person'
    assert 'finance' not in {u['id'] for u in detail['eligible_assignees']}

def test_mine_and_overdue_follow_assignment_and_reference_date(admin,db):
    from app.suppliers.models import SupplierReview
    case,_=create_case(admin);assert assign(admin,case).status_code==200
    row=db.get(SupplierReview,case['id']);row.due_date='2026-10-29';db.commit()
    login(admin,'finance')
    items=admin.get('/api/supplier-reviews',params={'mine':'true'}).json()['items']
    match=next(c for c in items if c['id']==case['id']);assert match['overdue']
    assert all(c['assigned_to']=='finance' for c in items)
    assert not match.get('eligible_assignees')
