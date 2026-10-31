import pytest
from alembic import command
from alembic.config import Config
from pathlib import Path
from sqlalchemy import create_engine, event, inspect, select
from sqlalchemy.exc import IntegrityError

from app import database
from app.contracts.models import AmendmentDraft
from app.documents.models import Document, DocumentVersion
from app.people.models import User


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
        with engine.connect() as connection:
            assert [dict(row) for row in connection.execute(select(Document.__table__)).mappings()] == before
            assert [dict(row) for row in connection.execute(select(DocumentVersion.__table__)).mappings()] == versions_before
            saved = dict(connection.execute(select(AmendmentDraft.__table__)).mappings().one())
            assert all(saved[field] == value for field, value in draft_values.items())
            assert saved['generated_document_id'] is None
            assert saved['generated_revision'] is None
            assert saved['generated_document_version'] is None
        with pytest.raises(IntegrityError), engine.begin() as connection:
            connection.execute(AmendmentDraft.__table__.insert().values(
                id='invalid-source', **{**draft_values, 'source_version': 2},
            ))
        with engine.connect() as connection:
            assert connection.execute(select(AmendmentDraft.id)).scalars().all() == ['valid-draft']
    finally:
        engine.dispose()
