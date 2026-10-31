"""Assignment records responsibility without granting decision authority."""
from sqlalchemy import select,text
from app.people.models import User
from app.documents.models import Document
from app.core.security import require_role,can_read,has_role
from app.core.exceptions import DomainError
from app.core.audit import record,now
from app.config import settings

def candidates(db,user,item):
    doc=db.get(Document,item.document_id) if item.document_id else None
    return [{'id':u.id,'name':u.name} for u in db.scalars(select(User).where(User.airport_id==user.airport_id,User.active==True))
        if has_role(u,'director','finance') and (not item.document_id or (doc and can_read(u,doc))) and not (item.status=='verified' and u.id==item.verified_by)]

def summary(db,user,item):
    person=db.get(User,item.assigned_to) if item.assigned_to else None
    state='unassigned'
    if item.assigned_to:
        eligible=any(u['id']==item.assigned_to for u in candidates(db,user,item))
        state='assigned' if eligible else 'needs_reassignment'
        if person and person.active and item.status=='verified' and item.assigned_to==item.verified_by: state='awaiting_second_person'
    return {'assigned_to':item.assigned_to,'assignee':person.name if person and person.airport_id==user.airport_id else None,
        'due_date':item.due_date,'assignment_revision':item.assignment_revision,'assignment_history':item.assignment_history,
        'assignment_state':state,'overdue':item.status in ('needs_review','verified') and bool(item.due_date and item.due_date<settings.reference_date.isoformat())}

def assign(db,user,identifier,body):
    db.execute(text('BEGIN IMMEDIATE'));require_role(user,'director')
    from app.suppliers.service import get_case,detail
    item,doc=get_case(db,user,identifier)
    if item.status not in ('needs_review','verified'): raise DomainError('Cazul are deja o decizie.',409)
    if item.assignment_revision!=body.assignment_revision: raise DomainError('Atribuirea s-a modificat. Reîncarcă verificarea.',409)
    if not any(u['id']==body.assigned_to for u in candidates(db,user,item)): raise DomainError('Persoana nu este activă, eligibilă sau nu are acces la sursă.',422)
    history={'from':item.assigned_to,'to':body.assigned_to,'due_date':body.due_date.isoformat(),'actor_id':user.id,'actor':user.name,'created_at':now(),'comment':body.comment}
    item.assigned_to=body.assigned_to;item.due_date=body.due_date.isoformat();item.assignment_revision+=1
    item.assignment_history=[*item.assignment_history,history]
    record(db,user,'Verificare furnizor atribuită',doc,f'{item.id}: {body.comment}')
    db.commit();return detail(db,user,item.id)
