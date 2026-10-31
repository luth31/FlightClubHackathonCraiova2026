from pathlib import Path

import pytest
from sqlalchemy import select

from app.database import SessionLocal
from app.documents.models import DocumentVersion
from test_workflows import act, approved


@pytest.mark.parametrize(
    'actions',
    [('sign',), ('archive',), ('sign', 'archive')],
    ids=['signed', 'archived-approved', 'archived-signed'],
)
def test_locked_document_rejects_edits_without_changing_evidence(admin, pdf_bytes, actions):
    document_id = approved(admin, pdf_bytes)
    for action in actions:
        response = act(admin, document_id, action)
        assert response.status_code == 200, response.text

    before = admin.get(f'/api/documents/{document_id}').json()
    for permission in ('can_edit', 'can_validate', 'can_submit'):
        assert before['permissions'][permission] is False, permission
    tasks_before = [
        task for task in admin.get('/api/tasks?status=all').json()['items']
        if task['document_id'] == document_id
    ]
    versions_query = select(DocumentVersion.__table__).where(
        DocumentVersion.document_id == document_id
    ).order_by(DocumentVersion.version)
    with SessionLocal() as db:
        versions_before = [dict(row) for row in db.execute(versions_query).mappings()]
    stored = versions_before[-1]
    original_bytes = Path(stored['file_path']).read_bytes()
    displayed_bytes = Path(stored['signed_path'] or stored['file_path']).read_bytes()

    patch = admin.patch(f'/api/documents/{document_id}', json={'title': 'Changed title'})
    assert patch.status_code == 409, patch.text
    revision = admin.post(
        f'/api/documents/{document_id}/versions',
        files={'file': ('replacement.pdf', pdf_bytes, 'application/pdf')},
        data={'comment': 'Attempt to replace a locked document'},
    )
    assert revision.status_code == 409, revision.text

    # Rejected edits must preserve approvals, signatures, tasks and audit history.
    after = admin.get(f'/api/documents/{document_id}').json()
    for field in ('title', 'status', 'version', 'validated', 'versions', 'audit', 'permissions'):
        assert after[field] == before[field], field
    tasks_after = [
        task for task in admin.get('/api/tasks?status=all').json()['items']
        if task['document_id'] == document_id
    ]
    assert tasks_after == tasks_before
    with SessionLocal() as db:
        versions_after = [dict(row) for row in db.execute(versions_query).mappings()]
    assert versions_after == versions_before
    assert Path(stored['file_path']).read_bytes() == original_bytes

    current_file = admin.get(f'/api/documents/{document_id}/file')
    historic_file = admin.get(f'/api/documents/{document_id}/file?version=1')
    assert current_file.status_code == historic_file.status_code == 200
    assert current_file.content == historic_file.content == displayed_bytes
    verification = admin.get(f'/api/documents/{document_id}/verify').json()
    assert verification['integrity']
    assert verification['signed'] == ('sign' in actions)
