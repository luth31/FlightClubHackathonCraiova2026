import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys


def migrate(path, revision):
    env = {**os.environ, 'AERODESK_DATABASE_URL': f'sqlite:///{path}'}
    result = subprocess.run([sys.executable, '-m', 'alembic', 'upgrade', revision],
        cwd=Path(__file__).resolve().parents[1], env=env, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr


def test_upgrade_preserves_legacy_supplier_review(tmp_path):
    path = tmp_path / 'legacy.db'
    migrate(path, '714af828c311')
    history = [{'iban': 'RO49AAAA1B31007593840000', 'version': 1}, {'iban': 'old', 'version': 2}]
    with sqlite3.connect(path) as db:
        db.execute("INSERT INTO suppliers VALUES (?,?,?,?,?,?,?,?,?)", (
            'legacy', 'Legacy SRL', 'dunarea', 'legacy-doc', 1,
            'old', 'contact@legacy.example', 'demo_verified', json.dumps(history)))
        db.execute("""INSERT INTO supplier_reviews
            (id,fingerprint,airport_id,supplier_name,expected_iban,observed_iban,sender_email,
             verified_contact,message,reasons,status,created_by,created_at,verification_note,decision_note)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", (
            'legacy-review', 'fingerprint', 'dunarea', 'Legacy SRL', 'old', 'old',
            'contact@legacy.example', 'contact@legacy.example', 'message', '[]',
            'approved', 'admin', '2026-10-01', 'verified', 'approved'))
    migrate(path, 'head')
    migrate(path, 'head')
    with sqlite3.connect(path) as db:
        assert db.execute('SELECT registry_revision,bank_history FROM suppliers').fetchone() == (2, json.dumps(history))
        assert db.execute('SELECT status,service_date,contract_snapshot,registry_revision FROM supplier_reviews').fetchone() == ('approved', None, None, None)


def test_catalog_migration_preserves_explicit_sources_and_only_matches_seed(tmp_path):
    path = tmp_path / 'catalog.db'
    migrate(path, '714af828c311')
    with sqlite3.connect(path) as db:
        for identifier, name, creator in (
            ('primary', 'Another Demo SRL', 'admin'),
            ('other-primary', 'Another Demo SRL', 'admin'),
            ('seed-contract', 'Legacy SRL', 'seed'),
            ('uploaded-contract', 'Legacy SRL', 'admin')):
            db.execute('''INSERT INTO documents
                (id,title,number,category,department,status,created_at,updated_at,supplier,currency,
                 owner,created_by,confidentiality,summary,searchable_text,version,validated,airport_id,extra)
                VALUES (?,?,?,'Contract','Achiziții','approved','2026-10-01','2026-10-01',?,'RON',
                        'Demo',?,'internal','','',1,1,'dunarea','{}')''',
                (identifier, identifier, identifier, name, creator))
        for identifier, name, document in (
            ('legacy', 'Legacy SRL', 'primary'), ('other', 'Another Demo SRL', 'other-primary')):
            db.execute('INSERT INTO suppliers VALUES (?,?,?,?,?,?,?,?,?)', (
                identifier, name, 'dunarea', document, 1, 'old', 'contact@demo.example', 'demo_verified', '[]'))
    migrate(path, 'head')
    migrate(path, 'head')
    with sqlite3.connect(path) as db:
        links = dict(db.execute('SELECT document_id,supplier_id FROM supplier_contracts'))
        assert links == {'primary': 'legacy', 'other-primary': 'other', 'seed-contract': 'legacy'}
