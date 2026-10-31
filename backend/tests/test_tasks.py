from conftest import login
from test_workflows import upload,act
from app.people.models import Delegation
from app.tasks.models import WorkflowTask

def submitted(client,pdf):
    id=upload(client,pdf)
    assert act(client,id,'validate').status_code==200
    assert act(client,id,'submit').status_code==200
    return id

def pending_task(client,id,kind='approval'):
    return next(t for t in client.get('/api/tasks').json()['items'] if t['document_id']==id and t['type']==kind)

def test_named_principal_and_current_delegate_control_review(admin,pdf_bytes):
    id=submitted(admin,pdf_bytes)
    task=pending_task(admin,id)
    assert task['assigned_to']=='manager' and task['effective_assignee']=='reviewer'
    assert task['assignment_state']=='delegated'
    assert act(admin,id,'approve').status_code==403
    assert not admin.get(f'/api/documents/{id}').json()['permissions']['can_review']
    login(admin,'reviewer')
    assert admin.get(f'/api/documents/{id}').json()['permissions']['can_review']
    assert act(admin,id,'approve').status_code==200
    assert act(admin,id,'sign').status_code==403
    completed=admin.get(f'/api/tasks/{task["id"]}').json()
    assert completed['completed_by']=='reviewer' and completed['status']=='completed'
    login(admin,'admin')
    assert pending_task(admin,id,'signature')['assigned_to']=='admin'
    assert act(admin,id,'sign').status_code==200

def test_reassignment_requires_scope_and_eligible_recipient(admin,pdf_bytes):
    id=submitted(admin,pdf_bytes);task=pending_task(admin,id)
    url=f'/api/tasks/{task["id"]}/assign'
    body={'assigned_to':'technician','version':1,'comment':'Responsabil nou de test'}
    assert admin.post(url,json=body).status_code==422
    login(admin,'finance')
    body['assigned_to']='admin'
    assert admin.post(url,json=body).status_code==403
    login(admin,'admin')
    body['comment']='   '
    assert admin.post(url,json=body).status_code==422

def test_assignment_and_history_survive_restart(admin,pdf_bytes):
    from fastapi.testclient import TestClient
    from app.main import app
    id=submitted(admin,pdf_bytes);task=pending_task(admin,id)
    response=admin.post(f'/api/tasks/{task["id"]}/assign',json={'assigned_to':'admin','version':1,'due_date':'2026-10-29','comment':'Preluare explicită a dosarului restant'})
    assert response.status_code==200,response.text
    assert response.json()['overdue'] and response.json()['assignee']=='Ana Ionescu'
    with TestClient(app) as restarted:
        login(restarted)
        persisted=restarted.get(f'/api/tasks/{task["id"]}').json()
        assert persisted['assigned_to']=='admin' and persisted['due_date']=='2026-10-29'
        assert persisted['history'][0]['action']=='Sarcină reatribuită'
        assert persisted['history'][0]['comment'].endswith('Preluare explicită a dosarului restant')

def test_new_version_cancels_stale_task_and_denies_reassignment(admin,pdf_bytes):
    id=submitted(admin,pdf_bytes);task=pending_task(admin,id)
    assert admin.patch(f'/api/documents/{id}',json={'title':'O versiune nouă pentru avizare'}).status_code==200
    stale=admin.get(f'/api/tasks/{task["id"]}').json()
    assert stale['status']=='cancelled' and not stale['can_act']
    assert admin.post(f'/api/tasks/{task["id"]}/assign',json={'assigned_to':'admin','version':1,'comment':'Nu se transferă pe versiunea nouă'}).status_code==409
    fresh=pending_task(admin,id,'validation')
    assert fresh['document_version']==2 and fresh['assigned_to']=='admin'

def test_expired_delegation_cannot_complete_assigned_task(admin,pdf_bytes,db):
    id=submitted(admin,pdf_bytes)
    grant=db.get(Delegation,'demo-delegation');previous=grant.ends_at
    try:
        grant.ends_at='2026-10-29';db.commit()
        login(admin,'reviewer')
        assert act(admin,id,'approve').status_code==403
        assert not admin.get(f'/api/documents/{id}').json()['permissions']['can_review']
    finally:
        grant.ends_at=previous;db.commit()

def test_disabled_assignee_requires_explicit_reassignment(admin,pdf_bytes,db):
    id=submitted(admin,pdf_bytes);task=pending_task(admin,id)
    grant=db.get(Delegation,'demo-delegation');previous=grant.active
    try:
        assert admin.patch('/api/people/manager',json={'active':False}).status_code==200
        disabled=admin.get(f'/api/tasks/{task["id"]}').json()
        assert disabled['assignment_state']=='needs_reassignment'
        assert disabled['history'][0]['action']=='Responsabil dezactivat'
        login(admin,'reviewer')
        assert act(admin,id,'approve').status_code==403
        login(admin,'admin')
        reassigned=admin.post(f'/api/tasks/{task["id"]}/assign',json={'assigned_to':'admin','version':1,'comment':'Preluare după dezactivarea contului responsabilului'})
        assert reassigned.status_code==200,reassigned.text
        assert act(admin,id,'approve').status_code==200
    finally:
        login(admin,'admin');admin.patch('/api/people/manager',json={'active':True})
        db.refresh(grant);grant.active=previous;db.commit()


def test_task_comment_is_version_bound_and_attributed(admin,pdf_bytes):
    id=submitted(admin,pdf_bytes);task=pending_task(admin,id)
    login(admin,'reviewer')
    response=admin.post(f'/api/tasks/{task["id"]}/comments',json={'comment':'Anexa tehnică a fost verificată cu responsabilul de mentenanță.','version':1})
    assert response.status_code==201,response.text
    assert response.json()['history'][0]['actor_id']=='reviewer'
    login(admin,'admin')
    admin.patch(f'/api/documents/{id}',json={'title':'Dosar revizuit după observații'})
    assert admin.post(f'/api/tasks/{task["id"]}/comments',json={'comment':'Observație pe versiunea veche','version':1}).status_code==409
