from pathlib import Path
from unittest.mock import patch

from alembic import command
from alembic.config import Config
import pytest
from sqlalchemy import create_engine, event, inspect, MetaData, select
from sqlalchemy.exc import IntegrityError


BACKEND = Path(__file__).resolve().parents[1]
LEGACY_REVISION = '20261101_mailbox_release_merge'
RENEWAL_REVISION = 'f6a9c182b407'


def upgrade(engine, revision):
    config = Config(str(BACKEND / 'alembic.ini'))
    # Migration connections use this isolated legacy database
    with patch('app.database.engine', engine):
        command.upgrade(config, revision)


@pytest.fixture
def legacy_database(tmp_path):
    database = tmp_path / 'legacy.db'
    pdf = tmp_path / 'original-contract.pdf'
    pdf.write_bytes(b'Original legacy contract PDF bytes')
    signed_pdf = tmp_path / 'signed-contract.pdf'
    signed_pdf.write_bytes(b'Original signed legacy contract bytes')
    engine = create_engine(f'sqlite:///{database.as_posix()}')

    @event.listens_for(engine, 'connect')
    def enable_foreign_keys(connection, _):
        connection.execute('PRAGMA foreign_keys=ON')

    upgrade(engine, LEGACY_REVISION)
    metadata = MetaData()
    metadata.reflect(bind=engine)
    with engine.begin() as connection:
        connection.execute(metadata.tables['users'].insert(), dict(id='legacy-owner', name='Legacy Owner',
            email='legacy@example.test', department='Procurement', role='Reviewer', roles=['reviewer'],
            airport_id='dunarea', active=True, password_hash='existing-password-hash', avatar='LO',
            manager_id=None, job_title='Contract owner'))
        connection.execute(metadata.tables['documents'].insert(), dict(id='legacy-contract',
            title='Existing signed contract', number='AD-2026-LEGACY', category='Contract',
            department='Procurement', status='signed', created_at='2026-01-01T10:00:00',
            updated_at='2026-02-01T12:00:00', expires_at='2026-11-30', supplier='Legacy Supplier',
            value=12000, currency='RON', owner='Legacy Owner', created_by='legacy-owner',
            confidentiality='internal', summary='Preserved legacy contract', searchable_text='Legacy PDF text',
            version=1, validated=True, airport_id='dunarea', extra={'metadata': {'supplier_iban': 'Original account'}}))
        connection.execute(metadata.tables['document_versions'].insert(), dict(id='legacy-v1',
            document_id='legacy-contract', version=1, file_path=str(pdf), filename=pdf.name,
            sha256='original-file-hash', created_at='2026-01-01T10:00:00', created_by='legacy-owner',
            comment='Original version', snapshot={'expires_at': '2026-11-30', 'value': 12000},
            approved_by='legacy-owner', approved_at='2026-01-15T10:00:00', signed_path=str(signed_pdf),
            signed_sha256='original-signed-hash', signer_id='legacy-owner', certificate_fingerprint='legacy-cert'))
        connection.execute(metadata.tables['workflow_tasks'].insert(), dict(id='legacy-approval',
            document_id='legacy-contract', document_version=1, type='approval', status='completed',
            assigned_to='legacy-owner', due_date='2026-01-15', created_at='2026-01-01T10:00:00',
            updated_at='2026-01-15T10:00:00', completed_by='legacy-owner'))
        connection.execute(metadata.tables['task_events'].insert(), dict(id=1, task_id='legacy-approval',
            actor_id='legacy-owner', actor='Legacy Owner', action='Approval completed', comment='Existing evidence',
            created_at='2026-01-15T10:00:00'))
        connection.execute(metadata.tables['sessions'].insert(), dict(token_hash='legacy-session',
            user_id='legacy-owner', expires_at='2026-12-31T10:00:00', auth_source='demo', auth_issuer=None))
    yield database, engine, pdf, signed_pdf
    engine.dispose()


def preserved_rows(engine):
    metadata = MetaData()
    metadata.reflect(bind=engine)
    tables = ('documents', 'document_versions', 'users', 'workflow_tasks', 'task_events', 'sessions')
    with engine.connect() as connection:
        return {name: [dict(row) for row in connection.execute(select(metadata.tables[name])).mappings()]
            for name in tables}


@pytest.mark.parametrize('starting_revision', [LEGACY_REVISION, '20261101_atomic_operations', 'c8e715bf402a'])
def test_upgrade_preserves_populated_legacy_database_and_can_run_twice(legacy_database, starting_revision):
    database, engine, pdf, signed_pdf = legacy_database
    upgrade(engine, starting_revision)
    before = preserved_rows(engine)
    original_files = pdf.read_bytes(), signed_pdf.read_bytes()
    upgrade(engine, 'head')
    upgrade(engine, 'head')
    assert preserved_rows(engine) == before
    assert (pdf.read_bytes(), signed_pdf.read_bytes()) == original_files
    metadata = MetaData()
    metadata.reflect(bind=engine)
    required = {'contract_renewals', 'contract_renewal_reminders', 'contract_renewal_events', 'document_reminders', 'document_renewal_decisions', 'equipment_teams', 'equipment_team_members'}
    assert required <= set(metadata.tables)
    with engine.connect() as connection:
        from alembic.script import ScriptDirectory
        expected_head = ScriptDirectory.from_config(Config(str(BACKEND / 'alembic.ini'))).get_current_head()
        assert connection.execute(select(metadata.tables['alembic_version'].c.version_num)).scalar_one() == expected_head
        for table in required:
            assert list(connection.execute(select(metadata.tables[table]))) == []
        assert list(connection.exec_driver_sql('PRAGMA foreign_key_check')) == []


def test_renewal_migration_enforces_document_version_and_reminder_identity(legacy_database):
    database, engine, _, _ = legacy_database
    upgrade(engine, 'head')
    metadata = MetaData()
    metadata.reflect(bind=engine)
    renewals = metadata.tables['contract_renewals']
    reminders = metadata.tables['contract_renewal_reminders']
    inspector = inspect(engine)
    assert any(set(foreign_key['constrained_columns']) == {'contract_id', 'source_version'}
        and foreign_key['referred_table'] == 'document_versions'
        for foreign_key in inspector.get_foreign_keys('contract_renewals'))
    assert set(inspector.get_pk_constraint('contract_renewal_reminders')['constrained_columns']) == {'renewal_id', 'threshold_days'}
    row = dict(id='legacy-renewal', contract_id='legacy-contract', source_version=1, airport_id='dunarea',
        expires_at='2026-11-30', due_date='2026-10-31', assigned_to='legacy-owner', status='pending', revision=1,
        acknowledged_by=None, acknowledged_at=None, closed_by=None, closed_at=None,
        created_at='2026-10-30T10:00:00', updated_at='2026-10-30T10:00:00')
    with engine.begin() as connection:
        connection.execute(renewals.insert(), row)
        connection.execute(reminders.insert(), dict(renewal_id=row['id'], threshold_days=30,
            due_date='2026-10-31', triggered_at=None))
    with pytest.raises(IntegrityError):
        with engine.begin() as connection:
            connection.execute(renewals.insert(), {**row, 'id': 'duplicate-renewal'})
    with pytest.raises(IntegrityError):
        with engine.begin() as connection:
            connection.execute(renewals.insert(), {**row, 'id': 'missing-version', 'source_version': 2})
    with pytest.raises(IntegrityError):
        with engine.begin() as connection:
            connection.execute(reminders.insert(), dict(renewal_id=row['id'], threshold_days=30,
                due_date='2026-10-31', triggered_at=None))
    with pytest.raises(IntegrityError):
        with engine.begin() as connection:
            connection.execute(reminders.insert(), dict(renewal_id=row['id'], threshold_days=45,
                due_date='2026-10-16', triggered_at=None))
