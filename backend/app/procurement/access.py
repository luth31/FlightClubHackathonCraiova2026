from sqlalchemy import select
from app.core.security import has_role, can_read, can_read_version, is_department_head
from app.people.organization import canonical_department
from app.people.models import User
from app.documents.models import Document, DocumentVersion
from app.procurement.models import ProcurementCaseDocument
from app.core.exceptions import DomainError


def can_manage(db, user):
    return has_role(user, 'director') or (canonical_department(user.department) == 'Achiziții' and
        (has_role(user, 'reviewer') or is_department_head(user, 'Achiziții')))


def can_accept(db, user):
    return has_role(user, 'director') or (canonical_department(user.department) == 'Tehnic' and
        (has_role(user, 'reviewer') or is_department_head(user, 'Tehnic')))


def can_finance(db, user):
    return has_role(user, 'director', 'finance') or is_department_head(user, 'Financiar')


def financial_access(db, user):
    return can_manage(db, user) or can_finance(db, user)


def relevant(db, user):
    return can_manage(db, user) or can_accept(db, user) or can_finance(db, user) or (
        canonical_department(user.department) == 'Tehnic' and has_role(user, 'technician'))


def owners(db, user):
    return [{'id': u.id, 'name': u.name} for u in db.scalars(select(User).where(
        User.airport_id == user.airport_id, User.active == True).order_by(User.name)) if can_manage(db, u)]


def owner(db, user, ident):
    person = db.get(User, ident)
    if not person or not person.active or person.airport_id != user.airport_id or not can_manage(db, person):
        raise DomainError('Responsabilul trebuie să aibă autoritate de achiziții în aeroport.', 422)
    return person


def visible_attached(db, user, association):
    doc = db.get(Document, association.document_id)
    version = db.scalar(select(DocumentVersion).where(DocumentVersion.document_id == association.document_id,
                                                    DocumentVersion.version == association.version))
    return bool(doc and version and can_read(user, doc) and can_read_version(user, doc, version))


def can_read_case(db, user, case):
    if case.airport_id != user.airport_id or not relevant(db, user): return False
    associations = list(db.scalars(select(ProcurementCaseDocument).where(ProcurementCaseDocument.case_id == case.id)))
    if not associations: return case.owner_id == user.id or has_role(user, 'director')
    return any(visible_attached(db, user, association) for association in associations)


def require(permission):
    if not permission: raise DomainError('Nu ai autoritatea necesară pentru această acțiune.', 403)
