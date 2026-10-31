import hashlib
import io
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from pypdf import PdfReader
from sqlalchemy import select

from app.contracts.models import AmendmentDraft
from app.core.models import AuditEvent
from app.database import SessionLocal
from app.documents.models import Document, DocumentVersion
from app.people.models import User
from conftest import login
from test_amendment_drafts import create_proposal, edit_payload, stored_evidence
from test_workflows import act, approved, assign_review


def draft_endpoint(contract_id, proposal):
    return f'/api/contracts/{contract_id}/amendment-drafts/{proposal["id"]}'


def generate(client, contract_id, proposal):
    response = client.post(
        f'{draft_endpoint(contract_id, proposal)}/generate-pdf',
        json={'revision': proposal['revision']},
    )
    assert response.status_code == 200, response.text
    return response.json()


def saved_proposal(client, contract_id, proposal):
    return next(
        item for item in client.get(
            f'/api/contracts/{contract_id}/amendment-drafts'
        ).json()['items'] if item['id'] == proposal['id']
    )


def document_tasks(client, document_id):
    return [
        task for task in client.get('/api/tasks?status=all').json()['items']
        if task['document_id'] == document_id
    ]


def advance(client, document_id, state):
    if state in ('validated', 'in_review', 'approved', 'signed', 'archived'):
        assert act(client, document_id, 'validate').status_code == 200
    if state in ('in_review', 'approved', 'signed', 'archived'):
        assert act(client, document_id, 'submit').status_code == 200
    if state in ('approved', 'signed', 'archived'):
        assign_review(client, document_id)
        assert act(client, document_id, 'approve').status_code == 200
    if state == 'signed':
        assert act(client, document_id, 'sign').status_code == 200
    if state == 'archived':
        assert act(client, document_id, 'archive').status_code == 200


@pytest.mark.parametrize('signed', [False, True], ids=['approved-base', 'signed-base'])
def test_generated_pdf_is_separate_and_preserves_the_base_agreement(admin, pdf_bytes, signed):
    contract_id = approved(admin, pdf_bytes)
    if signed:
        assert act(admin, contract_id, 'sign').status_code == 200
    proposal = create_proposal(
        admin, contract_id,
        title='Mentenanță pentru două echipamente',
        reason='Al doilea echipament necesită verificări și întreținere lunară.',
        clause_reference='Articolul 3 <servicii> & anexele',
        current_wording='Furnizorul întreține un echipament.',
        proposed_wording='Furnizorul întreține lunar două echipamente și păstrează rapoartele.',
    )
    base_before = stored_evidence(contract_id)
    tasks_before = document_tasks(admin, contract_id)
    contract = admin.get(f'/api/documents/{contract_id}').json()
    assert proposal['generated_document_id'] is None
    assert proposal['can_generate_pdf'] and not proposal['pdf_outdated']

    generated = generate(admin, contract_id, proposal)
    document_id = generated['generated_document_id']
    assert document_id and document_id != contract_id
    assert generated['generated_revision'] == proposal['revision'] == 1
    assert generated['generated_document_version'] == 1
    assert generated['generated_document_status'] == 'draft'
    assert generated['document_url'] and generated['pdf_file_url']
    assert not generated['pdf_outdated'] and generated['can_edit']
    assert saved_proposal(admin, contract_id, proposal) == generated

    document = admin.get(f'/api/documents/{document_id}').json()
    assert document['category'] == 'Act adițional'
    assert document['department'] == contract['department']
    assert document['confidentiality'] == contract['confidentiality']
    assert document['related_ids'] == [contract_id]
    assert document['status'] == 'draft' and not document['validated']
    assert document['expires_at'] is None
    assert document['metadata'].get('effective_date') is None
    assert document['metadata']['proposed_effective_date'] == '2027-01-01'
    assert not document['versions'][0]['signed']
    assert document['versions'][0]['approved_by'] is None
    tasks = document_tasks(admin, document_id)
    assert len(tasks) == 1 and tasks[0]['type'] == 'validation'
    assert tasks[0]['status'] == 'pending' and tasks[0]['document_version'] == 1

    response = admin.get(generated['pdf_file_url'])
    assert response.status_code == 200, response.text
    assert response.headers['content-type'] == 'application/pdf'
    assert hashlib.sha256(response.content).hexdigest() == document['versions'][0]['sha256']
    text = ' '.join(
        page.extract_text() for page in PdfReader(io.BytesIO(response.content)).pages
    )
    text = ' '.join(text.split())
    for field in ('title', 'reason', 'clause_reference', 'current_wording', 'proposed_wording'):
        assert ' '.join(proposal[field].split()) in text
    assert contract['number'] in text
    assert 'RO49AAAA1B31007593840000' not in text
    assert 'SecretAccount123' not in text

    with SessionLocal() as db:
        draft = db.get(AmendmentDraft, proposal['id'])
        assert draft.generated_document_id == document_id
        assert draft.generated_revision == draft.revision == 1
        assert draft.generated_document_version == 1
        assert db.get(Document, document_id).airport_id == db.get(Document, contract_id).airport_id
    # Generating a proposal cannot replace the original file or its workflow.
    assert stored_evidence(contract_id) == base_before
    assert document_tasks(admin, contract_id) == tasks_before


def test_simultaneous_generation_and_repeated_requests_create_one_pdf(admin, pdf_bytes):
    contract_id = approved(admin, pdf_bytes)
    proposal = create_proposal(admin, contract_id)
    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(
            lambda _: generate(admin, contract_id, proposal), range(2)
        ))
    document_id = results[0]['generated_document_id']
    assert all(item['generated_document_id'] == document_id for item in results)
    assert all(item['generated_document_version'] == 1 for item in results)
    document_before = stored_evidence(document_id)
    tasks_before = document_tasks(admin, document_id)
    with SessionLocal() as db:
        documents_before = set(db.scalars(select(Document.id)))
        events_before = list(db.scalars(select(AuditEvent.id)))

    repeated = generate(admin, contract_id, proposal)
    assert repeated['generated_document_id'] == document_id
    assert repeated['generated_document_version'] == 1
    assert stored_evidence(document_id) == document_before
    assert document_tasks(admin, document_id) == tasks_before
    assert len(document_before[1]) == 1 and len(tasks_before) == 1
    with SessionLocal() as db:
        assert set(db.scalars(select(Document.id))) == documents_before
        assert list(db.scalars(select(AuditEvent.id))) == events_before


def test_regeneration_versions_saved_text_and_blocks_approval_of_an_outdated_pdf(admin, pdf_bytes):
    contract_id = approved(admin, pdf_bytes)
    proposal = create_proposal(admin, contract_id)
    generated = generate(admin, contract_id, proposal)
    document_id = generated['generated_document_id']
    old_file = admin.get(generated['pdf_file_url']).content
    response = admin.patch(
        draft_endpoint(contract_id, proposal),
        json=edit_payload(proposal, proposed_wording='Noua clauză impune verificări săptămânale.'),
    )
    assert response.status_code == 200, response.text
    changed = response.json()
    assert changed['revision'] == 2 and changed['generated_revision'] == 1
    assert changed['pdf_outdated'] and changed['can_generate_pdf']
    assert admin.get(generated['pdf_file_url']).content == old_file
    evidence_before = stored_evidence(document_id)
    tasks_before = document_tasks(admin, document_id)
    for action in ('validate', 'submit'):
        blocked = act(admin, document_id, action)
        assert blocked.status_code == 409, blocked.text
    stale = admin.post(
        f'{draft_endpoint(contract_id, proposal)}/generate-pdf', json={'revision': 1},
    )
    assert stale.status_code == 409, stale.text
    assert stored_evidence(document_id) == evidence_before
    assert document_tasks(admin, document_id) == tasks_before

    regenerated = generate(admin, contract_id, changed)
    assert regenerated['generated_document_id'] == document_id
    assert regenerated['generated_revision'] == 2
    assert regenerated['generated_document_version'] == 2
    assert not regenerated['pdf_outdated']
    document = admin.get(f'/api/documents/{document_id}').json()
    assert document['version'] == 2 and len(document['versions']) == 2
    assert document['status'] == 'draft' and not document['validated']
    assert admin.get(f'/api/documents/{document_id}/file?version=1').content == old_file
    new_file = admin.get(regenerated['pdf_file_url'])
    assert new_file.status_code == 200
    new_text = ' '.join(page.extract_text() for page in PdfReader(io.BytesIO(new_file.content)).pages)
    assert changed['proposed_wording'] in ' '.join(new_text.split())
    tasks = document_tasks(admin, document_id)
    assert any(task['document_version'] == 1 and task['status'] == 'cancelled' for task in tasks)
    assert any(task['document_version'] == 2 and task['status'] == 'pending' for task in tasks)
    assert act(admin, document_id, 'validate').status_code == 200


@pytest.mark.parametrize('state', ['validated', 'in_review', 'approved', 'signed', 'archived'])
def test_validated_or_finalized_generated_evidence_cannot_be_rewritten(admin, pdf_bytes, state):
    contract_id = approved(admin, pdf_bytes)
    proposal = create_proposal(admin, contract_id)
    generated = generate(admin, contract_id, proposal)
    document_id = generated['generated_document_id']
    advance(admin, document_id, state)
    saved = saved_proposal(admin, contract_id, proposal)
    assert not saved['can_edit'] and not saved['can_generate_pdf']
    before = stored_evidence(document_id)
    tasks_before = document_tasks(admin, document_id)
    changed = admin.patch(
        draft_endpoint(contract_id, proposal),
        json=edit_payload(proposal, title='Încercare de schimbare după validare'),
    )
    assert changed.status_code == 409, changed.text
    regenerated = admin.post(
        f'{draft_endpoint(contract_id, proposal)}/generate-pdf', json={'revision': 1},
    )
    assert regenerated.status_code == 409, regenerated.text
    assert stored_evidence(document_id) == before
    assert document_tasks(admin, document_id) == tasks_before
    assert saved_proposal(admin, contract_id, proposal)['revision'] == 1
    assert admin.get(saved['pdf_file_url']).status_code == 200


def test_returning_a_generated_document_for_correction_unlocks_its_form(admin, pdf_bytes):
    contract_id = approved(admin, pdf_bytes)
    proposal = create_proposal(admin, contract_id)
    generated = generate(admin, contract_id, proposal)
    document_id = generated['generated_document_id']
    advance(admin, document_id, 'in_review')
    assign_review(admin, document_id)
    rejected = act(admin, document_id, 'reject', comment='Clarifică frecvența verificărilor.')
    assert rejected.status_code == 200, rejected.text
    saved = saved_proposal(admin, contract_id, proposal)
    assert saved['can_edit'] and not saved['pdf_outdated']
    response = admin.patch(
        draft_endpoint(contract_id, saved),
        json=edit_payload(saved, proposed_wording='Verificările se efectuează în fiecare săptămână.'),
    )
    assert response.status_code == 200, response.text
    assert response.json()['can_generate_pdf']
    regenerated = generate(admin, contract_id, response.json())
    assert regenerated['generated_document_id'] == document_id
    assert regenerated['generated_document_version'] == 2


def test_generated_documents_require_the_saved_form_instead_of_direct_mutations(admin, pdf_bytes):
    contract_id = approved(admin, pdf_bytes)
    proposal = create_proposal(admin, contract_id)
    generated = generate(admin, contract_id, proposal)
    document_id = generated['generated_document_id']
    before = stored_evidence(document_id)
    tasks_before = document_tasks(admin, document_id)
    for changes in (
        {'title': 'Changed outside the saved proposal'},
        {'metadata': {'amendment_draft_id': 'forged', 'effective_date': '2026-01-01'}},
    ):
        response = admin.patch(f'/api/documents/{document_id}', json=changes)
        assert response.status_code == 409, response.text
    response = admin.post(
        f'/api/documents/{document_id}/versions',
        files={'file': ('unrelated.pdf', pdf_bytes, 'application/pdf')},
        data={'comment': 'Replace the generated clauses'},
    )
    assert response.status_code == 409, response.text
    assert stored_evidence(document_id) == before
    assert document_tasks(admin, document_id) == tasks_before
    assert not saved_proposal(admin, contract_id, proposal)['pdf_outdated']


@pytest.mark.parametrize('account', ['finance', 'reviewer', 'manager'])
def test_readers_delegates_and_other_authors_cannot_generate(admin, pdf_bytes, account):
    contract_id = approved(admin, pdf_bytes)
    proposal = create_proposal(admin, contract_id)
    generated = generate(admin, contract_id, proposal)
    before = stored_evidence(generated['generated_document_id'])
    login(admin, account)
    saved = saved_proposal(admin, contract_id, proposal)
    assert not saved['can_generate_pdf'] and not saved['can_edit']
    response = admin.post(
        f'{draft_endpoint(contract_id, proposal)}/generate-pdf', json={'revision': 1},
    )
    assert response.status_code == 403, response.text
    assert admin.get(saved['pdf_file_url']).status_code == 200
    assert stored_evidence(generated['generated_document_id']) == before


def test_department_author_and_director_can_generate_the_authors_proposal(admin, pdf_bytes):
    contract_id = approved(admin, pdf_bytes)
    login(admin, 'manager')
    proposal = create_proposal(admin, contract_id)
    generated = generate(admin, contract_id, proposal)
    response = admin.patch(
        draft_endpoint(contract_id, proposal),
        json=edit_payload(proposal, reason='Autorul a clarificat obiectul modificării propuse.'),
    )
    assert response.status_code == 200, response.text
    login(admin, 'admin')
    regenerated = generate(admin, contract_id, response.json())
    assert regenerated['generated_document_id'] == generated['generated_document_id']
    assert regenerated['generated_document_version'] == 2


def test_an_author_who_lost_authority_cannot_generate(admin, pdf_bytes, db):
    contract_id = approved(admin, pdf_bytes)
    login(admin, 'manager')
    proposal = create_proposal(admin, contract_id)
    user = db.get(User, 'manager')
    original_roles = user.roles
    try:
        user.roles = []
        db.commit()
        saved = saved_proposal(admin, contract_id, proposal)
        assert not saved['can_generate_pdf']
        response = admin.post(
            f'{draft_endpoint(contract_id, proposal)}/generate-pdf', json={'revision': 1},
        )
        assert response.status_code == 403, response.text
        assert saved_proposal(admin, contract_id, proposal)['generated_document_id'] is None
    finally:
        user.roles = original_roles
        db.commit()


@pytest.mark.parametrize('action,mutation,state', [
    ('validate', 'revision', 'draft'),
    ('submit', 'generated-version', 'validated'),
    ('approve', 'source-version', 'in_review'),
    ('sign', 'parent-status', 'approved'),
])
def test_every_workflow_step_rechecks_the_generated_pdf_source(admin, pdf_bytes, db, action, mutation, state):
    contract_id = approved(admin, pdf_bytes)
    proposal = create_proposal(admin, contract_id)
    generated = generate(admin, contract_id, proposal)
    document_id = generated['generated_document_id']
    advance(admin, document_id, state)
    if action == 'approve':
        assign_review(admin, document_id)
    # A stale form or changed source must not proceed through an old approval task.
    if mutation == 'revision':
        db.get(AmendmentDraft, proposal['id']).revision += 1
    elif mutation == 'generated-version':
        db.get(Document, document_id).version += 1
    elif mutation == 'source-version':
        db.get(Document, contract_id).version += 1
    else:
        db.get(Document, contract_id).status = 'archived'
    db.commit()
    before = stored_evidence(document_id)
    tasks_before = document_tasks(admin, document_id)
    response = act(admin, document_id, action)
    assert response.status_code == 409, response.text
    assert stored_evidence(document_id) == before
    assert document_tasks(admin, document_id) == tasks_before


@pytest.mark.parametrize('mutation', ['source-version', 'archived-parent'])
def test_changed_or_archived_base_stops_generation_but_preserves_read_access(admin, pdf_bytes, db, mutation):
    contract_id = approved(admin, pdf_bytes)
    proposal = create_proposal(admin, contract_id)
    generated = generate(admin, contract_id, proposal)
    document_id = generated['generated_document_id']
    before = stored_evidence(document_id)
    contract = db.get(Document, contract_id)
    if mutation == 'source-version':
        contract.version += 1
    else:
        contract.status = 'archived'
    db.commit()
    saved = saved_proposal(admin, contract_id, proposal)
    assert not saved['can_generate_pdf'] and not saved['can_edit']
    response = admin.post(
        f'{draft_endpoint(contract_id, proposal)}/generate-pdf', json={'revision': 1},
    )
    assert response.status_code == 409, response.text
    assert admin.get(saved['pdf_file_url']).status_code == 200
    assert stored_evidence(document_id) == before


def test_generation_requires_a_current_revision_and_its_own_contract(admin, pdf_bytes):
    first = approved(admin, pdf_bytes)
    second = approved(admin, pdf_bytes)
    proposal = create_proposal(admin, first)
    endpoint = f'{draft_endpoint(first, proposal)}/generate-pdf'
    for body in ({}, {'revision': 0}, {'revision': 1, 'generated_document_id': 'forged'}):
        response = admin.post(endpoint, json=body)
        assert response.status_code == 422, response.text
    assert admin.post(endpoint, json={'revision': 2}).status_code == 409
    wrong_contract = admin.post(
        f'{draft_endpoint(second, proposal)}/generate-pdf', json={'revision': 1},
    )
    assert wrong_contract.status_code == 404, wrong_contract.text
    assert saved_proposal(admin, first, proposal)['generated_document_id'] is None
    login(admin, 'technician')
    assert admin.post(endpoint, json={'revision': 1}).status_code == 404


def test_pdf_generation_requires_a_session(client):
    response = client.post(
        '/api/contracts/test-contract/amendment-drafts/missing/generate-pdf',
        json={'revision': 1},
    )
    assert response.status_code == 401, response.text


@pytest.mark.parametrize('signed', [False, True], ids=['original-pdf', 'active-signed-pdf'])
def test_generation_rejects_a_tampered_source_pdf(admin, pdf_bytes, signed):
    contract_id = approved(admin, pdf_bytes)
    if signed:
        assert act(admin, contract_id, 'sign').status_code == 200
    proposal = create_proposal(admin, contract_id)
    with SessionLocal() as db:
        version = db.scalar(select(DocumentVersion).where(
            DocumentVersion.document_id == contract_id,
        ))
        path = Path(version.signed_path if signed else version.file_path)
        original = path.read_bytes()
        documents_before = set(db.scalars(select(Document.id)))
        events_before = list(db.scalars(select(AuditEvent.id)))
    try:
        path.write_bytes(original + b'\nChanged after approval\n')
        response = admin.post(
            f'{draft_endpoint(contract_id, proposal)}/generate-pdf',
            json={'revision': 1},
        )
        assert response.status_code == 409, response.text
        assert saved_proposal(admin, contract_id, proposal)['generated_document_id'] is None
        with SessionLocal() as db:
            assert set(db.scalars(select(Document.id))) == documents_before
            assert list(db.scalars(select(AuditEvent.id))) == events_before
    finally:
        path.write_bytes(original)


def test_reusing_a_generated_pdf_rechecks_its_hash(admin, pdf_bytes):
    contract_id = approved(admin, pdf_bytes)
    proposal = create_proposal(admin, contract_id)
    generated = generate(admin, contract_id, proposal)
    document_id = generated['generated_document_id']
    tasks_before = document_tasks(admin, document_id)
    with SessionLocal() as db:
        version = db.scalar(select(DocumentVersion).where(
            DocumentVersion.document_id == document_id,
        ))
        path = Path(version.file_path)
        original = path.read_bytes()
    try:
        path.write_bytes(original + b'\nChanged generated clauses\n')
        before = stored_evidence(document_id)
        response = admin.post(
            f'{draft_endpoint(contract_id, proposal)}/generate-pdf',
            json={'revision': 1},
        )
        assert response.status_code == 409, response.text
        assert admin.get(generated['pdf_file_url']).status_code == 409
        assert act(admin, document_id, 'validate').status_code == 409
        assert stored_evidence(document_id) == before
        assert document_tasks(admin, document_id) == tasks_before
    finally:
        path.write_bytes(original)
