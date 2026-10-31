"""Initial onboarding is a human-reviewed dossier, never extracted trust."""
import uuid
from sqlalchemy import select,text,desc
from app.suppliers.models import Supplier,SupplierContract,SupplierRegistration
from app.suppliers.catalog import same_name
from app.documents.service import get_document
from app.core.security import require_role
from app.core.exceptions import DomainError
from app.core.audit import record,now

def sources(db,user,payload,check_current=True):
    refs=[{'document_id':payload['source_contract_id'],'version':payload['source_version']},*payload['evidence_refs']]
    docs=[]
    for ref in refs:
        doc=get_document(db,ref['document_id'],user)
        if check_current and (doc.version!=ref['version'] or not doc.validated or doc.status not in ('approved','signed')):
            raise DomainError('Contractul sau dovezile s-au modificat ori nu mai sunt aprobate. Creează un dosar nou.',409)
        docs.append(doc)
    if check_current and (docs[0].category!='Contract' or not same_name(docs[0].supplier,payload['name'])):
        raise DomainError('Contractul nu corespunde furnizorului declarat.',422)
    return docs

def get_registration(db,user,identifier):
    require_role(user,'director','finance')
    item=db.get(SupplierRegistration,identifier)
    if not item or item.airport_id!=user.airport_id: raise DomainError('Dosarul nu a fost găsit.',404)
    sources(db,user,item.payload,False)
    return item

def serialize(db,user,item):
    from app.suppliers.service import actors
    names=actors(db,user)
    fields=('id','payload','status','created_by','created_at','verified_by','verified_at','verification_note',
            'verification_evidence','approved_by','approved_at','decision_note','supplier_id')
    result={key:getattr(item,key) for key in fields}
    result['actors']={key:names.get(getattr(item,key)) for key in ('created_by','verified_by','approved_by')}
    try:
        sources(db,user,item.payload)
        result['freshness']={'state':'current','reasons':[]}
    except DomainError as exc:
        result['freshness']={'state':'stale','reasons':[exc.message]}
    current=result['freshness']['state']=='current'
    result['can_verify']=current and item.status=='needs_review'
    result['can_approve']=current and item.status=='verified' and item.verified_by!=user.id
    return result

def listing(db,user):
    require_role(user,'director','finance');items=[]
    for item in db.scalars(select(SupplierRegistration).where(SupplierRegistration.airport_id==user.airport_id).order_by(desc(SupplierRegistration.created_at))):
        try: sources(db,user,item.payload,False)
        except DomainError: continue
        items.append(serialize(db,user,item))
    return {'items':items,'total':len(items)}

def create(db,user,body):
    db.execute(text('BEGIN IMMEDIATE'));require_role(user,'director','finance')
    payload=body.model_dump();docs=sources(db,user,payload)
    if db.scalar(select(Supplier).where(Supplier.airport_id==user.airport_id,Supplier.tax_id==payload['tax_id'])):
        raise DomainError('Există deja un furnizor cu acest CUI.',409)
    if db.get(SupplierContract,payload['source_contract_id']): raise DomainError('Contractul este deja asociat unui furnizor.',409)
    item=SupplierRegistration(id='registration-'+uuid.uuid4().hex[:12],airport_id=user.airport_id,payload=payload,
        status='needs_review',created_by=user.id,created_at=now(),verification_note='',decision_note='')
    db.add(item);record(db,user,'Dosar furnizor creat',docs[0],item.id);db.commit()
    return serialize(db,user,item)

def verify(db,user,identifier,body):
    db.execute(text('BEGIN IMMEDIATE'));item=get_registration(db,user,identifier)
    if item.status!='needs_review': raise DomainError('Dosarul nu așteaptă verificarea.',409)
    docs=sources(db,user,item.payload)
    item.verified_by=user.id;item.verified_at=now();item.verification_note=body.note;item.status='verified'
    item.verification_evidence={'contact_used':body.contact_used,'method':body.method,'contacted_person':body.contacted_person}
    record(db,user,'Înregistrare furnizor verificată',docs[0],f'{item.id}; confirmare umană din surse independente.')
    db.commit();return serialize(db,user,item)

def approve(db,user,identifier,comment):
    db.execute(text('BEGIN IMMEDIATE'));item=get_registration(db,user,identifier)
    if item.verified_by==user.id: raise DomainError('Verificatorul nu poate aproba propria confirmare.',403)
    if item.status=='approved' and item.approved_by==user.id: return serialize(db,user,item)
    if item.status!='verified': raise DomainError('Dosarul necesită verificare independentă.',409)
    docs=sources(db,user,item.payload);payload=item.payload
    if db.scalar(select(Supplier).where(Supplier.airport_id==user.airport_id,Supplier.tax_id==payload['tax_id'])):
        raise DomainError('CUI-ul este deja înregistrat. Reîncarcă registrul.',409)
    if db.get(SupplierContract,payload['source_contract_id']): raise DomainError('Contractul a fost asociat între timp.',409)
    at=now();identifier='supplier-'+uuid.uuid4().hex[:16]
    supplier=Supplier(id=identifier,name=payload['name'],airport_id=user.airport_id,tax_id=payload['tax_id'],
        address=payload['address'],category=payload['category'],state='active',document_id=docs[0].id,source_version=docs[0].version,
        expected_iban=payload['proposed_iban'],verified_contact=payload['proposed_contact'],trust_status='independently_approved',registry_revision=1,
        bank_history=[{'iban':payload['proposed_iban'],'version':1,'source_registration_id':item.id,'verified_by':item.verified_by,'approved_by':user.id,'created_at':at}])
    db.add(supplier);db.flush()
    db.add(SupplierContract(document_id=docs[0].id,supplier_id=identifier,linked_by=user.id,linked_at=at))
    item.status='approved';item.supplier_id=identifier;item.approved_by=user.id;item.approved_at=at;item.decision_note=comment.strip()
    record(db,user,'Furnizor nou aprobat',docs[0],f'{item.id}; verificator {item.verified_by}; aprobator {user.id}.')
    db.commit();return serialize(db,user,item)

def reject(db,user,identifier,comment):
    db.execute(text('BEGIN IMMEDIATE'));item=get_registration(db,user,identifier)
    if not comment.strip(): raise DomainError('Adaugă motivul respingerii.',422)
    if item.status not in ('needs_review','verified'): raise DomainError('Dosarul are deja o decizie.',409)
    item.status='rejected';item.approved_by=user.id;item.approved_at=now();item.decision_note=comment.strip()
    record(db,user,'Dosar furnizor respins',sources(db,user,item.payload,False)[0],f'{item.id}: {comment.strip()}')
    db.commit();return serialize(db,user,item)
