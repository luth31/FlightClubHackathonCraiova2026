"""Tenant rename preserves document evidence, sharing links and provider subjects."""
import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, text


def test_airport_migration_preserves_records_and_identity(monkeypatch):
    path = Path(__file__).parents[1] / 'alembic/versions/20261031_12_airport_names.py'
    spec = importlib.util.spec_from_file_location('airport_migration', path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    with create_engine('sqlite://').begin() as connection:
        for ddl in (
            'CREATE TABLE users (id TEXT, airport_id TEXT, email TEXT, identity_issuer TEXT, identity_subject TEXT)',
            'CREATE TABLE documents (id TEXT, airport_id TEXT, title TEXT)',
            'CREATE TABLE versions (document_id TEXT, sha256 TEXT, snapshot TEXT)',
            'CREATE TABLE shares (id TEXT, document_id TEXT, recipient_airport_id TEXT, recipient_airport TEXT)',
            'CREATE TABLE sessions (user_id TEXT)',
            'CREATE TABLE oidc_login_transactions (state TEXT)',
        ):
            connection.execute(text(ddl))
        connection.execute(text("INSERT INTO users VALUES ('existing','dunarea','existing@dunarea.example','http://127.0.0.1:8180/realms/dunarea','fixed-subject'), ('partner','carpati','real@company.example',NULL,'other-subject'), ('unrelated','other','one@other.example','https://other.example/realms/other','unrelated-subject')"))
        connection.execute(text("INSERT INTO documents VALUES ('signed','dunarea','Historical document')"))
        connection.execute(text("INSERT INTO versions VALUES ('signed','unchanged-hash','Historical Aeroportul Dunărea')"))
        connection.execute(text("INSERT INTO shares VALUES ('grant','signed','carpati','Aeroportul Carpați')"))
        connection.execute(text("INSERT INTO sessions VALUES ('existing')"))
        connection.execute(text("INSERT INTO oidc_login_transactions VALUES ('pending')"))
        monkeypatch.setattr(migration, 'op', Operations(MigrationContext.configure(connection)))
        migration.upgrade()
        migration.upgrade()
        assert connection.execute(text("SELECT airport_id,email,identity_issuer,identity_subject FROM users WHERE id='existing'")).one() == ('craiova','existing@craiova.example','http://127.0.0.1:8180/realms/craiova','fixed-subject')
        assert connection.execute(text("SELECT airport_id,email,identity_subject FROM users WHERE id='partner'")).one() == ('sibiu','real@company.example','other-subject')
        assert connection.execute(text("SELECT airport_id,identity_issuer FROM users WHERE id='unrelated'")).one() == ('other','https://other.example/realms/other')
        assert connection.execute(text('SELECT * FROM documents')).one() == ('signed','craiova','Historical document')
        assert connection.execute(text('SELECT * FROM versions')).one() == ('signed','unchanged-hash','Historical Aeroportul Dunărea')
        assert connection.execute(text('SELECT * FROM shares')).one() == ('grant','signed','sibiu','Aeroportul Sibiu')
        assert connection.execute(text('SELECT count(*) FROM sessions')).scalar() == 0
        assert connection.execute(text('SELECT count(*) FROM oidc_login_transactions')).scalar() == 0
