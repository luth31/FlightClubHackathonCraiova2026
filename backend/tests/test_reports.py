import csv
import io
import uuid

import pytest

from conftest import login
from app.config import settings
from app.documents.models import Document
from app.reports import service


def test_reports_require_authentication(client):
    client.post('/api/auth/logout')
    assert client.get('/api/reports').status_code == 401
    assert client.get('/api/reports/contracts/export.csv').status_code == 401


@pytest.mark.parametrize('account', ['admin', 'reviewer', 'finance', 'hr', 'technician'])
def test_every_permitted_report_and_export_works(client, account):
    login(client, account)
    catalog = client.get('/api/reports')
    assert catalog.status_code == 200
    permitted = {item['id'] for item in catalog.json()['items']}
    for definition in service.DEFINITIONS:
        identifier = definition['id']
        response = client.get(f'/api/reports/{identifier}')
        export = client.get(f'/api/reports/{identifier}/export.csv')
        if identifier not in permitted:
            assert response.status_code == export.status_code == 403
            continue
        assert response.status_code == 200, response.text
        assert export.status_code == 200, export.text
        data = response.json()
        assert data['total'] == len(data['rows'])
        assert len(data['metrics']) == 4
        assert sum(item['value'] for item in data['activity']['items']) == data['activity']['total']
        csv_rows = list(csv.reader(io.StringIO(export.content.decode('utf-8-sig'))))
        assert len(csv_rows) == data['total'] + 1


def test_report_document_permissions_apply_to_counts_rows_and_export(client):
    login(client, 'technician')
    data = client.get('/api/reports/documents').json()
    listed = client.get('/api/documents').json()['items']
    assert {r['document_id'] for r in data['rows']} == {r['id'] for r in listed}
    assert 'test-hr' not in {r['id'] for r in data['rows']}
    assert 'test-contract' not in {r['id'] for r in data['rows']}
    assert 'test-hr' not in client.get('/api/reports/documents/export.csv').text
    assert 'expected_iban' not in str(data)


def test_department_filters_current_snapshot_and_activity(admin):
    data = admin.get('/api/reports/documents', params={'department': 'Tehnic', 'days': 30}).json()
    assert data['rows']
    assert all(row['department'] == 'Tehnic' for row in data['rows'])
    assert data['metrics'][0]['value'] == data['total']
    empty = admin.get('/api/reports/documents', params={'department': 'Does not exist'}).json()
    assert empty['rows'] == []
    assert empty['metrics'][0]['value'] == 0
    another_period = admin.get('/api/reports/documents', params={'department': 'Tehnic', 'days': 365}).json()
    assert data['metrics'] == another_period['metrics']
    assert data['activity']['start'] != another_period['activity']['start']


def test_reports_recalculate_and_separate_currencies(admin, db):
    contract = db.get(Document, 'test-contract')
    previous = contract.value, contract.currency
    try:
        before = admin.get('/api/reports/contracts').json()
        contract.value = 98765
        contract.currency = 'EUR'
        db.commit()
        after = admin.get('/api/reports/contracts').json()
        assert next(row for row in after['rows'] if row['id'] == contract.id)['value'] == 98765
        assert after['currency_totals'] != before['currency_totals']
        assert next(item for item in after['currency_totals'] if item['currency'] == 'EUR')['value'] >= 98765
    finally:
        contract.value, contract.currency = previous
        db.commit()


def test_csv_formula_and_cross_airport_isolation(admin, db):
    contract = db.get(Document, 'test-contract')
    previous = contract.title
    foreign_id = 'report-foreign-' + uuid.uuid4().hex
    foreign = Document(id=foreign_id, title='Other airport secret', number=foreign_id,
                       category='Contract', department='Achiziții', status='approved',
                       created_at=str(settings.reference_date), updated_at=str(settings.reference_date),
                       owner='Other owner', airport_id='other-airport', extra={})
    try:
        db.add(foreign)
        contract.title = '=HYPERLINK("https://example.com")'
        db.commit()
        data = admin.get('/api/reports/contracts').json()
        assert foreign_id not in {r['id'] for r in data['rows']}
        exported = list(csv.reader(io.StringIO(admin.get('/api/reports/contracts/export.csv').content.decode('utf-8-sig'))))
        row = next(r for r in exported[1:] if r[-1] == contract.id)
        assert row[1].startswith("'=HYPERLINK")
        assert 'Other airport secret' not in str(data)
    finally:
        contract.title = previous
        db.delete(foreign)
        db.commit()


def test_report_parameter_validation(admin):
    assert admin.get('/api/reports/not-found').status_code == 404
    assert admin.get('/api/reports/documents?days=0').status_code == 422
    assert admin.get('/api/reports/documents?days=100000').status_code == 422


def test_workforce_report_does_not_export_leave_reasons(client):
    login(client, 'hr')
    data = client.get('/api/reports/people')
    assert data.status_code == 200
    assert 'reason' not in data.text
    assert 'password_hash' not in data.text


def test_changing_roles_revokes_report_access_immediately(admin, db):
    from app.people.models import User

    user = db.get(User, 'admin')
    previous = list(user.roles)
    try:
        assert admin.get('/api/reports/overview').status_code == 200
        user.roles = ['technician']
        db.commit()
        assert admin.get('/api/reports/overview').status_code == 403
        assert admin.get('/api/reports/suppliers/export.csv').status_code == 403
        assert 'overview' not in {d['id'] for d in admin.get('/api/reports').json()['items']}
    finally:
        user.roles = previous
        db.commit()


def test_supplier_report_and_csv_include_records_beyond_the_first_list_page(admin, db):
    from app.suppliers.models import SupplierReview

    before = admin.get('/api/reports/suppliers').json()['total']
    records = [SupplierReview(
        id='report-review-' + uuid.uuid4().hex, fingerprint=uuid.uuid4().hex,
        airport_id=settings.airport_id, document_id='test-contract', source_version=1,
        supplier_name=f'Report supplier {i}', expected_iban='', observed_iban='',
        sender_email='supplier@example.test', verified_contact='', message='Test review',
        reasons=[], status='needs_review', created_by='admin', created_at='2026-10-31T12:00:00Z',
    ) for i in range(30)]
    try:
        db.add_all(records)
        db.commit()
        identifiers = {record.id for record in records}
        listing = admin.get('/api/supplier-reviews').json()
        assert len(listing['items']) == 25
        report = admin.get('/api/reports/suppliers').json()
        assert report['total'] == before + 30
        assert identifiers <= {row['id'] for row in report['rows']}
        exported = list(csv.reader(io.StringIO(admin.get('/api/reports/suppliers/export.csv').content.decode('utf-8-sig'))))
        assert len(exported) == report['total'] + 1
        assert identifiers <= {row[0] for row in exported[1:]}
    finally:
        for record in records:
            db.delete(record)
        db.commit()
