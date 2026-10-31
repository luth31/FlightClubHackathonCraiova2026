import copy
from conftest import login
from test_suppliers import create_case,supplier
from test_workflows import act,assign_review

def approved_contract(client,pdf_bytes,name,value=2000):
    response=client.post('/api/documents',files={'file':('contract.pdf',pdf_bytes,'application/pdf')},
        data={'title':'Catalog contract','category':'Contract','department':'Achiziții','supplier':name})
    assert response.status_code==201,response.text
    document=response.json()['id']
    assert client.patch(f'/api/documents/{document}',json={'value':value,'expires_at':'2027-01-01'}).status_code==200
    assert act(client,document,'validate').status_code==200
    assert act(client,document,'submit').status_code==200
    assign_review(client,document)
    assert act(client,document,'approve').status_code==200
    return client.get(f'/api/documents/{document}').json()

def test_supplier_has_two_selectable_contracts(admin,pdf_bytes):
    known=supplier(admin)
    doc=approved_contract(admin,pdf_bytes,known['name'])
    url=f'/api/suppliers/{known["id"]}'
    response=admin.post(url+'/contracts',json={'document_id':doc['id'],'version':doc['version']})
    assert response.status_code==200,response.text
    contracts=admin.get(url+'/contracts').json()['items']
    assert {'test-contract',doc['id']} <= {d['id'] for d in contracts if d['eligible_for_review']}
    case,_=create_case(admin,supplier_id=known['id'],document_id=doc['id'],invoice_amount=1500)
    assert case['contract_snapshot']['value']=='2000.00'
    assert 'amount_above_contract' not in {r['code'] for r in case['reasons']}
    unrelated=approved_contract(admin,pdf_bytes,'Unrelated Supplier SRL')
    assert admin.post('/api/supplier-reviews',json={'supplier_id':known['id'],'document_id':unrelated['id'],'sender_email':known['verified_contact'],'observed_iban':known['expected_iban']}).status_code==422

def test_suspension_invalidates_pending_review(admin,db):
    from app.suppliers.models import Supplier
    known=supplier(admin); case,_=create_case(admin)
    record=db.get(Supplier,known['id']); baseline={k:copy.deepcopy(getattr(record,k)) for k in ('state','registry_revision')}
    try:
        response=admin.patch(f'/api/suppliers/{known["id"]}',json={'state':'suspended','comment':'Review vendor status','registry_revision':known['registry_revision']})
        assert response.status_code==200,response.text
        assert admin.get(f'/api/supplier-reviews/{case["id"]}').json()['freshness']['state']=='stale'
        assert admin.patch(f'/api/suppliers/{known["id"]}',json={'state':'active','comment':'Stale edit','registry_revision':known['registry_revision']}).status_code==409
        login(admin,'finance')
        assert admin.patch(f'/api/suppliers/{known["id"]}',json={'state':'active','comment':'Unauthorized edit','registry_revision':response.json()['registry_revision']}).status_code==403
    finally:
        db.expire_all()
        for key,value in baseline.items(): setattr(record,key,value)
        db.commit()

def test_seed_preserves_registry_identity_and_history(admin,db):
    from app.suppliers.service import seed_suppliers
    known=supplier(admin)
    before=admin.get(f'/api/suppliers/{known["id"]}').json()
    seed_suppliers(db);db.commit()
    again=admin.get(f'/api/suppliers/{known["id"]}').json()
    assert again['id']==known['id'] and again['bank_history']==before['bank_history']
    assert again['tax_id'] is None


def test_reseeding_after_airport_rename_preserves_supplier_id(admin, db, monkeypatch):
    from sqlalchemy import select
    from app.suppliers import service
    from app.suppliers.models import Supplier
    before = {item.id: copy.deepcopy(item.bank_history) for item in db.scalars(select(Supplier))}
    # The generated hash changes when the airport identifier changes. Persisted
    # suppliers must still be recognized by their original source contract.
    monkeypatch.setattr(service, 'supplier_id', lambda name, airport: 'would-be-new-tenant-hash')
    service.seed_suppliers(db)
    db.commit()
    after = {item.id: item.bank_history for item in db.scalars(select(Supplier))}
    assert after == before
