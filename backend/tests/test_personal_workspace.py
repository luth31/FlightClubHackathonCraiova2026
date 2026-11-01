from datetime import timedelta
from uuid import uuid4
from conftest import login
from app.config import settings
from app.documents.models import Document, DocumentVersion
from app.tasks.models import WorkflowTask


def document(db, **fields):
    key = 'workspace-' + uuid4().hex[:12]
    values = dict(id=key, title='Document personal ' + key, number=key, category='Contract', department='Achiziții',
        status='approved', created_at='2026-10-01', updated_at='2026-10-01', expires_at=None, supplier='Exemplu',
        currency='RON', owner='Alt responsabil', created_by='seed', confidentiality='internal', summary='Rezumat verificat',
        searchable_text='Document sintetic pentru verificarea spațiului personal', version=1, validated=True, airport_id=settings.airport_id, extra={})
    values.update(fields)
    item = Document(**values); db.add(item); db.flush()
    from sqlalchemy import select
    original = db.scalar(select(DocumentVersion).where(DocumentVersion.document_id == 'test-contract', DocumentVersion.version == 1))
    db.add(DocumentVersion(id='version-' + key, document_id=key, version=1, file_path=original.file_path,
        filename='workspace-test.pdf', sha256=original.sha256, created_at=values['created_at'], created_by='seed', snapshot={}, comment='Test fixture'))
    db.commit()
    return item


def test_personal_home_includes_assigned_work_not_every_accessible_approval(client, db):
    mine = document(db, status='in_review')
    other = document(db, status='in_review')
    for doc, owner in ((mine, 'admin'), (other, 'manager')):
        db.add(WorkflowTask(id='task-' + doc.id, document_id=doc.id, document_version=1, type='approval', status='pending',
            assigned_to=owner, due_date=str(settings.reference_date), created_at='2026-10-01', updated_at='2026-10-01'))
    db.commit(); login(client)
    actions = client.get('/api/workspace/home').json()['actions']
    assert any(a.get('document_id') == mine.id for a in actions)
    assert not any(a.get('document_id') == other.id for a in actions)
    assert client.get('/api/documents/' + other.id).status_code == 200
    mine_ids = [d['id'] for d in client.get('/api/workspace/documents?mine=true').json()['items']]
    assert mine.id in mine_ids and other.id not in mine_ids


def test_recent_documents_are_personal_and_access_is_rechecked(client, db):
    doc = document(db)
    login(client)
    assert client.post('/api/workspace/recent/' + doc.id).status_code == 200
    assert doc.id in [d['id'] for d in client.get('/api/workspace/home').json()['recent_documents']]
    login(client, 'finance')
    assert doc.id not in [d['id'] for d in client.get('/api/workspace/home').json()['recent_documents']]
    login(client, 'technician')
    assert client.post('/api/workspace/recent/' + doc.id).status_code == 404
    assert doc.id not in str(client.get('/api/workspace/home').json())


def test_expiry_kpis_handle_boundaries_validation_and_archive(client, db):
    owner = 'Validity ' + uuid4().hex
    today = settings.reference_date
    now_doc = document(db, owner=owner, expires_at=str(today))
    expired = document(db, owner=owner, expires_at=str(today - timedelta(days=1)))
    document(db, owner=owner, expires_at=str(today + timedelta(days=30)))
    document(db, owner=owner, expires_at=str(today + timedelta(days=31)))
    document(db, owner=owner, expires_at=str(today), validated=False)
    document(db, owner=owner)
    document(db, owner=owner, expires_at=str(today - timedelta(days=1)), status='archived')
    login(client)
    query = {'owner': owner}
    baseline = client.get('/api/workspace/documents', params=query).json()
    assert baseline['counters'] == {'total': 7, 'expiring': 2, 'expired': 1, 'unknown': 2}
    for kind in ('expiring', 'expired', 'unknown'):
        data = client.get('/api/workspace/documents', params={**query, 'validity_filter': kind}).json()
        assert data['total'] == baseline['counters'][kind]
    future_ids = [d['id'] for d in client.get('/api/workspace/documents', params={**query, 'validity_filter': 'expiring'}).json()['items']]
    assert now_doc.id in future_ids and expired.id not in future_ids


def test_assistant_scope_expired_intent_version_and_permission(client, db):
    doc = document(db, expires_at=str(settings.reference_date - timedelta(days=1)))
    login(client)
    answer = client.post('/api/assistant', json={'question': 'Câte contracte au expirat?', 'document_id': doc.id, 'version': 1}).json()
    assert answer['answer'].startswith('1 contracte')
    assert [s['id'] for s in answer['sources']] == [doc.id]
    assert answer['sources'][0]['page'] is None
    assert answer['scope']['document_id'] == doc.id
    future = client.post('/api/assistant', json={'question': 'Ce contracte expiră în 30 zile?', 'document_id': doc.id}).json()
    assert future['sources'] == []
    assert client.post('/api/assistant', json={'question': 'Rezumă documentul', 'document_id': doc.id, 'version': 2}).status_code == 409
    login(client, 'technician')
    assert client.post('/api/assistant', json={'question': 'Rezumă documentul', 'document_id': doc.id}).status_code == 404


def test_unvalidated_scope_does_not_fall_back_to_other_records(client, db):
    doc = document(db, validated=False)
    login(client)
    answer = client.post('/api/assistant', json={'question': 'Rezumă acest document', 'document_id': doc.id}).json()
    assert answer['sources'] == []
    assert 'nu sunt validate' in answer['answer']


def test_scoped_deadline_works_for_non_contract_and_legacy_active_filter(client, db):
    deadline = str(settings.reference_date + timedelta(days=45))
    doc = document(db, category='Proces-verbal', expires_at=deadline)
    login(client)
    answer = client.post('/api/assistant', json={'question': 'Care este termenul acestui document?', 'document_id': doc.id}).json()
    assert deadline in answer['answer']
    assert [s['id'] for s in answer['sources']] == [doc.id]
    active = client.get('/api/workspace/documents?category=Contract&contract_status=active&limit=500').json()
    assert all(d['contract_status'] == 'active' and d['category'] == 'Contract' for d in active['items'])


def test_personal_expiry_uses_account_id_not_a_shared_display_name(client, db):
    from app.people.models import User
    login(client)
    admin = db.get(User, 'admin')
    deadline = str(settings.reference_date + timedelta(days=5))
    own = document(db, category='Proces-verbal', owner_id=admin.id, owner='Previous name', expires_at=deadline)
    unrelated = document(db, category='Proces-verbal', owner_id='manager', owner=admin.name, expires_at=deadline)
    actions = client.get('/api/workspace/home').json()['actions']
    assert any(a.get('document_id') == own.id for a in actions)
    assert not any(a.get('document_id') == unrelated.id for a in actions)


def test_document_responsible_profile_uses_recorded_account_not_extracted_metadata(client, db):
    doc = document(db, owner_id='manager', owner='Nume anterior', extra={'owner_id':'admin'})
    login(client)
    response = client.get('/api/documents/' + doc.id)
    assert response.status_code == 200
    assert response.json()['owner_id'] == 'manager'
    assert response.json()['owner'] == 'Nume anterior'
