"""Permission-scoped supplier profiles and contract associations."""
from sqlalchemy import select,text
from app.suppliers.models import Supplier,SupplierContract
from app.documents.models import Document
from app.core.security import require_role,can_read,has_role,require_page
from app.core.exceptions import DomainError
from app.core.audit import record,now

def same_name(left,right):
    return ' '.join((left or '').casefold().split())==' '.join((right or '').casefold().split())

def contracts(db,user,supplier):
    return [d for link in db.scalars(select(SupplierContract).where(SupplierContract.supplier_id==supplier.id))
        if (d:=db.get(Document,link.document_id)) and d.airport_id==user.airport_id and can_read(user,d)]

def eligible(document,supplier):
    return document.category=='Contract' and same_name(document.supplier,supplier.name) and document.validated and document.status in ('approved','signed') and supplier.state=='active'

def get_supplier(db,user,identifier):
    require_page(user,'suppliers')
    item=db.get(Supplier,identifier)
    if not item or item.airport_id!=user.airport_id or not contracts(db,user,item): raise DomainError('Furnizorul nu a fost găsit.',404)
    return item

def contract_list(db,user,identifier):
    item=get_supplier(db,user,identifier)
    items=[{'id':d.id,'title':d.title,'version':d.version,'value':d.value,'currency':d.currency,'expires_at':d.expires_at,
        'eligible_for_review':has_role(user,'director','finance') and eligible(d,item),'unavailable_reason':None if eligible(d,item) else 'Furnizor suspendat, sursă modificată sau contract neaprobat.'} for d in contracts(db,user,item)]
    return {'items':items,'total':len(items)}

def choice_dict(db,user,item):
    from app.suppliers.service import supplier_dict
    visible=contracts(db,user,item)
    visible.sort(key=lambda d:(d.id!=item.document_id,d.id))
    usable=[d for d in visible if eligible(d,item)]
    result = {**supplier_dict(item),'document_id':(usable or visible)[0].id,'tax_id':item.tax_id,
        'address':item.address,'category':item.category,'state':item.state,
        'can_manage':has_role(user,'director'),'contracts':contract_list(db,user,item.id)['items'],
        'can_review_bank':has_role(user,'director','finance')}
    if result['can_review_bank']:
        result['bank_history'] = visible_bank_history(db,user,item)
    else:
        result.pop('expected_iban', None)
        result.pop('bank_history', None)
        for contract in result['contracts']:
            contract['eligible_for_review'] = False
    return result

def visible_bank_history(db,user,item):
    from app.suppliers.service import actors,can_access_case
    from app.suppliers.registration import get_registration
    names=actors(db,user)
    history=[]
    from app.suppliers.models import SupplierReview
    for entry in item.bank_history:
        entry={**entry,'verified_actor':names.get(entry.get('verified_by')),'approved_actor':names.get(entry.get('approved_by'))}
        if entry.get('source_case_id'):
            source=db.get(SupplierReview,entry['source_case_id'])
            if not can_access_case(db,user,source): entry.pop('source_case_id')
        if entry.get('source_registration_id'):
            try: get_registration(db,user,entry['source_registration_id'])
            except DomainError: entry.pop('source_registration_id')
        history.append(entry)
    return history

def detail(db,user,identifier):
    return choice_dict(db,user,get_supplier(db,user,identifier))

def listing(db,user):
    require_page(user,'suppliers')
    items=[choice_dict(db,user,s) for s in db.scalars(select(Supplier).where(Supplier.airport_id==user.airport_id)) if contracts(db,user,s)]
    return {'items':items,'total':len(items)}

def link_contract(db,user,identifier,body):
    db.execute(text('BEGIN IMMEDIATE'));require_role(user,'director')
    item=get_supplier(db,user,identifier)
    from app.documents.service import get_document
    doc=get_document(db,body.document_id,user)
    if doc.version!=body.version: raise DomainError('Contractul s-a modificat.',409)
    if not eligible(doc,item): raise DomainError('Contractul nu corespunde furnizorului sau nu este aprobat.',422)
    existing=db.get(SupplierContract,doc.id)
    if existing and existing.supplier_id!=item.id: raise DomainError('Contractul este asociat altui furnizor.',409)
    if not existing:
        db.add(SupplierContract(document_id=doc.id,supplier_id=item.id,linked_by=user.id,linked_at=now()))
        record(db,user,'Contract asociat furnizorului',doc,item.id)
    db.commit();return detail(db,user,item.id)

def update(db,user,identifier,body):
    db.execute(text('BEGIN IMMEDIATE'));require_role(user,'director')
    item=get_supplier(db,user,identifier)
    if item.registry_revision!=body.registry_revision: raise DomainError('Fișa furnizorului s-a modificat. Reîncarcă datele.',409)
    for field,value in body.model_dump(exclude_unset=True).items():
        if field in ('address','category','state'): setattr(item,field,value)
    item.registry_revision+=1
    record(db,user,'Fișă furnizor actualizată',db.get(Document,item.document_id),f'{item.id}: {body.comment}')
    db.commit();return detail(db,user,item.id)

def seed_links(db):
    suppliers=list(db.scalars(select(Supplier)))
    for doc in db.scalars(select(Document).where(Document.category=='Contract',Document.created_by=='seed')):
        if db.get(SupplierContract,doc.id): continue
        matches=[s for s in suppliers if s.airport_id==doc.airport_id and same_name(s.name,doc.supplier)]
        if len(matches)==1: db.add(SupplierContract(document_id=doc.id,supplier_id=matches[0].id,linked_by='seed',linked_at=doc.created_at))

def resolve_supplier(db,user,body,document):
    if body.supplier_id:
        item=get_supplier(db,user,body.supplier_id)
        link=db.get(SupplierContract,document.id) if document else None
        if not link or link.supplier_id!=item.id or not same_name(document.supplier,item.name): raise DomainError('Alege un contract asociat furnizorului.',422)
        return item
    if document:
        link=db.get(SupplierContract,document.id)
        item=db.get(Supplier,link.supplier_id) if link else None
        return item if item and item.airport_id==user.airport_id and same_name(document.supplier,item.name) else None
    matches=[s for s in db.scalars(select(Supplier).where(Supplier.airport_id==user.airport_id))
        if same_name(s.name,body.supplier_name) and contracts(db,user,s)]
    if len(matches)>1: raise DomainError('Selectează furnizorul prin identitatea sa fiscală.',422)
    return matches[0] if matches else None
