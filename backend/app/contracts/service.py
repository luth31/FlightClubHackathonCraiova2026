import csv
import io
from collections import Counter
from sqlalchemy.orm import Session
from sqlalchemy import select,desc
from app.database import get_db
from app.documents.service import visible_documents,serialize,DEPARTMENTS
from app.core.security import current_user,can_read,require_page
from app.core.models import AuditEvent
from app.core.audit import serialize as audit_dict
from app.documents.models import Document
from app.config import settings
from app.people.organization import canonical_department

def contract_items(db,user):
    return [serialize(d,user=user) for d in visible_documents(db,user) if d.category=='Contract']

def contracts(db,user):
    require_page(user, 'contracts')
    items=contract_items(db,user)
    return {'items':items,'total':len(items)}

def dashboard(db,user):
    docs=visible_documents(db,user)
    items=[serialize(d,user=user) for d in docs]
    expiring=[d for d in items if d['category']=='Contract' and d['validated'] and d['days_remaining'] is not None and 0<=d['days_remaining']<=60 and d['status']!='archived']
    pending=[d for d in items if d['status']=='in_review']
    overdue=[d for d in items if d['validated'] and d['days_remaining'] is not None and d['days_remaining']<0 and d['status']!='archived']
    counts=Counter(canonical_department(d.department) for d in docs)
    permitted={d.id for d in docs if can_read(user,d,include_assignment=False)}
    events=[audit_dict(e) for e in db.scalars(select(AuditEvent).where(AuditEvent.airport_id==user.airport_id).order_by(desc(AuditEvent.created_at),desc(AuditEvent.id))).all() if e.document_id in permitted or e.actor_id==user.id][:8]
    attention=[{'id':d['id'],'document_id':d['id'],'title':d['title'],'type':'approval','priority':'high','description':'Așteaptă avizarea','due_date':d.get('expires_at'),'department':d['department']} for d in pending[:3]]
    attention += [{'id':d['id'],'document_id':d['id'],'title':d['title'],'type':'expiry','priority':'high' if d['days_remaining']<=14 else 'medium','description':f'Expiră în {d["days_remaining"]} zile','due_date':d['expires_at'],'department':d['department']} for d in sorted(expiring,key=lambda d:d['days_remaining'])[:3]]
    return {'stats':{'documents':len(docs),'pending':len(pending),'expiring':len(expiring),'approved':sum(d.status in ('approved','signed') for d in docs),'overdue':len(overdue),'contracts':len([d for d in docs if d.category=='Contract'])},'recent_documents':items[:6],'attention':attention[:6],'activity':events,'departments':[{'name':k,'count':v} for k,v in counts.items()],'reference_date':str(settings.reference_date)}

def audit(db,user):
    require_page(user, 'audit')
    docs={d.id for d in visible_documents(db,user) if can_read(user,d,include_assignment=False)}
    items=[audit_dict(e) for e in db.scalars(select(AuditEvent).where(AuditEvent.airport_id==user.airport_id).order_by(desc(AuditEvent.created_at),desc(AuditEvent.id))).all() if e.document_id in docs or e.actor_id==user.id]
    return {'items':items[:500],'total':len(items)}

def safe_cell(value):
    value='' if value is None else str(value)
    return "'"+value if value.startswith(('=','+','-','@','\t','\r')) else value

def report(db,user,category=''):
    buffer=io.StringIO(); writer=csv.writer(buffer)
    writer.writerow(['Număr','Titlu','Tip','Departament','Stare','Furnizor','Valoare','Monedă','Expirare','Versiune','Validat'])
    for d in visible_documents(db,user):
        if category and d.category!=category: continue
        writer.writerow([safe_cell(v) for v in (d.number,d.title,d.category,d.department,d.status,d.supplier,d.value,d.currency,d.expires_at,d.version,d.validated)])
    return '\ufeff'+buffer.getvalue()
