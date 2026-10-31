from concurrent.futures import ThreadPoolExecutor

import pytest
from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError

from app.contracts import amendments
from app.contracts.models import AmendmentDraftRevision
from app.database import SessionLocal
from app.documents.models import Document
from app.people.models import User
from conftest import login
from test_amendment_drafts import create_proposal, edit_payload, proposal_payload, stored_evidence
from test_amendment_generation import document_tasks, generate
from test_workflows import act, approved


FORM_FIELDS = (
    'title', 'reason', 'clause_reference', 'current_wording',
    'proposed_wording', 'proposed_effective_date',
)


def draft_url(contract_id, draft):
    return f'/api/contracts/{contract_id}/amendment-drafts/{draft["id"]}'


def history(client, contract_id, draft):
    response = client.get(f'{draft_url(contract_id, draft)}/revisions')
    assert response.status_code == 200, response.text
    return response.json()


def save(client, contract_id, draft, **changes):
    response = client.patch(draft_url(contract_id, draft), json=edit_payload(draft, **changes))
    assert response.status_code == 200, response.text
    return response.json()


def test_every_saved_form_keeps_its_wording_source_and_actual_editor(admin, pdf_bytes):
    contract_id = approved(admin, pdf_bytes)
    contract_before = stored_evidence(contract_id)
    tasks_before = document_tasks(admin, contract_id)
    login(admin, 'manager')
    first = create_proposal(admin, contract_id)
    second = save(
        admin, contract_id, first,
        title='Servicii pentru două echipamente',
        reason='Programul de operare necesită verificări pentru ambele echipamente.',
        clause_reference='Articolul 4 — Frecvența intervențiilor',
        current_wording='O verificare trimestrială pentru fiecare echipament.',
        proposed_wording='Se efectuează o verificare lunară pentru fiecare echipament.',
        proposed_effective_date='2027-02-01',
    )
    login(admin, 'admin')
    third = save(
        admin, contract_id, second,
        proposed_wording='Se efectuează o verificare săptămânală pentru fiecare echipament.',
        proposed_effective_date=None,
    )

    saved = history(admin, contract_id, first)
    assert saved['current_revision'] == saved['total'] == 3
    assert saved['history_complete'] is True
    assert [item['revision'] for item in saved['items']] == [3, 2, 1]
    for item, expected, actor, name in zip(
        saved['items'], [third, second, first],
        ['admin', 'manager', 'manager'], ['Ana Ionescu', 'Mihai Dumitrescu', 'Mihai Dumitrescu'],
    ):
        assert item['draft_id'] == first['id']
        assert item['source_version'] == 1
        assert {field: item[field] for field in FORM_FIELDS} == {
            field: expected[field] for field in FORM_FIELDS
        }
        assert item['saved_by'] == actor and item['saved_by_name'] == name
        assert item['saved_at'] == expected['updated_at']
        assert item['recorded_at'] and item['origin'] == 'saved'
    assert stored_evidence(contract_id) == contract_before
    assert document_tasks(admin, contract_id) == tasks_before


def test_editor_display_name_is_preserved_after_the_account_is_renamed(admin, pdf_bytes, db):
    contract_id = approved(admin, pdf_bytes)
    proposal = create_proposal(admin, contract_id)
    before = history(admin, contract_id, proposal)
    user = db.get(User, 'admin')
    original_name = user.name
    try:
        user.name = 'Ana cu nume actualizat'
        db.commit()
        assert history(admin, contract_id, proposal) == before
        changed = save(admin, contract_id, proposal, title='Propunere după actualizarea numelui')
        items = history(admin, contract_id, changed)['items']
        assert items[0]['saved_by_name'] == user.name
        assert items[1]['saved_by_name'] == original_name
        assert items[0]['saved_by'] == items[1]['saved_by'] == 'admin'
    finally:
        user.name = original_name
        db.commit()


def test_noop_invalid_conflicting_saves_and_generation_do_not_invent_form_history(admin, pdf_bytes):
    contract_id = approved(admin, pdf_bytes)
    proposal = create_proposal(admin, contract_id)
    initial = history(admin, contract_id, proposal)
    generated = generate(admin, contract_id, proposal)
    generate(admin, contract_id, generated)
    save(admin, contract_id, generated)
    assert admin.patch(
        draft_url(contract_id, generated),
        json=edit_payload(generated, proposed_wording='short'),
    ).status_code == 422
    assert admin.patch(
        draft_url(contract_id, generated),
        json=edit_payload(generated, revision=99, title='Conflicting revision'),
    ).status_code == 409
    assert history(admin, contract_id, generated) == initial

    changed = save(admin, contract_id, generated, reason='Include intervențiile necesare în afara programului obișnuit.')
    after_save = history(admin, contract_id, changed)
    assert admin.patch(
        draft_url(contract_id, proposal),
        json=edit_payload(proposal, proposed_wording='Modificare din formularul vechi.'),
    ).status_code == 409
    generate(admin, contract_id, changed)
    assert history(admin, contract_id, changed) == after_save
    assert after_save['total'] == 2 and after_save['history_complete']
    assert after_save['items'][1] == initial['items'][0]


@pytest.mark.parametrize('operation', ['create', 'edit'])
def test_failed_save_rolls_back_the_form_and_its_history_together(admin, pdf_bytes, monkeypatch, operation):
    contract_id = approved(admin, pdf_bytes)
    proposal = create_proposal(admin, contract_id) if operation == 'edit' else None
    before = history(admin, contract_id, proposal) if proposal else None
    with SessionLocal() as session:
        row_count_before = len(session.scalars(select(AmendmentDraftRevision)).all())

    def fail_audit(*_args, **_kwargs):
        raise RuntimeError('Simulated audit storage failure')

    monkeypatch.setattr(amendments, 'record', fail_audit)
    with pytest.raises(RuntimeError, match='Simulated audit storage failure'):
        if proposal:
            admin.patch(draft_url(contract_id, proposal), json=edit_payload(proposal, title='Failed saved change'))
        else:
            admin.post(f'/api/contracts/{contract_id}/amendment-drafts', json=proposal_payload())
    listing = admin.get(f'/api/contracts/{contract_id}/amendment-drafts').json()
    if proposal:
        assert listing['items'] == [proposal]
        assert history(admin, contract_id, proposal) == before
    else:
        assert listing['total'] == 0
    with SessionLocal() as session:
        assert len(session.scalars(select(AmendmentDraftRevision)).all()) == row_count_before


def test_concurrent_edits_keep_one_new_form_revision(admin, pdf_bytes):
    contract_id = approved(admin, pdf_bytes)
    proposal = create_proposal(admin, contract_id)
    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(
            lambda title: admin.patch(draft_url(contract_id, proposal), json=edit_payload(proposal, title=title)),
            ['Concurrent wording A', 'Concurrent wording B'],
        ))
    assert sorted(response.status_code for response in responses) == [200, 409]
    winner = next(response.json() for response in responses if response.status_code == 200)
    saved = history(admin, contract_id, proposal)
    assert saved['total'] == saved['current_revision'] == 2 and saved['history_complete']
    assert saved['items'][0]['title'] == winner['title']
    assert saved['items'][1]['title'] == proposal['title']


@pytest.mark.parametrize('account', ['finance', 'reviewer', 'manager'])
def test_contract_readers_can_consult_history_without_drafting_authority(admin, pdf_bytes, account):
    contract_id = approved(admin, pdf_bytes)
    proposal = create_proposal(admin, contract_id)
    before = history(admin, contract_id, proposal)
    login(admin, account)
    assert history(admin, contract_id, proposal) == before


def test_history_requires_the_correct_readable_contract(admin, pdf_bytes, db):
    first = approved(admin, pdf_bytes)
    second = approved(admin, pdf_bytes)
    proposal = create_proposal(admin, first)
    assert admin.get(f'{draft_url(second, proposal)}/revisions').status_code == 404
    assert admin.get(f'/api/contracts/{first}/amendment-drafts/missing/revisions').status_code == 404
    assert admin.get(f'{draft_url("test-procedure", proposal)}/revisions').status_code == 404
    login(admin, 'technician')
    assert admin.get(f'{draft_url(first, proposal)}/revisions').status_code == 404
    login(admin, 'admin')
    document = db.get(Document, first)
    original_airport = document.airport_id
    try:
        document.airport_id = 'carpati'
        db.commit()
        assert admin.get(f'{draft_url(first, proposal)}/revisions').status_code == 404
    finally:
        document.airport_id = original_airport
        db.commit()


def test_history_requires_a_session(client):
    assert client.get('/api/contracts/test-contract/amendment-drafts/missing/revisions').status_code == 401


@pytest.mark.parametrize('mutation', ['archive', 'source-version'])
def test_history_remains_readable_after_the_source_is_archived_or_revised(admin, pdf_bytes, mutation):
    contract_id = approved(admin, pdf_bytes)
    proposal = create_proposal(admin, contract_id)
    proposal = save(admin, contract_id, proposal, title='Saved before source changed')
    before = history(admin, contract_id, proposal)
    if mutation == 'archive':
        assert act(admin, contract_id, 'archive').status_code == 200
    else:
        assert admin.patch(f'/api/documents/{contract_id}', json={'title': 'Revised source contract'}).status_code == 200
    assert history(admin, contract_id, proposal) == before


@pytest.mark.parametrize('method', ['POST', 'PATCH', 'PUT', 'DELETE'])
def test_history_api_has_no_overwrite_delete_or_restore_action(admin, pdf_bytes, method):
    contract_id = approved(admin, pdf_bytes)
    proposal = create_proposal(admin, contract_id)
    before = history(admin, contract_id, proposal)
    response = admin.request(method, f'{draft_url(contract_id, proposal)}/revisions', json={'revision': 1})
    assert response.status_code == 405, response.text
    assert history(admin, contract_id, proposal) == before


@pytest.mark.parametrize('operation', ['update', 'delete', 'duplicate', 'replace'])
def test_saved_revision_rows_cannot_be_rewritten_removed_or_duplicated(admin, pdf_bytes, operation):
    contract_id = approved(admin, pdf_bytes)
    proposal = create_proposal(admin, contract_id)
    before = history(admin, contract_id, proposal)
    with SessionLocal() as session:
        row = dict(session.execute(select(AmendmentDraftRevision.__table__).where(
            AmendmentDraftRevision.draft_id == proposal['id'],
        )).mappings().one())
    table = AmendmentDraftRevision.__table__
    condition = (table.c.draft_id == proposal['id']) & (table.c.revision == 1)
    with pytest.raises(IntegrityError), SessionLocal.begin() as session:
        if operation == 'update':
            session.execute(update(table).where(condition).values(proposed_wording='Overwritten historic wording'))
        elif operation == 'delete':
            session.execute(delete(table).where(condition))
        elif operation == 'replace':
            session.execute(table.insert().prefix_with('OR REPLACE').values(
                **{**row, 'proposed_wording': 'Replacement of retained wording'},
            ))
        else:
            session.execute(table.insert().values(**row))
    assert history(admin, contract_id, proposal) == before
