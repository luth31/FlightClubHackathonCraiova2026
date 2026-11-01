import os
from pathlib import Path
import subprocess
import sys

import pytest


BACKEND = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize('starting_revision', [
    'base', '20261101_strategy_analysis', '20261101_person_profiles', '20261101_collaboration_routing',
])
def test_profile_merge_upgrades_both_histories_and_fresh_databases(tmp_path, starting_revision):
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
from sqlalchemy import inspect, text
from app.database import engine, SessionLocal
from app.people.models import User, UserProfile
from app.seed import seed

config = Config('alembic.ini')
start = sys.argv[1]
if start != 'base':
    command.upgrade(config, start)
    seed()
    with SessionLocal() as db:
        db.get(User, 'admin').name = 'Preserved name'
        if start == '20261101_person_profiles':
            db.add(UserProfile(user_id='admin', presence='busy', status_message='Preserved message',
                photo=b'preserved-photo', photo_revision='kept'))
        db.commit()

command.upgrade(config, 'head')
command.upgrade(config, 'head')
seed()
with engine.connect() as connection:
    assert connection.execute(text('select version_num from alembic_version')).scalars().all() == [ScriptDirectory.from_config(config).get_current_head()]
assert 'user_profiles' in inspect(engine).get_table_names()
with SessionLocal() as db:
    assert db.get(User, 'admin') is not None
    if start != 'base':
        assert db.get(User, 'admin').name == 'Preserved name'
    if start == '20261101_person_profiles':
        profile = db.get(UserProfile, 'admin')
        assert (profile.presence, profile.status_message, profile.photo, profile.photo_revision) == ('busy', 'Preserved message', b'preserved-photo', 'kept')
'''
    result = subprocess.run([sys.executable, '-c', script, starting_revision],
        cwd=BACKEND, env=environment, capture_output=True, text=True, timeout=60)
    assert result.returncode == 0, result.stdout + result.stderr
