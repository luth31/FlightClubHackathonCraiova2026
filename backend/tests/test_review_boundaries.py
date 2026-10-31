"""Independent review: shared-copy boundaries and concurrent HR decisions."""
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path
from threading import Barrier
import time

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.config import settings
from app.core.models import AuditEvent
from app.main import app
from app.people import service as people_service
from app.sharing.models import Share, SharePreview
from conftest import login
from test_exchange import gateway_headers
from test_workflows import approved


def shared_copy(client, pdf_bytes):
    document_id = approved(client, pdf_bytes)
    preview = client.post(f'/api/documents/{document_id}/share-preview',
        json={'redact_terms': ['SecretAccount123']})
    assert preview.status_code == 200, preview.text
    response = client.post(f'/api/documents/{document_id}/shares', json={
        'preview_id': preview.json()['preview_id'], 'reviewed': True,
        'expires_at': '2026-12-31', 'recipient_airport_id': 'carpati',
        'recipient_airport': 'Aeroportul Carpați'})
    assert response.status_code == 201, response.text
    return document_id, response.json()['id'], preview.json()['preview_id']


def test_expired_share_denies_local_and_peer_download(admin, pdf_bytes, monkeypatch, tmp_path):
    _, share_id, _ = shared_copy(admin, pdf_bytes)
    headers = gateway_headers(monkeypatch, tmp_path)
    monkeypatch.setattr(settings, 'reference_date', date(2027, 1, 1))
    assert admin.get(f'/api/shares/{share_id}/file').status_code == 403
    assert admin.get(f'/api/exchange/shares/{share_id}/file', headers=headers).status_code == 403
    listing = admin.get('/api/exchange/shares', headers=headers).json()
    assert all(item['id'] != share_id for item in listing['items'])


def test_new_source_version_invalidates_shared_copy(admin, pdf_bytes, monkeypatch, tmp_path):
    document_id, share_id, _ = shared_copy(admin, pdf_bytes)
    headers = gateway_headers(monkeypatch, tmp_path)
    response = admin.post(f'/api/documents/{document_id}/versions',
        files={'file': ('revision.pdf', pdf_bytes, 'application/pdf')})
    assert response.status_code == 201, response.text
    assert admin.get(f'/api/shares/{share_id}/file').status_code == 403
    assert admin.get(f'/api/exchange/shares/{share_id}/file', headers=headers).status_code == 403
    assert all(item['id'] != share_id for item in admin.get('/api/exchange/shares', headers=headers).json()['items'])


def test_changed_derivative_is_never_served(admin, pdf_bytes, monkeypatch, tmp_path, db):
    _, share_id, preview_id = shared_copy(admin, pdf_bytes)
    headers = gateway_headers(monkeypatch, tmp_path)
    preview = db.get(SharePreview, preview_id)
    path = Path(preview.file_path)
    original = path.read_bytes()
    try:
        path.write_bytes(original + b'\n% changed after review\n')
        assert admin.get(f'/api/shares/{share_id}/file').status_code == 409
        assert admin.get(f'/api/exchange/shares/{share_id}/file', headers=headers).status_code == 409
    finally:
        path.write_bytes(original)


def test_peer_identity_must_match_grant_recipient(admin, pdf_bytes, monkeypatch, tmp_path, db):
    _, share_id, _ = shared_copy(admin, pdf_bytes)
    headers = gateway_headers(monkeypatch, tmp_path)
    share = db.get(Share, share_id)
    # Model an existing grant to another airport; a valid gateway token does
    # not authorize reading grants issued to a different recipient.
    share.recipient_airport_id = 'different-airport'
    db.commit()
    assert admin.get(f'/api/exchange/shares/{share_id}/file', headers=headers).status_code == 404


def test_concurrent_leave_decisions_commit_once(client, monkeypatch, db):
    login(client, 'technician')
    created = client.post('/api/people/leave', json={
        'starts_at': '2027-04-05', 'ends_at': '2027-04-06',
        'reason': 'Concurrent independent review'})
    assert created.status_code == 201, created.text
    leave_id = created.json()['id']
    original_check = people_service.can_review_leave

    def delayed_check(*args):
        result = original_check(*args)
        # Exercise overlapping requests at the authorization/state boundary.
        time.sleep(0.08)
        return result

    monkeypatch.setattr(people_service, 'can_review_leave', delayed_check)
    with TestClient(app) as first, TestClient(app) as second:
        login(first, 'admin')
        login(second, 'hr')
        start = Barrier(2)

        def decide(pair):
            reviewer, action = pair
            start.wait(timeout=5)
            return reviewer.post(f'/api/people/leave/{leave_id}/decision',
                json={'action': action, 'comment': 'Independent decision'})

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(decide, [(first, 'approve'), (second, 'reject')]))
    assert sorted(result.status_code for result in results) == [200, 409], [r.text for r in results]
    events = list(db.scalars(select(AuditEvent).where(AuditEvent.action.in_(['leave_approved', 'leave_rejected']))))
    assert sum(leave_id in event.detail for event in events) == 1
