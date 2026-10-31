from uuid import uuid4
from conftest import login
from app.suppliers.service import valid_ro_iban

def alternative_iban(suffix=42):
    body='DEMO'+str(suffix).zfill(16)
    numeric=''.join(str(ord(c)-55) if c.isalpha() else c for c in body+'RO00')
    return 'RO'+str(98-int(numeric)%97).zfill(2)+body

def supplier(client):
    items=client.get('/api/supplier-reviews').json()['suppliers']
    return next(s for s in items if s['document_id']=='test-contract')

def create_case(client,iban=None,sender=None,**extra):
    known=supplier(client)
    payload={'document_id':'test-contract','observed_iban':iban or alternative_iban(43),'sender_email':sender or known['verified_contact'],'message':'Mostră sintetică '+uuid4().hex,**extra}
    response=client.post('/api/supplier-reviews',json=payload)
    assert response.status_code==201,response.text
    return response.json(),payload

def test_iban_checksum_rejects_wrong_check_digits():
    assert valid_ro_iban('RO49 AAAA 1B31 0075 9384 0000')
    assert valid_ro_iban(alternative_iban())
    assert not valid_ro_iban('RO00 AAAA 1B31 0075 9384 0000')
    assert not valid_ro_iban('RO49AAAA1B31007593840000<script>')

def test_unchanged_and_known_sender_changed_account(admin):
    known=supplier(admin)
    unchanged,_=create_case(admin,iban=known['expected_iban'])
    assert unchanged['status']=='clear' and not unchanged['reasons']
    changed,payload=create_case(admin,iban=alternative_iban(50))
    assert changed['status']=='needs_review'
    assert {r['code'] for r in changed['reasons']}=={'iban_mismatch'}
    duplicate=admin.post('/api/supplier-reviews',json=payload).json()
    assert duplicate['id']==changed['id'] and duplicate['duplicate']

def test_lookalike_sender_is_distinct_from_bank_mismatch(admin):
    case,_=create_case(admin,sender='contracte@exemp1u.example',iban=alternative_iban(51))
    assert {'lookalike_sender','iban_mismatch'}=={r['code'] for r in case['reasons']}
    assert not case['payment_execution']

def test_bank_change_requires_independent_contact_and_second_actor(admin):
    login(admin,'finance')
    known=supplier(admin)
    case,_=create_case(admin,iban=alternative_iban(52))
    url=f'/api/supplier-reviews/{case["id"]}'
    assert admin.post(url+'/approve',json={'comment':''}).status_code==409
    assert admin.post(url+'/verify',json={'contact_used':'new-contact@attacker.example','note':'Confirmed through the message sender.'}).status_code==422
    verified=admin.post(url+'/verify',json={'contact_used':known['verified_contact'],'note':'Confirmare independentă simulată prin contactul cunoscut din registru.'})
    assert verified.status_code==200,verified.text
    assert admin.post(url+'/approve',json={'comment':'Self approval'}).status_code==403
    login(admin,'admin')
    response=admin.post(url+'/approve',json={'comment':'Verificare independentă revizuită.'})
    assert response.status_code==200,response.text
    assert response.json()['approved_by']=='admin' and response.json()['verified_by']=='finance'
    changed=supplier(admin)
    assert changed['expected_iban']==alternative_iban(52)
    assert len(changed['bank_history'])==2
    assert changed['bank_history'][0]['iban']==known['expected_iban']
    assert admin.post(url+'/approve',json={'comment':''}).status_code==200

def test_unknown_supplier_and_invalid_iban_remain_unresolved(admin):
    unknown=admin.post('/api/supplier-reviews',json={'supplier_name':'Necunoscut SRL','observed_iban':alternative_iban(53),'sender_email':'person@unknown.example'}).json()
    assert unknown['status']=='needs_review' and not unknown['can_verify']
    assert admin.post(f'/api/supplier-reviews/{unknown["id"]}/verify',json={'contact_used':'person@unknown.example','note':'Unknown details cannot be trusted.'}).status_code==409
    invalid,_=create_case(admin,iban='RO00AAAA1B31007593840000')
    assert not invalid['iban_valid'] and not invalid['can_verify']

def test_technician_cannot_read_or_import_supplier_details(client):
    login(client,'technician')
    assert client.get('/api/supplier-reviews').status_code==403
    assert client.post('/api/supplier-reviews',json={'document_id':'test-tech','observed_iban':alternative_iban(),'sender_email':'a@example.test'}).status_code==403

def test_bank_verification_cannot_clear_price_discrepancy(admin):
    case,_=create_case(admin,iban=alternative_iban(54),invoice_amount=1000000)
    known=supplier(admin)
    url=f'/api/supplier-reviews/{case["id"]}'
    assert admin.post(url+'/verify',json={'contact_used':known['verified_contact'],'note':'Confirmare contact cunoscut demonstrativ.'}).status_code==200
    login(admin,'finance')
    response=admin.post(url+'/approve',json={'comment':'Reviewed'})
    assert response.status_code==409
