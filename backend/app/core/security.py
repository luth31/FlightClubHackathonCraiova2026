import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from fastapi import Request, Depends
from sqlalchemy.orm import Session as DbSession
from app.database import get_db
from app.people.models import User, Session
from app.config import settings
from app.core.exceptions import DomainError
from app.people.organization import canonical_department, TECHNICAL_CATEGORIES, RESTRICTED, PUBLISHED
from sqlalchemy import select
from sqlalchemy.orm import object_session

def hash_password(password: str, salt: str | None = None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 120000).hex()
    return f'{salt}:{digest}'

def check_password(password: str, encoded: str):
    return hmac.compare_digest(hash_password(password, encoded.split(':')[0]), encoded)

def token_hash(token: str):
    return hashlib.sha256(token.encode()).hexdigest()

def issue_session(db, user, response, request=None, auth_source='demo'):
    """Rotate the browser's app session; identity-provider tokens never reach it."""
    if request:
        previous = request.cookies.get(f'flyleaf_session_{settings.airport_id}')
        if previous:
            old_session = db.get(Session, token_hash(previous))
            if old_session:
                db.delete(old_session)
    token = secrets.token_urlsafe(48)
    seconds = min(max(settings.oidc_session_minutes, 1), 720) * 60 if auth_source == 'oidc' else 43200
    db.add(Session(token_hash=token_hash(token), user_id=user.id,
        expires_at=(datetime.now(timezone.utc) + timedelta(seconds=seconds)).isoformat(),
        auth_source=auth_source, auth_issuer=settings.oidc_issuer if auth_source == 'oidc' else None))
    response.set_cookie(f'flyleaf_session_{settings.airport_id}', token,
        httponly=True, secure=settings.cookie_secure, samesite='strict', max_age=seconds, path='/api')

def optional_user(request: Request, db: DbSession = Depends(get_db)):
    flyleaf_session=request.cookies.get(f'flyleaf_session_{settings.airport_id}')
    if not flyleaf_session:
        return None
    session = db.get(Session, token_hash(flyleaf_session))
    if not session or datetime.fromisoformat(session.expires_at) <= datetime.now(timezone.utc):
        return None
    if session.auth_source != settings.auth_mode:
        return None
    if settings.auth_mode == 'oidc' and session.auth_issuer != settings.oidc_issuer:
        return None
    user = db.get(User, session.user_id)
    return user if user and user.active and user.airport_id == settings.airport_id else None

def current_user(user: User | None = Depends(optional_user), db: DbSession = Depends(get_db)):
    if not user:
        raise DomainError('Conectează-te pentru a continua.', 401)
    from app.people.management import refresh_appointments
    refresh_appointments(db)
    return user

def user_dict(user: User):
    result = {k:getattr(user,k) for k in ('id','name','email','department','role','roles','airport_id','active','avatar')}
    result['department'] = canonical_department(user.department)
    result['business_area'] = user.department
    result['permissions'] = {'pages': page_permissions(user)}
    return result

def has_role(user, *roles):
    return bool(set(user.roles) & set(roles))

def require_role(user, *roles):
    if not has_role(user, *roles):
        raise DomainError('Nu ai permisiunea necesară pentru această acțiune.', 403)

def is_department_head(user, department=None):
    db = object_session(user) if isinstance(user, User) else None
    if db:
        from app.people.management import is_head
        return is_head(db, user, department)
    return has_role(user, 'department_head') and (department is None or canonical_department(user.department) == canonical_department(department))


def can_share_documents(user):
    # Request coordination and publishing a document copy are separate powers.
    return has_role(user, 'director') or (has_role(user, 'reviewer') and canonical_department(user.department) == 'Conformitate')


def require_share_documents(user):
    if not can_share_documents(user):
        raise DomainError('Partajarea documentelor necesită directorul sau responsabilul de conformitate.', 403)


def page_permissions(user):
    director = has_role(user, 'director')
    head = is_department_head(user)
    finance = has_role(user, 'finance')
    compliance = has_role(user, 'reviewer') and canonical_department(user.department) == 'Conformitate'
    procurement = head and canonical_department(user.department) == 'Achiziții'
    technician = has_role(user, 'technician') and not head and not director
    return {'home': True, 'operations': True, 'documents': True, 'approvals': True, 'people': True, 'reports': True,
            'contracts': not technician and (director or finance or (head and not has_role(user, 'hr'))),
            'suppliers': director or finance or procurement,
            'sharing': director or head or compliance,
            'audit': not technician and (director or head or has_role(user, 'hr') or compliance)}


def require_page(user, page):
    if not page_permissions(user).get(page, False):
        raise DomainError('Nu ai acces la această secțiune.', 403)


def assigned_access(user, document):
    """Only a pending task for this exact version can extend record scope."""
    db = object_session(user) if isinstance(user, User) else None
    if not db: return False
    from app.tasks.models import WorkflowTask
    from app.people.models import Delegation
    tasks = db.scalars(select(WorkflowTask).where(WorkflowTask.document_id == document.id,
        WorkflowTask.document_version == document.version, WorkflowTask.status == 'pending'))
    today = settings.reference_date.isoformat()
    for task in tasks:
        if task.reassignment_required: continue
        principal = db.get(User, task.assigned_to) if task.assigned_to else None
        if not principal or not principal.active or principal.airport_id != user.airport_id: continue
        if principal.id == user.id:
            if task.type == 'signature': return has_role(user, 'signer')
            if task.type == 'approval':
                return has_role(user, 'director') or is_department_head(user, document.department) or (has_role(user, 'reviewer', 'finance', 'hr') and user.department == document.department)
            return document.created_by == user.id or is_department_head(user, document.department)
        if task.type != 'approval' or not has_role(user, 'reviewer', 'department_head'): continue
        # Check the principal's underlying authority, independently of delegation.
        if not (is_department_head(principal, document.department) or
                (has_role(principal, 'reviewer', 'finance', 'hr', 'director') and principal.department == document.department)):
            continue
        if db.scalar(select(Delegation.id).where(Delegation.from_user == principal.id,
            Delegation.to_user == user.id, Delegation.active == True,
            Delegation.starts_at <= today, Delegation.ends_at >= today)):
            return True
    return False


def can_read(user, document, include_assignment=True):
    if not document or not user.active or document.airport_id != user.airport_id:
        return False
    if document.department == 'Resurse umane':
        from app.people.leave_documents import linked_leave
        db = object_session(user) if isinstance(user, User) else None
        leave = linked_leave(db, document) if db else None
        if leave:
            from app.people.service import can_review_leave
            return leave.user_id == user.id or can_review_leave(db, user, leave)
        return has_role(user, 'hr') or is_department_head(user, 'Resurse umane') or document.owner_id == user.id or document.created_by == user.id
    if has_role(user, 'director'):
        return True
    # Approved operational procedures are internal reading material for all staff.
    # Drafts and restricted procedures keep their normal departmental scope.
    if (document.category == 'Procedură' and document.department == 'Conformitate'
            and document.status in ('approved', 'signed') and document.confidentiality not in RESTRICTED
            and (document.extra or {}).get('metadata', {}).get('sop_code')):
        return True
    head = is_department_head(user, document.department)
    if has_role(user, 'technician') and not head:
        return (canonical_department(document.department) == 'Tehnic' and document.category in TECHNICAL_CATEGORIES
                and document.confidentiality not in RESTRICTED
                and (document.status in PUBLISHED or document.created_by == user.id))
    if head:
        return True
    if document.created_by == user.id or document.owner_id == user.id:
        return True
    if include_assignment and assigned_access(user, document):
        return True
    if has_role(user, 'finance'):
        return document.department == 'Financiar' or (document.category in ('Contract','Act adițional') and document.status in PUBLISHED and document.confidentiality not in RESTRICTED)
    if document.confidentiality in RESTRICTED:
        return False
    if document.confidentiality == 'public' and document.status in PUBLISHED:
        return True
    return canonical_department(document.department) == canonical_department(user.department)


def can_read_version(user, document, version):
    if version.version == document.version:
        return can_read(user, document)
    from types import SimpleNamespace
    snapshot = version.snapshot or {}
    historical = SimpleNamespace(**{name: getattr(document, name) for name in
        ('id','airport_id','department','category','confidentiality','owner_id','created_by','extra')},
        version=version.version,
        status=snapshot.get('status', 'approved' if version.approved_by else 'draft'))
    return can_read(user, historical, include_assignment=False)

def can_edit(user, document):
    from app.people.leave_documents import is_leave_document
    if is_leave_document(document):
        return False
    return can_read(user,document) and (is_department_head(user, document.department) or
        has_role(user, 'director') or (has_role(user, 'reviewer','finance','hr') and user.department == document.department) or document.created_by == user.id)
