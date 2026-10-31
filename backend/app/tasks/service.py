"""Version-specific, assigned work. Delegation confers review authority only."""
from datetime import timedelta
from types import SimpleNamespace
from uuid import uuid4
from sqlalchemy import select,desc,text
from app.tasks.models import WorkflowTask,TaskEvent
from app.documents.models import Document
from app.people.models import User,Delegation
from app.people.service import can_review_department
from app.core.security import can_read,can_edit,has_role
from app.core.exceptions import DomainError
from app.core.audit import now,record
from app.config import settings


def task_event(db,task,user,action,comment=''):
    actor=user or SimpleNamespace(id='seed',name='Registru demonstrativ')
    db.add(TaskEvent(task_id=task.id,actor_id=actor.id,actor=actor.name,action=action,comment=comment,created_at=now()))
    task.updated_at=now()


def eligible(db,user,document,kind):
    if not user or not user.active or user.airport_id!=document.airport_id or not can_read(user,document): return False
    if kind=='approval': return can_review_department(db,user,document.department)
    if kind=='signature': return has_role(user,'signer')
    return can_edit(user,document)


def candidates(db,document,kind):
    return [u for u in db.scalars(select(User).where(User.airport_id==document.airport_id,User.active==True)).all() if eligible(db,u,document,kind)]


def default_assignee(db,document,kind,preferred=None):
    people=candidates(db,document,kind)
    if kind=='validation':
        creator=preferred or document.created_by
        if any(u.id==creator for u in people): return creator
    own=[u for u in people if u.department==document.department]
    chosen=sorted(own or people,key=lambda u:(has_role(u,'director'),u.id))
    return chosen[0].id if chosen else None


def current_task(db,document,kind):
    return db.scalar(select(WorkflowTask).where(WorkflowTask.document_id==document.id,WorkflowTask.document_version==document.version,WorkflowTask.type==kind))


def ensure_task(db,document,kind,user=None,preferred=None,reopen=False):
    task=current_task(db,document,kind)
    if task:
        if reopen and task.status!='pending':
            task.status='pending';task.completed_by=None
            task_event(db,task,user,'Sarcină redeschisă','Documentul a revenit în acest pas al fluxului.')
        return task
    assigned=default_assignee(db,document,kind,preferred)
    task=WorkflowTask(id='task-'+uuid4().hex[:12],document_id=document.id,document_version=document.version,type=kind,status='pending',assigned_to=assigned,due_date=(settings.reference_date+timedelta(days=1 if kind=='signature' else 3)).isoformat(),created_at=now(),updated_at=now())
    db.add(task);db.flush()
    name=db.get(User,assigned).name if assigned else 'Fără responsabil eligibil'
    task_event(db,task,user,'Sarcină atribuită',name)
    return task


def cancel_stale(db,document,user=None):
    tasks=db.scalars(select(WorkflowTask).where(WorkflowTask.document_id==document.id,WorkflowTask.status=='pending',WorkflowTask.document_version!=document.version)).all()
    for task in tasks:
        task.status='cancelled';task_event(db,task,user,'Versiune înlocuită',f'Sarcina pentru v{task.document_version} nu se aplică versiunii {document.version}.')


def on_new_version(db,document,user):
    cancel_stale(db,document,user)
    ensure_task(db,document,'validation',user,preferred=user.id)


def active_delegates(db,task,document):
    if task.type!='approval' or not task.assigned_to: return []
    principal=db.get(User,task.assigned_to)
    if not principal or not principal.active or principal.airport_id!=document.airport_id: return []
    today=settings.reference_date.isoformat()
    grants=db.scalars(select(Delegation).where(Delegation.from_user==principal.id,Delegation.active==True,Delegation.starts_at<=today,Delegation.ends_at>=today)).all()
    return [u for grant in grants if (u:=db.get(User,grant.to_user)) and eligible(db,u,document,'approval')]


def can_act(db,user,task,document):
    if not task or task.status!='pending' or task.document_version!=document.version or not eligible(db,user,document,task.type): return False
    principal=db.get(User,task.assigned_to) if task.assigned_to else None
    if not principal or not principal.active: return False
    if task.assigned_to==user.id: return True
    return any(delegate.id==user.id for delegate in active_delegates(db,task,document))


def can_reassign(db,user,task,document):
    if task.status!='pending' or task.document_version!=document.version or not can_read(user,document): return False
    return has_role(user,'admin','director') or (has_role(user,'reviewer','hr') and user.department==document.department and can_review_department(db,user,document.department))


def require_task(db,user,document,kind):
    task=ensure_task(db,document,kind)
    if not can_act(db,user,task,document):
        raise DomainError('Acțiunea aparține responsabilului desemnat sau delegatului său activ. Solicită reatribuirea sarcinii dacă este necesar.',403)
    return task


def complete_task(db,task,user,action,comment=''):
    task.status='completed';task.completed_by=user.id
    task_event(db,task,user,action,comment)


def serialize(db,task,user,document=None):
    document=document or db.get(Document,task.document_id)
    principal=db.get(User,task.assigned_to) if task.assigned_to else None
    delegates=active_delegates(db,task,document)
    valid=principal and eligible(db,principal,document,task.type)
    effective=delegates[0] if delegates else principal if valid else None
    assignment_state='delegated' if delegates else 'assigned' if valid else 'needs_reassignment'
    events=db.scalars(select(TaskEvent).where(TaskEvent.task_id==task.id).order_by(desc(TaskEvent.id))).all()
    manage=can_reassign(db,user,task,document)
    return {'id':task.id,'document_id':document.id,'document_version':task.document_version,'title':document.title,'number':document.number,'department':document.department,'type':task.type,'status':task.status,'assigned_to':task.assigned_to,'assignee':effective.name if effective else 'Reatribuire necesară','principal_name':principal.name if principal else None,'effective_assignee':effective.id if effective else None,'delegated_from':principal.name if delegates else None,'due_date':task.due_date,'overdue':task.status=='pending' and task.due_date<settings.reference_date.isoformat(),'priority':'high' if task.due_date<=settings.reference_date.isoformat() or assignment_state=='needs_reassignment' else 'medium','assignment_state':assignment_state,'can_act':can_act(db,user,task,document),'can_reassign':manage,'completed_by':task.completed_by,'created_at':task.created_at,'updated_at':task.updated_at,'history':[{'id':e.id,'actor':e.actor,'actor_id':e.actor_id,'action':e.action,'comment':e.comment,'created_at':e.created_at} for e in events],'eligible_assignees':[{'id':u.id,'name':u.name,'department':u.department} for u in candidates(db,document,task.type)] if manage else []}


def list_tasks(db,user,status='pending',mine=False):
    query=select(WorkflowTask).order_by(WorkflowTask.due_date,desc(WorkflowTask.created_at))
    if status!='all': query=query.where(WorkflowTask.status==status)
    result=[]
    for task in db.scalars(query).all():
        doc=db.get(Document,task.document_id)
        if not doc or not can_read(user,doc): continue
        if mine and not can_act(db,user,task,doc): continue
        result.append(serialize(db,task,user,doc))
    return {'items':result,'total':len(result),'reference_date':str(settings.reference_date)}


def get_task(db,user,task_id):
    task=db.get(WorkflowTask,task_id)
    doc=db.get(Document,task.document_id) if task else None
    if not task or not doc or not can_read(user,doc): raise DomainError('Sarcina nu a fost găsită sau nu ai acces.',404)
    return task,doc


def assign(db,user,task_id,body):
    db.execute(text('BEGIN IMMEDIATE'))
    task,document=get_task(db,user,task_id)
    if body.version!=task.document_version or document.version!=task.document_version: raise DomainError('Sarcina se referă la o versiune înlocuită. Reîncarcă documentul.',409)
    if not can_reassign(db,user,task,document): raise DomainError('Nu ai autoritate de reatribuire pentru această sarcină.',403)
    target=db.get(User,body.assigned_to)
    if not eligible(db,target,document,task.type): raise DomainError('Persoana aleasă nu este activă sau nu are autoritatea necesară în acest departament.',422)
    previous=db.get(User,task.assigned_to) if task.assigned_to else None
    task.assigned_to=target.id
    if body.due_date: task.due_date=body.due_date.isoformat()
    detail=f'{previous.name if previous else "Neatribuit"} → {target.name}. {body.comment}'
    task_event(db,task,user,'Sarcină reatribuită',detail)
    record(db,user,'Sarcină reatribuită',document,f'Versiunea {task.document_version}; {detail}')
    db.commit();return serialize(db,task,user,document)


def seed_tasks(db):
    for document in db.scalars(select(Document)).all():
        if document.status=='in_review': ensure_task(db,document,'approval')
        elif document.status=='draft' and not document.validated: ensure_task(db,document,'validation')


def add_comment(db,user,task_id,body):
    db.execute(text('BEGIN IMMEDIATE'))
    task,document=get_task(db,user,task_id)
    if task.document_version!=document.version or body.version!=task.document_version: raise DomainError('Comentariul se referă la o versiune înlocuită.',409)
    if not can_act(db,user,task,document) and not can_reassign(db,user,task,document): raise DomainError('Doar responsabilul sau coordonatorul poate comenta sarcina.',403)
    task_event(db,task,user,'Comentariu adăugat',body.comment)
    record(db,user,'Comentariu la sarcină',document,body.comment)
    db.commit();return serialize(db,task,user,document)


def flag_offboarding(db,target,user):
    for task in db.scalars(select(WorkflowTask).where(WorkflowTask.assigned_to==target.id,WorkflowTask.status=='pending')).all():
        task_event(db,task,user,'Responsabil dezactivat','Sarcina rămâne deschisă și necesită reatribuire explicită către o persoană activă și eligibilă.')
