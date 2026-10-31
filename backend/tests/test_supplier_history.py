from conftest import login
from test_suppliers import create_case, supplier
import copy
import pytest
from app.suppliers.models import Supplier

@pytest.fixture(autouse=True)
def restore_registry(admin,db):
    known=supplier(admin)
    item=db.get(Supplier,known['id'])
    fields=('expected_iban','bank_history','registry_revision','trust_status')
    baseline={key:copy.deepcopy(getattr(item,key)) for key in fields}
    yield
    db.expire_all()
    for key,value in baseline.items(): setattr(item,key,value)
    db.commit()

def test_bank_history_preserves_original_and_resolves_actors(admin):
    known=supplier(admin)
    login(admin,'finance')
    case,_=create_case(admin)
    url=f'/api/supplier-reviews/{case["id"]}'
    assert admin.post(url+'/verify',json={'contact_used':known['verified_contact'],'note':'Independent fictional confirmation.'}).status_code==200
    login(admin)
    assert admin.post(url+'/approve',json={}).status_code==200
    detail=admin.get(url)
    assert detail.status_code==200
    assert detail.json()['actors']['approved_by']['name']
    assert detail.json()['approved_at']
    registry=admin.get(f'/api/supplier-reviews/registry/{known["id"]}').json()
    assert registry['bank_history'][0]['iban']==known['expected_iban']
    assert registry['bank_history'][-1]['verified_actor']['id']=='finance'
    assert registry['bank_history'][-1]['approved_actor']['id']=='admin'

def test_recheck_keeps_original_and_deduplicates(admin):
    old,payload=create_case(admin)
    response=admin.post('/api/supplier-reviews',json={**payload,'previous_review_id':old['id']})
    assert response.status_code==201
    new=response.json()
    assert new['id']!=old['id']
    assert new['previous_review_id']==old['id']
    assert admin.post('/api/supplier-reviews',json={**payload,'previous_review_id':old['id']}).json()['id']==new['id']
    assert admin.get(f'/api/supplier-reviews/{old["id"]}').json()['rechecks'][0]['id']==new['id']

def test_recheck_rejects_missing_predecessor(admin):
    _,payload=create_case(admin)
    assert admin.post('/api/supplier-reviews',json={**payload,'previous_review_id':'missing'}).status_code==404
    login(admin,'technician')
    assert admin.get('/api/supplier-reviews/missing').status_code==403
