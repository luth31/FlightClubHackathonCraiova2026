"""Existing reporting links are reconciled without discarding valid links."""
import importlib.util
from pathlib import Path
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, text


def test_department_coordinator_migration_preserves_only_valid_links(monkeypatch):
    path = Path(__file__).parents[1] / 'alembic/versions/20261031_10_department_coordinators.py'
    spec = importlib.util.spec_from_file_location('coordinator_migration', path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    with create_engine('sqlite://').begin() as connection:
        connection.execute(text('CREATE TABLE users (id TEXT, airport_id TEXT, department_id TEXT, manager_id TEXT, department TEXT)'))
        connection.execute(text('INSERT INTO users (id, airport_id, department_id, manager_id) VALUES (:id, :airport, :dept, :manager)'), [
            {'id':'head', 'airport':'one', 'dept':'tech', 'manager':None},
            {'id':'valid', 'airport':'one', 'dept':'tech', 'manager':'head'},
            {'id':'wrong-dept', 'airport':'one', 'dept':'hr', 'manager':'head'},
            {'id':'wrong-airport', 'airport':'two', 'dept':'tech', 'manager':'head'},
            {'id':'self', 'airport':'one', 'dept':'tech', 'manager':'self'},
            {'id':'missing', 'airport':'one', 'dept':'tech', 'manager':'unknown'},
        ])
        connection.execute(text('UPDATE users SET department = department_id'))
        connection.execute(text('INSERT INTO users VALUES (:id, :airport, NULL, :manager, :name)'), [
            {'id':'legacy-head', 'airport':'one', 'manager':None, 'name':'Tehnic'},
            {'id':'legacy-valid', 'airport':'one', 'manager':'legacy-head', 'name':'Tehnic'},
            {'id':'legacy-wrong', 'airport':'one', 'manager':'legacy-head', 'name':'Resurse umane'},
        ])
        monkeypatch.setattr(migration, 'op', Operations(MigrationContext.configure(connection)))
        migration.upgrade()
        links = dict(connection.execute(text('SELECT id, manager_id FROM users')).all())
        assert links.pop('valid') == 'head'
        assert links.pop('legacy-valid') == 'legacy-head'
        assert all(manager is None for manager in links.values())
