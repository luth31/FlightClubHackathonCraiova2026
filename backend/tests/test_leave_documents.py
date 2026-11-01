from uuid import uuid4

import fitz
import pytest
from sqlalchemy import delete

from conftest import login
from app.config import settings
from app.core.models import AuditEvent
from app.documents.models import Document, DocumentVersion
from app.extraction.models import Extraction
from app.people.models import LeaveRequest, User


@pytest.fixture
def leave_document(client, db):
    login(client, 'technician')
    result = client.post('/api/people/leave', json={
        'starts_at':'2027-06-07', 'ends_at':'2027-06-11', 'reason':'Concediu de odihnă'})
    assert result.status_code == 201, result.text
    item = result.json()
    yield item
    db.expire_all()
    folder = settings.storage_dir / 'documents' / item['document_id']
    db.execute(delete(Extraction).where(Extraction.source_path.like(str(folder) + '/%')))
    db.execute(delete(AuditEvent).where(AuditEvent.document_id == item['document_id']))
    db.execute(delete(DocumentVersion).where(DocumentVersion.document_id == item['document_id']))
    db.execute(delete(Document).where(Document.id == item['document_id']))
    db.execute(delete(LeaveRequest).where(LeaveRequest.id == item['id']))
    db.commit()
    for path in folder.glob('*'): path.unlink()
    if folder.exists(): folder.rmdir()


def text(response):
    assert response.status_code == 200, response.text
    with fitz.open(stream=response.content, filetype='pdf') as pdf:
        return '\n'.join(page.get_text() for page in pdf)


def test_leave_creates_readable_pdf_library_record_and_directory_link(client, leave_document):
    item = leave_document
    detail = client.get('/api/documents/' + item['document_id']).json()
    assert detail['category'] == detail['department'] == 'Resurse umane'
    assert detail['confidentiality'] == 'restricted'
    assert detail['status'] == 'in_review'
    assert detail['managed_workflow']['type'] == 'leave'
    assert not any(detail['permissions'].values())
    assert detail['versions'][0]['version'] == 1
    pdf_text = text(client.get(item['document_url']))
    assert 'Concediu de odihnă' in pdf_text and 'Andrei Neagu' in pdf_text
    assert '07.06.2027 - 11.06.2027' in pdf_text
    assert 'În așteptarea aprobării' in pdf_text
    assert item['document_id'] in {d['id'] for d in client.get('/api/documents').json()['items']}
    directory = client.get('/api/people').json()
    entry = next(leave for leave in directory['leaves'] if leave['id'] == item['id'])
    assert entry['document_id'] == item['document_id'] and entry['document_version'] == 1
    duplicate = client.post('/api/people/leave', json={'starts_at':'2027-06-07','ends_at':'2027-06-11'})
    assert duplicate.status_code == 409
    assert len(client.get('/api/documents/' + item['document_id']).json()['versions']) == 1


def test_leave_pdf_scope_matches_request_scope_without_granting_other_hr_files(client, leave_document):
    url = '/api/documents/' + leave_document['document_id']
    for person in ('hr', 'technical-head', 'admin'):
        login(client, person)
        assert client.get(url).status_code == 200
        assert client.get(url + '/file').status_code == 200
    # The director's narrowly scoped leave access does not open personnel files.
    assert client.get('/api/documents/test-hr').status_code == 404
    for person in ('manager', 'finance', 'reviewer'):
        login(client, person)
        assert client.get(url).status_code == 404
        assert client.get(url + '/file').status_code == 404
        assert leave_document['document_id'] not in {d['id'] for d in client.get('/api/documents').json()['items']}


@pytest.mark.parametrize('action', ['approve', 'reject'])
def test_decision_generates_immutable_version_and_keeps_original(client, leave_document, action):
    item = leave_document
    original = client.get(item['document_url']).content
    login(client, 'technical-head')
    response = client.post(f"/api/people/leave/{item['id']}/decision",
        json={'action':action, 'comment':'Acoperirea turelor a fost verificată.'})
    assert response.status_code == 200, response.text
    assert response.json()['document_id'] == item['document_id']
    assert response.json()['document_version'] == 2
    result = text(client.get(item['document_url']))
    assert ('Aprobată' if action == 'approve' else 'Respinsă') in result
    assert 'Sorin Pavel' in result and 'Acoperirea turelor a fost verificată.' in result
    assert client.get(item['document_url'] + '?version=1').content == original
    login(client, 'technician')
    assert client.get(item['document_url'] + '?version=1').content == original
    assert client.get(item['document_url']).status_code == 200
    detail = client.get('/api/documents/' + item['document_id']).json()
    assert [v['version'] for v in detail['versions']] == [2, 1]
    assert not any(detail['permissions'].values())


def test_leave_document_cannot_be_edited_or_decided_through_generic_workflow(client, leave_document):
    url = '/api/documents/' + leave_document['document_id']
    assert client.patch(url, json={'title':'Replaced leave request'}).status_code == 403
    login(client, 'hr')
    for action in ('approve','reject','sign'):
        response = client.post(url + '/actions', json={'action':action,'comment':'Bypass attempt'})
        assert response.status_code == 409, response.text
    entry = next(l for l in client.get('/api/people').json()['leaves'] if l['id'] == leave_document['id'])
    assert entry['status'] == 'pending'


def test_failed_leave_commit_rolls_back_document_and_removes_pdf(client, db, monkeypatch):
    from app.people import service
    from app.people.schemas import LeaveCreate
    identifier = uuid4().hex[:12]
    monkeypatch.setattr(service, 'uuid4', lambda: type('ID', (), {'hex':identifier})())
    user = db.get(User, 'technician')
    db.rollback()
    monkeypatch.setattr(db, 'commit', lambda: (_ for _ in ()).throw(RuntimeError('commit failed')))
    with pytest.raises(RuntimeError, match='commit failed'):
        service.create_leave(db, user, LeaveCreate(starts_at='2027-09-06', ends_at='2027-09-07'))
    assert db.get(LeaveRequest, 'leave-' + identifier) is None
    assert db.get(Document, 'doc-leave-' + identifier) is None
    assert not (settings.storage_dir / 'documents' / ('doc-leave-' + identifier)).exists()


def test_pdf_escapes_long_free_text_and_supports_romanian_glyphs():
    from types import SimpleNamespace
    from app.people.leave_documents import render_pdf
    person = SimpleNamespace(name='Ștefănescu Țănase', department='Resurse umane', job_title='Specialist', role='HR')
    leave = SimpleNamespace(starts_at='2027-11-01', ends_at='2027-11-05', status='pending',
                            reason='<script> & șțăâî ' + 'Detaliu justificativ. ' * 45)
    content = render_pdf(leave, person, 'FL-RU-TEST', '2026-11-01T10:00:00Z')
    with fitz.open(stream=content, filetype='pdf') as pdf:
        result = '\n'.join(page.get_text() for page in pdf)
        assert 'Ștefănescu Țănase' in result and '<script> & șțăâî' in result
        assert len(pdf) <= 3
