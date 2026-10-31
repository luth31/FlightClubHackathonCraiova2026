"""Legacy display names survive the upgrade to structured name fields."""
import importlib.util
from pathlib import Path
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, text


def test_employee_name_migration_preserves_display_names(monkeypatch):
    path = Path(__file__).parents[1] / 'alembic/versions/20261031_11_employee_name_parts.py'
    spec = importlib.util.spec_from_file_location('employee_name_migration', path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    with create_engine('sqlite://').begin() as connection:
        connection.execute(text('CREATE TABLE users (id TEXT, name TEXT)'))
        connection.execute(text('INSERT INTO users VALUES (:id, :name)'), [
            {'id':'two', 'name':'Ana Popescu'},
            {'id':'middle', 'name':' Ștefan  Mihai Ionescu '},
            {'id':'one', 'name':'Ana'},
        ])
        monkeypatch.setattr(migration, 'op', Operations(MigrationContext.configure(connection)))
        migration.upgrade()
        rows = {row.id: row for row in connection.execute(text('SELECT * FROM users'))}
        assert (rows['two'].first_name, rows['two'].middle_name, rows['two'].last_name) == ('Ana', '', 'Popescu')
        assert (rows['middle'].first_name, rows['middle'].middle_name, rows['middle'].last_name) == ('Ștefan', 'Mihai', 'Ionescu')
        assert rows['middle'].name == ' Ștefan  Mihai Ionescu '
        assert rows['one'].first_name == 'Ana' and rows['one'].last_name == ''
        migration.downgrade()
        assert connection.execute(text("SELECT name FROM users WHERE id = 'middle'")).scalar() == ' Ștefan  Mihai Ionescu '
