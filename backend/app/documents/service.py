import hashlib
import io
import re
import uuid
import unicodedata
from datetime import date
from pathlib import Path
from sqlalchemy import select, desc, text
from pypdf import PdfReader
from pypdf.generic import IndirectObject, DictionaryObject, ArrayObject
from app.documents.models import Document, DocumentVersion
from app.core.models import AuditEvent
from app.core.security import can_read, can_edit, require_role, has_role
from app.core.exceptions import DomainError
from app.core.audit import record, now, serialize as serialize_event
from app.config import settings

CATEGORIES=['Contract','Referat de necesitate','Caiet de sarcini','Comandă','Factură','Proces-verbal','Raport de mentenanță','Act adițional','Procedură','Audit','Resurse umane','Instruire']
DEPARTMENTS=['Achiziții','Tehnic','Financiar','Operațiuni','Resurse umane','Conformitate']
LOCKED_STATUSES=('signed','archived')

def file_hash(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def current_version(db, document):
    result=db.scalar(select(DocumentVersion).where(DocumentVersion.document_id==document.id,DocumentVersion.version==document.version))
    if not result: raise DomainError('Versiunea documentului nu a fost găsită.',404)
    return result

def get_document(db, document_id, user, edit=False):
    document=db.get(Document,document_id)
    if not document or not can_read(user,document):
        raise DomainError('Documentul nu a fost găsit sau nu ai acces.',404)
    if edit and not can_edit(user,document):
        raise DomainError('Nu poți modifica acest document.',403)
    return document

def require_unlocked_document(document):
    # Revisions must not replace signed or archived evidence.
    if document.status in LOCKED_STATUSES:
        raise DomainError('Documentele semnate sau arhivate sunt păstrate ca atare. Înregistrează modificările ca documente separate.',409)

def visible_documents(db,user):
    return [d for d in db.scalars(select(Document).where(Document.airport_id==user.airport_id).order_by(desc(Document.updated_at))).all() if can_read(user,d)]

def serialize(document, db=None, details=False, user=None):
    fields=('id','title','number','category','department','status','created_at','updated_at','expires_at','supplier','value','currency','owner','created_by','confidentiality','summary','version','validated')
    data={k:getattr(document,k) for k in fields}
    data.update(document.extra or {})
    data.pop('text_excerpt',None)
    data['file_url']=f'/api/documents/{document.id}/file'
    data['days_remaining']=(date.fromisoformat(document.expires_at[:10])-settings.reference_date).days if document.expires_at else None
    data['contract_status']='expired' if data['days_remaining'] is not None and data['days_remaining']<0 else 'active'
    effective_date=(document.extra or {}).get('metadata',{}).get('effective_date')
    if effective_date:
        try:
            if date.fromisoformat(str(effective_date)[:10])>settings.reference_date: data['contract_status']='scheduled'
        except ValueError: pass
    if document.status=='archived': data['contract_status']='archived'
    elif document.status in ('draft','in_review'): data['contract_status']='pending'
    data.setdefault('metadata',{})
    data.setdefault('tags',[])
    data.setdefault('related_ids',[])
    data.setdefault('source_refs',[])
    data.setdefault('extraction_evidence',[])
    if details and db:
        versions=db.scalars(select(DocumentVersion).where(DocumentVersion.document_id==document.id).order_by(desc(DocumentVersion.version))).all()
        data['versions']=[{'version':v.version,'created_at':v.created_at,'created_by':v.created_by,'filename':v.filename,'sha256':v.sha256,'comment':v.comment,'approved_by':v.approved_by,'approved_at':v.approved_at,'signed':bool(v.signed_path),'file_url':f'/api/documents/{document.id}/file?version={v.version}','metadata_snapshot':v.snapshot} for v in versions]
        events=db.scalars(select(AuditEvent).where(AuditEvent.document_id==document.id).order_by(desc(AuditEvent.created_at),desc(AuditEvent.id))).all()
        data['audit']=[serialize_event(e) for e in events]
        steps=[('Încărcare','done'),('Validare metadate','done' if document.validated else 'current'),('Avizare','done' if document.status in ('approved','signed','archived') else 'current' if document.status=='in_review' else 'pending'),('Semnare','done' if document.status=='signed' else 'pending')]
        data['workflow']={'steps':[{'label':a,'status':b} for a,b in steps],'current_step':document.status}
        data['related_documents']=[serialize(d,user=user) for d in [db.get(Document,i) for i in data['related_ids']] if d and (user is None or can_read(user,d))]
    if user:
        from app.people.service import can_review_department
        locked=document.status in LOCKED_STATUSES
        data['permissions']={'can_edit':can_edit(user,document) and not locked,'can_review':can_review_department(db,user,document.department) if db else (has_role(user,'director') or (has_role(user,'reviewer','hr') and user.department==document.department)),'can_sign':has_role(user,'signer'),'can_share':has_role(user,'director','reviewer') and document.department!='Resurse umane'}
        if db:
            from app.tasks import service as task_service
            for kind,key in [('approval','can_review'),('validation','can_validate'),('signature','can_sign')]:
                task=task_service.current_task(db,document,kind)
                if task: data['permissions'][key]=task_service.can_act(db,user,task,document)
            kind={'draft':'validation','in_review':'approval','approved':'signature'}.get(document.status)
            active_task=task_service.current_task(db,document,kind) if kind else None
            if active_task and details: data['workflow']['task']=task_service.serialize(db,active_task,user,document)
        data['permissions'].setdefault('can_validate',can_edit(user,document))
        data['permissions']['can_validate']=data['permissions']['can_validate'] and not locked
        data['permissions']['can_submit']=can_edit(user,document) and document.validated and not locked
        from app.contracts.amendments import can_propose_amendment
        data['permissions']['can_propose_amendment']=can_propose_amendment(user,document)
        if db:
            from app.contracts.amendments import generated_amendment_info
            generated=generated_amendment_info(db,user,document)
            if generated:
                data['generated_amendment']=generated
                data['permissions']['can_edit']=False
                for key in ('can_validate','can_submit','can_review','can_sign'):
                    data['permissions'][key]=data['permissions'].get(key,False) and generated['current']
    data=without_private_text(data)
    if user and has_role(user,'technician'):
        data=sanitize_for_technician(data)
    return data

def without_private_text(value):
    if isinstance(value,dict): return {k:without_private_text(v) for k,v in value.items() if k not in ('searchable_text','text_excerpt')}
    if isinstance(value,list): return [without_private_text(item) for item in value]
    return value

def sanitize_for_technician(value):
    if isinstance(value,dict):
        if str(value.get('field','')).lower() in ('iban','supplier_iban','bank_account','supplier_contact'):
            return {}
        return {k:sanitize_for_technician(v) for k,v in value.items() if not any(term in k.lower() for term in ('iban','bank','supplier_contact'))}
    if isinstance(value,list): return [sanitize_for_technician(item) for item in value]
    return value

def reject_active_pdf_content(reader):
    forbidden_keys={'/OpenAction','/AA','/JavaScript','/JS','/Launch','/EmbeddedFiles','/EF','/RichMedia','/RichMediaContent','/RichMediaSettings','/XFA'}
    forbidden_actions={'/JavaScript','/Launch','/GoToR','/GoToE','/SubmitForm','/ImportData','/Rendition','/Sound','/Movie','/RichMediaExecute'}
    visited=set()
    stack=[reader.trailer]
    traversed=0
    while stack:
        item=stack.pop()
        if isinstance(item,IndirectObject):
            key=('ref',item.idnum,item.generation)
            if key in visited: continue
            visited.add(key)
            item=item.get_object()
        if isinstance(item,(DictionaryObject,ArrayObject,dict,list)):
            key=('object',id(item))
            if key in visited: continue
            visited.add(key)
            traversed+=1
            if traversed>100000: raise DomainError('Structura PDF-ului este prea complexă pentru import.',422)
        if isinstance(item,(DictionaryObject,dict)):
            if forbidden_keys.intersection(item.keys()) or str(item.get('/S','')) in forbidden_actions or str(item.get('/Subtype','')) in {'/RichMedia','/Movie','/Sound','/Screen','/FileAttachment'}:
                raise DomainError('PDF-ul conține acțiuni active sau fișiere încorporate. Exportă o copie simplă și reîncearcă.',422)
            if str(item.get('/S',''))=='/URI':
                uri=str(item.get('/URI','')).strip().lower()
                if not uri.startswith(('https://','http://','mailto:')):
                    raise DomainError('PDF-ul conține un link cu protocol nesigur.',422)
            stack.extend(item.values())
        elif isinstance(item,(ArrayObject,list)):
            stack.extend(item)

def validate_pdf(content):
    if len(content)>25*1024*1024: raise DomainError('Fișierul depășește limita de 25 MB.',413)
    if not content.startswith(b'%PDF-'): raise DomainError('Încarcă un fișier PDF valid.',422)
    try:
        reader=PdfReader(io.BytesIO(content))
        if reader.is_encrypted: raise DomainError('PDF-urile protejate cu parolă nu sunt acceptate.',422)
        if not reader.pages: raise DomainError('PDF-ul nu conține pagini.',422)
        if len(reader.pages)>1000: raise DomainError('PDF-ul depășește limita de 1.000 de pagini.',422)
        texts=[(p.extract_text() or '')[:30000] for p in reader.pages[:100]]
        reject_active_pdf_content(reader)
        return texts
    except DomainError: raise
    except Exception: raise DomainError('Fișierul nu poate fi citit ca PDF.',422)

def evidence_from_text(texts):
    fields=[]
    separator=r'[ \t]*(?:[:–-][ \t]*|\r?\n[ \t]*)'
    patterns={
        'supplier':r'(?:^|\n)(?:Furnizor|Prestator)'+separator+r'([^\n]{3,150})',
        'expires_at':r'(?:Data expirării|Expiră la|Valabil până la)'+separator+r'(\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4})',
        'iban':r'\b(RO\d{2}(?:[ ]?[A-Z0-9]){20})\b',
        'value':r'(?:Valoare(?: totală| fără TVA)?)'+separator+r'([\d., ]+)\s*(?:RON|lei|EUR)',
    }
    for field,pattern in patterns.items():
        for i,text in enumerate(texts):
            match=re.search(pattern,text,re.I)
            if match:
                value=match.group(1).strip()
                fields.append({'field':field,'value':value,'page':i+1,'excerpt':match.group(0),'confidence':0.8,'validated':False,'method':'pattern'})
                break
    return fields

def store_version(db,document,content,filename,user,comment='',snapshot=None):
    folder=settings.storage_dir/'documents'/document.id
    folder.mkdir(parents=True,exist_ok=True)
    path=folder/f'v{document.version}.pdf'
    path.write_bytes(content)
    version=DocumentVersion(id=uuid.uuid4().hex,document_id=document.id,version=document.version,file_path=str(path),filename=Path(filename).name,sha256=hashlib.sha256(content).hexdigest(),created_at=now(),created_by=user.id,comment=comment,snapshot=snapshot or {})
    db.add(version)
    return version

def suggested_values(evidence):
    values={}
    for field in evidence:
        value=str(field['value']).strip()
        if field['field']=='supplier': values['supplier']=value
        elif field['field']=='expires_at':
            try:
                if re.fullmatch(r'\d{2}\.\d{2}\.\d{4}',value):
                    day,month,year=value.split('.');value=f'{year}-{month}-{day}'
                values['expires_at']=date.fromisoformat(value).isoformat()
            except ValueError: pass
        elif field['field']=='value':
            compact=value.replace(' ','').replace('\u00a0','')
            if ',' in compact and '.' in compact:
                compact=compact.replace('.','').replace(',','.') if compact.rfind(',')>compact.rfind('.') else compact.replace(',','')
            elif ',' in compact:
                compact=compact.replace(',','.') if len(compact.rsplit(',',1)[-1])<=2 else compact.replace(',','')
            elif compact.count('.')>1 or ('.' in compact and len(compact.rsplit('.',1)[-1])==3):
                compact=compact.replace('.','')
            try:
                parsed=float(compact)
                if parsed>=0: values['value']=parsed
            except ValueError: pass
    return values

def matching_document_ids(db,query):
    words=re.findall(r'\w+(?:-\w+)+|\w+',query,flags=re.UNICODE)
    if not words: return set()
    expression=' AND '.join('"'+word.replace('"','""')+'"'+('' if '-' in word else '*') for word in words[:20])
    return set(db.execute(text('SELECT document_id FROM document_search WHERE document_search MATCH :query'),{'query':expression}).scalars())

def create_document(db,user,content,filename,title,category,department,supplier=None,expires_at=None):
    if category not in CATEGORIES or department not in DEPARTMENTS: raise DomainError('Tipul sau departamentul nu este valid.',422)
    if category=='Resurse umane' and department!='Resurse umane': raise DomainError('Documentele de personal aparțin departamentului Resurse umane.',422)
    if has_role(user,'hr') and department!='Resurse umane': raise DomainError('Contul de resurse umane încarcă documente numai în propriul departament.',403)
    if department=='Resurse umane' and not has_role(user,'hr'): raise DomainError('Documentele de personal se încarcă de Resurse umane.',403)
    if has_role(user,'technician') and category not in ('Raport de mentenanță','Proces-verbal','Procedură','Instruire'): raise DomainError('Contul tehnic poate încărca rapoarte de mentenanță, procese-verbale, proceduri și instruiri.',403)
    if has_role(user,'technician') and department!='Tehnic': raise DomainError('Poți încărca documente în departamentul Tehnic.',403)
    texts=validate_pdf(content)
    if expires_at:
        try: date.fromisoformat(expires_at)
        except ValueError: raise DomainError('Data expirării nu este validă.',422)
    document_id='doc-'+uuid.uuid4().hex[:12]
    evidence=evidence_from_text(texts)
    suggestions=suggested_values(evidence)
    document=Document(id=document_id,title=(title or Path(filename).stem)[:300],number=f'AD-{settings.reference_date.year}-{uuid.uuid4().hex[:6].upper()}',category=category,department=department,status='draft',created_at=now(),updated_at=now(),expires_at=expires_at or suggestions.get('expires_at'),supplier=supplier or suggestions.get('supplier'),value=suggestions.get('value'),currency='RON',owner=user.name,created_by=user.id,searchable_text='\n'.join(texts),confidentiality='restricted' if department=='Resurse umane' else 'internal',summary='Document introdus în registru.',version=1,validated=False,airport_id=user.airport_id,extra={'filename':Path(filename).name,'tags':['Nou'],'metadata':{},'extraction_evidence':evidence,'page_count':len(texts),'related_ids':[],'source_refs':[],'extraction_status':'text-extracted' if any(texts) else 'needs-ocr','extraction_notice':'Extracție de text și reguli; valorile necesită verificare umană.' if any(texts) else 'PDF scanat: completează manual metadatele; OCR nu este configurat.'})
    db.add(document); db.flush()
    store_version(db,document,content,filename,user,'Încărcare inițială',snapshot=serialize(document))
    from app.tasks.service import on_new_version
    on_new_version(db,document,user)
    record(db,user,'Document încărcat',document,f'Versiunea 1 · {len(content)} octeți')
    db.commit()
    return document

def patch_document(db,user,document_id,changes):
    db.execute(text('BEGIN IMMEDIATE'))
    document=get_document(db,document_id,user,edit=True)
    require_unlocked_document(document)
    from app.contracts.amendments import require_manual_revision_allowed
    require_manual_revision_allowed(db,document)
    nullable={'supplier','expires_at','value'}
    changes={k:v for k,v in changes.items() if v is not None or k in nullable}
    if not changes: return document
    for field in ('category','department','confidentiality'):
        if field in changes and changes[field]!=getattr(document,field):
            raise DomainError('Tipul, departamentul și nivelul de acces sunt fixe pentru toate versiunile. Pentru un public nou, pregătește o copie revizuită prin partajare.',403)
    old=current_version(db,document)
    old.snapshot=serialize(document)
    document.version+=1; document.status='draft'; document.validated=False; document.updated_at=now()
    for key,value in changes.items():
        if key=='metadata': document.extra={**document.extra,'metadata':value}
        else: setattr(document,key,str(value) if key=='expires_at' and value is not None else value)
    store_version(db,document,Path(old.file_path).read_bytes(),old.filename,user,'Metadate modificate; avizarea anterioară nu se aplică.',snapshot=serialize(document))
    from app.tasks.service import on_new_version
    on_new_version(db,document,user)
    record(db,user,'Metadate actualizate',document,f'Versiunea {document.version}; necesită o nouă validare și avizare')
    db.commit(); return document

def add_version(db,user,document_id,content,filename,comment):
    db.execute(text('BEGIN IMMEDIATE'))
    document=get_document(db,document_id,user,edit=True)
    require_unlocked_document(document)
    from app.contracts.amendments import require_manual_revision_allowed
    require_manual_revision_allowed(db,document)
    texts=validate_pdf(content)
    previous=current_version(db,document)
    previous.snapshot=serialize(document)
    document.version+=1; document.status='draft'; document.validated=False; document.updated_at=now()
    document.searchable_text='\n'.join(texts)
    document.extra={**document.extra,'filename':Path(filename).name,'extraction_evidence':evidence_from_text(texts),'page_count':len(texts),'extraction_status':'text-extracted' if any(texts) else 'needs-ocr','extraction_notice':'Extracție de text și reguli; valorile necesită verificare umană.' if any(texts) else 'PDF scanat: completează manual metadatele; OCR nu este configurat.'}
    document.extra.pop('text_excerpt',None)
    suggestions=suggested_values(document.extra['extraction_evidence'])
    document.supplier=suggestions.get('supplier')
    document.expires_at=suggestions.get('expires_at')
    document.value=suggestions.get('value')
    store_version(db,document,content,filename,user,comment or 'Versiune nouă',snapshot=serialize(document))
    from app.tasks.service import on_new_version
    on_new_version(db,document,user)
    record(db,user,'Versiune nouă',document,f'Versiunea {document.version}; avizările au fost resetate')
    db.commit(); return document
