import os
from pathlib import Path
import subprocess
import sys

import pytest


BACKEND = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize('starting_revision', [
    'base', '20261101_strategy_analysis', '20261101_person_profiles',
    '20261101_profiles_strategy_merge', '20261101_collaboration_routing',
    '20261101_workspace_merge', '20261101_collaboration_profiles',
    '20261101_operations_workspace', '20261101_collaboration_merge', 'both_histories',
    '20261101_release_merge', '20261101_collaboration_contacts', '20261101_collaboration_mailbox',
])
def test_workspace_merge_preserves_existing_histories_and_upgrades_fresh_databases(tmp_path, starting_revision):
    environment = {**os.environ, 'PYTHONPATH': str(BACKEND),
        'FLYLEAF_DATABASE_URL': f'sqlite:///{(tmp_path / "migration.db").as_posix()}',
        'FLYLEAF_STORAGE_DIR': str(tmp_path / 'storage'),
        'FLYLEAF_CORPUS_DIR': str(tmp_path / 'no-corpus'),
        'FLYLEAF_SEED_DOCUMENTS': 'false', 'FLYLEAF_EXTRACTION_ENABLED': 'false'}
    script = '''
import sys
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import inspect, text, MetaData, Table
from app.database import engine, SessionLocal
from app.collaboration.models import CollaborationSync, CollaborationThread
from app.people.models import User, UserProfile
from app.seed import seed

config = Config('alembic.ini')
start = sys.argv[1]
preserved_profile = False
preserved_collaboration = False
preserved_mailbox = False
if start != 'base':
    revisions = ('20261101_profiles_strategy_merge', '20261101_collaboration_routing') if start == 'both_histories' else (start,)
    for revision in revisions:
        command.upgrade(config, revision)
    seed()
    tables = inspect(engine).get_table_names()
    preserved_profile = 'user_profiles' in tables
    preserved_collaboration = 'collaboration_sync' in tables
    preserved_mailbox = 'collaboration_mailbox_state' in tables
    with SessionLocal() as db:
        db.get(User, 'admin').name = 'Preserved name'
        if preserved_profile:
            db.add(UserProfile(user_id='admin', presence='busy', status_message='Preserved message',
                photo=b'preserved-photo', photo_revision='kept'))
        if preserved_collaboration:
            # Insert using the schema at this old revision, before new columns exist.
            sync_table = Table('collaboration_sync', MetaData(), autoload_with=engine)
            thread_table = Table('collaboration_threads', MetaData(), autoload_with=engine)
            db.execute(sync_table.insert().values(id='preserved-sync', airport_id='CRA', peer_airport_id='SBZ',
                received_cursor=12, acknowledged_cursor=7, peer_name='Preserved partner',
                departments=['operations'], last_synced_at='2026-11-01T00:00:00Z'))
            db.execute(thread_table.insert().values(id='preserved-thread', airport_id='CRA',
                requester_airport_id='CRA', recipient_airport_id='SBZ',
                requester_department='operations', recipient_department='safety',
                subject='Preserved request', topic='operations', created_at='2026-11-01T00:00:00Z'))
        if preserved_mailbox:
            mailbox = Table('collaboration_mailbox_state', MetaData(), autoload_with=engine)
            db.execute(mailbox.insert().values(airport_id='CRA', user_id='admin', thread_id='preserved-thread',
                read_sequence=9, starred=True, archived=True))
        db.commit()

command.upgrade(config, 'head')
command.upgrade(config, 'head')
seed()
with engine.connect() as connection:
    assert connection.execute(text('select version_num from alembic_version')).scalars().all() == [ScriptDirectory.from_config(config).get_current_head()]
assert {'user_profiles', 'collaboration_threads', 'collaboration_sync', 'procurement_cases', 'procurement_payments'} <= set(inspect(engine).get_table_names())
assert {column['name'] for column in inspect(engine).get_columns('collaboration_mailbox_state')} == {
    'airport_id', 'user_id', 'thread_id', 'read_sequence', 'starred', 'archived',
}
with SessionLocal() as db:
    assert db.get(User, 'admin') is not None
    if start != 'base':
        assert db.get(User, 'admin').name == 'Preserved name'
    if preserved_profile:
        profile = db.get(UserProfile, 'admin')
        assert (profile.presence, profile.status_message, profile.photo, profile.photo_revision) == ('busy', 'Preserved message', b'preserved-photo', 'kept')
    if preserved_collaboration:
        sync = db.get(CollaborationSync, 'preserved-sync')
        assert (sync.received_cursor, sync.acknowledged_cursor, sync.peer_name, sync.departments,
            sync.last_synced_at) == (12, 7, 'Preserved partner', ['operations'], '2026-11-01T00:00:00Z')
        thread = db.get(CollaborationThread, 'preserved-thread')
        assert (thread.subject, thread.requester_department, thread.recipient_department) == (
            'Preserved request', 'operations', 'safety')
    if preserved_mailbox:
        row = db.execute(text("select read_sequence, starred, archived from collaboration_mailbox_state where thread_id='preserved-thread'")).one()
        assert tuple(row) == (9, 1, 1)
'''
    result = subprocess.run([sys.executable, '-c', script, starting_revision],
        cwd=BACKEND, env=environment, capture_output=True, text=True, timeout=60)
    assert result.returncode == 0, result.stdout + result.stderr
