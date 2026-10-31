"""Deterministic imported-sample review. No mailbox access or payment execution.
RO IBAN format: SWIFT IBAN Registry; MOD 97-10 per BNR Regulation 2/2004 Annex 2.
A valid checksum says nothing about account ownership.
"""
import hashlib,json,re,uuid,csv,io
from decimal import Decimal
from difflib import SequenceMatcher
from sqlalchemy import select,desc,text
from app.suppliers.models import Supplier,SupplierReview
from app.documents.models import Document
from app.documents.service import get_document
from app.core.security import require_role,can_read
from app.core.audit import record,now
from app.core.exceptions import DomainError
from app.config import settings
from app.suppliers.checks import evaluate_checks,review_freshness,BLOCKING
from app.people.models import User

REASONS={
 'iban_mismatch':'Contul IBAN diferă de contul aprobat al furnizorului.',
 'invalid_iban':'Formatul sau suma de control a IBAN-ului nu este validă.',
 'lookalike_sender':'Adresa seamănă cu un contact cunoscut, dar nu este identică.',
 'unknown_sender':'Expeditorul nu este contactul verificat din registru.',
 'unknown_supplier':'Furnizorul nu are un cont și un contact verificate în registru.',
 'source_not_approved':'Contractul sursă lipsește sau nu este aprobat și validat.',
 'amount_above_contract':'Valoarea facturii depășește plafonul contractului.',
 'currency_mismatch':'Moneda facturii diferă de moneda contractului; nu se efectuează conversie automată.',
 'supplier_suspended':'Furnizorul este suspendat.',
 'outside_service_period':'Data prestației nu se află în perioada contractuală.',
}

def normalize_iban(value):
    return re.sub(r'\s+','',value).upper()

def valid_ro_iban(value):
    value=normalize_iban(value)
    if not re.fullmatch(r'RO\d{2}[A-Z]{4}[A-Z0-9]{16}',value): return False
    numeric=''.join(str(ord(c)-55) if c.isalpha() else c for c in value[4:]+value[:4])
    return int(numeric)%97==1

def supplier_id(name,airport):
    return 'supplier-'+hashlib.sha256(f'{airport}|{name.casefold()}'.encode()).hexdigest()[:16]

def seed_suppliers(db):
    # These are explicitly fictional, previously verified registry fixtures, not
    # automatic promotion of newly extracted banking details to trusted records.
    for doc in db.scalars(select(Document).where(Document.category=='Contract',Document.created_by=='seed')):
        metadata=(doc.extra or {}).get('metadata',{})
        iban=normalize_iban(str(metadata.get('supplier_iban','')))
        contact=str(metadata.get('supplier_contact','')).strip().lower()
        if not doc.supplier or not metadata.get('demo_iban_valid_checksum') or not valid_ro_iban(iban) or not contact: continue
        identifier=supplier_id(doc.supplier,doc.airport_id)
        if db.get(Supplier,identifier): continue
        db.add(Supplier(id=identifier,name=doc.supplier,airport_id=doc.airport_id,document_id=doc.id,source_version=doc.version,expected_iban=iban,verified_contact=contact,trust_status='demo_verified',bank_history=[{'iban':iban,'version':1,'source':'Registru fictiv verificat pentru scenariul demonstrativ','approved_by':'demo-fixture','created_at':doc.created_at}]))

    from app.suppliers.catalog import seed_links
    db.flush();seed_links(db)

def supplier_dict(item):
    return {k:getattr(item,k) for k in ('id','name','document_id','expected_iban','verified_contact','trust_status','bank_history','registry_revision')}

def snapshot_contract(document):
    if not document: return None
    return {'value':str(Decimal(str(document.value)).quantize(Decimal('0.01'))) if document.value is not None else None,
        'currency':document.currency,'effective_date':(document.extra or {}).get('metadata',{}).get('effective_date'),
        'expires_at':document.expires_at,'validated':document.validated,'status':document.status}

def case_dict(item,user=None,*,freshness=None):
    fields=('id','document_id','source_version','supplier_id','supplier_name','expected_iban','observed_iban','sender_email','verified_contact','invoice_amount','message','reasons','status','created_by','created_at','verified_by','verified_at','verification_note','approved_by','approved_at','decision_note')
    result={k:getattr(item,k) for k in fields}
    result.update({k:getattr(item,k) for k in ('service_date','invoice_currency','registry_revision','contract_snapshot','checks')})
    result['freshness']=freshness or {'state':'unrecorded','reasons':['Reîncarcă verificarea pentru evaluarea referințelor.']}
    result['risk_level']='high' if any(r['code'] in ('iban_mismatch','invalid_iban') for r in item.reasons) else 'medium' if item.reasons else 'low'
    result['iban_valid']=valid_ro_iban(item.observed_iban)
    result['can_verify']=item.status=='needs_review' and bool(item.supplier_id) and result['iban_valid']
    unresolved={r['code'] for r in item.reasons}&BLOCKING
    result['can_approve']=item.status=='verified' and not unresolved and (not user or item.verified_by!=user.id)
    if result['freshness']['state']!='current': result['can_verify']=result['can_approve']=False
    result['payment_execution']=False
    return result

def actors(db,user):
    return {u.id:{'id':u.id,'name':u.name} for u in db.scalars(select(User).where(User.airport_id==user.airport_id))}

def serialize_case(db,user,item,actor_names=None):
    result=case_dict(item,user,freshness=review_freshness(db,user,item))
    names=actor_names if actor_names is not None else actors(db,user)
    result['actors']={field:names.get(getattr(item,field),{'id':getattr(item,field),'name':getattr(item,field)}) if getattr(item,field) else None for field in ('created_by','verified_by','approved_by')}
    result['previous_review_id']=item.previous_review_id
    return result

def detail(db,user,case_id):
    item,_=get_case(db,user,case_id)
    result=serialize_case(db,user,item)
    children=db.scalars(select(SupplierReview).where(SupplierReview.previous_review_id==item.id,SupplierReview.airport_id==user.airport_id)).all()
    result['rechecks']=[{'id':c.id,'status':c.status,'created_at':c.created_at} for c in children if not c.document_id or ((d:=db.get(Document,c.document_id)) and can_read(user,d))]
    return result

def registry_detail(db,user,supplier_id):
    from app.suppliers.catalog import detail
    return detail(db,user,supplier_id)

def require_current(db,user,item):
    freshness=review_freshness(db,user,item)
    if freshness['state']!='current': raise DomainError(' '.join(freshness['reasons']),409)

def allowed_suppliers(db,user):
    from app.suppliers.catalog import contracts,eligible
    return [s for s in db.scalars(select(Supplier).where(Supplier.airport_id==user.airport_id)) if any(eligible(d,s) for d in contracts(db,user,s))]

def list_reviews(db,user,filters=None):
    require_role(user,'director','finance')
    from app.suppliers.query import ReviewFilters,matching_reviews
    from app.suppliers.catalog import choice_dict
    filters=filters or ReviewFilters()
    all_items=matching_reviews(db,user,ReviewFilters())
    items=matching_reviews(db,user,filters)
    names=actors(db,user)
    return {'items':[serialize_case(db,user,item,names) for item in items[filters.offset:filters.offset+filters.limit]],
        'total':len(items),'limit':filters.limit,'offset':filters.offset,
        'suppliers':[choice_dict(db,user,s) for s in allowed_suppliers(db,user)],
        'counters':{state:sum(i.status==state for i in all_items) for state in ('needs_review','verified','approved','clear')},
        'notice':'Date fictive. Nu se execută sau blochează plăți externe.'}

def export_reviews(db,user,filters):
    from app.suppliers.query import matching_reviews
    from app.contracts.service import safe_cell
    buffer=io.StringIO();writer=csv.writer(buffer)
    writer.writerow(['ID','Furnizor','Stare','Risc orientativ','Creat','Sumă','Monedă','Prestație','Contract','Versiune','Verificator','Aprobator'])
    names=actors(db,user)
    for item in matching_reviews(db,user,filters):
        row=serialize_case(db,user,item,names)
        writer.writerow([safe_cell(v) for v in (item.id,item.supplier_name,item.status,row['risk_level'],item.created_at,
            item.invoice_amount,item.invoice_currency,item.service_date,item.document_id,item.source_version,
            (row['actors']['verified_by'] or {}).get('name'),(row['actors']['approved_by'] or {}).get('name'))])
    return '\ufeff'+buffer.getvalue()

def create_review(db,user,body):
    require_role(user,'director','finance')
    db.execute(text('BEGIN IMMEDIATE'))
    doc=get_document(db,body.document_id,user) if body.document_id else None
    if doc and doc.category!='Contract': raise DomainError('Alege contractul care fundamentează verificarea.',422)
    name=doc.supplier if doc else body.supplier_name.strip() or 'Furnizor necunoscut'
    from app.suppliers.catalog import resolve_supplier
    supplier=resolve_supplier(db,user,body,doc)
    if body.previous_review_id:
        previous,_=get_case(db,user,body.previous_review_id)
        if previous.supplier_id and (not supplier or previous.supplier_id!=supplier.id): raise DomainError('Reevaluarea trebuie să păstreze furnizorul cunoscut.',422)
    expected=supplier.expected_iban if supplier else ''
    contact=supplier.verified_contact if supplier else ''
    observed=normalize_iban(body.observed_iban)
    sender=body.sender_email.strip().lower()
    # Deduplication is relative to the evidence reviewed, not just the imported
    # message. Reusing an old clear result after a contract or registry change
    # would skip the checks against the new source of truth.
    fingerprint=hashlib.sha256(json.dumps({
        'airport':user.airport_id,'document':body.document_id,
        'source_version':doc.version if doc else None,
        'source_status':doc.status if doc else None,
        'source_validated':doc.validated if doc else None,
        'registry_iban':expected,'registry_contact':contact,
        'registry_version':supplier.registry_revision if supplier else None,
        'currency':body.invoice_currency,'supplier_id':supplier.id if supplier else None,
        'previous_review_id':body.previous_review_id,
        'iban':observed,'sender':sender,'amount':body.invoice_amount,
        'date':str(body.service_date),'message':body.message,'supplier':name,
    },sort_keys=True).encode()).hexdigest()
    existing=db.scalar(select(SupplierReview).where(SupplierReview.fingerprint==fingerprint))
    if existing: return {**serialize_case(db,user,existing),'duplicate':True}
    checks=evaluate_checks(body,doc,supplier)
    codes=list(dict.fromkeys(code for check in checks for code in check['reason_codes']))
    item=SupplierReview(id='review-'+uuid.uuid4().hex[:12],fingerprint=fingerprint,airport_id=user.airport_id,document_id=doc.id if doc else None,source_version=doc.version if doc else None,supplier_id=supplier.id if supplier else None,supplier_name=name or 'Furnizor necunoscut',expected_iban=expected,observed_iban=observed,sender_email=sender,verified_contact=contact,invoice_amount=body.invoice_amount,message=body.message,reasons=[{'code':code,'message':REASONS[code]} for code in codes],status='needs_review' if codes else 'clear',created_by=user.id,created_at=now(),verification_note='',decision_note='')
    item.checks=checks
    item.previous_review_id=body.previous_review_id
    item.service_date=body.service_date.isoformat() if body.service_date else None
    item.invoice_currency=body.invoice_currency
    item.registry_revision=supplier.registry_revision if supplier else None
    item.contract_snapshot=snapshot_contract(doc)
    db.add(item);record(db,user,'Mostră furnizor verificată',doc,'; '.join(REASONS[c] for c in codes) if codes else 'Detaliile coincid cu registrul fictiv verificat.')
    db.commit();return serialize_case(db,user,item)

def get_case(db,user,case_id):
    require_role(user,'director','finance')
    item=db.get(SupplierReview,case_id)
    if not item or item.airport_id!=user.airport_id: raise DomainError('Verificarea nu a fost găsită.',404)
    doc=get_document(db,item.document_id,user) if item.document_id else None
    return item,doc

def verify(db,user,case_id,body):
    db.execute(text('BEGIN IMMEDIATE'))
    item,doc=get_case(db,user,case_id)
    if item.status!='needs_review': raise DomainError('Cazul nu așteaptă verificarea independentă.',409)
    if not item.supplier_id or not item.verified_contact: raise DomainError('Furnizorul necesită înregistrare și verificare inițială independentă.',409)
    if not valid_ro_iban(item.observed_iban): raise DomainError('Un IBAN cu format sau sumă de control invalidă nu poate fi confirmat.',422)
    if body.contact_used.strip().lower()!=item.verified_contact:
        raise DomainError('Verificarea trebuie realizată prin contactul cunoscut din registru, independent de mesaj.',422)
    require_current(db,user,item)
    item.status='verified';item.verified_by=user.id;item.verified_at=now();item.verification_note=body.note.strip()
    record(db,user,'Verificare independentă înregistrată',doc,f'Caz {item.id}; contact cunoscut, confirmare umană.');db.commit()
    return serialize_case(db,user,item)

def approve(db,user,case_id,comment):
    db.execute(text('BEGIN IMMEDIATE'))
    item,doc=get_case(db,user,case_id)
    if item.verified_by==user.id: raise DomainError('Aprobarea necesită o a doua persoană. Verificatorul nu poate aproba propria confirmare.',403)
    if item.status=='approved': return serialize_case(db,user,item)
    if item.status!='verified': raise DomainError('Înregistrează mai întâi verificarea independentă.',409)
    unresolved={r['code'] for r in item.reasons}&BLOCKING
    require_current(db,user,item)
    if unresolved: raise DomainError('Există neconcordanțe de contract sau factură care nu sunt rezolvate de verificarea contului.',409)
    if not doc or doc.version!=item.source_version or doc.status not in ('approved','signed'): raise DomainError('Contractul sursă nu mai este aprobat în versiunea verificată.',409)
    supplier=db.get(Supplier,item.supplier_id)
    if not supplier or supplier.expected_iban!=item.expected_iban: raise DomainError('Registrul furnizorului s-a schimbat. Creează o verificare nouă.',409)
    if supplier.expected_iban!=item.observed_iban:
        supplier.expected_iban=item.observed_iban
        supplier.registry_revision+=1
        supplier.bank_history=[*supplier.bank_history,{'iban':item.observed_iban,'version':len(supplier.bank_history)+1,'source_case_id':item.id,'verified_by':item.verified_by,'approved_by':user.id,'created_at':now()}]
        supplier.trust_status='independently_approved'
    item.status='approved';item.approved_by=user.id;item.approved_at=now();item.decision_note=comment.strip()
    record(db,user,'Modificare furnizor aprobată',doc,f'Caz {item.id}; verificator {item.verified_by}, aprobator {user.id}. Nu a fost executată nicio plată.');db.commit()
    return serialize_case(db,user,item)

def reject(db,user,case_id,comment):
    db.execute(text('BEGIN IMMEDIATE'))
    item,doc=get_case(db,user,case_id)
    if not comment.strip(): raise DomainError('Adaugă motivul respingerii.',422)
    if item.status not in ('needs_review','verified'): raise DomainError('Cazul are deja o decizie.',409)
    item.status='rejected';item.approved_by=user.id;item.approved_at=now();item.decision_note=comment.strip()
    record(db,user,'Modificare furnizor respinsă',doc,comment.strip());db.commit();return serialize_case(db,user,item)
