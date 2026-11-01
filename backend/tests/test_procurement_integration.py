"""Procurement templates use the same immutable PDF intake and approval boundary."""
import json
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from types import SimpleNamespace

import pytest


@pytest.mark.parametrize('template,category,wanted_stage,wanted_type', [
    ('acceptance', 'Proces-verbal', 'inventory_management', 'Proces-verbal de recepție'),
    ('inbound_delivery', 'Proces-verbal', 'shipping', 'Livrare de intrare'),
    ('credit_note', 'Factură', 'invoice_verification', 'Notă de credit'),
    ('return_order', 'Comandă', 'purchasing', 'Comandă de retur'),
])
def test_fixed_template_classification_does_not_depend_on_the_pdf_title(template, category, wanted_stage, wanted_type):
    from app.documents.classification import classify
    document = SimpleNamespace(category=category, title='Uploaded supplier PDF', department='Achiziții',
                               extra={'metadata': {'procurement': {'template_id': template}}})
    result = classify(document)
    assert result is not None
    assert result['stage'] == wanted_stage
    assert result['document_type'] == wanted_type


def test_migration_history_has_one_upgrade_target():
    config = Config(str(Path(__file__).resolve().parents[1] / 'alembic.ini'))
    assert len(ScriptDirectory.from_config(config).get_heads()) == 1


def upload_template(admin, pdf_bytes, template='contract', fields=None):
    return admin.post('/api/documents', files={'file': ('procurement.pdf', pdf_bytes, 'application/pdf')},
                      data={'title': 'Procurement integration fixture', 'category': 'Contract',
                            'department': 'Achiziții', 'procurement_template': template,
                            'procurement_fields': json.dumps(fields or {})})


def test_upload_stores_fixed_template_fields_in_initial_version(admin, pdf_bytes):
    response = upload_template(admin, pdf_bytes, fields={
        'number': 'PO-INT-1', 'currency': 'EUR', 'supplier': 'Integration Supplier', 'value': '1200.25',
    })
    assert response.status_code == 201, response.text
    document = response.json()
    assert document['version'] == 1
    assert document['number'] == 'PO-INT-1'
    assert document['currency'] == 'EUR'
    assert document['supplier'] == 'Integration Supplier'
    assert document['value'] == 1200.25
    saved = admin.get(f"/api/procurement/documents/{document['id']}").json()
    assert saved['template_id'] == 'contract'
    assert saved['fields']['value'] == '1200.25'
    assert saved['fields']['currency'] == 'EUR'


def test_incomplete_template_blocks_document_validation(admin, pdf_bytes):
    response = upload_template(admin, pdf_bytes)
    assert response.status_code == 201, response.text
    document = response.json()
    result = admin.post(f"/api/documents/{document['id']}/actions",
                        json={'action': 'validate', 'version': 1})
    assert result.status_code == 422, result.text
    refreshed = admin.get(f"/api/documents/{document['id']}").json()
    assert not refreshed['validated']
    assert refreshed['version'] == 1


def test_invalid_template_upload_does_not_register_a_pdf(admin, pdf_bytes):
    before = admin.get('/api/documents?limit=500').json()['total']
    result = upload_template(admin, pdf_bytes, template='not-a-fixed-template')
    assert result.status_code == 422, result.text
    assert admin.get('/api/documents?limit=500').json()['total'] == before


def test_malformed_template_fields_are_rejected_at_intake(admin, pdf_bytes):
    result = admin.post('/api/documents', files={'file': ('procurement.pdf', pdf_bytes, 'application/pdf')},
                        data={'procurement_template': 'contract', 'procurement_fields': '[1,2]'})
    assert result.status_code == 422, result.text


def test_template_fields_without_a_template_are_rejected(admin, pdf_bytes):
    result = admin.post('/api/documents', files={'file': ('procurement.pdf', pdf_bytes, 'application/pdf')},
                        data={'procurement_fields': '{"value":"1.00"}'})
    assert result.status_code == 422, result.text


def test_uploaded_invoice_approval_requires_real_case_acceptance_and_allocation(admin, pdf_bytes):
    from app.procurement.catalog import get_template

    def uploaded(template, supplied):
        values = {'number': 'INT-' + template, 'issue_date': '2026-10-01', **supplied}
        response = admin.post('/api/documents', files={'file': ('evidence.pdf', pdf_bytes, 'application/pdf')}, data={
            'title': 'Integration ' + template, 'category': get_template(template)['category'],
            'department': 'Achiziții', 'procurement_template': template, 'procurement_fields': json.dumps(values),
        })
        assert response.status_code == 201, response.text
        return response.json()['id']

    def document_action(ident, action, wanted=200):
        if action == 'approve' and wanted == 200:
            task = admin.get(f'/api/documents/{ident}').json()['workflow']['task']
            assigned = admin.post(f"/api/tasks/{task['id']}/assign", json={
                'version': 1, 'assigned_to': 'admin', 'comment': 'Explicit integration review assignment'})
            assert assigned.status_code == 200, assigned.text
        result = admin.post(f'/api/documents/{ident}/actions', json={'action': action, 'version': 1})
        assert result.status_code == wanted, result.text

    def approve(ident):
        for action in ('validate', 'submit', 'approve'):
            document_action(ident, action)

    result = admin.post('/api/procurement/cases', json={'title': 'Uploaded invoice integration',
        'description': '', 'owner_id': 'admin', 'currency': 'RON', 'anticipated_value': '1000.00'})
    assert result.status_code == 201, result.text
    case = result.json()

    def mutate(path, payload):
        nonlocal case
        result = admin.post(f"/api/procurement/cases/{case['id']}/{path}",
                            json={'revision': case['revision'], **payload})
        assert result.status_code == 200, result.text
        case = result.json()

    common = {'supplier': 'Integration Supplier', 'value': '1000.00', 'currency': 'RON'}
    sources = {
        'necessity': uploaded('necessity', {'value': '1000.00', 'currency': 'RON', 'requester': 'Requester',
            'justification': 'Replacement equipment', 'budget_line': 'B1', 'urgency': 'normal'}),
        'specifications': uploaded('specifications', {'scope': 'Equipment', 'technical_requirements': 'One unit',
            'acceptance_criteria': 'Function check', 'author': 'Engineer'}),
        'contract': uploaded('contract', {**common, 'effective_date': '2026-10-01',
            'expiration_date': '2027-10-01', 'payment_terms': '30 days'}),
        'inbound_delivery': uploaded('inbound_delivery', {'delivery_date': '2026-10-05', 'items': 'One unit', 'reference': 'DN1'}),
        'acceptance': uploaded('acceptance', {'inspection_date': '2026-10-06', 'verdict': 'accepted',
            'accepted_amount': '1000.00', 'currency': 'RON'}),
    }
    for template, ident in sources.items():
        approve(ident)
        mutate('documents', {'document_id': ident, 'version': 1, 'template_id': template})
    for child, parent, relationship in [('specifications', 'necessity', 'specifies_need'),
        ('contract', 'necessity', 'fulfills_request'), ('inbound_delivery', 'contract', 'delivers_against'),
        ('acceptance', 'inbound_delivery', 'accepts_delivery')]:
        mutate('links', {'source_id': sources[child], 'target_id': sources[parent],
            'source_version': 1, 'target_version': 1, 'type': relationship})
    result = admin.patch(f"/api/procurement/cases/{case['id']}", json={
        'revision': case['revision'], 'primary_document_id': sources['contract']})
    assert result.status_code == 200, result.text
    case = result.json()
    for _ in range(3):
        mutate('actions', {'action': 'advance', 'comment': 'Verified evidence'})
    assert case['stage'] == 'accepted'
    invoice = uploaded('invoice', {**common, 'due_date': '2026-11-20', 'tax_amount': '0.00'})
    mutate('documents', {'document_id': invoice, 'version': 1, 'template_id': 'invoice'})
    document_action(invoice, 'validate')
    document_action(invoice, 'submit')
    document_action(invoice, 'approve', wanted=409)
    assert admin.get(f'/api/documents/{invoice}').json()['status'] == 'in_review'
    for target in (sources['contract'], sources['acceptance']):
        mutate('links', {'source_id': invoice, 'target_id': target, 'source_version': 1,
            'target_version': 1, 'type': 'invoices_against'})
    mutate('allocations', {'invoice_id': invoice, 'acceptance_id': sources['acceptance'],
        'invoice_version': 1, 'acceptance_version': 1, 'amount': '1000.00'})
    document_action(invoice, 'approve')
    mutate('actions', {'action': 'advance', 'comment': 'Invoice approval verified'})
    assert case['stage'] == 'invoiced'
    assert case['balances']['outstanding'] == '1000.00'
    assert case['balances']['paid'] == '0.00'
