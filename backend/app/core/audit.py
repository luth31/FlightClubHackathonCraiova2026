from datetime import datetime, timezone
from app.core.models import AuditEvent
from app.config import settings
from app.core.presentation import operational_text

def now():
    return datetime.now(timezone.utc).isoformat()

def record(db, user, action, document=None, detail=''):
    event = AuditEvent(actor=user.name, actor_id=user.id, action=action, document_id=document.id if document else None, document_title=document.title if document else '', created_at=now(), detail=detail, airport_id=settings.airport_id)
    db.add(event)
    return event

def serialize(event):
    return {k: operational_text(getattr(event,k)) if k in ('actor','action','detail') else getattr(event,k) for k in ('id','actor','actor_id','action','document_id','document_title','created_at','detail')}
