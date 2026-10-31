"""Rename the two demonstration tenants without changing record or subject IDs."""
from urllib.parse import urlsplit, urlunsplit

from alembic import op
import sqlalchemy as sa

revision = '20261031_airport_names'
down_revision = '20261031_employee_name_parts'
branch_labels = None
depends_on = None

RENAMES = (
    ('dunarea', 'craiova', 'Aeroportul Dunărea', 'Aeroportul Craiova', 8180, 8080),
    ('carpati', 'sibiu', 'Aeroportul Carpați', 'Aeroportul Sibiu', 8181, 8081),
)


def upgrade():
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    tables = {name: {column['name'] for column in inspector.get_columns(name)}
              for name in inspector.get_table_names()
              if not name.startswith(('sqlite_', 'document_search'))}
    for old, new, old_name, new_name, identity_port, web_port in RENAMES:
        for table, columns in tables.items():
            for column in ('airport_id', 'recipient_airport_id'):
                if column in columns:
                    connection.execute(sa.text(f'UPDATE "{table}" SET "{column}" = :new WHERE "{column}" = :old'), {'old': old, 'new': new})
        if 'shares' in tables:
            connection.execute(sa.text('UPDATE shares SET recipient_airport = :new WHERE recipient_airport = :old'), {'old': old_name, 'new': new_name})
        if 'users' in tables:
            # Only fixture addresses, never user-supplied real contact details.
            connection.execute(sa.text('UPDATE users SET email = replace(email, :old, :new) WHERE airport_id = :airport AND email LIKE :suffix'),
                               {'old': f'@{old}.example', 'new': f'@{new}.example', 'airport': new, 'suffix': f'%@{old}.example'})
            issuers = connection.execute(sa.text('SELECT DISTINCT identity_issuer FROM users WHERE identity_issuer IS NOT NULL')).scalars().all()
            for issuer in issuers:
                parsed = urlsplit(issuer)
                if not parsed.path.endswith(f'/realms/{old}'):
                    continue
                updated = urlunsplit(parsed._replace(path=parsed.path[:-len(old)] + new))
                if issuer == f'http://127.0.0.1:{identity_port}/realms/{old}':
                    updated = f'http://127.0.0.1:{identity_port}/realms/{new}'
                connection.execute(sa.text('UPDATE users SET identity_issuer = :new WHERE airport_id = :airport AND identity_issuer = :old'),
                                   {'old': issuer, 'new': updated, 'airport': new})
    # Public issuer and cookie names change. Require a new, pinned OIDC login.
    for table in ('sessions', 'oidc_login_transactions'):
        if table in tables:
            connection.execute(sa.text(f'DELETE FROM "{table}"'))


def downgrade():
    raise RuntimeError('Restore the pre-rename database and identity-volume backups together.')
