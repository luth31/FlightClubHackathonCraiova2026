import json
import hashlib
import uuid
from pathlib import Path
from sqlalchemy import select
from app.database import SessionLocal
from app.config import settings
from app.people.models import User,Delegation,LeaveRequest
from app.documents.models import Document,DocumentVersion
from app.core.models import AuditEvent
from app.core.security import hash_password
from app.suppliers.service import seed_suppliers
from app.tasks.service import seed_tasks
from app.people.names import split_name

USERS=[
 ('admin','Ana Ionescu','Conducere','Director aeroport',['admin','director','reviewer','signer'],'AI',None),
 ('manager','Mihai Dumitrescu','Achiziții','Șef achiziții și financiar',['reviewer'],'MD','admin'),
 ('reviewer','Elena Popa','Conformitate','Responsabil conformitate',['reviewer'],'EP','admin'),
 ('finance','Radu Marinescu','Financiar','Responsabil financiar',['finance','reviewer'],'RM','manager'),
 ('hr','Ioana Stancu','Resurse umane','Responsabil resurse umane',['hr','reviewer'],'IS','admin'),
 ('technical-head','Sorin Pavel','Tehnic','Șef tehnic și operațiuni',['reviewer'],'SP','admin'),
 ('technician','Andrei Neagu','Tehnic','Tehnician mentenanță',['technician'],'AN','technical-head'),
]


def seed_owner_id(db, name):
    matches = list(db.scalars(select(User.id).where(User.airport_id == settings.airport_id, User.name == name).limit(2)))
    return matches[0] if len(matches) == 1 else None

def seed():
    settings.storage_dir.mkdir(parents=True,exist_ok=True)
    with SessionLocal() as db:
        initialize_hierarchy = db.get(User, 'technical-head') is None
        for uid,name,department,role,roles,avatar,manager in USERS:
            if not db.get(User,uid):
                db.add(User(id=uid,name=name,**split_name(name),email=f'{uid}@{settings.airport_id}.example',department=department,role=role,roles=roles,airport_id=settings.airport_id,active=True,password_hash=hash_password('FlyLeaf2026!'),avatar=avatar,manager_id=manager,job_title=role))
        db.flush()
        from app.people.management import seed_departments
        seed_departments(db, initialize_technical_head=initialize_hierarchy)
        for uid, _, _, _, _, _, manager in USERS if initialize_hierarchy else []:
            person = db.get(User, uid)
            # Fill only missing reporting links; never replace an edited manager.
            if person and not person.manager_id and manager and person.department in ('Achiziții','Conformitate','Financiar','Resurse umane','Tehnic'):
                person.manager_id = manager
        if not db.get(Delegation,'demo-delegation'):
            db.add(Delegation(id='demo-delegation',from_user='manager',to_user='reviewer',starts_at='2026-10-29',ends_at='2026-11-06',reason='Înlocuire pe perioada concediului aprobat',active=True))
            db.add(LeaveRequest(id='demo-leave',user_id='manager',starts_at='2026-10-29',ends_at='2026-11-06',reason='Concediu de odihnă',status='approved',approver_id='admin'))
        manifest=settings.corpus_dir/'seed-manifest.json'
        if settings.seed_documents and manifest.exists():
            raw=json.loads(manifest.read_text(encoding='utf-8'))
            records=raw.get('documents',[]) if isinstance(raw,dict) else raw
            for item in records:
                if db.get(Document,item['id']): continue
                path=settings.corpus_dir/'pdfs'/Path(item['filename']).name
                if not path.is_file(): continue
                status=item.get('status','draft')
                extra={k:item.get(k,default) for k,default in [('filename',path.name),('tags',[]),('metadata',{}),('related_ids',[]),('source_refs',[])]}
                source_fields=extra['metadata'].get('source_fields',[])
                if isinstance(source_fields,dict): source_fields=[{'field':k,**v} if isinstance(v,dict) else {'field':k,'value':v,'page':1} for k,v in source_fields.items()]
                extra['extraction_evidence']=source_fields
                extra['extraction_status']='seed-reviewed'
                extra['extraction_notice']='Metadate din corpusul fictiv, pregătite pentru demonstrație.'
                document=Document(id=item['id'],title=item['title'],number=item.get('number',item['id'].upper()),category=item.get('category','Contract'),department=item.get('department','Achiziții'),status=status,created_at=item.get('created_at','2026-10-01'),updated_at=item.get('updated_at',item.get('created_at','2026-10-01')),expires_at=item.get('expires_at') or None,supplier=item.get('supplier') or None,value=item.get('value'),currency=item.get('currency','RON'),owner=item.get('owner','Elena Popa'),owner_id=seed_owner_id(db,item.get('owner','Elena Popa')),created_by='seed',confidentiality=item.get('confidentiality','internal'),summary=item.get('summary',''),searchable_text='',version=1,validated=item.get('validated',status!='draft'),airport_id=settings.airport_id,extra=extra)
                db.add(document); db.flush()
                version_folder=settings.storage_dir/'documents'/document.id
                version_folder.mkdir(parents=True,exist_ok=True)
                stored_path=version_folder/'v1.pdf'
                stored_path.write_bytes(path.read_bytes())
                db.add(DocumentVersion(id=uuid.uuid4().hex,document_id=document.id,version=1,file_path=str(stored_path),filename=path.name,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),created_at=document.created_at,created_by='seed',comment='Document fictiv din corpusul de demonstrație',snapshot=item,approved_by='manager' if status in ('approved','archived') else None,approved_at=document.created_at if status in ('approved','archived') else None))
                db.add(AuditEvent(actor='Elena Popa',actor_id='reviewer',action='Document înregistrat',document_id=document.id,document_title=document.title,created_at=document.created_at,detail='Corpus fictiv pentru demonstrație · versiunea 1',airport_id=settings.airport_id))
        db.flush()
        seed_suppliers(db)
        seed_tasks(db)
        db.commit()
