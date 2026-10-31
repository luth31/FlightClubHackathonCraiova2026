import json
from pathlib import Path

import pytest
from sqlalchemy import select

from app.database import SessionLocal
from app.documents.models import Document, DocumentVersion
from app.people.models import User
from conftest import login
from test_workflows import act, approved, assign_review


def proposal_payload(source_version=1, **changes):
    return {
        'source_version': source_version,
        'title': 'Mentenanță pentru al doilea echipament',
        'reason': 'Aeroportul a achiziționat un al doilea echipament.',
        'clause_reference': 'Articolul 3 — Servicii',
        'current_wording': 'Furnizorul întreține un echipament.',
        'proposed_wording': 'Furnizorul va întreține cele două echipamente.',
        'proposed_effective_date': '2027-01-01',
        **changes,
    }


def create_proposal(client, document_id, **changes):
    response = client.post(
        f'/api/contracts/{document_id}/amendment-drafts',
        json=proposal_payload(**changes),
    )
    assert response.status_code == 201, response.text
    return response.json()


def edit_payload(proposal, **changes):
    return {
        key: proposal[key] for key in (
            'title', 'reason', 'clause_reference', 'current_wording',
            'proposed_wording', 'proposed_effective_date', 'revision',
        )
    } | changes


def stored_evidence(document_id):
    with SessionLocal() as db:
        document = dict(db.execute(
            select(Document.__table__).where(Document.id == document_id)
        ).mappings().one())
        versions = [dict(row) for row in db.execute(
            select(DocumentVersion.__table__).where(
                DocumentVersion.document_id == document_id
            ).order_by(DocumentVersion.version)
        ).mappings()]
    files = {
        path: Path(path).read_bytes()
        for version in versions
        for path in (version['file_path'], version['signed_path']) if path
    }
    return document, versions, files


@pytest.mark.parametrize('signed', [False, True], ids=['approved', 'signed'])
def test_draft_persists_and_reopens_without_changing_contract(admin, pdf_bytes, signed):
    document_id = approved(admin, pdf_bytes)
    if signed:
        assert act(admin, document_id, 'sign').status_code == 200
    before = stored_evidence(document_id)
    document_before = admin.get(f'/api/documents/{document_id}').json()
    tasks_before = [
        task for task in admin.get('/api/tasks?status=all').json()['items']
        if task['document_id'] == document_id
    ]

    proposal = create_proposal(admin, document_id)
    assert proposal['contract_id'] == document_id
    assert proposal['contract_number'] == document_before['number']
    assert proposal['source_version'] == document_before['version']
    assert proposal['status'] == 'draft' and proposal['revision'] == 1
    assert proposal['created_by'] == 'admin' and proposal['can_edit']
    assert not proposal['source_changed']

    listing = admin.get(f'/api/contracts/{document_id}/amendment-drafts').json()
    assert listing == {'items': [proposal], 'total': 1}
    changed_wording = 'Furnizorul va întreține cele două echipamente lunar.'
    updated = admin.patch(
        f'/api/contracts/{document_id}/amendment-drafts/{proposal["id"]}',
        json=edit_payload(proposal, proposed_wording=changed_wording),
    )
    assert updated.status_code == 200, updated.text
    updated_proposal = updated.json()
    assert updated_proposal['revision'] == 2
    assert updated_proposal['proposed_wording'] == changed_wording
    assert updated_proposal['source_version'] == proposal['source_version']
    reopened = admin.get(f'/api/contracts/{document_id}/amendment-drafts').json()
    assert reopened['items'] == [updated_proposal]

    # Drafting must preserve the agreement, signed bytes and approval tasks.
    assert stored_evidence(document_id) == before
    tasks_after = [
        task for task in admin.get('/api/tasks?status=all').json()['items']
        if task['document_id'] == document_id
    ]
    assert tasks_after == tasks_before
    document_after = admin.get(f'/api/documents/{document_id}').json()
    original_event_ids = {event['id'] for event in document_before['audit']}
    new_events = [event for event in document_after['audit'] if event['id'] not in original_event_ids]
    assert len(new_events) == 2
    assert all(event['actor_id'] == 'admin' and proposal['id'] in event['detail'] for event in new_events)
    assert document_after['permissions']['can_propose_amendment'] is True


def test_unchanged_save_keeps_revision_and_stale_save_cannot_overwrite(admin, pdf_bytes):
    document_id = approved(admin, pdf_bytes)
    proposal = create_proposal(admin, document_id)
    endpoint = f'/api/contracts/{document_id}/amendment-drafts/{proposal["id"]}'
    unchanged = admin.patch(endpoint, json=edit_payload(proposal))
    assert unchanged.status_code == 200, unchanged.text
    assert unchanged.json()['revision'] == 1

    first = admin.patch(endpoint, json=edit_payload(proposal, title='Prima modificare salvată'))
    assert first.status_code == 200, first.text
    stale = admin.patch(endpoint, json=edit_payload(proposal, title='Modificare dintr-o filă veche'))
    assert stale.status_code == 409, stale.text
    saved = admin.get(f'/api/contracts/{document_id}/amendment-drafts').json()['items'][0]
    assert saved['title'] == 'Prima modificare salvată' and saved['revision'] == 2


def test_optional_fields_and_whitespace_are_handled(admin, pdf_bytes):
    document_id = approved(admin, pdf_bytes)
    body = proposal_payload(title='  Propunere de mentenanță  ')
    body.pop('current_wording')
    body.pop('proposed_effective_date')
    response = admin.post(f'/api/contracts/{document_id}/amendment-drafts', json=body)
    assert response.status_code == 201, response.text
    proposal = response.json()
    assert proposal['title'] == 'Propunere de mentenanță'
    assert proposal['current_wording'] == ''
    assert proposal['proposed_effective_date'] is None


@pytest.mark.parametrize('account', ['finance', 'reviewer'], ids=['other-department', 'approval-delegate'])
def test_contract_reading_and_approval_delegation_do_not_allow_drafting(admin, pdf_bytes, account):
    document_id = approved(admin, pdf_bytes)
    proposal = create_proposal(admin, document_id)
    login(admin, account)
    document = admin.get(f'/api/documents/{document_id}')
    assert document.status_code == 200
    assert document.json()['permissions']['can_propose_amendment'] is False
    listing = admin.get(f'/api/contracts/{document_id}/amendment-drafts')
    assert listing.status_code == 200
    assert listing.json()['items'][0]['can_edit'] is False
    assert admin.post(
        f'/api/contracts/{document_id}/amendment-drafts', json=proposal_payload()
    ).status_code == 403
    assert admin.patch(
        f'/api/contracts/{document_id}/amendment-drafts/{proposal["id"]}',
        json=edit_payload(proposal),
    ).status_code == 403


def test_department_author_and_director_can_edit_but_another_author_cannot(admin, pdf_bytes):
    document_id = approved(admin, pdf_bytes)
    director_proposal = create_proposal(admin, document_id)
    login(admin, 'manager')
    author_proposal = create_proposal(admin, document_id)
    assert author_proposal['created_by'] == 'manager'
    author_endpoint = f'/api/contracts/{document_id}/amendment-drafts/{author_proposal["id"]}'
    assert admin.patch(author_endpoint, json=edit_payload(author_proposal, title='Modificare de către autor')).status_code == 200
    other_endpoint = f'/api/contracts/{document_id}/amendment-drafts/{director_proposal["id"]}'
    assert admin.patch(other_endpoint, json=edit_payload(director_proposal)).status_code == 403
    login(admin, 'admin')
    current = next(item for item in admin.get(f'/api/contracts/{document_id}/amendment-drafts').json()['items'] if item['id'] == author_proposal['id'])
    assert admin.patch(author_endpoint, json=edit_payload(current, title='Modificare de către director')).status_code == 200


def test_it_admin_role_alone_does_not_grant_drafting(admin, pdf_bytes, db):
    document_id = approved(admin, pdf_bytes)
    user = db.get(User, 'admin')
    original_roles = user.roles
    try:
        user.roles = ['admin']
        db.commit()
        assert admin.get(f'/api/documents/{document_id}').json()['permissions']['can_propose_amendment'] is False
        assert admin.post(f'/api/contracts/{document_id}/amendment-drafts', json=proposal_payload()).status_code == 403
    finally:
        user.roles = original_roles
        db.commit()


def test_author_losing_drafting_authority_cannot_edit(admin, pdf_bytes, db):
    document_id = approved(admin, pdf_bytes)
    login(admin, 'manager')
    proposal = create_proposal(admin, document_id)
    author = db.get(User, 'manager')
    original_roles = author.roles
    try:
        author.roles = []
        db.commit()
        listing = admin.get(f'/api/contracts/{document_id}/amendment-drafts')
        assert listing.status_code == 200
        assert listing.json()['items'][0]['can_edit'] is False
        assert admin.patch(
            f'/api/contracts/{document_id}/amendment-drafts/{proposal["id"]}',
            json=edit_payload(proposal),
        ).status_code == 403
    finally:
        author.roles = original_roles
        db.commit()


@pytest.mark.parametrize('state,validated', [('draft', False), ('in_review', True), ('approved', False), ('archived', True)])
def test_parent_must_be_validated_and_approved_or_signed(admin, pdf_bytes, db, state, validated):
    document_id = approved(admin, pdf_bytes)
    document = db.get(Document, document_id)
    document.status, document.validated = state, validated
    db.commit()
    assert admin.get(f'/api/documents/{document_id}').json()['permissions']['can_propose_amendment'] is False
    response = admin.post(f'/api/contracts/{document_id}/amendment-drafts', json=proposal_payload())
    assert response.status_code == 409, response.text


def test_archived_parent_keeps_drafts_readable_but_not_editable(admin, pdf_bytes):
    document_id = approved(admin, pdf_bytes)
    proposal = create_proposal(admin, document_id)
    assert act(admin, document_id, 'archive').status_code == 200
    listing = admin.get(f'/api/contracts/{document_id}/amendment-drafts')
    assert listing.status_code == 200
    assert listing.json()['items'][0]['can_edit'] is False
    assert admin.patch(
        f'/api/contracts/{document_id}/amendment-drafts/{proposal["id"]}',
        json=edit_payload(proposal),
    ).status_code == 409


def test_source_version_change_requires_a_new_proposal(admin, pdf_bytes):
    document_id = approved(admin, pdf_bytes)
    proposal = create_proposal(admin, document_id)
    assert admin.post(
        f'/api/contracts/{document_id}/amendment-drafts', json=proposal_payload(source_version=2)
    ).status_code == 409
    changed = admin.patch(f'/api/documents/{document_id}', json={'title': 'Contract de bază revizuit'})
    assert changed.status_code == 200
    for action in ('validate', 'submit'):
        assert act(admin, document_id, action).status_code == 200
    assign_review(admin, document_id)
    assert act(admin, document_id, 'approve').status_code == 200

    item = admin.get(f'/api/contracts/{document_id}/amendment-drafts').json()['items'][0]
    assert item['source_changed'] and not item['can_edit']
    assert item['source_version'] == 1
    assert admin.patch(
        f'/api/contracts/{document_id}/amendment-drafts/{proposal["id"]}',
        json=edit_payload(proposal, proposed_wording='Schimbare bazată pe versiunea veche.'),
    ).status_code == 409
    assert create_proposal(admin, document_id, source_version=2)['source_version'] == 2


def test_unreadable_cross_airport_and_noncontract_sources_are_not_exposed(admin, pdf_bytes, db):
    document_id = approved(admin, pdf_bytes)
    proposal = create_proposal(admin, document_id)
    login(admin, 'technician')
    endpoint = f'/api/contracts/{document_id}/amendment-drafts'
    assert admin.get(endpoint).status_code == 404
    assert admin.post(endpoint, json=proposal_payload()).status_code == 404
    assert admin.patch(f'{endpoint}/{proposal["id"]}', json=edit_payload(proposal)).status_code == 404
    login(admin, 'admin')
    assert admin.get('/api/contracts/test-procedure/amendment-drafts').status_code == 404
    assert admin.post('/api/contracts/test-procedure/amendment-drafts', json=proposal_payload()).status_code == 404
    document = db.get(Document, document_id)
    document.airport_id = 'carpati'
    db.commit()
    assert admin.get(endpoint).status_code == 404
    assert admin.post(endpoint, json=proposal_payload()).status_code == 404


def test_draft_cannot_be_addressed_through_another_contract(admin, pdf_bytes):
    first = approved(admin, pdf_bytes)
    second = approved(admin, pdf_bytes)
    proposal = create_proposal(admin, first)
    response = admin.patch(
        f'/api/contracts/{second}/amendment-drafts/{proposal["id"]}',
        json=edit_payload(proposal),
    )
    assert response.status_code == 404, response.text


@pytest.mark.parametrize('changes', [
    {'title': '   '}, {'reason': '   '}, {'clause_reference': ' '},
    {'proposed_wording': '  '}, {'proposed_effective_date': '2027-02-30'},
    {'source_version': 0}, {'source_version': float('nan')}, {'status': 'approved'},
])
def test_invalid_or_forged_proposals_are_rejected(admin, pdf_bytes, changes):
    document_id = approved(admin, pdf_bytes)
    response = admin.post(
        f'/api/contracts/{document_id}/amendment-drafts',
        content=json.dumps(proposal_payload(**changes)),
        headers={'Content-Type': 'application/json'},
    )
    assert response.status_code == 422, response.text
    assert admin.get(f'/api/contracts/{document_id}/amendment-drafts').json()['total'] == 0


def test_draft_creation_requires_a_session(client):
    endpoint = '/api/contracts/test-contract/amendment-drafts'
    assert client.get(endpoint).status_code == 401
    assert client.post(endpoint, json=proposal_payload()).status_code == 401
