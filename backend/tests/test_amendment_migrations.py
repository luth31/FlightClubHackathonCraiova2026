import pytest
from alembic import command
from alembic.config import Config
from pathlib import Path
from sqlalchemy import create_engine, event, inspect, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import database
from app.contracts import amendments
from app.contracts.models import AmendmentDraft, AmendmentDraftRevision
from app.contracts.schemas import AmendmentUpdate
from app.documents.models import Document, DocumentVersion
from app.people.models import User
from app.tasks.models import WorkflowTask


def test_amendment_upgrade_preserves_existing_records_and_pins_source(tmp_path, monkeypatch):
    engine = create_engine(f'sqlite:///{(tmp_path / "upgrade.db").as_posix()}')

    @event.listens_for(engine, 'connect')
    def enable_foreign_keys(connection, _):
        connection.execute('PRAGMA foreign_keys=ON')

    monkeypatch.setattr(database, 'engine', engine)
    config = Config(str(Path(__file__).resolve().parents[1] / 'alembic.ini'))
    try:
        command.upgrade(config, '714af828c311')
        with engine.begin() as connection:
            connection.execute(User.__table__.insert().values(
                id='existing-user', name='Existing owner', email='owner@example.test',
                department='Achiziții', role='reviewer', roles=['reviewer'],
                airport_id='dunarea', password_hash='test-only',
            ))
            connection.execute(Document.__table__.insert().values(
                id='existing-contract', title='Existing signed contract',
                number='EXISTING-001', category='Contract', department='Achiziții',
                status='signed', created_at='2026-10-01', updated_at='2026-10-01',
                owner='Existing owner', created_by='existing-user',
                airport_id='dunarea', version=1, validated=True,
                value=12000, expires_at='2027-10-01',
            ))
            connection.execute(DocumentVersion.__table__.insert().values(
                id='existing-version', document_id='existing-contract', version=1,
                file_path='original.pdf', filename='original.pdf', sha256='a' * 64,
                signed_path='signed.pdf', signed_sha256='b' * 64,
                signer_id='existing-user', approved_by='existing-user',
                approved_at='2026-10-01', created_at='2026-10-01', created_by='existing-user',
            ))
            before = [dict(row) for row in connection.execute(select(Document.__table__)).mappings()]
            versions_before = [dict(row) for row in connection.execute(select(DocumentVersion.__table__)).mappings()]

        command.upgrade(config, 'b19a5c732e04')
        draft_values = dict(
            contract_id='existing-contract', source_version=1, title='Separate proposal',
            reason='Add another equipment unit.', clause_reference='Article 3',
            proposed_wording='Maintenance covers two units.', created_by='existing-user',
            created_at='2026-10-31', updated_at='2026-10-31',
        )
        with engine.begin() as connection:
            connection.execute(AmendmentDraft.__table__.insert().values(id='valid-draft', **draft_values))

        # Upgrade populated proposals, then verify repeating startup is safe.
        command.upgrade(config, 'head')
        command.upgrade(config, 'head')
        assert 'contract_amendment_drafts' in inspect(engine).get_table_names()
        assert 'contract_amendment_revisions' in inspect(engine).get_table_names()
        with engine.connect() as connection:
            assert [dict(row) for row in connection.execute(select(Document.__table__)).mappings()] == before
            assert [dict(row) for row in connection.execute(select(DocumentVersion.__table__)).mappings()] == versions_before
            saved = dict(connection.execute(select(AmendmentDraft.__table__)).mappings().one())
            assert all(saved[field] == value for field, value in draft_values.items())
            assert saved['generated_document_id'] is None
            assert saved['generated_revision'] is None
            assert saved['generated_document_version'] is None
            baseline = dict(connection.execute(select(AmendmentDraftRevision.__table__)).mappings().one())
            assert baseline['draft_id'] == 'valid-draft' and baseline['revision'] == 1
            assert baseline['origin'] == 'migration' and baseline['recorded_at']
            assert baseline['saved_by'] is baseline['saved_by_name'] is baseline['saved_at'] is None
        with pytest.raises(IntegrityError), engine.begin() as connection:
            connection.execute(AmendmentDraft.__table__.insert().values(
                id='invalid-source', **{**draft_values, 'source_version': 2},
            ))
        with engine.connect() as connection:
            assert connection.execute(select(AmendmentDraft.id)).scalars().all() == ['valid-draft']
    finally:
        engine.dispose()


def test_history_upgrade_backfills_only_the_retained_revision_and_preserves_generated_evidence(tmp_path, monkeypatch):
    engine = create_engine(f'sqlite:///{(tmp_path / "history-upgrade.db").as_posix()}')

    @event.listens_for(engine, 'connect')
    def enable_foreign_keys(connection, _):
        connection.execute('PRAGMA foreign_keys=ON')

    monkeypatch.setattr(database, 'engine', engine)
    config = Config(str(Path(__file__).resolve().parents[1] / 'alembic.ini'))
    files = {}
    for filename in ('original.pdf', 'signed.pdf', 'addendum-v1.pdf', 'addendum-v2.pdf'):
        path = tmp_path / filename
        path.write_bytes(f'Existing immutable fixture: {filename}'.encode())
        files[str(path)] = path.read_bytes()
    try:
        command.upgrade(config, 'c72e41a9d508')
        with engine.begin() as connection:
            connection.execute(User.__table__.insert().values(
                id='history-owner', name='Existing proposal owner', email='history@example.test',
                department='Achiziții', role='reviewer', roles=['reviewer'],
                airport_id='dunarea', password_hash='test-only',
            ))
            for document_id, category, status, version in (
                ('history-contract', 'Contract', 'signed', 1),
                ('history-addendum', 'Act adițional', 'draft', 2),
            ):
                connection.execute(Document.__table__.insert().values(
                    id=document_id, title=f'Existing {category}', number=document_id,
                    category=category, department='Achiziții', status=status,
                    created_at='2026-10-01', updated_at='2026-10-29',
                    owner='Existing proposal owner', created_by='history-owner',
                    airport_id='dunarea', version=version, validated=status == 'signed',
                    value=12000 if category == 'Contract' else None,
                    expires_at='2027-10-01' if category == 'Contract' else None,
                ))
            for document_id, version, filename in (
                ('history-contract', 1, 'original.pdf'),
                ('history-addendum', 1, 'addendum-v1.pdf'),
                ('history-addendum', 2, 'addendum-v2.pdf'),
            ):
                connection.execute(DocumentVersion.__table__.insert().values(
                    id=f'{document_id}-v{version}', document_id=document_id, version=version,
                    file_path=str(tmp_path / filename), filename=filename, sha256='a' * 64,
                    signed_path=str(tmp_path / 'signed.pdf') if document_id == 'history-contract' else None,
                    signed_sha256='b' * 64 if document_id == 'history-contract' else None,
                    signer_id='history-owner' if document_id == 'history-contract' else None,
                    approved_by='history-owner' if document_id == 'history-contract' else None,
                    approved_at='2026-10-01' if document_id == 'history-contract' else None,
                    created_at='2026-10-01', created_by='history-owner',
                ))
            connection.execute(WorkflowTask.__table__.insert().values(
                id='existing-validation-task', document_id='history-addendum', document_version=2,
                type='validation', assigned_to='history-owner', due_date='2026-11-01',
                created_at='2026-10-29', updated_at='2026-10-29',
            ))
            connection.execute(AmendmentDraft.__table__.insert().values(
                id='edited-proposal', contract_id='history-contract', source_version=1,
                title='Current edited proposal', reason='Current reason after several saved corrections.',
                clause_reference='Article 4', current_wording='Maintenance covers one unit.',
                proposed_wording='Maintenance covers three units.', proposed_effective_date='2027-01-01',
                revision=3, created_by='history-owner', created_at='2026-10-25', updated_at='2026-10-29',
                generated_document_id='history-addendum', generated_revision=2, generated_document_version=2,
            ))
            tables = (User.__table__, Document.__table__, DocumentVersion.__table__, WorkflowTask.__table__, AmendmentDraft.__table__)
            before = {
                table.name: [dict(row) for row in connection.execute(select(table)).mappings()]
                for table in tables
            }

        command.upgrade(config, 'head')
        command.upgrade(config, 'head')
        with engine.connect() as connection:
            assert {
                table.name: [dict(row) for row in connection.execute(select(table)).mappings()]
                for table in tables
            } == before
            retained = dict(connection.execute(select(AmendmentDraftRevision.__table__)).mappings().one())
            draft = before['contract_amendment_drafts'][0]
            fields = (
                'revision', 'source_version', 'title', 'reason', 'clause_reference',
                'current_wording', 'proposed_wording', 'proposed_effective_date',
            )
            assert {field: retained[field] for field in fields} == {field: draft[field] for field in fields}
            assert retained['draft_id'] == 'edited-proposal' and retained['revision'] == 3
            assert retained['origin'] == 'migration' and retained['recorded_at']
            # Earlier wording and the last editor were never stored, so migration cannot invent them.
            assert retained['saved_by'] is retained['saved_by_name'] is retained['saved_at'] is None
        with Session(engine, expire_on_commit=False) as session:
            user = session.get(User, 'history-owner')
            baseline_history = amendments.list_revisions(session, user, 'history-contract', 'edited-proposal')
            assert baseline_history['current_revision'] == 3 and baseline_history['total'] == 1
            assert baseline_history['history_complete'] is False
            assert baseline_history['items'][0]['origin'] == 'migration'
            changed = amendments.update_draft(session, user, 'history-contract', 'edited-proposal', AmendmentUpdate(
                **{field: retained[field] for field in fields if field != 'source_version'}
                | {'title': 'First correction with retained history'},
            ))
            assert changed['revision'] == 4
            saved_history = amendments.list_revisions(session, user, 'history-contract', 'edited-proposal')
            assert saved_history['current_revision'] == 4 and saved_history['total'] == 2
            assert saved_history['history_complete'] is False
            assert saved_history['items'][1] == baseline_history['items'][0]
            assert saved_history['items'][0]['origin'] == 'saved'
            assert saved_history['items'][0]['saved_by'] == 'history-owner'
            assert saved_history['items'][0]['saved_by_name'] == 'Existing proposal owner'
            assert saved_history['items'][0]['saved_at'] == changed['updated_at']
            assert saved_history['items'][0]['recorded_at']
        assert {path: Path(path).read_bytes() for path in files} == files
    finally:
        engine.dispose()
