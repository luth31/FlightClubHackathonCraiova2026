import hashlib
import json
from pathlib import Path

from sqlalchemy import delete, select

from app.config import settings
from app.core.models import AuditEvent
from app.documents.models import Document, DocumentVersion
from app.seed import seed


DATA = Path(__file__).resolve().parents[2] / 'data'


def test_scenario_sources_have_real_pdfs_and_only_explicit_in_case_links():
    records = json.loads((DATA / 'procurement-scenarios.json').read_text(encoding='utf-8'))['documents']
    by_id = {item['id']: item for item in records}
    assert len(by_id) == len(records) == 22
    assert len({item['metadata']['case_id'] for item in records}) == 3
    for item in records:
        pdf = (DATA / 'pdfs' / item['filename']).read_bytes()
        assert pdf.startswith(b'%PDF')
        assert hashlib.sha256(pdf).hexdigest() == item['sha256']
        assert item['metadata']['flow_demo'] is True
        for link in item['metadata']['flow_links']:
            assert by_id[link['source_id']]['metadata']['case_id'] == item['metadata']['case_id']
            assert link['kind'] in ('flow', 'related', 'reference', 'correction')


def test_scenarios_seed_additively_without_replacing_user_edits_or_versions(admin, db, tmp_path, monkeypatch):
    item = json.loads((DATA / 'procurement-scenarios.json').read_text(encoding='utf-8'))['documents'][0]
    corpus = tmp_path / 'corpus'
    (corpus / 'pdfs').mkdir(parents=True)
    (corpus / 'seed-manifest.json').write_text('{"documents": []}', encoding='utf-8')
    (corpus / 'procurement-scenarios.json').write_text(json.dumps({'documents': [item]}), encoding='utf-8')
    (corpus / 'pdfs' / item['filename']).write_bytes((DATA / 'pdfs' / item['filename']).read_bytes())
    monkeypatch.setattr(settings, 'corpus_dir', corpus)
    try:
        seed()
        document = db.get(Document, item['id'])
        assert document.title == item['title']
        document.title = 'User-edited title'
        db.commit()
        seed()
        db.expire_all()
        assert db.get(Document, item['id']).title == 'User-edited title'
        versions = list(db.scalars(select(DocumentVersion).where(DocumentVersion.document_id == item['id'])))
        assert len(versions) == 1
        assert versions[0].sha256 == item['sha256']
        response = admin.get(f"/api/documents/{item['id']}/file")
        assert response.status_code == 200
        assert hashlib.sha256(response.content).hexdigest() == item['sha256']
    finally:
        db.execute(delete(AuditEvent).where(AuditEvent.document_id == item['id']))
        db.execute(delete(DocumentVersion).where(DocumentVersion.document_id == item['id']))
        db.execute(delete(Document).where(Document.id == item['id']))
        db.commit()
