"""Deterministic imported-sample review. No mailbox access or payment execution.
RO IBAN format: SWIFT IBAN Registry; MOD 97-10 per BNR Regulation 2/2004 Annex 2.
A valid checksum says nothing about account ownership.
"""
import hashlib,json,re,uuid
from difflib import SequenceMatcher
from sqlalchemy import select,desc,text
from app.suppliers.models import Supplier,SupplierReview
from app.documents.models import Document
from app.documents.service import get_document
from app.core.security import require_role,can_read
from app.core.audit import record,now
from app.core.exceptions import DomainError
from app.config import settings

REASONS={
 'iban_mismatch':'Contul IBAN diferă de contul aprobat al furnizorului.',
 'invalid_iban':'Formatul sau suma de control a IBAN-ului nu este validă.',
 'lookalike_sender':'Adresa seamănă cu un contact cunoscut, dar nu este identică.',
 'unknown_sender':'Expeditorul nu este contactul verificat din registru.',
 'unknown_supplier':'Furnizorul nu are un cont și un contact verificate în registru.',
 'source_not_approved':'Contractul sursă lipsește sau nu este aprobat și validat.',
 'amount_above_contract':'Valoarea facturii depășește plafonul contractului.',
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

def supplier_dict(item):
    return {k:getattr(item,k) for k in ('id','name','document_id','expected_iban','verified_contact','trust_status','bank_history')}

def case_dict(item,user=None):
    fields=('id','document_id','source_version','supplier_id','supplier_name','expected_iban','observed_iban','sender_email','verified_contact','invoice_amount','message','reasons','status','created_by','created_at','verified_by','verified_at','verification_note','approved_by','approved_at','decision_note')
    result={k:getattr(item,k) for k in fields}
    result['risk_level']='high' if any(r['code'] in ('iban_mismatch','invalid_iban') for r in item.reasons) else 'medium' if item.reasons else 'low'
    result['iban_valid']=valid_ro_iban(item.observed_iban)
    result['can_verify']=item.status=='needs_review' and bool(item.supplier_id) and result['iban_valid']
    unresolved={r['code'] for r in item.reasons}&{'unknown_supplier','invalid_iban','source_not_approved','amount_above_contract','outside_service_period'}
    result['can_approve']=item.status=='verified' and not unresolved and (not user or item.verified_by!=user.id)
    result['payment_execution']=False
    return result

def allowed_suppliers(db,user):
    return [s for s in db.scalars(select(Supplier).where(Supplier.airport_id==user.airport_id)).all() if (d:=db.get(Document,s.document_id)) and can_read(user,d) and d.validated and d.status in ('approved','signed')]

def list_reviews(db,user):
    require_role(user,'director','finance')
    items=[item for item in db.scalars(select(SupplierReview).where(SupplierReview.airport_id==user.airport_id).order_by(desc(SupplierReview.created_at))).all() if not item.document_id or ((doc:=db.get(Document,item.document_id)) and can_read(user,doc))]
    return {'items':[case_dict(item,user) for item in items],'total':len(items),'suppliers':[supplier_dict(s) for s in allowed_suppliers(db,user)],'counters':{'needs_review':sum(i.status=='needs_review' for i in items),'verified':sum(i.status=='verified' for i in items),'approved':sum(i.status=='approved' for i in items),'clear':sum(i.status=='clear' for i in items)},'notice':'Verificare de mostre importate. Registrul inițial și toate datele sunt fictive; aplicația nu accesează emailul și nu execută sau blochează plăți externe.'}

def create_review(db,user,body):
    require_role(user,'director','finance')
    db.execute(text('BEGIN IMMEDIATE'))
    doc=get_document(db,body.document_id,user) if body.document_id else None
    if doc and doc.category!='Contract': raise DomainError('Alege contractul care fundamentează verificarea.',422)
    name=doc.supplier if doc else body.supplier_name.strip() or 'Furnizor necunoscut'
    supplier=db.get(Supplier,supplier_id(name,user.airport_id)) if name else None
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
        'registry_version':len(supplier.bank_history) if supplier else None,
        'iban':observed,'sender':sender,'amount':body.invoice_amount,
        'date':str(body.service_date),'message':body.message,'supplier':name,
    },sort_keys=True).encode()).hexdigest()
    existing=db.scalar(select(SupplierReview).where(SupplierReview.fingerprint==fingerprint))
    if existing: return {**case_dict(existing,user),'duplicate':True}
    codes=[]
    if not supplier: codes.append('unknown_supplier')
    if not valid_ro_iban(observed): codes.append('invalid_iban')
    if supplier and observed!=expected: codes.append('iban_mismatch')
    if contact and sender!=contact:
        codes.append('lookalike_sender' if SequenceMatcher(None,sender,contact).ratio()>=0.75 else 'unknown_sender')
    if not doc or not doc.validated or doc.status not in ('approved','signed'): codes.append('source_not_approved')
    if doc and body.invoice_amount is not None and doc.value is not None and body.invoice_amount>doc.value: codes.append('amount_above_contract')
    if doc and body.service_date:
        effective=(doc.extra or {}).get('metadata',{}).get('effective_date')
        service_date=body.service_date.isoformat()
        if (effective and service_date<str(effective)[:10]) or (doc.expires_at and service_date>doc.expires_at[:10]): codes.append('outside_service_period')
    item=SupplierReview(id='review-'+uuid.uuid4().hex[:12],fingerprint=fingerprint,airport_id=user.airport_id,document_id=doc.id if doc else None,source_version=doc.version if doc else None,supplier_id=supplier.id if supplier else None,supplier_name=name or 'Furnizor necunoscut',expected_iban=expected,observed_iban=observed,sender_email=sender,verified_contact=contact,invoice_amount=body.invoice_amount,message=body.message,reasons=[{'code':code,'message':REASONS[code]} for code in codes],status='needs_review' if codes else 'clear',created_by=user.id,created_at=now(),verification_note='',decision_note='')
    db.add(item);record(db,user,'Mostră furnizor verificată',doc,'; '.join(REASONS[c] for c in codes) if codes else 'Detaliile coincid cu registrul fictiv verificat.')
    db.commit();return case_dict(item,user)

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
    if doc and doc.version!=item.source_version: raise DomainError('Contractul s-a schimbat. Importă o verificare nouă.',409)
    item.status='verified';item.verified_by=user.id;item.verified_at=now();item.verification_note=body.note.strip()
    record(db,user,'Verificare independentă înregistrată',doc,f'Caz {item.id}; contact cunoscut, confirmare umană.');db.commit()
    return case_dict(item,user)

def approve(db,user,case_id,comment):
    db.execute(text('BEGIN IMMEDIATE'))
    item,doc=get_case(db,user,case_id)
    if item.verified_by==user.id: raise DomainError('Aprobarea necesită o a doua persoană. Verificatorul nu poate aproba propria confirmare.',403)
    if item.status=='approved': return case_dict(item,user)
    if item.status!='verified': raise DomainError('Înregistrează mai întâi verificarea independentă.',409)
    unresolved={r['code'] for r in item.reasons}&{'unknown_supplier','invalid_iban','source_not_approved','amount_above_contract','outside_service_period'}
    if unresolved: raise DomainError('Există neconcordanțe de contract sau factură care nu sunt rezolvate de verificarea contului.',409)
    if not doc or doc.version!=item.source_version or doc.status not in ('approved','signed'): raise DomainError('Contractul sursă nu mai este aprobat în versiunea verificată.',409)
    supplier=db.get(Supplier,item.supplier_id)
    if not supplier or supplier.expected_iban!=item.expected_iban: raise DomainError('Registrul furnizorului s-a schimbat. Creează o verificare nouă.',409)
    if supplier.expected_iban!=item.observed_iban:
        supplier.expected_iban=item.observed_iban
        supplier.bank_history=[*supplier.bank_history,{'iban':item.observed_iban,'version':len(supplier.bank_history)+1,'source_case_id':item.id,'verified_by':item.verified_by,'approved_by':user.id,'created_at':now()}]
        supplier.trust_status='independently_approved'
    item.status='approved';item.approved_by=user.id;item.approved_at=now();item.decision_note=comment.strip()
    record(db,user,'Modificare furnizor aprobată',doc,f'Caz {item.id}; verificator {item.verified_by}, aprobator {user.id}. Nu a fost executată nicio plată.');db.commit()
    return case_dict(item,user)

def reject(db,user,case_id,comment):
    db.execute(text('BEGIN IMMEDIATE'))
    item,doc=get_case(db,user,case_id)
    if not comment.strip(): raise DomainError('Adaugă motivul respingerii.',422)
    if item.status not in ('needs_review','verified'): raise DomainError('Cazul are deja o decizie.',409)
    item.status='rejected';item.approved_by=user.id;item.approved_at=now();item.decision_note=comment.strip()
    record(db,user,'Modificare furnizor respinsă',doc,comment.strip());db.commit();return case_dict(item,user)
