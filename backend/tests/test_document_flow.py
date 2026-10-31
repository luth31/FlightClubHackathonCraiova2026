import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from sqlalchemy import delete, select

from app.config import settings
from app.core.models import AuditEvent
from app.documents.classification import classify, normalize
from app.documents.models import Document, DocumentVersion
from app.seed import seed
from conftest import login


@pytest.mark.parametrize('category,title,stage,document_type', [
    ('Comandă', 'Returns purchase order PO-42', 'purchasing', 'Comandă de retur'),
    ('Comandă', 'Comandă de înlocuire PO-43', 'purchasing', 'Comandă de înlocuire'),
    ('Contract', 'Contract pentru avize de livrare', 'purchasing', 'Contract'),
    ('Caiet de sarcini', 'Caiet de sarcini pentru facturare', 'purchasing', 'Caiet de sarcini'),
    ('Proces-verbal', 'Outbound Delivery DN-42', 'shipping', 'Livrare de ieșire'),
    ('Proces-verbal', 'Aviz de livrare DN-43', 'shipping', 'Livrare de intrare'),
    ('Raport de mentenanță', 'Revizie SP-02', 'shipping', 'Raport de prestare'),
    ('Proces-verbal', 'Proces-verbal de recepție SP-02', 'inventory_management', 'Proces-verbal de recepție'),
    ('Proces-verbal', 'Notă de intrare-recepție NIR-42', 'inventory_management', 'Proces-verbal de recepție'),
    ('Proces-verbal', 'Material Document MD-42', 'inventory_management', 'Document de material'),
    ('Factură', 'Credit Memo From Vendor CM-42', 'invoice_verification', 'Notă de credit furnizor'),
    ('Factură', 'Factură storno INV-42', 'invoice_verification', 'Notă de credit'),
])
def test_document_types_follow_the_procurement_flow(category, title, stage, document_type):
    document = SimpleNamespace(category=category, title=title, department='Tehnic', extra={})
    result = classify(document)
    assert result['stage'] == stage
    assert result['document_type'] == document_type


@pytest.mark.parametrize('category,department,title', [
    ('Procedură', 'Achiziții', 'Purchase order procedure'),
    ('Audit', 'Financiar', 'Invoice audit'),
    ('Instruire', 'Tehnic', 'Material document training'),
    ('Resurse umane', 'Resurse umane', 'Comandă de achiziție personală'),
    ('Factură', 'Resurse umane', 'Factură dosar personal'),
    ('Proces-verbal', 'Tehnic', 'Proces-verbal al ședinței despre facturi'),
])
def test_unrelated_records_are_not_classified_from_mentions(category, department, title):
    document = SimpleNamespace(category=category, title=title, department=department,
        summary='Purchase order, outbound delivery, material document, invoice',
        searchable_text='Factura Credit memo', extra={})
    assert classify(document) is None


def test_explicit_metadata_recognizes_material_type_without_overriding_known_stage():
    document = SimpleNamespace(category='Proces-verbal', title='Înregistrare MD-42', department='Tehnic',
        extra={'metadata': {'document_type': 'Material document'}})
    assert classify(document)['stage'] == 'inventory_management'
    assert classify(document)['source'] == 'metadata'
    document.category = 'Contract'
    assert classify(document)['stage'] == 'purchasing'


@pytest.mark.parametrize('category,title,stage', [
    ('Comandă', 'Comandă de înlocuire PO-43', 'purchasing'),
    ('Raport de mentenanță', 'Raport de mentenanță / prestare - Scări SP-02', 'shipping'),
    ('Proces-verbal', 'Proces-verbal de recepție - Scări SP-02', 'inventory_management'),
    ('Factură', 'Factură storno INV-42', 'invoice_verification'),
    ('Procedură', 'Proces-verbal de recepție template', None),
])
@pytest.mark.parametrize('rounds', [1, 2])
def test_old_windows_imports_keep_the_same_classification(category, title, stage, rounds):
    original = SimpleNamespace(category=category, title=title, department='Tehnic', extra={})
    encoded_category, encoded_title = category, title
    for _ in range(rounds):
        encoded_category = encoded_category.encode('utf-8').decode('cp1252')
        encoded_title = encoded_title.encode('utf-8').decode('cp1252')
    imported = SimpleNamespace(category=encoded_category, title=encoded_title, department='Tehnic', extra={})
    assert classify(imported) == classify(original)
    assert (classify(imported) or {}).get('stage') == stage
    assert imported.category == encoded_category
    assert imported.title == encoded_title


def test_encoding_recovery_preserves_correct_and_mixed_unicode_text():
    title = 'Proces-verbal de recepție - Café și Scări SP-02'
    mixed = title.replace('ție', 'ție'.encode('utf-8').decode('cp1252'))
    assert normalize(mixed) == normalize(title)
    assert normalize('Café | România | Straße | 倉庫') == 'cafe romania stra e'


@pytest.fixture
def flow_documents(admin, db):
    records = [
        ('flow-order', 'Comandă de achiziție PO-42', 'Comandă', 'Achiziții', 'FLOW-A', 'approved'),
        ('flow-outbound', 'Outbound delivery DN-42', 'Proces-verbal', 'Tehnic', 'FLOW-A', 'approved'),
        ('flow-receipt', 'Proces-verbal de recepție MD-42', 'Proces-verbal', 'Tehnic', 'FLOW-A', 'approved'),
        ('flow-invoice', 'Factură INV-42', 'Factură', 'Financiar', 'FLOW-A', 'approved'),
        ('flow-credit', 'Credit memo from vendor CM-42', 'Factură', 'Financiar', 'FLOW-B', 'signed'),
        ('flow-procedure', 'Material document procedure', 'Procedură', 'Conformitate', 'FLOW-A', 'approved'),
        ('flow-hr', 'Purchase order personal', 'Resurse umane', 'Resurse umane', 'FLOW-A', 'approved'),
        ('flow-foreign', 'Factură de la alt aeroport', 'Factură', 'Financiar', 'FLOW-A', 'approved'),
        ('flow-minutes', 'Proces-verbal de ședință', 'Proces-verbal', 'Tehnic', 'FLOW-B', 'approved'),
    ]
    ids = [record[0] for record in records]
    for identifier, title, category, department, case_ref, status in records:
        db.add(Document(id=identifier, title=title, number=identifier.upper(), category=category,
            department=department, status=status, created_at='2026-10-01', updated_at='2026-10-01',
            supplier='Flow supplier', owner='Ioana Stancu' if department == 'Resurse umane' else 'Elena Popa',
            created_by='seed', confidentiality='restricted' if department == 'Resurse umane' else 'internal',
            summary=title, searchable_text='FlowMarker procurement fixture', version=1, validated=True,
            airport_id='foreign' if identifier == 'flow-foreign' else settings.airport_id,
            extra={'metadata': {'case_id': case_ref, 'supplier_iban': 'private-bank-field'},
                'related_ids': [other for other in ids if other != identifier]}))
    db.commit()
    yield ids
    for identifier in ids:
        db.delete(db.get(Document, identifier))
    db.commit()


def flow_items(payload):
    return [item for stage in payload['stages'] for item in stage['items']]


def test_flow_route_requires_login_and_is_not_treated_as_document_id(client):
    assert client.get('/api/documents/flow').status_code == 401


def test_flow_counts_cases_and_relations_respect_read_permissions(admin, flow_documents):
    response = admin.get('/api/documents/flow', params={'q': 'FlowMarker'})
    assert response.status_code == 200, response.text
    payload = response.json()
    assert [stage['id'] for stage in payload['stages']] == [
        'purchasing', 'shipping', 'inventory_management', 'invoice_verification']
    assert [stage['count'] for stage in payload['stages']] == [1, 1, 1, 2]
    assert payload['total'] == 7
    assert payload['classified_total'] == 5
    assert payload['unclassified_total'] == 2
    assert payload['cases'] == [
        {'id': 'FLOW-A', 'label': 'FLOW-A', 'count': 5},
        {'id': 'FLOW-B', 'label': 'FLOW-B', 'count': 2}]
    assert 'Comandă' in payload['categories']
    for item in flow_items(payload):
        assert 'flow-hr' not in item['related_ids']
        assert 'flow-foreign' not in item['related_ids']
        assert item['flow_case_id'] in {'FLOW-A', 'FLOW-B'}


def test_case_selection_keeps_other_case_options_and_register_filters(admin, flow_documents):
    selected = admin.get('/api/documents/flow', params={'q': 'FlowMarker', 'case_id': 'FLOW-A'}).json()
    assert selected['total'] == 5
    assert selected['classified_total'] == 4
    assert [case['id'] for case in selected['cases']] == ['FLOW-A', 'FLOW-B']
    assert all(item['flow_case_id'] == 'FLOW-A' for item in flow_items(selected))
    filtered = admin.get('/api/documents/flow', params={
        'q': 'FlowMarker', 'category': 'Factură', 'status': 'approved', 'department': 'Financiar'}).json()
    assert {item['id'] for item in flow_items(filtered)} == {'flow-invoice', 'flow-credit'}
    assert filtered['total'] == filtered['classified_total'] == 2
    empty = admin.get('/api/documents/flow', params={'q': 'NoMatchingFlowRecord'}).json()
    assert empty['total'] == 0
    assert empty['cases'] == []
    assert len(empty['stages']) == 4
    assert all(stage['count'] == 0 for stage in empty['stages'])


def test_flow_filters_match_canonical_labels_in_old_windows_imports(admin, db, flow_documents):
    document = db.get(Document, 'flow-order')
    document.category = document.category.encode('utf-8').decode('cp1252')
    document.department = document.department.encode('utf-8').decode('cp1252')
    document.title = document.title.encode('utf-8').decode('cp1252')
    db.commit()
    payload = admin.get('/api/documents/flow', params={
        'q': 'FlowMarker', 'category': 'Comandă', 'department': 'Achiziții'}).json()
    assert payload['total'] == payload['classified_total'] == 1
    assert payload['stages'][0]['items'][0]['id'] == 'flow-order'
    assert payload['stages'][0]['items'][0]['flow']['document_type'] == 'Comandă de achiziție'
    db.refresh(document)
    assert document.category != 'Comandă'


def test_corpus_seed_uses_utf8_when_platform_default_is_windows_text(admin, db, pdf_bytes, tmp_path, monkeypatch):
    record = {
        'id': 'flow-utf8-seed', 'title': 'Raport de mentenanță - Scări SP-02',
        'category': 'Raport de mentenanță', 'department': 'Tehnic', 'status': 'approved',
        'filename': 'flow-utf8-seed.pdf', 'summary': 'Recepție și prestare',
    }
    corpus = tmp_path / 'corpus'
    (corpus / 'pdfs').mkdir(parents=True)
    (corpus / 'pdfs' / record['filename']).write_bytes(pdf_bytes)
    (corpus / 'seed-manifest.json').write_text(json.dumps({'documents': [record]}, ensure_ascii=False), encoding='utf-8')
    original_read_text = Path.read_text

    def windows_read_text(path, *args, **kwargs):
        if not args and not kwargs.get('encoding'):
            kwargs['encoding'] = 'cp1252'
        return original_read_text(path, *args, **kwargs)

    monkeypatch.setattr(Path, 'read_text', windows_read_text)
    monkeypatch.setattr(settings, 'corpus_dir', corpus)
    try:
        seed()
        document = db.get(Document, record['id'])
        assert document.title == record['title']
        assert document.category == record['category']
        assert document.summary == record['summary']
        version = db.scalar(select(DocumentVersion).where(DocumentVersion.document_id == document.id))
        assert version.snapshot['category'] == record['category']
        assert classify(document)['stage'] == 'shipping'
    finally:
        db.execute(delete(AuditEvent).where(AuditEvent.document_id == record['id']))
        db.execute(delete(DocumentVersion).where(DocumentVersion.document_id == record['id']))
        db.execute(delete(Document).where(Document.id == record['id']))
        db.commit()


def test_technician_flow_hides_financial_records_and_private_fields(admin, flow_documents):
    login(admin, 'technician')
    response = admin.get('/api/documents/flow', params={'q': 'FlowMarker'})
    assert response.status_code == 200
    payload = response.json()
    assert payload['total'] == 3
    assert payload['classified_total'] == 2
    assert {item['id'] for item in flow_items(payload)} == {'flow-outbound', 'flow-receipt'}
    assert 'private-bank-field' not in response.text
    for item in flow_items(payload):
        assert set(item['related_ids']) <= {'flow-outbound', 'flow-receipt', 'flow-minutes'}


def test_new_document_and_title_revision_recompute_flow_without_migration(admin, pdf_bytes):
    uploaded = admin.post('/api/documents', files={'file': ('delivery.pdf', pdf_bytes, 'application/pdf')},
        data={'title': 'Aviz de livrare DN-99', 'category': 'Proces-verbal', 'department': 'Tehnic'})
    assert uploaded.status_code == 201, uploaded.text
    document = uploaded.json()
    assert document['flow']['stage'] == 'shipping'
    updated = admin.patch(f"/api/documents/{document['id']}",
        json={'title': 'Proces-verbal de recepție DN-99', 'metadata': {'case_id': 'FLOW-NEW'}})
    assert updated.status_code == 200, updated.text
    assert updated.json()['flow']['stage'] == 'inventory_management'
    assert updated.json()['version'] == 2
    payload = admin.get('/api/documents/flow', params={'case_id': 'FLOW-NEW'}).json()
    assert payload['total'] == payload['classified_total'] == 1
    assert payload['stages'][2]['items'][0]['id'] == document['id']


def test_flow_includes_all_matches_beyond_default_library_page(admin, db):
    ids = [f'flow-bulk-{index}' for index in range(105)]
    try:
        for identifier in ids:
            db.add(Document(id=identifier, title='Factură BulkFlowMarker', number=identifier,
                category='Factură', department='Financiar', status='approved', created_at='2026-10-01',
                updated_at='2026-10-01', owner='Elena Popa', created_by='seed', confidentiality='internal',
                summary='', searchable_text='BulkFlowMarker', version=1, validated=True,
                airport_id=settings.airport_id, extra={}))
        db.commit()
        page = admin.get('/api/documents', params={'q': 'BulkFlowMarker'}).json()
        assert len(page['items']) == 100
        payload = admin.get('/api/documents/flow', params={'q': 'BulkFlowMarker'}).json()
        assert payload['total'] == payload['classified_total'] == 105
        assert {item['id'] for item in flow_items(payload)} == set(ids)
    finally:
        for identifier in ids:
            document = db.get(Document, identifier)
            if document:
                db.delete(document)
        db.commit()
