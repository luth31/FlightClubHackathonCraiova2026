"""Index extracted document content with SQLite FTS5.
Revision ID: ac7351a92eff
Revises: 233a0417d25e
"""
from alembic import op
import sqlalchemy as sa
revision='ac7351a92eff'
down_revision='233a0417d25e'
branch_labels=None
depends_on=None

TEXT_EXPRESSION="new.title || ' ' || new.number || ' ' || COALESCE(new.supplier,'') || ' ' || new.summary || ' ' || new.searchable_text"

def upgrade():
    op.add_column('documents',sa.Column('searchable_text',sa.Text(),nullable=False,server_default=''))
    op.execute("CREATE VIRTUAL TABLE document_search USING fts5(document_id UNINDEXED, searchable_text, tokenize='unicode61 remove_diacritics 2')")
    op.execute("INSERT INTO document_search(document_id,searchable_text) SELECT id,title || ' ' || number || ' ' || COALESCE(supplier,'') || ' ' || summary || ' ' || searchable_text FROM documents")
    op.execute(f"CREATE TRIGGER document_search_insert AFTER INSERT ON documents BEGIN INSERT INTO document_search(document_id,searchable_text) VALUES(new.id,{TEXT_EXPRESSION}); END")
    op.execute("CREATE TRIGGER document_search_delete AFTER DELETE ON documents BEGIN DELETE FROM document_search WHERE document_id=old.id; END")
    op.execute(f"CREATE TRIGGER document_search_update AFTER UPDATE OF title,number,supplier,summary,searchable_text ON documents BEGIN DELETE FROM document_search WHERE document_id=old.id; INSERT INTO document_search(document_id,searchable_text) VALUES(new.id,{TEXT_EXPRESSION}); END")

def downgrade():
    for trigger in ('document_search_insert','document_search_update','document_search_delete'):
        op.execute(f'DROP TRIGGER IF EXISTS {trigger}')
    op.execute('DROP TABLE IF EXISTS document_search')
    op.drop_column('documents','searchable_text')
