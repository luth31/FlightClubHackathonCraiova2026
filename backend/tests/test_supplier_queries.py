import csv
import io
from conftest import login
from test_suppliers import create_case, supplier

def test_filter_pagination_and_export_match(admin):
    cases=[create_case(admin,message=f'query fixture {i}')[0] for i in range(3)]
    first=admin.get('/api/supplier-reviews',params={'q':'query fixture','limit':2}).json()
    second=admin.get('/api/supplier-reviews',params={'q':'query fixture','limit':2,'offset':2}).json()
    # q searches names/contact/IBAN/IDs, not free-text evidence.
    ids=[c['id'] for c in cases]
    first=admin.get('/api/supplier-reviews',params={'q':ids[0],'limit':1}).json()
    assert first['total']==1 and first['items'][0]['id']==ids[0]
    page=admin.get('/api/supplier-reviews',params={'limit':2}).json()
    assert len(page['items'])==2
    assert admin.get('/api/supplier-reviews',params={'limit':2,'offset':2}).json()['items'][0]['id'] not in {c['id'] for c in page['items']}
    response=admin.get('/api/supplier-reviews/export.csv',params={'q':ids[0]})
    assert response.status_code==200
    rows=list(csv.reader(io.StringIO(response.text.lstrip('\ufeff'))))
    assert len(rows)==2 and rows[1][0]==ids[0]
    assert admin.get('/api/supplier-reviews',params={'created_from':'2026-12-01','created_to':'2026-01-01'}).status_code==422

def test_export_and_totals_respect_access(admin,db):
    from app.suppliers.models import SupplierReview
    case,_=create_case(admin)
    row=db.get(SupplierReview,case['id']); row.airport_id='other'; db.commit()
    assert admin.get('/api/supplier-reviews',params={'q':case['id']}).json()['total']==0
    assert case['id'] not in admin.get('/api/supplier-reviews/export.csv').text
    login(admin,'technician')
    assert admin.get('/api/supplier-reviews/export.csv').status_code==403

def test_csv_neutralizes_formula_supplier_name(admin):
    response=admin.post('/api/supplier-reviews',json={'supplier_name':'=FORMULA','sender_email':'a@example.test','observed_iban':supplier(admin)['expected_iban']})
    assert response.status_code==201
    export=admin.get('/api/supplier-reviews/export.csv',params={'q':'=FORMULA'})
    assert "'=FORMULA" in export.text
