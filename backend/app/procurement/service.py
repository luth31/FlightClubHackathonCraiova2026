from pathlib import Path
from uuid import uuid4
import hashlib
import json
from sqlalchemy import select, text
from app.core.audit import now, record
from app.core.exceptions import DomainError
from app.core.security import can_read, can_read_version, can_edit, has_role
from app.documents.models import Document, DocumentVersion
from app.documents import service as documents
from app.people.models import User
from app.procurement import access, catalog, finance
from app.procurement.evidence import Evidence, ZERO
from app.procurement.models import (ProcurementCase, ProcurementCaseDocument, ProcurementDocumentLink,
    ProcurementInvoiceAllocation, ProcurementCaseEvent, ProcurementPayment)


def uid():
    return uuid4().hex


def get_case(db, user, ident):
    case = db.get(ProcurementCase, ident)
    if not case or not access.can_read_case(db, user, case):
        raise DomainError('Dosarul nu a fost găsit sau nu ai acces.', 404)
    return case


def mutation(db, user, ident, revision, *, manage=False, terminal=False):
    db.execute(text('BEGIN IMMEDIATE'))
    db.expire_all()
    case = get_case(db, user, ident)
    if case.revision != revision: raise DomainError('Dosarul s-a schimbat. Reîncarcă înainte de a reîncerca.', 409)
    if manage: access.require(access.can_manage(db, user))
    if not terminal and case.stage in ('paid', 'cancelled'):
        raise DomainError('Redeschide dosarul înainte de modificări.', 409)
    return case


def event(db, case, user, action, comment='', old_stage=None, evidence=None):
    db.add(ProcurementCaseEvent(id=uid(), case_id=case.id, action=action, comment=comment,
        actor_id=user.id, actor=user.name, created_at=now(), from_stage=old_stage or case.stage,
        to_stage=case.stage, evidence=evidence or {}))


def finish(db, user, case):
    case.revision += 1
    case.updated_at = now()
    db.commit()
    return detail(db, user, case)


def serialize_attrs(item, names):
    return {key: getattr(item, key) for key in names.split()}


def visible_ids(db, user, evidence):
    return {a.document_id for a in evidence.associations if access.visible_attached(db, user, a)}


def capabilities(db, user, case, evidence, blockers):
    manage, accept, financial = access.can_manage(db,user), access.can_accept(db,user), access.can_finance(db,user)
    authority = {'draft': manage, 'needs_review': manage, 'committed': accept,
                 'accepted': financial, 'invoiced': financial}.get(case.stage, False)
    active = case.stage not in ('paid','cancelled')
    stale = any(evidence.stale(a) for a in evidence.associations) or any(evidence.link_stale(l) for l in evidence.links)
    overpaid = catalog.money(finance.balances(db,case,evidence)['overpaid']) if financial else ZERO
    return dict(can_manage=manage and active, can_accept=accept and active, can_finance=financial and active,
        can_advance=authority and not blockers, can_return=active and case.stage != 'draft' and (manage or accept or financial),
        can_cancel=active and manage and not any(entry.kind=='payment' and not any(
            reversal.reversed_entry_id==entry.id for reversal in finance.ledger(db,case)) for entry in finance.ledger(db,case)),
        can_reopen=case.stage in ('paid','cancelled') and has_role(user,'director'),
        can_pay=financial and case.stage=='invoiced' and not stale and overpaid==ZERO,
        can_refund=financial and active and not stale)


def detail(db, user, case):
    evidence = Evidence(db,case)
    visible = visible_ids(db,user,evidence)
    privileged = access.financial_access(db,user)
    financial_ids = {a.document_id for a in evidence.typed('contract','purchase_order','addendum','invoice','credit_note','acceptance')}
    all_financial_visible = financial_ids <= visible
    data = serialize_attrs(case,'id number title description owner_id currency deadline stage revision legacy_ref')
    owner = db.get(User,case.owner_id)
    data.update(owner_name=owner.name if owner and owner.airport_id==user.airport_id else '',
        anticipated_value=case.anticipated_value if privileged else None,
        committed_value=case.committed_value if privileged and all_financial_visible else None,
        primary_document_id=case.primary_document_id if case.primary_document_id in visible else None,
        owners=access.owners(db,user) if access.can_manage(db,user) else [])
    data['documents'] = []
    for association in evidence.associations:
        if association.document_id not in visible: continue
        doc = evidence.documents[association.document_id]
        errors = evidence.errors(association)
        data['documents'].append(dict(document_id=doc.id,version=association.version,current_version=doc.version,
            template_id=association.template_id,title=doc.title,number=doc.number,status=doc.status,
            stale=evidence.stale(association),complete=not catalog.document_errors(doc,association.template_id),
            extraction_status=(doc.extra or {}).get('extraction_status'),
            errors=errors,can_edit=can_edit(user,doc) and case.stage not in ('paid','cancelled')))
    data['links'] = [{**serialize_attrs(link,'id source_id target_id source_version target_version type'),
        'stale':evidence.link_stale(link)} for link in evidence.links if link.source_id in visible and link.target_id in visible]
    data['allocations'] = [serialize_attrs(a,'id invoice_id acceptance_id invoice_version acceptance_version amount')
        for a in evidence.allocations if privileged and a.invoice_id in visible and a.acceptance_id in visible]
    data['balances'] = finance.balances(db,case,evidence) if privileged and all_financial_visible else None
    data['payments'] = [serialize_attrs(p,'id kind invoice_id invoice_version amount date reference actor created_at reversed_entry_id')
        for p in finance.ledger(db,case) if privileged and p.invoice_id in visible]
    data['history'] = []
    for item in db.scalars(select(ProcurementCaseEvent).where(ProcurementCaseEvent.case_id==case.id).order_by(ProcurementCaseEvent.created_at,ProcurementCaseEvent.id)):
        row = serialize_attrs(item,'id action actor created_at from_stage to_stage')
        row['comment'] = item.comment if len(visible)==len(evidence.associations) else ''
        row['evidence'] = {key:value for key,value in item.evidence.items() if key in visible}
        if privileged and all_financial_visible and 'committed_value' in item.evidence:
            row['evidence']['committed_value'] = item.evidence['committed_value']
        data['history'].append(row)
    blockers = evidence.stage_errors(db)
    # Guards use all evidence; hide document-specific/financial errors from narrower readers.
    if len(visible)!=len(evidence.associations):
        blockers = ['Există dovezi sau decizii de verificat de personalul autorizat.'] if blockers else []
    elif not privileged and blockers:
        blockers = ['Verifică documentele aprobate, legăturile și rezolvarea recepțiilor înainte de progresie.']
    data['blockers'] = blockers
    data['next_action'] = {'draft':'Trimite în verificare','needs_review':'Angajează achiziția','committed':'Confirmă recepția',
        'accepted':'Confirmă facturile','invoiced':'Închide ca plătit'}.get(case.stage)
    data['capabilities'] = capabilities(db,user,case,evidence,evidence.stage_errors(db))
    taken = set(db.scalars(select(ProcurementCaseDocument.document_id)))
    data['available_documents'] = [{**serialize_attrs(doc,'id title number category version status supplier currency'),
        'template_id':catalog.namespace(doc).get('template_id'),
        'value':str(doc.value) if privileged and doc.value is not None else None,
        'extraction_status':(doc.extra or {}).get('extraction_status') if (doc.extra or {}).get('auto_intake') else None}
        for doc in documents.visible_documents(db,user)
        if doc.id not in taken and any(catalog.canonical(doc.category)==catalog.canonical(t['category']) for t in catalog.TEMPLATES)]
    return data


def list_cases(db,user,q=''):
    items=[]
    for case in db.scalars(select(ProcurementCase).where(ProcurementCase.airport_id==user.airport_id).order_by(ProcurementCase.updated_at.desc())):
        if not access.can_read_case(db,user,case): continue
        if q and q.casefold() not in f'{case.title} {case.number} {case.legacy_ref or ""}'.casefold(): continue
        evidence=Evidence(db,case)
        visible=visible_ids(db,user,evidence)
        owner=db.get(User,case.owner_id)
        items.append({**serialize_attrs(case,'id number title currency stage revision legacy_ref deadline'),
            'owner_name':owner.name if owner else '', 'document_count':len(visible),
            'stale_count':sum(evidence.stale(a) for a in evidence.associations if a.document_id in visible)})
    return dict(items=items,stages=catalog.STAGES,can_create=access.can_manage(db,user),owners=access.owners(db,user) if access.can_manage(db,user) else [])


def create_case(db,user,body):
    db.execute(text('BEGIN IMMEDIATE'))
    access.require(access.can_manage(db,user))
    access.owner(db,user,body.owner_id)
    fingerprint=hashlib.sha256(json.dumps(body.model_dump(mode='json',exclude={'request_id'}),sort_keys=True,
        separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
    if body.request_id:
        existing=db.scalar(select(ProcurementCase).where(ProcurementCase.airport_id==user.airport_id,
            ProcurementCase.request_actor_id==user.id,ProcurementCase.request_id==body.request_id))
        if existing:
            if existing.request_fingerprint!=fingerprint: raise DomainError('Identificatorul de reîncercare aparține unei alte cereri.',409)
            if not access.can_read_case(db,user,existing): raise DomainError('Dosarul nu a fost găsit sau nu ai acces.',404)
            db.commit()
            return detail(db,user,existing)
    case=ProcurementCase(id='pc-'+uid(),airport_id=user.airport_id,number='ACH-'+uid()[:8].upper(),
        title=body.title,description=body.description,owner_id=body.owner_id,currency=body.currency,
        anticipated_value=body.anticipated_value,deadline=body.deadline.isoformat() if body.deadline else None,
        created_at=now(),updated_at=now(),committed_value='0.00',stage='draft',revision=1,template_version=catalog.VERSION,
        request_id=body.request_id,request_actor_id=user.id if body.request_id else None,
        request_fingerprint=fingerprint if body.request_id else None)
    db.add(case);db.flush();event(db,case,user,'created');db.commit()
    return detail(db,user,case)


def patch_case(db,user,ident,body):
    case=mutation(db,user,ident,body.revision,manage=True)
    values=body.model_dump(exclude_unset=True,exclude={'revision'})
    if values.get('owner_id'): access.owner(db,user,values['owner_id'])
    if 'primary_document_id' in values:
        if case.stage not in ('draft','needs_review'): raise DomainError('Returnează dosarul înainte de schimbarea angajamentului.',409)
        association=Evidence(db,case).association(values['primary_document_id'])
        if values['primary_document_id'] is not None and (not association or association.template_id not in ('contract','purchase_order') or not access.visible_attached(db,user,association)):
            raise DomainError('Selectează o dovadă principală accesibilă din dosar.',422)
    for key,value in values.items():
        if key in ('title','owner_id','description','anticipated_value') and value is None:
            raise DomainError('Câmpul nu poate fi gol.',422)
        if key=='title' and not value.strip(): raise DomainError('Titlul este obligatoriu.',422)
        if key=='anticipated_value': value=format(catalog.money(value),'.2f')
        if key=='deadline' and value: value=value.isoformat()
        setattr(case,key,value)
    event(db,case,user,'updated')
    return finish(db,user,case)


def associate(db,user,ident,body):
    case=mutation(db,user,ident,body.revision,manage=True)
    doc=documents.get_document(db,body.document_id,user)
    if doc.extra.get('auto_intake') and doc.extra.get('extraction_status')!='ready':
        raise DomainError('Așteaptă extragerea și verificarea tipului documentului înainte de asociere.',409)
    if body.version!=doc.version: raise DomainError('Asociază versiunea curentă a documentului.',409)
    version=documents.current_version(db,doc)
    if not can_read_version(user,doc,version): raise DomainError('Versiunea nu este accesibilă.',404)
    selected=catalog.get_template(body.template_id)
    if catalog.canonical(doc.category)!=catalog.canonical(selected['category']): raise DomainError('Categoria nu corespunde șablonului.',422)
    namespace=catalog.namespace(doc)
    if namespace.get('template_id') and namespace['template_id']!=body.template_id:
        raise DomainError('Șablonul selectat diferă de metadatele documentului.',422)
    association=db.scalar(select(ProcurementCaseDocument).where(ProcurementCaseDocument.document_id==doc.id))
    if association and association.case_id!=case.id: raise DomainError('Documentul aparține deja altui dosar.',409)
    if association:
        if association.version==body.version and association.template_id==body.template_id:
            raise DomainError('Dovada este deja asociată.',409)
        if case.stage not in ('draft','needs_review'):
            raise DomainError('Returnează dosarul în verificare înainte de actualizarea dovezii.',409)
        # A revised invoice must be pinned before its version-specific links and
        # allocations can be rebuilt for approval. It remains pending evidence.
        if body.template_id!='invoice' and (doc.status not in ('approved','signed','archived') or not version.approved_at or not version.approved_by):
            raise DomainError('Actualizarea dovezii necesită aprobarea versiunii noi.',409)
        association.version=body.version;association.template_id=body.template_id
        association.attached_by=user.id;association.attached_at=now()
        action='evidence_refreshed'
    else:
        db.add(ProcurementCaseDocument(id=uid(),case_id=case.id,document_id=doc.id,version=body.version,
            template_id=body.template_id,attached_by=user.id,attached_at=now()))
        action='evidence_attached'
    event(db,case,user,action,evidence={doc.id:body.version})
    return finish(db,user,case)


def upload_document(db,user,ident,revision,template_id,content,filename):
    """Pin a new draft PDF to its case in the same transaction as its creation."""
    from app.people.organization import canonical_department
    case=mutation(db,user,ident,revision,manage=True)
    selected=catalog.get_template(template_id)
    department='Achiziții' if canonical_department(user.department)=='Conducere' else canonical_department(user.department)
    doc=documents.create_document(db,user,content,filename,'',selected['category'],department,
        procurement_template=template_id,auto_extract=True,commit=False)
    db.add(ProcurementCaseDocument(id=uid(),case_id=case.id,document_id=doc.id,version=doc.version,
        template_id=template_id,attached_by=user.id,attached_at=now()))
    event(db,case,user,'evidence_attached',evidence={doc.id:doc.version})
    finish(db,user,case)
    return documents.serialize(doc,db,details=True,user=user)


def remove_association(db,user,ident,document_id,revision):
    case=mutation(db,user,ident,revision,manage=True)
    evidence=Evidence(db,case);association=evidence.association(document_id)
    if not association or not access.visible_attached(db,user,association): raise DomainError('Dovada nu a fost găsită.',404)
    if (case.primary_document_id==document_id or any(document_id in (link.source_id,link.target_id) for link in evidence.links) or
        any(document_id in (a.invoice_id,a.acceptance_id) for a in evidence.allocations) or
        any(p.invoice_id==document_id for p in finance.ledger(db,case))):
        raise DomainError('Dovada este folosită de angajament, legături, alocări sau plăți.',409)
    if case.stage not in ('draft','needs_review'): raise DomainError('Returnează dosarul înainte de eliminarea dovezilor.',409)
    db.delete(association);event(db,case,user,'evidence_removed',evidence={document_id:association.version})
    return finish(db,user,case)


def endpoints(db,user,case,evidence,source_id,target_id,source_version,target_version):
    source,target=evidence.association(source_id),evidence.association(target_id)
    if not source or not target or not access.visible_attached(db,user,source) or not access.visible_attached(db,user,target):
        raise DomainError('Ambele documente trebuie să fie accesibile și asociate dosarului.',404)
    if (source_id==target_id or evidence.stale(source) or evidence.stale(target) or
        source.version!=source_version or target.version!=target_version):
        raise DomainError('Confirmă două documente diferite și versiunile lor curente.',409)
    return source,target


def add_link(db,user,ident,body):
    case=mutation(db,user,ident,body.revision,manage=True);evidence=Evidence(db,case)
    source,target=endpoints(db,user,case,evidence,body.source_id,body.target_id,body.source_version,body.target_version)
    relationship=next((r for r in catalog.RELATIONSHIPS if r['id']==body.type),None)
    if not relationship or source.template_id not in relationship['source_types'] or target.template_id not in relationship['target_types']:
        raise DomainError('Relația nu este permisă între aceste șabloane.',422)
    if source.template_id=='purchase_order' and target.template_id=='purchase_order': raise DomainError('Comanda copil necesită un contract.',422)
    if source.template_id in ('addendum','credit_note') and any(link.source_id==source.document_id and link.type==body.type and link.target_id!=target.document_id for link in evidence.links):
        raise DomainError('Acest document trebuie să aibă un singur părinte.',409)
    link=next((l for l in evidence.links if l.source_id==body.source_id and l.target_id==body.target_id and l.type==body.type),None)
    if link:
        if link.source_version==body.source_version and link.target_version==body.target_version: raise DomainError('Legătura este deja confirmată.',409)
        link.source_version=body.source_version;link.target_version=body.target_version;link.actor_id=user.id;link.created_at=now()
    else:
        db.add(ProcurementDocumentLink(id=uid(),case_id=case.id,actor_id=user.id,created_at=now(),**body.model_dump(exclude={'revision'})))
    event(db,case,user,'link_confirmed',evidence={body.source_id:body.source_version,body.target_id:body.target_version})
    return finish(db,user,case)


def remove_link(db,user,ident,link_id,revision):
    case=mutation(db,user,ident,revision,manage=True);evidence=Evidence(db,case)
    link=next((l for l in evidence.links if l.id==link_id),None)
    if not link or link.source_id not in visible_ids(db,user,evidence) or link.target_id not in visible_ids(db,user,evidence):
        raise DomainError('Legătura nu a fost găsită.',404)
    if case.stage not in ('draft','needs_review'): raise DomainError('Returnează dosarul înainte de eliminarea legăturilor.',409)
    db.delete(link);event(db,case,user,'link_removed')
    return finish(db,user,case)


def allocate(db,user,ident,body):
    case=mutation(db,user,ident,body.revision,manage=True);evidence=Evidence(db,case)
    invoice,acceptance=endpoints(db,user,case,evidence,body.invoice_id,body.acceptance_id,body.invoice_version,body.acceptance_version)
    if invoice.template_id!='invoice' or acceptance.template_id!='acceptance': raise DomainError('Alocarea leagă o factură și o recepție.',422)
    if not evidence.acceptance_valid(acceptance): raise DomainError('Recepția trebuie aprobată, legată și rezolvată.',409)
    if not evidence.related(invoice.document_id,'invoices_against',('acceptance',)) or acceptance not in evidence.related(invoice.document_id,'invoices_against',('acceptance',)):
        raise DomainError('Confirmă legătura factură–recepție înainte de alocare.',409)
    if not evidence.matches_award(invoice.document_id): raise DomainError('Factura are furnizor sau monedă diferite.',409)
    amount=catalog.money(body.amount)
    if amount<=ZERO: raise DomainError('Alocarea trebuie să fie pozitivă.',422)
    old=next((a for a in evidence.allocations if a.invoice_id==body.invoice_id and a.acceptance_id==body.acceptance_id),None)
    if old and amount<catalog.money(old.amount) and case.stage not in ('draft','needs_review'):
        raise DomainError('Returnează dosarul în verificare înainte de reconcilierea alocărilor.',409)
    others=[a for a in evidence.allocations if a is not old]
    invoice_used=sum((catalog.money(a.amount) for a in others if a.invoice_id==body.invoice_id),ZERO)
    capacity_used=sum((catalog.money(a.amount) for a in others if a.acceptance_id==body.acceptance_id),ZERO)
    if invoice_used+amount>catalog.money(evidence.records[body.invoice_id].value or '0.00'):
        raise DomainError('Alocările depășesc valoarea brută a facturii.',409)
    if capacity_used+amount>catalog.money(evidence.fields(body.acceptance_id).get('accepted_amount','0.00')):
        raise DomainError('Recepția nu mai are capacitate monetară disponibilă.',409)
    values={**body.model_dump(exclude={'revision'}),'amount':format(amount,'.2f')}
    if old:
        for key,value in values.items(): setattr(old,key,value)
    else: db.add(ProcurementInvoiceAllocation(id=uid(),case_id=case.id,**values))
    event(db,case,user,'allocation_confirmed',evidence={body.invoice_id:body.invoice_version,body.acceptance_id:body.acceptance_version})
    return finish(db,user,case)


def remove_allocation(db,user,ident,allocation_id,revision):
    case=mutation(db,user,ident,revision,manage=True);evidence=Evidence(db,case)
    allocation=next((a for a in evidence.allocations if a.id==allocation_id),None)
    if not allocation or allocation.invoice_id not in visible_ids(db,user,evidence) or allocation.acceptance_id not in visible_ids(db,user,evidence):
        raise DomainError('Alocarea nu a fost găsită.',404)
    if case.stage not in ('draft','needs_review'): raise DomainError('Returnează dosarul înainte de reconcilierea alocărilor.',409)
    db.delete(allocation);event(db,case,user,'allocation_removed')
    return finish(db,user,case)


def act(db,user,ident,body):
    case=mutation(db,user,ident,body.revision,terminal=True);evidence=Evidence(db,case)
    old=case.stage;action=body.action;comment=body.comment.strip()
    if action=='advance':
        authority={'draft':access.can_manage(db,user),'needs_review':access.can_manage(db,user),
            'committed':access.can_accept(db,user),'accepted':access.can_finance(db,user),'invoiced':access.can_finance(db,user)}.get(case.stage,False)
        access.require(authority)
        blockers=evidence.stage_errors(db)
        if blockers: raise DomainError(' '.join(blockers) if len(visible_ids(db,user,evidence))==len(evidence.associations) else 'Dosarul are dovezi sau decizii de verificat de personalul autorizat.',409)
        stages=[s['id'] for s in catalog.STAGES]
        case.stage=stages[stages.index(case.stage)+1]
        if old=='needs_review': case.committed_value=format(evidence.commitment()[0],'.2f')
    elif action=='return':
        access.require(access.can_manage(db,user) or access.can_accept(db,user) or access.can_finance(db,user))
        stages=[s['id'] for s in catalog.STAGES]
        target=body.target_stage or ('needs_review' if case.stage not in ('draft','needs_review') else 'draft')
        if case.stage not in stages or target not in stages or stages.index(target)>=stages.index(case.stage):
            raise DomainError('Alege o etapă anterioară validă.',422)
        if not comment: raise DomainError('Explică motivul returnării.',422)
        case.stage=target
    elif action=='cancel':
        access.require(access.can_manage(db,user))
        if case.stage in ('paid','cancelled'): raise DomainError('Dosarul este deja închis.',409)
        if not comment: raise DomainError('Explică motivul anulării.',422)
        entries=finance.ledger(db,case)
        if any(p.kind=='payment' and not any(r.reversed_entry_id==p.id for r in entries) for p in entries):
            raise DomainError('Plățile nereversate împiedică anularea; rambursările nu corectează plăți valide.',409)
        case.stage='cancelled'
    elif action=='reopen':
        access.require(has_role(user,'director'))
        if case.stage not in ('paid','cancelled'): raise DomainError('Doar un dosar închis poate fi redeschis.',409)
        if not comment: raise DomainError('Explică motivul redeschiderii.',422)
        if body.target_stage and body.target_stage not in ('draft','needs_review'): raise DomainError('Redeschide în ciornă sau verificare.',422)
        case.stage=body.target_stage or 'needs_review'
    evidence_ids={a.document_id:a.version for a in evidence.associations}
    evidence_ids['committed_value']=case.committed_value
    event(db,case,user,action,comment,old_stage=old,evidence=evidence_ids)
    return finish(db,user,case)


def pay(db,user,ident,body):
    case=mutation(db,user,ident,body.revision);access.require(access.can_finance(db,user));evidence=Evidence(db,case)
    if body.kind=='payment' and case.stage!='invoiced': raise DomainError('Plățile necesită etapa Facturat.',409)
    association=evidence.association(body.invoice_id)
    if not association or association.template_id!='invoice' or not access.visible_attached(db,user,association): raise DomainError('Factura nu a fost găsită.',404)
    if body.invoice_version!=association.version: raise DomainError('Confirmă versiunea curentă a facturii.',409)
    if any(evidence.stale(a) for a in evidence.associations) or any(evidence.link_stale(l) for l in evidence.links):
        raise DomainError('Actualizează dovezile și legăturile înainte de plăți.',409)
    errors=evidence.invoice_errors(body.invoice_id)+evidence.unresolved_branches()
    errors += evidence.credit_errors()
    if errors: raise DomainError(' '.join(errors),409)
    balances=finance.balances(db,case,evidence)
    row=next(r for r in balances['invoices'] if r['document_id']==body.invoice_id)
    amount=catalog.money(body.amount)
    if amount<=ZERO or not body.reference.strip(): raise DomainError('Completează o valoare pozitivă și referința.',422)
    if any(p.invoice_id==body.invoice_id and p.kind==body.kind and p.reference==body.reference.strip()
           for p in finance.ledger(db,case)):
        raise DomainError('Referința bancară este deja înregistrată pentru această factură și operațiune.',409)
    if body.kind=='payment':
        if catalog.money(balances['overpaid'])>ZERO: raise DomainError('Reconciliază supraplățile dosarului înainte de noi plăți.',409)
        if catalog.money(row['overpaid'])>ZERO or amount>catalog.money(row['outstanding']): raise DomainError('Plata depășește soldul datorat sau există o supraplată.',409)
        # A changed commitment must be accepted through a case decision first.
        if evidence.commitment()[1] or evidence.commitment()[0]!=catalog.money(case.committed_value):
            raise DomainError('Reconciliază și aprobă angajamentul înainte de noi plăți.',409)
    elif amount>catalog.money(row['overpaid']) or catalog.money(row['credit'])<=ZERO:
        raise DomainError('Rambursarea necesită credit aprobat și nu poate depăși supraplata facturii.',409)
    db.add(ProcurementPayment(id=uid(),case_id=case.id,invoice_id=body.invoice_id,invoice_version=body.invoice_version,
        kind=body.kind,amount=format(amount,'.2f'),date=body.date.isoformat(),reference=body.reference.strip(),
        actor_id=user.id,actor=user.name,created_at=now()))
    event(db,case,user,body.kind,evidence={body.invoice_id:body.invoice_version})
    return finish(db,user,case)


def reverse(db,user,ident,payment_id,body):
    case=mutation(db,user,ident,body.revision);access.require(access.can_finance(db,user))
    entries=finance.ledger(db,case);entry=next((p for p in entries if p.id==payment_id),None)
    evidence=Evidence(db,case)
    if not entry or entry.invoice_id not in visible_ids(db,user,evidence): raise DomainError('Înregistrarea nu a fost găsită.',404)
    if entry.kind=='reversal' or any(p.reversed_entry_id==entry.id for p in entries): raise DomainError('Înregistrarea nu poate fi reversată din nou.',409)
    if not body.comment.strip() or not body.reference.strip(): raise DomainError('Explică corecția și referința.',422)
    if any(p.invoice_id==entry.invoice_id and p.kind=='reversal' and p.reference==body.reference.strip() for p in entries):
        raise DomainError('Referința corecției este deja înregistrată.',409)
    db.add(ProcurementPayment(id=uid(),case_id=case.id,invoice_id=entry.invoice_id,invoice_version=entry.invoice_version,
        kind='reversal',amount=entry.amount,date=body.date.isoformat(),reference=body.reference.strip(),
        actor_id=user.id,actor=user.name,created_at=now(),reversed_entry_id=entry.id))
    event(db,case,user,'reversal',body.comment.strip(),evidence={entry.invoice_id:entry.invoice_version})
    return finish(db,user,case)


def document_detail(db,user,document_id):
    doc=documents.get_document(db,document_id,user)
    association=db.scalar(select(ProcurementCaseDocument).where(ProcurementCaseDocument.document_id==doc.id))
    case=db.get(ProcurementCase,association.case_id) if association else None
    visible_case=case if case and access.can_read_case(db,user,case) else None
    return dict(document_id=doc.id,version=doc.version,template_id=catalog.namespace(doc).get('template_id') or (association.template_id if association else None),
        fields=catalog.document_fields(doc,association.template_id if association else None),errors=catalog.document_errors(doc,association.template_id if association else None),
        case_id=visible_case.id if visible_case else None,case_revision=visible_case.revision if visible_case else None,
        can_edit=can_edit(user,doc) and doc.status not in ('signed','archived') and (not case or case.stage not in ('paid','cancelled')))


def patch_metadata(db,user,document_id,body):
    db.execute(text('BEGIN IMMEDIATE'));db.expire_all()
    doc=documents.get_document(db,document_id,user,edit=True)
    if doc.version!=body.version: raise DomainError('Documentul s-a schimbat; reîncarcă versiunea curentă.',409)
    if doc.status in ('signed','archived'): raise DomainError('Creează o versiune nouă pentru documentul semnat sau arhivat.',409)
    association=db.scalar(select(ProcurementCaseDocument).where(ProcurementCaseDocument.document_id==doc.id))
    if association:
        case=db.get(ProcurementCase,association.case_id)
        if case.stage in ('paid','cancelled'): raise DomainError('Redeschide dosarul înainte de schimbarea dovezilor.',409)
        if association.template_id!=body.template_id: raise DomainError('Șablonul este fix pentru dovada asociată.',409)
    previous=documents.current_version(db,doc)
    if documents.file_hash(previous.file_path)!=previous.sha256: raise DomainError('Integritatea PDF-ului nu poate fi confirmată.',409)
    previous.snapshot=documents.serialize(doc)
    catalog.apply_fields(doc,body.template_id,body.fields)
    doc.version+=1;doc.status='draft';doc.validated=False;doc.updated_at=now()
    doc.extra={**doc.extra,'edited_fields':list(set(doc.extra.get('edited_fields',[]))|set(body.fields))}
    documents.store_version(db,doc,Path(previous.file_path).read_bytes(),previous.filename,user,
        'Metadate de achiziții modificate; necesită avizare nouă.',snapshot=documents.serialize(doc))
    from app.tasks.service import on_new_version
    on_new_version(db,doc,user)
    record(db,user,'Metadate achiziții actualizate',doc,f'Versiunea {doc.version}')
    db.commit();return document_detail(db,user,doc.id)


def check_document_action(db,user,document,action):
    association=db.scalar(select(ProcurementCaseDocument).where(ProcurementCaseDocument.document_id==document.id))
    template_id=association.template_id if association else catalog.namespace(document).get('template_id')
    if not template_id: return
    if action in ('validate','submit','approve'):
        errors=catalog.document_errors(document,template_id)
        if errors: raise DomainError(' '.join(errors),422 if action=='validate' else 409)
        if catalog.namespace(document).get('template_id')!=template_id:
            raise DomainError('Confirmă metadatele șablonului de achiziții înainte de validare.',409)
    if association:
        case=db.get(ProcurementCase,association.case_id)
        if case.airport_id!=user.airport_id: raise DomainError('Dosarul nu a fost găsit.',404)
        if case.stage in ('paid','cancelled') and action not in ('sign','archive'):
            raise DomainError('Redeschide dosarul înainte de schimbarea dovezilor.',409)
        if template_id=='invoice' and action=='approve':
            evidence=Evidence(db,case)
            if association.version!=document.version: raise DomainError('Confirmă versiunea facturii în dosar.',409)
            if case.stage not in ('committed','accepted','invoiced'):
                raise DomainError('Factura necesită angajament și recepții în dosarul gestionat.',409)
            errors=evidence.invoice_errors(document.id,approval=False)+evidence.unresolved_branches()
            if any(evidence.stale(a) for a in evidence.associations): errors.append('Actualizează dovezile înlocuite.')
            if errors: raise DomainError(' '.join(errors),409)


def ensure_document_namespace(db,user,document,changes=None):
    """Generic document edits may not erase or bypass enrolled template metadata."""
    association=db.scalar(select(ProcurementCaseDocument).where(ProcurementCaseDocument.document_id==document.id))
    if association:
        case=db.get(ProcurementCase,association.case_id)
        if case.stage in ('paid','cancelled'): raise DomainError('Redeschide dosarul înainte de schimbarea dovezilor.',409)
        if changes and 'metadata' in changes:
            supplied=changes['metadata'].get('procurement',{})
            if supplied!=catalog.namespace(document): raise DomainError('Modifică metadatele fixe prin panoul de achiziții.',409)


def import_legacy_cases(db):
    # No document, version, approval, relationship or payment is fabricated by import.
    for doc in db.scalars(select(Document).order_by(Document.id)):
        metadata=(doc.extra or {}).get('metadata',{})
        raw=metadata.get('case_id') or metadata.get('procurement_ref')
        if not isinstance(raw,str) or not raw.strip() or len(raw)>200: continue
        legacy=raw.strip()
        if db.scalar(select(ProcurementCase.id).where(ProcurementCase.airport_id==doc.airport_id,ProcurementCase.legacy_ref==legacy)): continue
        people=list(db.scalars(select(User).where(User.airport_id==doc.airport_id,User.active==True).order_by(User.id)))
        candidates=[p for p in people if access.can_manage(db,p)]
        if not candidates: continue
        owner=next((p for p in candidates if p.id==doc.owner_id),None) or next((p for p in candidates if not has_role(p,'director')),candidates[0])
        case=ProcurementCase(id='pc-'+uid(),airport_id=doc.airport_id,number='ACH-'+uid()[:8].upper(),
            title=f'Dosar importat {legacy}',description='Documente existente propuse pentru asociere explicită.',owner_id=owner.id,
            currency=doc.currency if doc.currency and len(doc.currency)==3 else 'RON',anticipated_value='0.00',committed_value='0.00',
            stage='draft',revision=1,template_version=catalog.VERSION,created_at=now(),updated_at=now(),legacy_ref=legacy)
        db.add(case);db.flush();event(db,case,owner,'legacy_imported')
    db.commit()
