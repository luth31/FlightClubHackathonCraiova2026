from uuid import uuid4

from conftest import login
import pytest


def create_case(client, **changes):
    payload = dict(title='Dosar test ' + uuid4().hex[:8], description='Achiziție test',
                   owner_id='admin', currency='RON', anticipated_value='1000.00')
    payload.update(changes)
    response = client.post('/api/procurement/cases', json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def test_fixed_catalog_and_empty_case_are_available(admin):
    response = admin.get('/api/procurement/templates')
    assert response.status_code == 200
    data = response.json()
    assert data['version'] == 1
    assert len(data['templates']) == 13
    assert [s['id'] for s in data['stages']] == ['draft', 'needs_review', 'committed', 'accepted', 'invoiced', 'paid']
    case = create_case(admin)
    assert case['stage'] == 'draft'
    assert case['anticipated_value'] == '1000.00'
    assert case['documents'] == []
    assert case['blockers']
    listed = admin.get('/api/procurement/cases').json()
    assert case['id'] in [item['id'] for item in listed['items']]


def test_empty_case_cannot_advance_and_revision_conflicts(admin):
    case = create_case(admin)
    response = admin.post(f"/api/procurement/cases/{case['id']}/actions", json={
        'revision': case['revision'], 'action': 'advance', 'comment': ''})
    assert response.status_code == 409
    updated = admin.patch(f"/api/procurement/cases/{case['id']}", json={
        'revision': case['revision'], 'title': 'Titlu corectat'})
    assert updated.status_code == 200, updated.text
    stale = admin.patch(f"/api/procurement/cases/{case['id']}", json={
        'revision': case['revision'], 'title': 'Cerere veche'})
    assert stale.status_code == 409
    assert admin.get(f"/api/procurement/cases/{case['id']}").json()['title'] == 'Titlu corectat'


def test_case_money_is_exact_and_bounded(admin):
    for bad in ['NaN', 'Infinity', '1.001', '-1', '1000000000000000000000']:
        response = admin.post('/api/procurement/cases', json=dict(
            title='Invalid', description='', owner_id='admin', currency='RON', anticipated_value=bad))
        assert response.status_code == 422, response.text


def approved_doc(db, template, value='1000.00', **fields):
    from app.documents.models import Document, DocumentVersion
    from app.documents.service import CATEGORIES
    import hashlib
    from conftest import TEST_ROOT, pdf_bytes, corpus
    categories = {'necessity': 1, 'specifications': 2, 'contract': 0, 'purchase_order': 3,
                  'addendum': 7, 'inbound_delivery': 5, 'service_report': 6,
                  'acceptance': 5, 'invoice': 4, 'credit_note': 4,
                  'return_order': 3, 'replacement_order': 3, 'outbound_delivery': 5}
    defaults = {'requester': 'Solicitant', 'justification': 'Necesitate', 'budget_line': 'B1',
                'urgency': 'normal', 'scope': 'Scop', 'technical_requirements': 'Cerințe',
                'acceptance_criteria': 'Criterii', 'author': 'Autor', 'effective_date': '2026-01-01',
                'expiration_date': '2027-01-01', 'payment_terms': '30 zile', 'delivery_deadline': '2026-12-01',
                'delivery_destination': 'Aeroport', 'delivery_date': '2026-10-10', 'items': 'Lucrări',
                'reference': 'REF', 'inspection_date': '2026-10-11', 'verdict': 'accepted',
                'accepted_amount': value, 'findings': '', 'resolved': False,
                'issue_date': '2026-10-12', 'due_date': '2026-11-30', 'tax_amount': '0.00'}
    defaults.update(fields)
    ident = 'proc-doc-' + uuid4().hex[:10]
    content = (corpus / 'pdfs' / 'test-contract.pdf').read_bytes()
    path = TEST_ROOT / (ident + '.pdf')
    path.write_bytes(content)
    doc = Document(id=ident, title=ident, number=ident, category=CATEGORIES[categories[template]],
                   department='Achiziții' if template not in ('acceptance','inbound_delivery','service_report') else 'Tehnic',
                   status='approved', created_at='2026-10-01', updated_at='2026-10-01', supplier='Furnizor',
                   value=float(value), currency='RON', owner='Ana', owner_id='admin', created_by='admin',
                   expires_at=defaults.get('expiration_date'),
                   confidentiality='internal', version=1, validated=True, airport_id='craiova',
                   extra={'metadata': {'procurement': {'template_id': template, 'version': 1, 'fields': defaults}}})
    db.add(doc)
    db.flush()
    db.add(DocumentVersion(id=uuid4().hex, document_id=ident, version=1, file_path=str(path),
                           filename=path.name, sha256=hashlib.sha256(content).hexdigest(),
                           created_at='2026-10-01', created_by='admin', snapshot={}, approved_by='admin',
                           approved_at='2026-10-01'))
    db.commit()
    return ident


def mutate(admin, case, path, payload, status=200):
    response = admin.post(f"/api/procurement/cases/{case['id']}/{path}",
                          json={'revision': case['revision'], **payload})
    assert response.status_code == status, response.text
    return response.json() if status == 200 else case


def attach(admin, case, doc, template):
    return mutate(admin, case, 'documents', {'document_id': doc, 'version': 1, 'template_id': template})


def link(admin, case, source, target, kind):
    return mutate(admin, case, 'links', {'source_id': source, 'target_id': target,
                                        'source_version': 1, 'target_version': 1, 'type': kind})


def dossier(admin, db, invoice_amounts=('1000.00',)):
    case = create_case(admin)
    ids = {}
    for template in ['necessity', 'specifications', 'contract', 'inbound_delivery', 'acceptance']:
        ids[template] = approved_doc(db, template)
        case = attach(admin, case, ids[template], template)
    case = link(admin, case, ids['specifications'], ids['necessity'], 'specifies_need')
    case = link(admin, case, ids['contract'], ids['necessity'], 'fulfills_request')
    case = link(admin, case, ids['inbound_delivery'], ids['contract'], 'delivers_against')
    case = link(admin, case, ids['acceptance'], ids['inbound_delivery'], 'accepts_delivery')
    response = admin.patch(f"/api/procurement/cases/{case['id']}", json={
        'revision': case['revision'], 'primary_document_id': ids['contract']})
    assert response.status_code == 200, response.text
    case = response.json()
    for _ in range(3):
        case = mutate(admin, case, 'actions', {'action': 'advance', 'comment': 'Evidență verificată'})
    invoices = []
    for amount in invoice_amounts:
        invoice = approved_doc(db, 'invoice', amount)
        invoices.append(invoice)
        case = attach(admin, case, invoice, 'invoice')
        case = link(admin, case, invoice, ids['contract'], 'invoices_against')
        case = link(admin, case, invoice, ids['acceptance'], 'invoices_against')
    return case, ids, invoices


def test_full_case_partial_payment_credit_refund_and_reversal(admin, db):
    case, ids, invoices = dossier(admin, db)
    invoice = invoices[0]
    case = mutate(admin, case, 'allocations', {'invoice_id': invoice, 'acceptance_id': ids['acceptance'],
                       'invoice_version': 1, 'acceptance_version': 1, 'amount': '1000.00'})
    case = mutate(admin, case, 'actions', {'action': 'advance', 'comment': ''})
    assert case['committed_value'] == '1000.00'
    case = mutate(admin, case, 'payments', {'invoice_id': invoice, 'invoice_version': 1, 'kind': 'payment',
                      'amount': '600.00', 'date': '2026-11-01', 'reference': 'OP1'})
    assert case['balances']['outstanding'] == '400.00'
    case = mutate(admin, case, 'actions', {'action': 'advance', 'comment': ''}, 409)
    case = mutate(admin, case, 'payments', {'invoice_id': invoice, 'invoice_version': 1, 'kind': 'payment',
                      'amount': '400.00', 'date': '2026-11-01', 'reference': 'OP2'})
    credit = approved_doc(db, 'credit_note', '0.00', credit_amount='200.00', reason='Reducere')
    case = attach(admin, case, credit, 'credit_note')
    case = link(admin, case, credit, invoice, 'credits_invoice')
    assert case['balances']['overpaid'] == '200.00'
    case = mutate(admin, case, 'actions', {'action': 'advance', 'comment': ''}, 409)
    case = mutate(admin, case, 'payments', {'invoice_id': invoice, 'invoice_version': 1, 'kind': 'refund',
                       'amount': '200.00', 'date': '2026-11-01', 'reference': 'REF1'})
    assert case['balances']['overpaid'] == '0.00'
    payment_id = case['payments'][-1]['id']
    case = mutate(admin, case, f'payments/{payment_id}/reverse', {'comment': 'Corectare',
                      'date': '2026-11-01', 'reference': 'COR1'})
    assert case['balances']['overpaid'] == '200.00'
    mutate(admin, case, f'payments/{payment_id}/reverse', {'comment': 'Duplicat',
                      'date': '2026-11-01', 'reference': 'COR2'}, 409)


def test_overlapping_allocations_cannot_reuse_acceptance(admin, db):
    case, ids, invoices = dossier(admin, db, ('700.00', '400.00'))
    case = mutate(admin, case, 'allocations', {'invoice_id': invoices[0], 'acceptance_id': ids['acceptance'],
                       'invoice_version': 1, 'acceptance_version': 1, 'amount': '700.00'})
    mutate(admin, case, 'allocations', {'invoice_id': invoices[1], 'acceptance_id': ids['acceptance'],
                       'invoice_version': 1, 'acceptance_version': 1, 'amount': '400.00'}, 409)


def test_stale_document_blocks_payment_and_historical_ledger_survives(admin, db):
    from app.documents.models import Document, DocumentVersion
    case, ids, invoices = dossier(admin, db)
    invoice = invoices[0]
    case = mutate(admin, case, 'allocations', {'invoice_id': invoice, 'acceptance_id': ids['acceptance'],
                       'invoice_version': 1, 'acceptance_version': 1, 'amount': '1000.00'})
    case = mutate(admin, case, 'actions', {'action': 'advance', 'comment': ''})
    case = mutate(admin, case, 'payments', {'invoice_id': invoice, 'invoice_version': 1, 'kind': 'payment',
                       'amount': '100.00', 'date': '2026-11-01', 'reference': 'OP'})
    doc = db.get(Document, invoice)
    doc.version = 2
    doc.status = 'draft'
    db.commit()
    detail = admin.get(f"/api/procurement/cases/{case['id']}").json()
    assert any(d['stale'] for d in detail['documents'])
    assert detail['payments'][0]['invoice_version'] == 1
    mutate(admin, detail, 'payments', {'invoice_id': invoice, 'invoice_version': 1, 'kind': 'payment',
                       'amount': '100.00', 'date': '2026-11-01', 'reference': 'OLD'}, 409)


def test_technical_reader_cannot_read_financial_data_or_hidden_documents(admin, db):
    case, ids, invoices = dossier(admin, db)
    login(admin, 'technical-head')
    response = admin.get(f"/api/procurement/cases/{case['id']}")
    assert response.status_code == 200, response.text
    detail = response.json()
    assert detail['balances'] is None
    assert detail['payments'] == []
    assert detail['anticipated_value'] is None
    assert invoices[0] not in str(detail)
    assert detail['capabilities']['can_finance'] is False


def test_legacy_import_is_draft_idempotent_and_preserves_documents(admin, db):
    from app.documents.models import Document
    from app.procurement.service import import_legacy_cases
    from app.procurement.models import ProcurementCase
    from sqlalchemy import select
    doc = db.get(Document, 'test-contract')
    original = dict(doc.extra)
    doc.extra = {**doc.extra, 'metadata': {**doc.extra.get('metadata', {}), 'procurement_ref': 'LEGACY-TEST'}}
    db.commit()
    import_legacy_cases(db)
    import_legacy_cases(db)
    rows = list(db.scalars(select(ProcurementCase).where(ProcurementCase.legacy_ref == 'LEGACY-TEST')))
    assert len(rows) == 1
    assert rows[0].stage == 'draft'
    assert db.get(Document, doc.id).status == 'approved'
    assert not db.get(Document, doc.id).extra['metadata'].get('procurement')
    detail = admin.get(f'/api/procurement/cases/{rows[0].id}').json()
    assert detail['documents'] == []
    doc.extra = original
    db.commit()


def test_catalog_handles_malformed_namespace_and_rejects_wrong_field_types(admin, db):
    from app.procurement import catalog
    from app.documents.models import Document
    doc = db.get(Document, approved_doc(db, 'acceptance'))
    doc.extra = {'metadata': {'procurement': None}}
    assert catalog.document_errors(doc) == []
    doc.extra = {'metadata': {'procurement': {'template_id': 'acceptance', 'fields': {
        'issue_date': '2026-10-01', 'inspection_date': 'not-a-date', 'verdict': 'accepted',
        'accepted_amount': 'NaN', 'resolved': 'yes'}}}}
    assert len(catalog.document_errors(doc)) >= 3


def test_airport_isolation_and_unauthorized_create(admin, db):
    from app.procurement.models import ProcurementCase
    case = create_case(admin)
    db.get(ProcurementCase, case['id']).airport_id = 'foreign-airport'
    db.commit()
    assert admin.get(f"/api/procurement/cases/{case['id']}").status_code == 404
    login(admin, 'technician')
    response = admin.post('/api/procurement/cases', json=dict(title='Neautorizat', description='',
        owner_id='admin', currency='RON', anticipated_value='1.00'))
    assert response.status_code == 403


def test_effective_addendum_changes_commitment_without_double_counting_orders(admin, db):
    case = create_case(admin)
    contract = approved_doc(db, 'contract')
    case = attach(admin, case, contract, 'contract')
    order = approved_doc(db, 'purchase_order', '700.00')
    case = attach(admin, case, order, 'purchase_order')
    case = link(admin, case, order, contract, 'fulfills_request')
    addendum = approved_doc(db, 'addendum', value_delta='200.00', amendment_kind='price',
                            effective_date='2026-10-01', change_description='Majorare')
    case = attach(admin, case, addendum, 'addendum')
    case = link(admin, case, addendum, contract, 'amends_contract')
    response = admin.patch(f"/api/procurement/cases/{case['id']}", json={
        'revision': case['revision'], 'primary_document_id': contract})
    assert response.status_code == 200, response.text
    case = response.json()
    for template in ['necessity', 'specifications']:
        doc = approved_doc(db, template)
        case = attach(admin, case, doc, template)
        if template == 'necessity': need = doc
        else: case = link(admin, case, doc, need, 'specifies_need')
    case = mutate(admin, case, 'actions', {'action': 'advance', 'comment': ''})
    case = mutate(admin, case, 'actions', {'action': 'advance', 'comment': ''})
    assert case['committed_value'] == '1200.00'


def test_cancel_and_director_reopen_require_reasons(admin):
    case = create_case(admin)
    mutate(admin, case, 'actions', {'action': 'cancel', 'comment': ''}, 422)
    case = mutate(admin, case, 'actions', {'action': 'cancel', 'comment': 'Nu mai este necesar'})
    assert case['stage'] == 'cancelled'
    mutate(admin, case, 'actions', {'action': 'reopen', 'comment': ''}, 422)
    case = mutate(admin, case, 'actions', {'action': 'reopen', 'comment': 'Reluare'})
    assert case['stage'] == 'needs_review'


def test_managed_invoice_approval_requires_full_allocation_for_exact_version(admin, db):
    from app.documents.models import Document, DocumentVersion
    from app.tasks.service import ensure_task
    from app.people.models import User
    from sqlalchemy import select
    case, ids, invoices = dossier(admin, db)
    invoice = invoices[0]
    doc = db.get(Document, invoice)
    version = db.scalar(select(DocumentVersion).where(DocumentVersion.document_id==invoice, DocumentVersion.version==1))
    doc.status='in_review'
    version.approved_by=None
    version.approved_at=None
    ensure_task(db,doc,'approval',db.get(User,'admin'),preferred='admin',reopen=True)
    db.commit()
    response = admin.post(f'/api/documents/{invoice}/actions',json={'action':'approve','version':1,'comment':''})
    assert response.status_code==409,response.text
    case=mutate(admin,case,'allocations',{'invoice_id':invoice,'acceptance_id':ids['acceptance'],
        'invoice_version':1,'acceptance_version':1,'amount':'1000.00'})
    login(admin,'manager')
    response = admin.post(f'/api/documents/{invoice}/actions',json={'action':'approve','version':1,'comment':''})
    assert response.status_code==200,response.text
    assert response.json()['status']=='approved'
    login(admin,'admin')
    case=mutate(admin,case,'actions',{'action':'advance','comment':''})
    assert case['stage']=='invoiced'


def test_selected_purchase_order_must_be_standalone(admin, db):
    case,ids,invoices=dossier(admin,db)
    case=mutate(admin,case,'actions',{'action':'return','target_stage':'needs_review','comment':'Schimbare'})
    order=approved_doc(db,'purchase_order')
    case=attach(admin,case,order,'purchase_order')
    case=link(admin,case,order,ids['contract'],'fulfills_request')
    response=admin.patch(f"/api/procurement/cases/{case['id']}",json={'revision':case['revision'],'primary_document_id':order})
    assert response.status_code==200,response.text
    case=response.json()
    mutate(admin,case,'actions',{'action':'advance','comment':''},409)


def test_credits_cannot_exceed_invoice_gross(admin, db):
    case,ids,invoices=dossier(admin,db)
    case=mutate(admin,case,'allocations',{'invoice_id':invoices[0],'acceptance_id':ids['acceptance'],
        'invoice_version':1,'acceptance_version':1,'amount':'1000.00'})
    case=mutate(admin,case,'actions',{'action':'advance','comment':''})
    credit=approved_doc(db,'credit_note','0.00',credit_amount='1200.00',reason='Exces')
    case=attach(admin,case,credit,'credit_note')
    case=link(admin,case,credit,invoices[0],'credits_invoice')
    response=admin.post(f"/api/procurement/cases/{case['id']}/payments",json={'revision':case['revision'],
        'invoice_id':invoices[0],'invoice_version':1,'kind':'refund','amount':'200.00','date':'2026-11-01','reference':'Fără plată'})
    assert response.status_code==409,response.text


def test_reduced_award_cannot_ignore_existing_allocations(admin,db):
    case,ids,invoices=dossier(admin,db)
    case=mutate(admin,case,'allocations',{'invoice_id':invoices[0],'acceptance_id':ids['acceptance'],
        'invoice_version':1,'acceptance_version':1,'amount':'1000.00'})
    case=mutate(admin,case,'actions',{'action':'return','target_stage':'needs_review','comment':'Reducere'})
    addendum=approved_doc(db,'addendum',value_delta='-200.00',amendment_kind='price',effective_date='2026-10-01',change_description='Reducere')
    case=attach(admin,case,addendum,'addendum')
    case=link(admin,case,addendum,ids['contract'],'amends_contract')
    mutate(admin,case,'actions',{'action':'advance','comment':''},409)


def test_duplicate_payment_revision_cannot_write_twice(admin, db):
    case,ids,invoices=dossier(admin,db)
    case=mutate(admin,case,'allocations',{'invoice_id':invoices[0],'acceptance_id':ids['acceptance'],
        'invoice_version':1,'acceptance_version':1,'amount':'1000.00'})
    case=mutate(admin,case,'actions',{'action':'advance','comment':''})
    payload={'revision':case['revision'],'invoice_id':invoices[0],'invoice_version':1,'kind':'payment',
        'amount':'600.00','date':'2026-11-01','reference':'OP'}
    one=admin.post(f"/api/procurement/cases/{case['id']}/payments",json=payload)
    two=admin.post(f"/api/procurement/cases/{case['id']}/payments",json=payload)
    assert one.status_code==200,one.text
    assert two.status_code==409,two.text
    assert len(admin.get(f"/api/procurement/cases/{case['id']}").json()['payments'])==1


def test_create_transport_retry_is_idempotent_and_conflicting_payload_is_rejected(admin):
    request_id=uuid4().hex
    case=create_case(admin,request_id=request_id,title='Reîncercare sigură')
    duplicate=create_case(admin,request_id=request_id,title='Reîncercare sigură')
    assert duplicate['id']==case['id']
    response=admin.post('/api/procurement/cases',json={'request_id':request_id,'title':'Altă cerere',
        'description':'Achiziție test','owner_id':'admin','currency':'RON','anticipated_value':'1000.00'})
    assert response.status_code==409,response.text


def test_payment_reference_cannot_be_recorded_twice_after_refresh(admin,db):
    case,ids,invoices=dossier(admin,db)
    case=mutate(admin,case,'allocations',{'invoice_id':invoices[0],'acceptance_id':ids['acceptance'],
        'invoice_version':1,'acceptance_version':1,'amount':'1000.00'})
    case=mutate(admin,case,'actions',{'action':'advance','comment':''})
    payload={'invoice_id':invoices[0],'invoice_version':1,'kind':'payment','amount':'100.00','date':'2026-11-01','reference':'OP-DUP'}
    case=mutate(admin,case,'payments',payload)
    mutate(admin,case,'payments',payload,409)
    assert len(admin.get(f"/api/procurement/cases/{case['id']}").json()['payments'])==1


def test_replaced_invoice_can_refresh_pending_evidence_then_be_reapproved(admin, db):
    case, ids, invoices = dossier(admin, db)
    invoice = invoices[0]
    case = mutate(admin, case, 'allocations', {'invoice_id': invoice, 'acceptance_id': ids['acceptance'],
        'invoice_version': 1, 'acceptance_version': 1, 'amount': '1000.00'})
    changed = admin.patch(f'/api/procurement/documents/{invoice}', json={
        'version': 1, 'template_id': 'invoice', 'fields': {'due_date': '2026-12-15'}})
    assert changed.status_code == 200, changed.text
    assert changed.json()['version'] == 2
    case = mutate(admin, case, 'actions', {'action': 'return', 'target_stage': 'needs_review', 'comment': 'Factură nouă'})
    case = mutate(admin, case, 'documents', {'document_id': invoice, 'version': 2, 'template_id': 'invoice'})
    assert next(d for d in case['documents'] if d['document_id'] == invoice)['status'] == 'draft'
    for old_link in list(case['links']):
        if old_link['source_id'] != invoice: continue
        response = admin.delete(f"/api/procurement/cases/{case['id']}/links/{old_link['id']}?revision={case['revision']}")
        assert response.status_code == 200, response.text
        case = response.json()
    for target in (ids['contract'], ids['acceptance']):
        case = mutate(admin, case, 'links', {'source_id': invoice, 'target_id': target,
            'source_version': 2, 'target_version': 1, 'type': 'invoices_against'})
    case = mutate(admin, case, 'allocations', {'invoice_id': invoice, 'acceptance_id': ids['acceptance'],
        'invoice_version': 2, 'acceptance_version': 1, 'amount': '1000.00'})
    case = mutate(admin, case, 'actions', {'action': 'advance', 'comment': 'Reconfirmat'})
    for action in ('validate', 'submit'):
        response = admin.post(f'/api/documents/{invoice}/actions', json={'version': 2, 'action': action})
        assert response.status_code == 200, response.text
    task = admin.get(f'/api/documents/{invoice}').json()['workflow']['task']
    assigned = admin.post(f"/api/tasks/{task['id']}/assign", json={'version': 2, 'assigned_to': 'admin', 'comment': 'Revizuire explicită'})
    assert assigned.status_code == 200, assigned.text
    response = admin.post(f'/api/documents/{invoice}/actions', json={'version': 2, 'action': 'approve'})
    assert response.status_code == 200, response.text
    for _ in range(2):
        case = mutate(admin, case, 'actions', {'action': 'advance', 'comment': 'Versiune aprobată'})
    assert case['stage'] == 'invoiced'


def test_paid_case_credit_can_be_refunded_after_reopen_and_reconciled(admin, db):
    case, ids, invoices = dossier(admin, db)
    invoice = invoices[0]
    case = mutate(admin, case, 'allocations', {'invoice_id': invoice, 'acceptance_id': ids['acceptance'],
        'invoice_version': 1, 'acceptance_version': 1, 'amount': '1000.00'})
    case = mutate(admin, case, 'actions', {'action': 'advance', 'comment': ''})
    case = mutate(admin, case, 'payments', {'invoice_id': invoice, 'invoice_version': 1,
        'kind': 'payment', 'amount': '1000.00', 'date': '2026-11-01', 'reference': 'PAID-ORIGINAL'})
    case = mutate(admin, case, 'actions', {'action': 'advance', 'comment': 'Plătit'})
    case = mutate(admin, case, 'actions', {'action': 'reopen', 'comment': 'Credit după plată'})
    credit = approved_doc(db, 'credit_note', '0.00', credit_amount='200.00', reason='Reducere')
    case = attach(admin, case, credit, 'credit_note')
    case = link(admin, case, credit, invoice, 'credits_invoice')
    assert case['balances']['overpaid'] == '200.00'
    assert case['capabilities']['can_refund']
    assert not case['capabilities']['can_pay']
    case = mutate(admin, case, 'payments', {'invoice_id': invoice, 'invoice_version': 1,
        'kind': 'refund', 'amount': '200.00', 'date': '2026-11-01', 'reference': 'REFUND-ACTUAL'})
    amendment = approved_doc(db, 'addendum', '0.00', amendment_kind='price', value_delta='-200.00', change_description='Reducere aprobată')
    case = attach(admin, case, amendment, 'addendum')
    case = link(admin, case, amendment, ids['contract'], 'amends_contract')
    for _ in range(4):
        case = mutate(admin, case, 'actions', {'action': 'advance', 'comment': 'Reconciliere verificată'})
    assert case['stage'] == 'paid'
    assert case['balances']['paid'] == '800.00'
    assert case['balances']['committed'] == '800.00'
    assert case['balances']['overpaid'] == '0.00'
    assert {p['kind'] for p in case['payments']} == {'payment', 'refund'}


def test_child_purchase_order_cannot_justify_delivery_for_another_supplier_or_currency(admin, db):
    from app.documents.models import Document
    case, ids, invoices = dossier(admin, db)
    case = mutate(admin, case, 'actions', {'action': 'return', 'target_stage': 'needs_review', 'comment': 'Verificare comandă'})
    child = approved_doc(db, 'purchase_order')
    order = db.get(Document, child)
    order.supplier = 'Another supplier'
    order.currency = 'EUR'
    db.commit()
    case = attach(admin, case, child, 'purchase_order')
    case = link(admin, case, child, ids['contract'], 'fulfills_request')
    for old in list(case['links']):
        if old['source_id'] != ids['inbound_delivery']: continue
        response = admin.delete(f"/api/procurement/cases/{case['id']}/links/{old['id']}?revision={case['revision']}")
        assert response.status_code == 200, response.text
        case = response.json()
    case = link(admin, case, ids['inbound_delivery'], child, 'delivers_against')
    response = admin.post(f"/api/procurement/cases/{case['id']}/allocations", json={
        'revision': case['revision'], 'invoice_id': invoices[0], 'acceptance_id': ids['acceptance'],
        'invoice_version': 1, 'acceptance_version': 1, 'amount': '1000.00'})
    assert response.status_code == 409, response.text


def test_overpayment_on_one_invoice_blocks_new_payment_on_another(admin, db):
    case, ids, invoices = dossier(admin, db, ('500.00', '500.00'))
    for invoice in invoices:
        case = mutate(admin, case, 'allocations', {'invoice_id': invoice, 'acceptance_id': ids['acceptance'],
            'invoice_version': 1, 'acceptance_version': 1, 'amount': '500.00'})
    case = mutate(admin, case, 'actions', {'action': 'advance', 'comment': ''})
    case = mutate(admin, case, 'payments', {'invoice_id': invoices[0], 'invoice_version': 1,
        'kind': 'payment', 'amount': '500.00', 'date': '2026-11-01', 'reference': 'PAY-A'})
    credit = approved_doc(db, 'credit_note', '0.00', credit_amount='200.00', reason='Reducere')
    case = attach(admin, case, credit, 'credit_note')
    case = link(admin, case, credit, invoices[0], 'credits_invoice')
    response = admin.post(f"/api/procurement/cases/{case['id']}/payments", json={
        'revision': case['revision'], 'invoice_id': invoices[1], 'invoice_version': 1,
        'kind': 'payment', 'amount': '100.00', 'date': '2026-11-01', 'reference': 'PAY-B'})
    assert response.status_code == 409, response.text
    assert not case['capabilities']['can_pay']
